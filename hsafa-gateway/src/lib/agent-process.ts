import { streamText, stepCountIs, type LanguageModel } from 'ai';
import type Redis from 'ioredis';
import { prisma } from './db.js';
import { createBlockingRedis } from './redis.js';
import {
  drainInbox,
  waitForInbox,
  formatInboxEvents,
  inboxSize,
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
import { processStream, type CollectedToolCall } from './stream-processor.js';
import { formatDuration } from './time-utils.js';
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

const DEFAULT_MAX_STEPS = 5;

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

  let activeSpaceId: string | null = null;
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

  // Safety reset: if consciousness is suspiciously large with no successful cycles,
  // reset to empty to prevent infinite tool-call loops from corrupted history
  const MAX_STARTUP_MESSAGES = 120;
  if (consciousness.length > MAX_STARTUP_MESSAGES) {
    console.log(`[agent-process] ${agentName} consciousness too large (${consciousness.length} messages), resetting to fresh start`);
    consciousness = [];
    cycleCount = 0;
    activeSpaceId = null;
    await saveConsciousness(agentEntityId, [], 0);
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
    tryLockEnterSpace: () => true,
    unlockEnterSpace: () => {},
  };

  // Build tools and model (once — rebuilt if config changes)
  const built = await buildAgent(agent.configJson as any, context);

  // Crash recovery: re-push any events stuck in 'processing' from a previous crash
  const recovered = await recoverStuckEvents(agentEntityId);
  if (recovered > 0) {
    console.log(`[agent-process] ${agentName} recovered ${recovered} stuck inbox events`);
  }

  console.log(`[agent-process] ${agentName} (${agentEntityId}) started — cycle ${cycleCount}, consciousness=${consciousness.length} messages`);

  // ── Main loop ─────────────────────────────────────────────────────────────

  while (!signal.aborted) {
    try {
      // 1. SLEEP — block until inbox has events
      console.log(`[DEBUG:agent-process] ${agentName} waiting for inbox...`);
      const firstEvent = await waitForInbox(agentEntityId, blockingRedis, signal);
      if (signal.aborted || !firstEvent) break;
      console.log(`[DEBUG:agent-process] ${agentName} woke up with event type=${firstEvent.type}`);

      // 2. DRAIN — pull all pending events
      const remainingEvents = await drainInbox(agentEntityId);
      const allEvents: InboxEvent[] = [firstEvent, ...remainingEvents];
      console.log(`[DEBUG:agent-process] ${agentName} drained ${allEvents.length} events`);

      if (allEvents.length === 0) continue;

      // Reset active space at the start of each cycle — the agent must explicitly
      // call enter_space to select which space to act in. This ensures the model
      // always makes a conscious decision about WHERE to respond.
      activeSpaceId = null;
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

      console.log(`[DEBUG:agent-process] ${agentName} starting think cycle ${cycleCount} with ${allEvents.length} events, runId=${run.id}`);

      // 7. THINK — one streamText call
      const maxSteps = (agent.configJson as any)?.loop?.maxSteps ?? DEFAULT_MAX_STEPS;
      const agentConfig = agent.configJson as any;

      const result = streamText({
        model: built.model as LanguageModel,
        messages: consciousness as any,
        tools: built.tools as any,
        toolChoice: (agentConfig?.loop?.toolChoice as any) ?? 'auto',
        temperature: agentConfig?.model?.temperature,
        maxOutputTokens: agentConfig?.model?.maxTokens,
        stopWhen: [stepCountIs(maxSteps)],

        providerOptions: {
          openai: { parallelToolCalls: false },
        },

        prepareStep: async ({ stepNumber }) => {
          if (stepNumber === 0) return {};

          const elapsed = ((Date.now() - cycleStart) / 1000).toFixed(1);
          const pending = await inboxSize(agentEntityId);
          const parts = [`step ${stepNumber + 1}`, `${elapsed}s into cycle`];
          if (pending > 0) parts.push(`${pending} new inbox event(s) waiting`);

          return {
            messages: [{ role: 'user' as const, content: `[${parts.join(' | ')}]` }],
          };
        },
      });

      console.log(`[DEBUG:agent-process] ${agentName} stream started, processing...`);

      // 8. PROCESS STREAM — handle tool events, streaming to spaces
      const streamResult = await processStream(result.fullStream, {
        runId: run.id,
        agentEntityId,
        getActiveSpaceId: () => activeSpaceId,
        visibleTools: built.visibleToolNames,
        asyncTools: built.asyncToolNames,
      });

      console.log(`[DEBUG:agent-process] ${agentName} stream processed, toolCalls=${streamResult.toolCalls.length}`);

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

      // 10b. APPEND cycle timeline — gives agent temporal awareness
      const cycleDurationMs = Date.now() - cycleStart;
      const timelineParts: string[] = [`Cycle ${cycleCount} complete in ${formatDuration(cycleDurationMs)}`];
      if (streamResult.toolCalls.length > 0) {
        const toolSummaries = streamResult.toolCalls
          .map((tc: CollectedToolCall) => `${tc.toolName}(${tc.durationMs != null ? formatDuration(tc.durationMs) : '?'})`)
          .join(', ');
        timelineParts.push(`tools: ${toolSummaries}`);
      }
      consciousness.push({ role: 'user', content: `[${timelineParts.join(' | ')}]` });

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
      if (error instanceof Error) console.error(`[agent-process] stack:`, error.stack);

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
