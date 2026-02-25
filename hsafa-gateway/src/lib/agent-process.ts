import { streamText, stepCountIs, type LanguageModel } from 'ai';
import type Redis from 'ioredis';
import { prisma } from './db.js';
import { createBlockingRedis } from './redis.js';
import {
  drainInbox,
  waitForInbox,
  formatInboxEvents,
  peekInbox,
  formatInboxPreview,
  markEventsProcessing,
  markEventsProcessed,
  markEventsFailed,
  recoverStuckEvents,
} from './inbox.js';
import {
  loadConsciousness,
  saveConsciousness,
  compactConsciousness,
  refreshSystemPrompt,
  type ModelMessage,
} from './consciousness.js';
import { processStream } from './stream-processor.js';
import { emitSmartSpaceEvent } from './smartspace-events.js';
import { buildAgent } from '../agent-builder/builder.js';
import { buildSystemPrompt } from '../agent-builder/prompt-builder.js';
import type { AgentProcessContext, InboxEvent } from '../agent-builder/types.js';

// =============================================================================
// Agent Process (v3)
//
// The persistent while(true) loop: sleep → wake → think → act → sleep.
// One process per agent. Replaces the stateless run-runner from v2.
// =============================================================================

const DEFAULT_MAX_STEPS = 20;

export interface AgentProcessOptions {
  agentId: string;
  agentEntityId: string;
  agentName: string;
  signal: AbortSignal;
}

/**
 * The core agent process loop.
 * Runs indefinitely until the abort signal fires.
 *
 * Lifecycle:
 * 1. Load consciousness from DB
 * 2. Block on inbox (BRPOP — zero CPU sleep)
 * 3. Drain all pending events
 * 4. Refresh system prompt
 * 5. Inject inbox events as user message
 * 6. streamText (think cycle)
 * 7. Process stream (streaming to spaces)
 * 8. Append new messages to consciousness
 * 9. Compact if over budget
 * 10. Save consciousness
 * 11. Loop back to step 2
 */
