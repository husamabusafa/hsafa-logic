import { ToolLoopAgent, stepCountIs, hasToolCall, type LanguageModel } from 'ai';
import type Redis from 'ioredis';
import { prisma } from './db.js';
import { createBlockingRedis } from './redis.js';
import {
  drainInbox,
  waitForInbox,
  formatInboxEvents,
  inboxSize,
  peekInbox,
  formatInboxPreview,
  markEventsProcessing,
  markEventsProcessed,
  recoverStuckEvents,
} from './inbox.js';
import {
  loadConsciousness,
  saveConsciousness,
  compactConsciousness,
  estimateTokens,
  refreshSystemPrompt,
  type ModelMessage,
} from './consciousness.js';
import { processStream } from './stream-processor.js';
import { emitSmartSpaceEvent } from './smartspace-events.js';
import { getSpacesForEntity } from './membership-service.js';
import { buildAgent } from '../agent-builder/builder.js';
import { buildSystemPrompt } from '../agent-builder/prompt-builder.js';
import type { AgentProcessContext, BuiltAgent, InboxEvent } from '../agent-builder/types.js';

// =============================================================================
// Agent Process (v3)
//
// The persistent while(true) loop: sleep → wake → think → act → sleep.
// One process per agent. Replaces the stateless run-runner from v2.
// =============================================================================

/** Safety net only — should never trigger. The agent uses the `done` tool to signal completion. */
const SAFETY_MAX_STEPS = 50;

/**
 * Create a ToolLoopAgent instance with our configuration.
 * Encapsulates model, tools, loop control, and step preparation.
 * Rebuilt when the model changes (e.g. graceful degradation).
 */
