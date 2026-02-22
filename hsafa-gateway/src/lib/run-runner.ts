// =============================================================================
// Run Runner
// =============================================================================
// Orchestrates a run lifecycle. Ties builder → prompt-builder → streamText →
// stream-processor together. The AI SDK manages the tool-call loop internally
// via stopWhen; the stream-processor intercepts fullStream events across all
// steps for real-time Redis emission.
//
// Called by agent-trigger (fire-and-forget) and the service trigger route.

import { streamText, stepCountIs, type LanguageModel } from 'ai';
import { prisma } from './db.js';
import { emitSmartSpaceEvent, emitRunEvent } from './smartspace-events.js';
import { processStream } from './stream-processor.js';
import { buildAgent } from '../agent-builder/builder.js';
import { buildPrompt } from '../agent-builder/prompt-builder.js';
import type { RunContext, RunActionLog, RunActionEntry } from '../agent-builder/types.js';

// =============================================================================
// Constants
// =============================================================================

/** Max tool-call steps per run before forcing a stop (prevents infinite loops) */
const MAX_TOOL_STEPS = 20;

// =============================================================================
// Active run registry (in-process AbortControllers)
// Used by stop_run / absorb_run to abort LLM generation mid-stream.
// =============================================================================

const activeAbortControllers = new Map<string, AbortController>();

export function getAbortController(runId: string): AbortController | undefined {
  return activeAbortControllers.get(runId);
}

// =============================================================================
// executeRun — main entry point
// =============================================================================

/**
 * Execute a run by ID. Handles the full agent lifecycle:
 * 1. Transition to 'running', emit agent.active
 * 2. Build agent (tools + model) and prompt
 * 3. streamText with stopWhen — SDK manages the tool-call loop across steps
 * 4. processStream consumes fullStream (emits Redis events for all steps)
 * 5. On natural stop: update status → 'completed', update lastProcessedMessageId
 * 6. On error: update status → 'failed'
 * 7. Always emit agent.inactive
 */
