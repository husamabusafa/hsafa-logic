// =============================================================================
// Run Runner
// =============================================================================
// Main agentic loop. Ties builder → prompt-builder → streamText → stream-processor
// together. Called by agent-trigger (fire-and-forget) and the service trigger route.

import { streamText, type LanguageModel } from 'ai';
import { prisma } from './db.js';
import { emitSmartSpaceEvent, emitRunEvent } from './smartspace-events.js';
import { processStream } from './stream-processor.js';
import { buildAgent } from '../agent-builder/builder.js';
import { buildPrompt } from '../agent-builder/prompt-builder.js';
import type { RunContext } from '../agent-builder/types.js';

// =============================================================================
// Constants
// =============================================================================

/** Max tool-call loops per run before forcing a stop (prevents infinite loops) */
const MAX_TOOL_LOOPS = 20;

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
 * 3. streamText → processStream (collect tool calls)
 * 4. Execute tool calls → inject results
 * 5. Loop back to step 3 if finishReason === 'tool-calls'
 * 6. On natural stop: update status → 'completed', update lastProcessedMessageId
 * 7. On error: update status → 'failed'
 * 8. Always emit agent.inactive
 */
export async function executeRun(runId: string): Promise<void> {
  // ── Load run ───────────────────────────────────────────────────────────────
  let run = await prisma.run.findUnique({
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
  };

  try {
    // ── 2. Build agent (tools + model) and prompt ────────────────────────────
    const [builtAgent, builtPrompt] = await Promise.all([
      buildAgent(runId, context),
      buildPrompt({ runId, agentEntityId, agentName, agentId }),
    ]);

    // ── 3–5. Agentic tool-call loop ───────────────────────────────────────────
    // Model messages accumulate tool calls and results across loop iterations.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const modelMessages: any[] = [];
    let loopCount = 0;

    while (loopCount < MAX_TOOL_LOOPS) {
      loopCount++;

      // Check if run was canceled mid-loop (e.g. by stop_run)
      const currentRun = await prisma.run.findUnique({
        where: { id: runId },
        select: { status: true },
      });
      if (currentRun?.status === 'canceled') {
        console.log(`[run-runner] Run ${runId} was canceled, stopping loop`);
        return;
      }

      // Emit run.started on first iteration
      if (loopCount === 1) {
        await emitRunEvent(runId, {
          type: 'run.started',
          runId,
          agentEntityId,
        });
      }

      // Call the LLM
      const streamResult = streamText({
        model: builtAgent.model as LanguageModel,
        system: builtPrompt.systemPrompt,
        messages: modelMessages,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tools: builtAgent.tools as any,
        abortSignal: abortController.signal,
        // No stopWhen/maxSteps — we manage the loop manually so the
        // stream-processor can intercept send_message deltas in real-time.
      });

      // Process the stream (emits Redis events, collects tool calls)
      const result = await processStream(streamResult.fullStream, {
        runId,
        agentEntityId,
        getActiveSpaceId,
        visibleTools: builtAgent.visibleToolNames,
      });

      if (result.finishReason === 'error') {
        throw new Error(`Stream error in run ${runId}`);
      }

      // If no tool calls → agent is done (natural stop)
      if (result.toolCalls.length === 0 || result.finishReason !== 'tool-calls') {
        break;
      }

      // Detect client/space tools (no execute function) — transition to waiting_tool
      // For now: if all tool calls are against known non-prebuilt tools that
      // are space/external execution type, we'd set waiting_tool.
      // The simplified MVP: just execute all tools that have results.
      // Tools without execute functions in the AI SDK will produce no result —
      // the SDK skips them. This means we only loop when there are results.

      // Append assistant message with tool calls to model messages
      const toolCallParts = result.toolCalls.map((tc) => ({
        type: 'tool-call' as const,
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        input: tc.args,
      }));

      modelMessages.push({
        role: 'assistant',
        content: [
          ...(result.internalText ? [{ type: 'text' as const, text: result.internalText }] : []),
          ...toolCallParts,
        ],
      });

      // The AI SDK already executed the tools via the execute functions.
      // Collect results from the stream's tool results.
      // The stream-processor collected toolCalls but not results directly —
      // however since execute() runs inside the SDK, results are emitted as
      // tool-result events that the stream-processor also sees.
      // We need to get the actual results to inject into modelMessages.
      // The AI SDK's streamText collects results accessible via result.toolResults.
      const toolResults = await streamResult.toolResults;

      if (toolResults.length > 0) {
        // Append tool results as a tool message
        modelMessages.push({
          role: 'tool',
          content: toolResults.map((tr) => ({
            type: 'tool-result' as const,
            toolCallId: tr.toolCallId,
            toolName: tr.toolName,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            output: (tr as any).output ?? (tr as any).result,
          })),
        });
      }
    }

    if (loopCount >= MAX_TOOL_LOOPS) {
      console.warn(`[run-runner] Run ${runId} hit MAX_TOOL_LOOPS (${MAX_TOOL_LOOPS})`);
    }

    // ── 6. Mark completed + update lastProcessedMessageId ────────────────────
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
    // ── 7. Handle errors ──────────────────────────────────────────────────────
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
    // ── 8. Always emit agent.inactive ─────────────────────────────────────────
    activeAbortControllers.delete(runId);
    await emitAgentStatusToAllSpaces(agentEntityId, agentName, 'inactive', runId);
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