function createAgentInstance(
  built: BuiltAgent,
  context: AgentProcessContext,
  agentConfig: any,
  cycleState: { start: number },
): ToolLoopAgent {
  return new ToolLoopAgent({
    model: built.model as LanguageModel,
    tools: built.tools as any,
    toolChoice: agentConfig?.loop?.toolChoice ?? 'auto',
    // temperature + maxOutputTokens are applied via model middleware (see model-registry.ts)
    stopWhen: [
      hasToolCall('done'),
      stepCountIs(SAFETY_MAX_STEPS),
    ],
    experimental_context: context,
    providerOptions: {
      openai: { parallelToolCalls: false },
    },
    prepareStep: async ({ stepNumber, messages }) => {
      if (stepNumber === 0) return {};
      const parts: string[] = [];
      const elapsed = Date.now() - cycleState.start;
      parts.push(`Current time: ${new Date().toISOString()} (cycle running ${Math.round(elapsed / 1000)}s)`);
      try {
        const pending = await inboxSize(context.agentEntityId);
        if (pending > 0) {
          const preview = await peekInbox(context.agentEntityId, 3);
          parts.push(formatInboxPreview(preview));
        }
      } catch {
        // Non-critical — skip if Redis hiccups
      }
      if (parts.length === 0) return {};
      return {
        messages: [
          ...messages,
          { role: 'system' as const, content: parts.join('\n') },
        ],
      };
    },
  });
}

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

  // Load consciousness (includes persisted runtime state)
  let { messages: consciousness, cycleCount, metadata: consciousnessMetadata } = await loadConsciousness(agentEntityId);

  // Restore activeSpaceId from persisted metadata — the agent remembers which
  // space it was in from the previous cycle. Only reset if the space no longer
  // exists or the agent is no longer a member.
  let activeSpaceId: string | null = consciousnessMetadata.activeSpaceId ?? null;
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

  // Ship #4: Compaction instead of amnesia — if consciousness is large, compact it
  // instead of wiping everything. The agent keeps compressed history.
  const maxTokens = (agent.configJson as any)?.consciousness?.maxTokens ?? 200_000;
  const startupTokens = estimateTokens(consciousness);
  if (startupTokens > maxTokens) {
    console.log(`[agent-process] ${agentName} consciousness large (${startupTokens} est. tokens), compacting...`);
    consciousness = compactConsciousness(consciousness, maxTokens);
    await saveConsciousness(agentEntityId, consciousness, cycleCount, { activeSpaceId });
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
  };

  // Build tools and model (once — rebuilt if config changes)
  const built = await buildAgent(agent.configJson as any, context);
  const agentConfig = agent.configJson as any;

  // Crash recovery: re-push any events stuck in 'processing' from a previous crash
  const recovered = await recoverStuckEvents(agentEntityId);
  if (recovered > 0) {
    console.log(`[agent-process] ${agentName} recovered ${recovered} stuck inbox events`);
  }

  // Ship #17: Graceful degradation — track consecutive failures for adaptive behavior
  let consecutiveFailures = 0;
  const originalModel = built.model;

  // Create the ToolLoopAgent — encapsulates model, tools, loop control, prepareStep
  const cycleState = { start: 0 };
  let currentAgent = createAgentInstance(built, context, agentConfig, cycleState);

  console.log(`[agent-process] ${agentName} (${agentEntityId}) started — cycle ${cycleCount}, consciousness=${consciousness.length} messages`);

  // ── Main loop ─────────────────────────────────────────────────────────────

  while (!signal.aborted) {
    let preCycleConsciousness: ModelMessage[] | null = null;
    let preCycleCycleCount = cycleCount;
    try {
      // 1. SLEEP — block until inbox has events
      const firstEvent = await waitForInbox(agentEntityId, blockingRedis, signal);
      if (signal.aborted || !firstEvent) break;

      // 2. DRAIN — pull all pending events
      const remainingEvents = await drainInbox(agentEntityId);
      const allEvents: InboxEvent[] = [firstEvent, ...remainingEvents];

      if (allEvents.length === 0) continue;

      // activeSpaceId is preserved across cycles (persisted in consciousness
      // metadata). The agent remembers being in a space and can send_message
      // immediately without re-entering. It only changes when the agent calls
      // enter_space explicitly.
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

      cycleState.start = Date.now();

      // 4. EMIT agent.active to all spaces
      await emitAgentStatus(agentEntityId, 'active', { runId: run.id, agentName });

      // 5. REFRESH system prompt
      const systemPrompt = await buildSystemPrompt(agentId, agentEntityId, agentName);
      consciousness = refreshSystemPrompt(consciousness, systemPrompt);

      // 6. INJECT inbox events as user message
      // Snapshot before mutation — used for crash recovery
      preCycleConsciousness = [...consciousness];
      preCycleCycleCount = cycleCount - 1;

      const inboxMessage: ModelMessage = {
        role: 'user',
        content: formatInboxEvents(allEvents),
      };
      consciousness.push(inboxMessage);

      // 7. THINK — one ToolLoopAgent.stream() call
      // All config (model, tools, stopWhen, prepareStep, experimental_context)
      // is encapsulated in the agent. The agent decides when it's done via
      // the `done` tool (hasToolCall('done') stops the loop after execution).
      const result = await currentAgent.stream({
        messages: consciousness as any,
      });

      // 8. PROCESS STREAM — collect tool calls, track durations, emit run events
      // (Space-facing streaming is handled by tool lifecycle hooks on each tool)
      const streamResult = await processStream(result.fullStream, {
        runId: run.id,
        agentEntityId,
      });

      // 9. EXTRACT done tool metadata (if agent called done)
      const doneTool = streamResult.toolCalls.find((tc) => tc.toolName === 'done');
      const doneSummary = doneTool ? (doneTool.args as any)?.summary : undefined;
      const isNoAction = doneTool && !doneSummary;

      if (isNoAction) {
        console.log(`[agent-process] ${agentName} cycle ${cycleCount} — done (nothing to do)`);
      }

      // 10. COLLECT response messages
      const response = await result.response;
      const newMessages = response.messages as unknown as ModelMessage[];

      // 11. APPEND new messages to consciousness
      consciousness.push(...newMessages);

      // 12. COMPACT if over budget
      consciousness = compactConsciousness(consciousness, maxTokens);

      // 13. SAVE consciousness (including runtime state like activeSpaceId)
      await saveConsciousness(agentEntityId, consciousness, cycleCount, {
        activeSpaceId,
      });

      // 14. UPDATE audit record
      const usage = await result.totalUsage;
      const durationMs = Date.now() - cycleState.start;

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

      // Success — reset failure counter and restore original model if degraded
      consecutiveFailures = 0;
      if (built.model !== originalModel) {
        console.log(`[agent-process] ${agentName} restored to original model after recovery`);
        built.model = originalModel;
        currentAgent = createAgentInstance(built, context, agentConfig, cycleState);
      }

      console.log(
        `[agent-process] ${agentName} cycle ${cycleCount} complete ` +
        `(${allEvents.length} events, ${streamResult.toolCalls.length} tools, ${durationMs}ms)`
      );

    } catch (error) {
      if (signal.aborted) break;

      consecutiveFailures++;
      console.error(`[agent-process] ${agentName} cycle error (failure #${consecutiveFailures}):`, error);
      if (error instanceof Error) console.error(`[agent-process] stack:`, error.stack);

      // CRASH RECOVERY: rollback consciousness so the next cycle starts clean.
      if (preCycleConsciousness) {
        consciousness = preCycleConsciousness;
        cycleCount = preCycleCycleCount;
        context.cycleCount = cycleCount;
        console.log(`[agent-process] ${agentName} consciousness rolled back to pre-cycle state`);
      }

      // Mark events as failed in Postgres
      if (context.currentRunId) {
        await prisma.inboxEvent.updateMany({
          where: { runId: context.currentRunId, status: 'processing' },
          data: { status: 'failed' },
        }).catch(() => {});
      }

      // Update run as failed
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

      // Ship #13: Error classification + adaptive recovery
      const errorClass = classifyError(error);
      console.log(`[agent-process] ${agentName} error class: ${errorClass}`);

      if (errorClass === 'auth') {
        // Auth errors won't fix themselves — long rest, don't count as consecutive
        console.warn(`[agent-process] ${agentName} auth error — resting 5 minutes`);
        await sleep(300_000);
        consecutiveFailures = 0;
      } else if (consecutiveFailures >= 5) {
        // Long rest, then retry with original model
        console.warn(`[agent-process] ${agentName} resting for 5 minutes after ${consecutiveFailures} consecutive failures`);
        await sleep(300_000);
        consecutiveFailures = 0;
        built.model = originalModel;
        currentAgent = createAgentInstance(built, context, agentConfig, cycleState);
      } else if (consecutiveFailures >= 3) {
        // Try a simpler/cheaper model
        try {
          const { registry } = await import('./model-registry.js');
          built.model = registry.languageModel('openai:gpt-4o-mini' as any);
          currentAgent = createAgentInstance(built, context, agentConfig, cycleState);
          console.log(`[agent-process] ${agentName} switching to fallback model after ${consecutiveFailures} failures`);
        } catch {
          // If registry fails, just use longer backoff
        }
        await sleep(jitter(10_000));
      } else if (errorClass === 'rate_limit') {
        // Rate limits: longer backoff with jitter to avoid thundering herd
        const base = errorClass === 'rate_limit' ? 15_000 : 5_000;
        const backoff = Math.min(base * Math.pow(2, consecutiveFailures - 1), 60_000);
        await sleep(jitter(backoff));
      } else if (errorClass === 'model_overloaded') {
        // Model overloaded: medium backoff
        await sleep(jitter(10_000 * consecutiveFailures));
      } else {
        // Default: exponential backoff with jitter
        const backoff = Math.min(5_000 * Math.pow(2, consecutiveFailures - 1), 30_000);
        await sleep(jitter(backoff));
      }
    }
  }

  // Graceful shutdown
  console.log(`[agent-process] ${agentName} shutting down`);
  await saveConsciousness(agentEntityId, consciousness, cycleCount, {
    activeSpaceId,
  });
  blockingRedis.disconnect();

  // Close MCP clients
  for (const mcp of built.mcpClients) {
    try {
      await mcp.close();
      console.log(`[agent-process] ${agentName} closed MCP client "${mcp.name}"`);
    } catch {
      // Best effort
    }
  }
}