export async function executeRun(runId: string): Promise<void> {
  // ── Load run ───────────────────────────────────────────────────────────────
  const run = await prisma.run.findUnique({
    where: { id: runId },
    include: {
      agent: { select: { id: true, name: true } },
      agentEntity: { select: { id: true, displayName: true } },
    },
  });

  if (!run) {
    console.error(`[run-runner] Run ${runId} not found`);
    return;
  }

  // Guard: don't re-execute runs that are already past queued
  if (run.status !== 'queued') {
    console.warn(`[run-runner] Run ${runId} is ${run.status}, skipping execution`);
    return;
  }

  const agentEntityId = run.agentEntityId;
  const agentName = run.agentEntity.displayName ?? run.agent.name;
  const agentId = run.agentId;

  // ── 1. Transition to running ───────────────────────────────────────────────
  await prisma.run.update({
    where: { id: runId },
    data: { status: 'running', startedAt: new Date() },
  });

  // Emit agent.active to all spaces the agent is a member of
  await emitAgentStatusToAllSpaces(agentEntityId, agentName, 'active', runId);

  // ── Set up AbortController for this run ───────────────────────────────────
  const abortController = new AbortController();
  activeAbortControllers.set(runId, abortController);
  let waitingTool = false;

  // ── Set up activeSpaceId closure (mutable) ────────────────────────────────
  // Read initial value from DB (may already be set by agent-trigger for space_message)
  let currentActiveSpaceId: string | null = run.activeSpaceId ?? null;

  const getActiveSpaceId = () => currentActiveSpaceId;
  const setActiveSpaceId = async (spaceId: string) => {
    currentActiveSpaceId = spaceId;
    await prisma.run.update({
      where: { id: runId },
      data: { activeSpaceId: spaceId },
    });
  };

  // ── Build RunActionLog (in-memory, tracks all actions during this run) ────
  const actionLog: RunActionLog = {
    entries: [],
    add(entry: Omit<RunActionEntry, 'step' | 'timestamp'>) {
      this.entries.push({
        ...entry,
        step: this.entries.length + 1,
        timestamp: new Date().toISOString(),
      });
    },
    toSummary() {
      return {
        toolsCalled: this.entries
          .filter((e) => e.action === 'tool_call')
          .map((e) => ({ name: e.toolName!, args: e.toolArgs })),
        messagesSent: this.entries
          .filter((e) => e.action === 'message_sent')
          .map((e) => ({ spaceId: e.spaceId!, spaceName: e.spaceName, preview: e.messagePreview ?? '' })),
        spacesEntered: this.entries
          .filter((e) => e.action === 'space_entered')
          .map((e) => ({ spaceId: e.spaceId!, spaceName: e.spaceName })),
      };
    },
  };

  // ── Build trigger summary for embedding in message metadata ──────────────
  const triggerSummary: RunContext['triggerSummary'] = {
    type: run.triggerType ?? 'unknown',
    senderName: run.triggerSenderName ?? undefined,
    senderType: run.triggerSenderType ?? undefined,
    messageContent: run.triggerMessageContent ?? undefined,
    spaceId: run.triggerSpaceId ?? undefined,
    serviceName: run.triggerServiceName ?? undefined,
    planName: run.triggerPlanName ?? undefined,
  };

  // Resolve trigger space name for the summary
  if (run.triggerSpaceId) {
    const triggerSpace = await prisma.smartSpace.findUnique({
      where: { id: run.triggerSpaceId },
      select: { name: true },
    });
    if (triggerSpace?.name) triggerSummary.spaceName = triggerSpace.name;
  }

  // ── Build RunContext ───────────────────────────────────────────────────────
  const context: RunContext = {
    runId,
    agentEntityId,
    agentName,
    agentId,
    triggerSpaceId: run.triggerSpaceId ?? null,
    triggerType: run.triggerType ?? 'unknown',
    getActiveSpaceId,
    setActiveSpaceId,
    actionLog,
    triggerSummary,
  };

  try {
    // ── 2. Build agent (tools + model) and prompt ────────────────────────────
    const [builtAgent, builtPrompt] = await Promise.all([
      buildAgent(runId, context),
      buildPrompt({ runId, agentEntityId, agentName, agentId }),
    ]);

    // Emit run.started
    await emitRunEvent(runId, {
      type: 'run.started',
      runId,
      agentEntityId,
    });

    // ── 3. streamText — SDK manages the tool-call loop via stopWhen ──────────
    // fullStream yields events across ALL steps so the stream-processor can
    // intercept send_message deltas and visible tool events in real-time.
    // Tools without execute functions (space/external) stop the loop
    // automatically — this is how waiting_tool will work.
    const streamResult = streamText({
      model: builtAgent.model as LanguageModel,
      system: builtPrompt.systemPrompt,
      messages: [{ role: 'user' as const, content: 'Execute this run.' }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: builtAgent.tools as any,
      abortSignal: abortController.signal,
      stopWhen: stepCountIs(MAX_TOOL_STEPS),
      prepareStep: async ({ stepNumber }) => {
        // Check if run was canceled between steps (e.g. by stop_run)
        if (stepNumber > 0) {
          const currentRun = await prisma.run.findUnique({
            where: { id: runId },
            select: { status: true },
          });
          if (currentRun?.status === 'canceled') {
            abortController.abort();
          }
        }
        return {};
      },
    });

    // ── 4. Process the full multi-step stream ────────────────────────────────
    // Emits Redis events (space.message.streaming, tool.started, etc.) and
    // collects tool calls for the run channel. The SDK handles message
    // accumulation and tool result injection internally.
    const result = await processStream(streamResult.fullStream, {
      runId,
      agentEntityId,
      getActiveSpaceId,
      visibleTools: builtAgent.visibleToolNames,
    });

    if (result.finishReason === 'error') {
      throw new Error(`Stream error in run ${runId}`);
    }

    // ── 5. Check for pending client tool calls → waiting_tool ────────────
    const pendingClientToolCalls = result.toolCalls.filter(
      (tc) => builtAgent.clientToolNames.has(tc.toolName),
    );

    if (pendingClientToolCalls.length > 0) {
      // Persist pending tool calls so the tool-results endpoint can match them
      await Promise.all(
        pendingClientToolCalls.map((tc, idx) =>
          prisma.toolCall.create({
            data: {
              runId,
              seq: idx + 1,
              callId: tc.toolCallId,
              toolName: tc.toolName,
              args: tc.args as any,
              status: 'requested',
            },
          }),
        ),
      );

      await prisma.run.update({
        where: { id: runId },
        data: { status: 'waiting_tool' },
      });

      // Emit waiting_tool event
      await emitRunEvent(runId, {
        type: 'run.waiting_tool',
        runId,
        agentEntityId,
        toolCalls: pendingClientToolCalls.map((tc) => ({
          callId: tc.toolCallId,
          toolName: tc.toolName,
          args: tc.args,
        })),
      });

      const activeSpaceId = getActiveSpaceId();
      if (activeSpaceId) {
        await emitSmartSpaceEvent(activeSpaceId, {
          type: 'run.waiting_tool',
          runId,
          agentEntityId,
          toolCalls: pendingClientToolCalls.map((tc) => ({
            callId: tc.toolCallId,
            toolName: tc.toolName,
            args: tc.args,
          })),
        });
      }

      // Don't emit agent.inactive — agent is waiting for tool results
      waitingTool = true;
      return;
    }

    // ── 5b. Mark completed + update lastProcessedMessageId ───────────────
    await prisma.run.update({
      where: { id: runId },
      data: { status: 'completed', completedAt: new Date() },
    });

    // Update lastProcessedMessageId for the agent in the active space
    const finalActiveSpaceId = getActiveSpaceId();
    if (finalActiveSpaceId) {
      await updateLastProcessedMessage(finalActiveSpaceId, agentEntityId);
    }

    // Emit run.completed to the active space (if any) and run channel
    await emitRunEvent(runId, { type: 'run.completed', runId, agentEntityId });
    if (finalActiveSpaceId) {
      await emitSmartSpaceEvent(finalActiveSpaceId, {
        type: 'run.completed',
        runId,
        agentEntityId,
      });
    }
  } catch (err) {
    // ── 6. Handle errors ──────────────────────────────────────────────────────
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[run-runner] Run ${runId} failed:`, errMsg);

    // Don't update status if run was already canceled
    const currentRun = await prisma.run.findUnique({
      where: { id: runId },
      select: { status: true },
    });
    if (currentRun && currentRun.status !== 'canceled') {
      await prisma.run.update({
        where: { id: runId },
        data: { status: 'failed', completedAt: new Date(), errorMessage: errMsg },
      });
    }

    await emitRunEvent(runId, { type: 'run.failed', runId, agentEntityId, error: errMsg });

    const activeSpaceId = getActiveSpaceId();
    if (activeSpaceId) {
      await emitSmartSpaceEvent(activeSpaceId, {
        type: 'run.failed',
        runId,
        agentEntityId,
        error: errMsg,
      });
    }
  } finally {
    // ── 7. Cleanup + emit agent.inactive (unless waiting for tool results) ────
    activeAbortControllers.delete(runId);
    if (!waitingTool) {
      await emitAgentStatusToAllSpaces(agentEntityId, agentName, 'inactive', runId);
    }
  }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Emit agent.active or agent.inactive to every space the agent is a member of.
 */
async function emitAgentStatusToAllSpaces(
  agentEntityId: string,
  agentName: string,
  status: 'active' | 'inactive',
  runId: string,
): Promise<void> {
  const memberships = await prisma.smartSpaceMembership.findMany({
    where: { entityId: agentEntityId },
    select: { smartSpaceId: true },
  });

  await Promise.all(
    memberships.map((m) =>
      emitSmartSpaceEvent(m.smartSpaceId, {
        type: `agent.${status}`,
        agentEntityId,
        agentName,
        runId,
      }),
    ),
  );
}

/**
 * After a run completes, advance lastProcessedMessageId for the agent in the space.
 * This powers the [SEEN]/[NEW] markers in the next run's context.
 */
async function updateLastProcessedMessage(
  spaceId: string,
  agentEntityId: string,
): Promise<void> {
  const latestMsg = await prisma.smartSpaceMessage.findFirst({
    where: { smartSpaceId: spaceId },
    orderBy: { seq: 'desc' },
    select: { id: true },
  });

  if (latestMsg) {
    await prisma.smartSpaceMembership.updateMany({
      where: { smartSpaceId: spaceId, entityId: agentEntityId },
      data: { lastProcessedMessageId: latestMsg.id },
    });
  }
}