export async function startAgentProcess(options: AgentProcessOptions): Promise<void> {
  const { agentId, agentEntityId, agentName, signal } = options;

  // Dedicated Redis connection for blocking BRPOP
  const blockingRedis: Redis = createBlockingRedis();

  // Load consciousness
  let { messages: consciousness, cycleCount } = await loadConsciousness(agentEntityId);

  // Restore activeSpaceId from consciousness — scan backwards for last enter_space/leave_space
  let activeSpaceId: string | null = restoreActiveSpaceId(consciousness);
  const agent = await prisma.agent.findUniqueOrThrow({
    where: { id: agentId },
    include: {
      entity: {
        include: {
          smartSpaceMemberships: {
            include: {
              smartSpace: {
                include: {
                  memberships: {
                    include: { entity: { select: { id: true, displayName: true, type: true } } },
                  },
                },
              },
            },
          },
          memories: true,
          goals: true,
          plans: { where: { status: 'pending' } },
        },
      },
    },
  });

  // Mutable active space — restored from consciousness on startup, updated by enter/leave_space
  let enterSpaceLocked = false;
  if (activeSpaceId) {
    console.log(`[agent-process] ${agentName} restored activeSpaceId: ${activeSpaceId}`);
  }

  // Build process context
  const context: AgentProcessContext = {
    agentEntityId,
    agentName,
    agentId,
    cycleCount,
    currentRunId: null,
    getActiveSpaceId: () => activeSpaceId,
    setActiveSpaceId: (spaceId: string) => { activeSpaceId = spaceId; },
    clearActiveSpaceId: () => { activeSpaceId = null; },
    tryLockEnterSpace: () => {
      if (enterSpaceLocked) return false;
      enterSpaceLocked = true;
      return true;
    },
    unlockEnterSpace: () => { enterSpaceLocked = false; },
  };

  // Build tools and model (once — rebuilt if config changes)
  const built = await buildAgent(agent.configJson as any, context);

  // Crash recovery: re-push any events stuck in 'processing' from a previous crash
  const recovered = await recoverStuckEvents(agentEntityId);
  if (recovered > 0) {
    console.log(`[agent-process] ${agentName} recovered ${recovered} stuck inbox events`);
  }

  console.log(`[agent-process] ${agentName} (${agentEntityId}) started — cycle ${cycleCount}`);

  // ── Main loop ─────────────────────────────────────────────────────────────

  while (!signal.aborted) {
    try {
      // 1. SLEEP — block until inbox has events
      const firstEvent = await waitForInbox(agentEntityId, blockingRedis, signal);
      if (signal.aborted || !firstEvent) break;

      // 2. DRAIN — pull all pending events
      const remainingEvents = await drainInbox(agentEntityId);
      const allEvents: InboxEvent[] = [firstEvent, ...remainingEvents];

      if (allEvents.length === 0) continue;

      // activeSpaceId persists across cycles — once the agent enters a space,
      // it stays there until it explicitly calls leave_space or enter_space to switch.
      cycleCount++;
      context.cycleCount = cycleCount;

      // 3. CREATE AUDIT RECORD — Run record for this think cycle
      const run = await prisma.run.create({
        data: {
          agentEntityId,
          agentId,
          status: 'running',
          cycleNumber: cycleCount,
          inboxEventCount: allEvents.length,
          triggerType: allEvents[0].type,
          triggerSpaceId: allEvents[0].type === 'space_message'
            ? (allEvents[0].data as any).spaceId
            : undefined,
          triggerEntityId: allEvents[0].type === 'space_message'
            ? (allEvents[0].data as any).senderEntityId
            : undefined,
          triggerMessageId: allEvents[0].type === 'space_message'
            ? (allEvents[0].data as any).messageId
            : undefined,
          triggerPayload: allEvents[0].type === 'service'
            ? (allEvents[0].data as any).payload
            : undefined,
        },
      });
      context.currentRunId = run.id;

      // Track eventIds for Postgres lifecycle
      const eventIds = allEvents.map((e) => e.eventId);

      // Mark events as processing in Postgres (linked to this run)
      await markEventsProcessing(agentEntityId, eventIds, run.id);

      const cycleStart = Date.now();

      // 4. EMIT agent.active to all spaces
      await emitAgentStatus(agentEntityId, 'active', { runId: run.id, agentName });

      // 5. REFRESH system prompt
      const systemPrompt = await buildSystemPrompt(agentId, agentEntityId, agentName);
      consciousness = refreshSystemPrompt(consciousness, systemPrompt);

      // 6. INJECT inbox events as user message
      // Save pre-cycle snapshot for skip rollback
      const preCycleConsciousness = [...consciousness];
      const preCycleCycleCount = cycleCount - 1;

      const inboxMessage: ModelMessage = {
        role: 'user',
        content: formatInboxEvents(allEvents),
      };
      consciousness.push(inboxMessage);

      // 7. THINK — one streamText call
      const maxSteps = (agent.configJson as any)?.loop?.maxSteps ?? DEFAULT_MAX_STEPS;

      const agentConfig = agent.configJson as any;
      const result = streamText({
        model: built.model as LanguageModel,
        messages: consciousness as any,
        tools: built.tools as any,
        temperature: agentConfig?.model?.temperature,
        maxOutputTokens: agentConfig?.model?.maxTokens,
        stopWhen: stepCountIs(maxSteps),
        prepareStep: async ({ stepNumber }) => {
          const spaceId = activeSpaceId;
          const spaceContext = spaceId
            ? `ACTIVE SPACE: ${spaceId} — you are currently in this space. send_message will deliver here.`
            : `ACTIVE SPACE: none — you are not in any space. Call enter_space before send_message.`;

          // Step 0: inject active space reminder only
          if (stepNumber === 0) {
            return {
              messages: [{ role: 'user' as const, content: spaceContext }],
            };
          }

          // Step 1+: active space + mid-cycle inbox preview
          const pending = await peekInbox(agentEntityId, 5);
          const parts: string[] = [spaceContext];
          if (pending.length > 0) parts.push(formatInboxPreview(pending));

          return {
            messages: [{ role: 'user' as const, content: parts.join('\n\n') }],
          };
        },
      });

      // 8. PROCESS STREAM — handle tool events, streaming to spaces
      const streamResult = await processStream(result.fullStream, {
        runId: run.id,
        agentEntityId,
        getActiveSpaceId: () => activeSpaceId,
        visibleTools: built.visibleToolNames,
        asyncTools: built.asyncToolNames,
      });

      // 9. CHECK FOR SKIP — detect skip() tool call and roll back
      const response = await result.response;
      const newMessages = response.messages as unknown as ModelMessage[];

      if (isSkipCycle(newMessages)) {
        // Full rollback: restore consciousness, delete run, revert cycle count
        const reason = extractSkipReason(newMessages);
        consciousness = preCycleConsciousness;
        cycleCount = preCycleCycleCount;
        context.cycleCount = cycleCount;

        await prisma.run.delete({ where: { id: run.id } }).catch(() => {});
        // Reset events back to pending (they were never really processed)
        await markEventsFailed(agentEntityId, eventIds).catch(() => {});
        await emitAgentStatus(agentEntityId, 'inactive', { runId: run.id, agentName });

        console.log(`[agent-process] ${agentName} skipped cycle: ${reason}`);
        continue;
      }

      // 10. APPEND new messages to consciousness
      consciousness.push(...newMessages);

      // 11. COMPACT if over budget
      const maxTokens = (agent.configJson as any)?.consciousness?.maxTokens ?? 100_000;
      const minCycles = (agent.configJson as any)?.consciousness?.minRecentCycles ?? 10;
      consciousness = compactConsciousness(consciousness, maxTokens, minCycles);

      // 12. SAVE consciousness
      await saveConsciousness(agentEntityId, consciousness, cycleCount);

      // 13. UPDATE audit record
      const usage = await result.totalUsage;
      const durationMs = Date.now() - cycleStart;

      await prisma.run.update({
        where: { id: run.id },
        data: {
          status: 'completed',
          completedAt: new Date(),
          stepCount: streamResult.toolCalls.length,
          promptTokens: usage.inputTokens ?? 0,
          completionTokens: usage.outputTokens ?? 0,
          durationMs,
        },
      });

      // Mark all events as processed in Postgres
      await markEventsProcessed(agentEntityId, eventIds);

      // 14. EMIT agent.inactive
      await emitAgentStatus(agentEntityId, 'inactive', { runId: run.id, agentName });

      console.log(
        `[agent-process] ${agentName} cycle ${cycleCount} complete ` +
        `(${allEvents.length} events, ${streamResult.toolCalls.length} tools, ${durationMs}ms)`
      );

    } catch (error) {
      if (signal.aborted) break;

      console.error(`[agent-process] ${agentName} cycle error:`, error);

      // Mark events as failed in Postgres (they can be inspected / retried)
      if (context.currentRunId) {
        // eventIds might not be in scope if the error was before drain
        // Use a Postgres query to find events linked to this run
        await prisma.inboxEvent.updateMany({
          where: { runId: context.currentRunId, status: 'processing' },
          data: { status: 'failed' },
        }).catch(() => {});
      }

      // Update run as failed if we have one
      if (context.currentRunId) {
        try {
          await prisma.run.update({
            where: { id: context.currentRunId },
            data: {
              status: 'failed',
              completedAt: new Date(),
              errorMessage: error instanceof Error ? error.message : String(error),
            },
          });
        } catch {
          // Best effort
        }
      }

      await emitAgentStatus(agentEntityId, 'inactive', {
        runId: context.currentRunId,
        agentName,
      });

      // Wait before retrying to avoid tight error loops
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  // Graceful shutdown
  console.log(`[agent-process] ${agentName} shutting down`);
  await saveConsciousness(agentEntityId, consciousness, cycleCount);
  blockingRedis.disconnect();
}

// =============================================================================
// Active space restoration
// =============================================================================

/**
 * Scan consciousness backwards to find the last enter_space or leave_space tool call.
 * Returns the spaceId from the last enter_space, or null if the last action was leave_space
 * or no space action was found.
 */
function restoreActiveSpaceId(messages: ModelMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'assistant' || !Array.isArray(msg.content)) continue;
    for (const part of (msg.content as any[])) {
      if (part.type !== 'tool-call') continue;
      if (part.toolName === 'enter_space') return part.input?.spaceId ?? null;
      if (part.toolName === 'leave_space') return null;
    }
  }
  return null;
}