// =============================================================================
// Error classification + backoff helpers (Ship #13)
// =============================================================================

type ErrorClass = 'rate_limit' | 'auth' | 'model_overloaded' | 'network' | 'unknown';

/**
 * Classify an error for adaptive recovery strategy.
 * Matches common patterns from OpenAI, Anthropic, Google, and OpenRouter APIs.
 */
function classifyError(error: unknown): ErrorClass {
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  const status = (error as any)?.status ?? (error as any)?.statusCode ?? 0;

  if (status === 429 || msg.includes('rate limit') || msg.includes('too many requests')) {
    return 'rate_limit';
  }
  if (status === 401 || status === 403 || msg.includes('unauthorized') || msg.includes('invalid api key') || msg.includes('permission denied')) {
    return 'auth';
  }
  if (status === 503 || msg.includes('overloaded') || msg.includes('capacity') || msg.includes('service unavailable')) {
    return 'model_overloaded';
  }
  if (msg.includes('econnrefused') || msg.includes('enotfound') || msg.includes('timeout') || msg.includes('network')) {
    return 'network';
  }
  return 'unknown';
}

/** Sleep for a given number of milliseconds */
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Add ±25% random jitter to a delay to prevent thundering herd */
function jitter(base: number): number {
  return base * (0.75 + Math.random() * 0.5);
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
    const spaces = await getSpacesForEntity(agentEntityId);

    const event = {
      type: `agent.${status}`,
      agentEntityId,
      agentName: meta.agentName,
      runId: meta.runId,
    };

    await Promise.all(
      spaces.map((s) => emitSmartSpaceEvent(s.spaceId, event)),
    );
  } catch (err) {
    console.warn(`[agent-process] Failed to emit agent.${status}:`, err);
  }
}
