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
  maybeAutoSnapshot,
  type ModelMessage,
} from './consciousness.js';
import { processStream } from './stream-processor.js';
import { emitRunEvent } from './run-events.js';
import { buildHaseef } from '../agent-builder/builder.js';
import { buildSystemPrompt } from '../agent-builder/prompt-builder.js';
import { normalizeSystemMessages } from './model-compat.js';
import type { HaseefProcessContext, BuiltHaseef, InboxEvent, ServiceEventData } from '../agent-builder/types.js';
import { SENSE_TYPE } from '../agent-builder/types.js';

// =============================================================================
// Haseef Process (v4)
//
// The persistent while(true) loop: sleep → wake → think → act → sleep.
// One process per Haseef.
// =============================================================================

/** Safety net only — should never trigger. The Haseef uses the `done` tool to signal completion. */
const SAFETY_MAX_STEPS = 50;

/**
 * Create a ToolLoopAgent instance with our configuration.
 * Encapsulates model, tools, loop control, and step preparation.
 * Rebuilt when the model changes (e.g. graceful degradation).
 */
function createHaseefInstance(
  built: BuiltHaseef,
  context: HaseefProcessContext,
  haseefConfig: any,
  cycleState: { start: number },
): ToolLoopAgent {
  return new ToolLoopAgent({
    model: built.model as LanguageModel,
    tools: built.tools as any,
    toolChoice: haseefConfig?.loop?.toolChoice ?? 'auto',
    // temperature + maxOutputTokens are applied via model middleware (see model-registry.ts)
    stopWhen: [
      hasToolCall('done'),
      stepCountIs(SAFETY_MAX_STEPS),
    ],
    experimental_context: context,
    providerOptions: {
      openai: { parallelToolCalls: false },
      anthropic: { thinking: { type: 'enabled', budgetTokens: 16000 } },
    },
    prepareStep: async ({ stepNumber, messages }) => {
      if (stepNumber === 0) return {};
      const parts: string[] = [];
      const elapsed = Date.now() - cycleState.start;
      parts.push(`Current time: ${new Date().toISOString()} (cycle running ${Math.round(elapsed / 1000)}s)`);
      try {
        const pending = await inboxSize(context.haseefId);
        if (pending > 0) {
          const preview = await peekInbox(context.haseefId, 3);
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

export interface HaseefProcessOptions {
  haseefId: string;
  haseefName: string;
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
 * 7. Process stream (tool calls, run events)
 * 8. Append new messages to consciousness
 * 9. Compact if over budget
 * 10. Save consciousness
 * 11. Loop back to step 2
 */
export async function startHaseefProcess(options: HaseefProcessOptions): Promise<void> {
  const { haseefId, haseefName, signal } = options;

  // Dedicated Redis connection for blocking BRPOP
  const blockingRedis: Redis = createBlockingRedis();

  // Load consciousness (includes persisted runtime state)
  let { messages: consciousness, cycleCount } = await loadConsciousness(haseefId);

  const haseef = await prisma.haseef.findUniqueOrThrow({
    where: { id: haseefId },
  });

  // Ship #4: Compaction instead of amnesia — if consciousness is large, compact it
  // instead of wiping everything. The agent keeps compressed history.
  const maxTokens = (haseef.configJson as any)?.consciousness?.maxTokens ?? 200_000;
  const startupTokens = estimateTokens(consciousness);
  if (startupTokens > maxTokens) {
    console.log(`[haseef-process] ${haseefName} consciousness large (${startupTokens} est. tokens), compacting...`);
    consciousness = compactConsciousness(consciousness, maxTokens);
    await saveConsciousness(haseefId, consciousness, cycleCount, {});
  }

  // Build process context
  const context: HaseefProcessContext = {
    haseefId,
    haseefName,
    cycleCount,
    currentRunId: null,
  };

  // Build tools and model (once — rebuilt if config changes)
  const built = await buildHaseef(haseef.configJson as any, context);
  const haseefConfig = haseef.configJson as any;

  // Crash recovery: re-push any events stuck in 'processing' from a previous crash
  const recovered = await recoverStuckEvents(haseefId);
  if (recovered > 0) {
    console.log(`[haseef-process] ${haseefName} recovered ${recovered} stuck inbox events`);
  }

  let consecutiveFailures = 0;

  // Create the ToolLoopAgent — encapsulates model, tools, loop control, prepareStep
  const cycleState = { start: 0 };
  let currentInstance = createHaseefInstance(built, context, haseefConfig, cycleState);

  console.log(`[haseef-process] ${haseefName} (${haseefId}) started — cycle ${cycleCount}, consciousness=${consciousness.length} messages`);

  // ── Main loop ─────────────────────────────────────────────────────────────

  while (!signal.aborted) {
    let preCycleConsciousness: ModelMessage[] | null = null;
    let preCycleCycleCount = cycleCount;
    try {
      // 1. SLEEP — block until inbox has events
      const firstEvent = await waitForInbox(haseefId, blockingRedis, signal);
      if (signal.aborted || !firstEvent) break;

      // 2. DRAIN — pull all pending events
      const remainingEvents = await drainInbox(haseefId);
      const allEvents: InboxEvent[] = [firstEvent, ...remainingEvents];

      if (allEvents.length === 0) continue;

      cycleCount++;
      context.cycleCount = cycleCount;

      // 3. CREATE AUDIT RECORD — Run record for this think cycle
      // Use channel:type as the triggerType for v4 SenseEvent format
      const first = allEvents[0];
      const firstData = first.data as Record<string, unknown>;
      const isService = first.type === SENSE_TYPE.SERVICE;
      const run = await prisma.run.create({
        data: {
          haseefId,
          status: 'running',
          cycleNumber: cycleCount,
          inboxEventCount: allEvents.length,
          triggerType: `${first.channel}:${first.type}`,
          triggerSource: first.source || undefined,
          triggerEntityId: (firstData.senderEntityId as string) || undefined,
          triggerPayload: isService
            ? (firstData as unknown as ServiceEventData).payload as any
            : undefined,
        },
      });
      context.currentRunId = run.id;

      // Track eventIds for Postgres lifecycle
      const eventIds = allEvents.map((e) => e.eventId);

      // Mark events as processing in Postgres (linked to this run)
      await markEventsProcessing(haseefId, eventIds, run.id);

      cycleState.start = Date.now();

      // 4. EMIT run.start for extensions (e.g. ext-spaces emits agent.active to spaces)
      // triggerSource = spaceId for space-triggered runs — lets extensions route
      // tool streaming events to the correct space without a DB lookup
      await emitRunEvent(run.id, {
        type: 'run.start',
        runId: run.id,
        haseefId,
        triggerType: run.triggerType ?? undefined,
        triggerSource: run.triggerSource ?? undefined,
      });

      // 5. REFRESH system prompt (v4: includes extension instructions)
      const systemPrompt = await buildSystemPrompt(haseefId, haseefName, built.extensionInstructions);
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
      //
      // Normalize: Anthropic doesn't support multiple system messages separated
      // by user/assistant messages. Convert any non-first system messages to
      // user messages. This is safe for all providers.
      const normalizedMessages = normalizeSystemMessages(consciousness);
      const result = await currentInstance.stream({
        messages: normalizedMessages as any,
      });

      // 8. PROCESS STREAM — collect tool calls, track durations, emit run events
      // (Space-facing streaming is handled by tool lifecycle hooks on each tool)
      const streamResult = await processStream(result.fullStream, {
        runId: run.id,
        haseefId,
      });

      // 9. EXTRACT done tool metadata (if agent called done)
      const doneTool = streamResult.toolCalls.find((tc) => tc.toolName === 'done');
      const doneSummary = doneTool ? (doneTool.args as any)?.summary : undefined;
      const isNoAction = doneTool && !doneSummary;

      if (isNoAction) {
        console.log(`[haseef-process] ${haseefName} cycle ${cycleCount} — done (nothing to do)`);
      }

      // 10. COLLECT response messages
      const response = await result.response;
      const newMessages = response.messages as unknown as ModelMessage[];

      // 11. APPEND new messages to consciousness
      consciousness.push(...newMessages);

      // 12. COMPACT if over budget
      consciousness = compactConsciousness(consciousness, maxTokens);

      // 13. SAVE consciousness
      await saveConsciousness(haseefId, consciousness, cycleCount, {});

      // 13b. AUTO-SNAPSHOT (§6.3) — every 50 cycles
      await maybeAutoSnapshot(haseefId, cycleCount);

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
      await markEventsProcessed(haseefId, eventIds);

      // 15. EMIT run.finish for extensions (e.g. ext-spaces emits agent.inactive to spaces)
      await emitRunEvent(run.id, {
        type: 'run.finish',
        runId: run.id,
        haseefId,
        status: 'completed',
      });

      // Success — reset failure counter
      consecutiveFailures = 0;

      console.log(
        `[haseef-process] ${haseefName} cycle ${cycleCount} complete ` +
        `(${allEvents.length} events, ${streamResult.toolCalls.length} tools, ${durationMs}ms)`
      );

    } catch (error) {
      if (signal.aborted) break;

      consecutiveFailures++;
      console.error(`[haseef-process] ${haseefName} cycle error (failure #${consecutiveFailures}):`, error);
      if (error instanceof Error) console.error(`[haseef-process] stack:`, error.stack);

      // CRASH RECOVERY: rollback consciousness so the next cycle starts clean.
      if (preCycleConsciousness) {
        consciousness = preCycleConsciousness;
        cycleCount = preCycleCycleCount;
        context.cycleCount = cycleCount;
        console.log(`[haseef-process] ${haseefName} consciousness rolled back to pre-cycle state`);
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

      // Emit run.finish on failure for extensions
      if (context.currentRunId) {
        await emitRunEvent(context.currentRunId, {
          type: 'run.finish',
          runId: context.currentRunId,
          haseefId,
          status: 'failed',
        }).catch(() => {});
      }

      // Ship #13: Error classification + adaptive recovery
      const errorClass = classifyError(error);
      console.log(`[haseef-process] ${haseefName} error class: ${errorClass}`);

      if (errorClass === 'auth') {
        // Auth errors won't fix themselves — long rest, don't count as consecutive
        console.warn(`[haseef-process] ${haseefName} auth error — resting 5 minutes`);
        await sleep(300_000);
        consecutiveFailures = 0;
      } else if (consecutiveFailures >= 5) {
        // Many failures — long rest, then retry with same model
        console.warn(`[haseef-process] ${haseefName} resting for 5 minutes after ${consecutiveFailures} consecutive failures`);
        await sleep(300_000);
        consecutiveFailures = 0;
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
  console.log(`[haseef-process] ${haseefName} shutting down`);
  await saveConsciousness(haseefId, consciousness, cycleCount, {});
  blockingRedis.disconnect();

  // Close MCP clients
  for (const mcp of built.mcpClients) {
    try {
      await mcp.close();
      console.log(`[haseef-process] ${haseefName} closed MCP client "${mcp.name}"`);
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