// =============================================================================
// Skip detection helpers
// =============================================================================

/**
 * Check if the agent called skip() — a tool call with no execute function.
 * The SDK stops the loop immediately, so it appears as an assistant message
 * with a tool-call content part where toolName === 'skip'.
 */
function isSkipCycle(messages: ModelMessage[]): boolean {
  for (const msg of messages) {
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      if (msg.content.some((p: any) => p.type === 'tool-call' && p.toolName === 'skip')) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Extract the reason string from a skip() tool call.
 */
function extractSkipReason(messages: ModelMessage[]): string {
  for (const msg of messages) {
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      const skipPart = (msg.content as any[]).find(
        (p) => p.type === 'tool-call' && p.toolName === 'skip',
      );
      if (skipPart?.args?.reason) return skipPart.args.reason;
    }
  }
  return 'irrelevant';
}

// =============================================================================
// Agent status helper
// =============================================================================

/**
 * Emit agent.active / agent.inactive to ALL spaces the agent is a member of.
 */
async function emitAgentStatus(
  agentEntityId: string,
  status: 'active' | 'inactive',
  meta: { runId: string | null; agentName: string },
): Promise<void> {
  try {
    const memberships = await prisma.smartSpaceMembership.findMany({
      where: { entityId: agentEntityId },
      select: { smartSpaceId: true },
    });

    const event = {
      type: `agent.${status}`,
      agentEntityId,
      agentName: meta.agentName,
      runId: meta.runId,
    };

    await Promise.all(
      memberships.map((m) => emitSmartSpaceEvent(m.smartSpaceId, event)),
    );
  } catch (err) {
    console.warn(`[agent-process] Failed to emit agent.${status}:`, err);
  }
}
