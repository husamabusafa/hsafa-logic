import { prisma } from './db.js';
import { redis, createBlockingRedis } from './redis.js';
import { buildHaseef } from '../agent-builder/builder.js';
import {
  loadConsciousness,
  saveConsciousness,
  pruneConsciousness,
  maybeAutoSnapshot,
  estimateTokens,
  type ModelMessage,
} from './consciousness.js';
import {
  drainInbox,
  waitForInbox,
  markEventsProcessing,
  markEventsProcessed,
  recoverStuckEvents,
  formatInboxEvents,
} from './inbox.js';
import {
  buildSystemPrompt,
  selectMemories,
  searchArchive,
} from '../agent-builder/prompt-builder.js';
import { processStream } from './stream-processor.js';
import { HaseefConfigSchema } from '../agent-builder/types.js';
import { stepCountIs } from 'ai';

// =============================================================================
// Agent Process (v5)
//
// The think loop — one long-running process per Haseef.
// Cycle: SLEEP → DRAIN → FETCH → BUILD → THINK → SAVE → repeat
// =============================================================================

const DEFAULT_MAX_TOKENS = 200_000;

interface StartOptions {
  haseefId: string;
  haseefName: string;
  signal: AbortSignal;
}

/**
 * Start the continuous think loop for a Haseef.
 * This function runs indefinitely until the signal is aborted.
 */
export async function startHaseefProcess(opts: StartOptions): Promise<void> {
  const { haseefId, haseefName, signal } = opts;

  console.log(`[process] ${haseefName} starting...`);

  // Dedicated Redis connection for BRPOP (blocking)
  const blockingRedis = createBlockingRedis();

  // Recover any events stuck from a previous crash
  const recovered = await recoverStuckEvents(haseefId);
  if (recovered > 0) {
    console.log(`[process] ${haseefName} recovered ${recovered} stuck events`);
  }

  // Load initial state
  let haseef = await prisma.haseef.findUniqueOrThrow({ where: { id: haseefId } });
  let config = HaseefConfigSchema.parse(haseef.configJson);
  let cachedConfigHash = haseef.configHash;
  let consciousness = await loadConsciousness(haseefId);

  console.log(`[process] ${haseefName} ready (cycle ${consciousness.cycleCount}, ${estimateTokens(consciousness.messages)} tokens)`);

  // ── Main loop ──────────────────────────────────────────────────────────────

  while (!signal.aborted) {
    try {
      // 1. SLEEP — wait for inbox events
      const wakeEvent = await waitForInbox(haseefId, blockingRedis, signal);
      if (signal.aborted || !wakeEvent) break;

      // 2. DRAIN — pull all pending events
      // BRPOP already consumed one event (wakeEvent), so drain the rest
      // then prepend the wake event. Deduplicate by eventId.
      const moreEvents = await drainInbox(haseefId);
      const seen = new Set(moreEvents.map((e) => e.eventId));
      const events = seen.has(wakeEvent.eventId)
        ? moreEvents
        : [wakeEvent, ...moreEvents];
      if (events.length === 0) continue;

      const cycleStart = Date.now();
      const newCycleCount = consciousness.cycleCount + 1;

      // 3. FETCH per-cycle data (parallel)
      const [dbHaseef, dbTools, dbScopes] = await Promise.all([
        prisma.haseef.findUniqueOrThrow({ where: { id: haseefId } }),
        prisma.haseefTool.findMany({ where: { haseefId } }),
        prisma.haseefScope.findMany({ where: { haseefId }, select: { scope: true, instructions: true } }),
      ]);
      haseef = dbHaseef;

      // Scope instructions from extensions (stored in HaseefScope table)
      const scopeInstructions = new Map<string, string>();
      for (const s of dbScopes) {
        if (s.instructions) scopeInstructions.set(s.scope, s.instructions);
      }

      // 4. CHECK CONFIG — rebuild model only if hash changed
      if (haseef.configHash !== cachedConfigHash) {
        config = HaseefConfigSchema.parse(haseef.configJson);
        cachedConfigHash = haseef.configHash;
        console.log(`[process] ${haseefName} config changed — rebuilt`);
      }

      // Determine trigger info from first event
      const firstEvent = events[0];
      const triggerScope = firstEvent?.scope ?? null;
      const triggerType = firstEvent?.type ?? null;

      // Create run record
      const run = await prisma.run.create({
        data: {
          haseefId,
          cycleNumber: newCycleCount,
          inboxEventCount: events.length,
          triggerScope,
          triggerType,
        },
      });

      // Mark events as processing
      const eventIds = events.map((e) => e.eventId);
      await markEventsProcessing(haseefId, eventIds);

      // 5. SELECT MEMORIES
      const eventText = events.map((e) => JSON.stringify(e.data)).join(' ');
      const { selected: memories, totalCount: totalMemoryCount } = await selectMemories(haseefId, eventText);

      // 5b. SEARCH ARCHIVE
      const relevantPast = await searchArchive(haseefId, eventText);

      // 6. BUILD TOOLS from DB rows + prebuilt
      const context = {
        haseefId,
        haseefName,
        cycleCount: newCycleCount,
        currentRunId: run.id,
      };
      const built = await buildHaseef(haseef.configJson, context, dbTools);

      // 7. BUILD SYSTEM PROMPT
      const consciousnessRecord = await prisma.haseefConsciousness.findUnique({
        where: { haseefId },
        select: { lastCycleAt: true },
      });

      const connectedScopes = dbScopes.map((s) => s.scope);

      const systemPrompt = buildSystemPrompt({
        haseefId,
        haseefName,
        cycleCount: newCycleCount,
        createdAt: haseef.createdAt,
        lastCycleAt: consciousnessRecord?.lastCycleAt ?? null,
        profileJson: haseef.profileJson as Record<string, unknown> | null,
        config,
        memories,
        totalMemoryCount,
        relevantPast,
        connectedScopes,
        scopeInstructions,
      });

      // 8. INJECT events into consciousness
      // Save pre-cycle length so we can roll back on failure
      const preCycleMessageCount = consciousness.messages.length;
      const eventMessage: ModelMessage = {
        role: 'user',
        content: formatInboxEvents(events),
      };
      consciousness.messages.push(eventMessage);

      // 9. THINK — stream with AI SDK
      const messagesForLLM = consciousness.messages.filter((m) => m.role !== 'system');

      // Emit run.started (includes trigger info for stream bridge routing)
      const triggerSpaceId = (firstEvent?.data as Record<string, unknown>)?.spaceId as string | undefined;
      await redis.publish(`haseef:${haseefId}:stream`, JSON.stringify({
        type: 'run.started',
        runId: run.id,
        haseefId,
        cycleNumber: newCycleCount,
        triggerScope,
        triggerType,
        triggerSource: triggerSpaceId ?? null,
      }));

      // Use streamText from AI SDK
      const { streamText } = await import('ai');
      const result = streamText({
        model: built.model as any,
        tools: built.tools as any,
        system: systemPrompt,
        messages: messagesForLLM as any,
         stopWhen: stepCountIs(50),
        toolCallStreaming: true,
      } as any);

      // 10. PROCESS stream — wrapped in try/finally to ALWAYS emit run.finished
      let cycleToolCount = 0;
      let cycleError: string | null = null;
      try {
        const t0 = Date.now();
        const streamResult = await processStream(result.fullStream, {
          runId: run.id,
          haseefId,
        });
        const streamMs = Date.now() - t0;
        cycleToolCount = streamResult.toolCalls.length;

        // Log tool call breakdown (only if slow)
        if (streamMs > 3000) {
          const toolNames = streamResult.toolCalls.map((tc) => tc.toolName);
          console.log(`[process] ${haseefName} stream done (${streamMs}ms, tools: [${toolNames.join(', ')}])`);
        }

        // If the stream had errors and produced no output, throw with the actual
        // error message — prevents the generic AI SDK "No output generated" error
        if (streamResult.streamErrors.length > 0 && streamResult.toolCalls.length === 0 && !streamResult.text) {
          throw new Error(`LLM stream error: ${streamResult.streamErrors.join('; ')}`);
        }

        // 11. APPEND result messages to consciousness
        const t1 = Date.now();
        const responseMessages = await result.response;
        const responseMs = Date.now() - t1;
        if (responseMs > 500) {
          console.warn(`[process] ${haseefName} await result.response took ${responseMs}ms`);
        }
        if (responseMessages?.messages) {
          for (const msg of responseMessages.messages) {
            consciousness.messages.push(msg as unknown as ModelMessage);
          }
        }

        // 12. PRUNE consciousness — archive old cycles if over budget
        const maxTokens = config.consciousness?.maxTokens ?? DEFAULT_MAX_TOKENS;
        consciousness.messages = await pruneConsciousness(
          haseefId,
          consciousness.messages,
          newCycleCount,
          maxTokens,
        );

        // 13. SAVE consciousness
        consciousness.cycleCount = newCycleCount;
        await saveConsciousness(haseefId, consciousness.messages, newCycleCount);

        // Auto-snapshot check
        await maybeAutoSnapshot(haseefId, newCycleCount);

        // Mark events as processed
        await markEventsProcessed(haseefId, eventIds);

        // Update run record
        const durationMs = Date.now() - cycleStart;
        await prisma.run.update({
          where: { id: run.id },
          data: {
            status: 'completed',
            completedAt: new Date(),
            stepCount: streamResult.toolCalls.length,
            durationMs,
          },
        });

      } catch (innerErr) {
        // Roll back consciousness to pre-cycle state — prevents stacking
        // user messages on repeated failures
        consciousness.messages.length = preCycleMessageCount;

        // Stream or post-stream error — update run as failed
        cycleError = innerErr instanceof Error ? innerErr.message : String(innerErr);
        console.error(`[process] ${haseefName} cycle #${newCycleCount} inner error:`, cycleError);

        const durationMs = Date.now() - cycleStart;
        await prisma.run.update({
          where: { id: run.id },
          data: {
            status: 'failed',
            completedAt: new Date(),
            stepCount: cycleToolCount,
            durationMs,
            errorMessage: cycleError?.slice(0, 2000) ?? null,
          },
        }).catch(() => {});

        // Re-throw so the outer catch handles backoff/retry
        throw innerErr;
      } finally {
        // ALWAYS emit run.finished — prevents permanent "thinking" indicator
        const durationMs = Date.now() - cycleStart;
        await redis.publish(`haseef:${haseefId}:stream`, JSON.stringify({
          type: 'run.finished',
          runId: run.id,
          haseefId,
          cycleNumber: newCycleCount,
          durationMs,
          stepCount: cycleToolCount,
          ...(cycleError ? { error: cycleError } : {}),
        })).catch(() => {});

        // Close MCP clients after cycle (regardless of success/failure)
        for (const client of built.mcpClients) {
          client.close().catch((err) => {
            console.warn(`[process] ${haseefName} MCP client close error:`, err instanceof Error ? err.message : err);
          });
        }
      }

    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[process] ${haseefName} cycle error:`, errMsg);

      // Mark stuck events as failed so they don't block the next cycle
      await recoverStuckEvents(haseefId).catch(() => 0);

      // Brief pause to avoid tight error loops
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  // Cleanup
  blockingRedis.disconnect();
  console.log(`[process] ${haseefName} stopped`);
}
