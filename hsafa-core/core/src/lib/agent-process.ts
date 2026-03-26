import { prisma } from './db.js';
import { redis, createBlockingRedis } from './redis.js';
import { buildHaseef } from '../agent-builder/builder.js';
import { buildV7Tools } from './tool-builder.js';
import { emitLifecycleToScope } from './tool-dispatcher.js';
import {
  loadConsciousness,
  saveConsciousness,
  pruneConsciousness,
  maybeAutoSnapshot,
  estimateTokens,
  type ModelMessage,
} from './consciousness.js';
import {
  waitForEvent,
  logEvent,
  recoverUnprocessedEvents,
  formatEventForConsciousness,
} from './inbox.js';
import {
  buildSystemPrompt,
  selectMemories,
  searchArchive,
} from '../agent-builder/prompt-builder.js';
import { processStream } from './stream-processor.js';
import { HaseefConfigSchema } from '../agent-builder/types.js';
import type { SenseEvent } from '../agent-builder/types.js';
import { stepCountIs, hasToolCall } from 'ai';

// =============================================================================
// Agent Process (v6 — Event-Driven Interrupt/Rerun)
//
// No cycles. No batching. No inbox queue.
//
// Each event triggers a new run. If a run is already in progress, it is
// interrupted: completed work is preserved in consciousness, incomplete
// work is discarded, and a new run starts with the new event injected.
//
// This is how a human brain works — continuous reaction, not batch processing.
//
// Flow: WAIT → EVENT → [INTERRUPT if running] → RUN → SAVE → WAIT
// =============================================================================

const DEFAULT_MAX_TOKENS = 200_000;

/** Maximum steps per run (safety limit). */
const MAX_STEPS = 50;

interface StartOptions {
  haseefId: string;
  haseefName: string;
  signal: AbortSignal;
}

/** Handle to an active run that can be interrupted. */
interface ActiveRun {
  runId: string;
  /** Abort the LLM stream. */
  abortController: AbortController;
  /** Resolves when the run fully completes (stream + save). */
  promise: Promise<void>;
}

/**
 * Start the event-driven process for a Haseef.
 * Runs indefinitely until the signal is aborted.
 */
export async function startHaseefProcess(opts: StartOptions): Promise<void> {
  const { haseefId, haseefName, signal } = opts;

  console.log(`[process] ${haseefName} starting...`);

  // Dedicated Redis connection for BRPOP (blocking)
  const blockingRedis = createBlockingRedis();

  // Recover any events from a previous crash
  const recovered = await recoverUnprocessedEvents(haseefId);
  if (recovered > 0) {
    console.log(`[process] ${haseefName} recovered ${recovered} unprocessed events`);
  }

  // Load initial state
  let haseef = await prisma.haseef.findUniqueOrThrow({ where: { id: haseefId } });
  let config = HaseefConfigSchema.parse(haseef.configJson);
  let cachedConfigHash = haseef.configHash;
  let consciousness = await loadConsciousness(haseefId);
  let runCount = consciousness.cycleCount; // renamed internally but DB field stays

  console.log(`[process] ${haseefName} ready (run ${runCount}, ${estimateTokens(consciousness.messages)} tokens)`);

  // ── Active run tracking ────────────────────────────────────────────────────

  let activeRun: ActiveRun | null = null;

  // ── Main event loop ────────────────────────────────────────────────────────

  while (!signal.aborted) {
    try {
      // 1. WAIT — block until an event arrives (zero CPU)
      const event = await waitForEvent(haseefId, blockingRedis, signal);
      if (signal.aborted || !event) break;

      // 2. DRAIN — grab any other events already in the queue (no waiting)
      const events = await drainPendingEvents(haseefId, event);
      if (signal.aborted) break;

      // 3. INTERRUPT — if a run is active, cancel it
      if (activeRun) {
        console.log(`[process] ${haseefName} interrupting run ${activeRun.runId.slice(0, 8)}...`);
        activeRun.abortController.abort();
        // Wait for the interrupted run to clean up (saves partial consciousness)
        await activeRun.promise.catch(() => {});
        // Reload consciousness — the interrupted run may have saved partial work
        consciousness = await loadConsciousness(haseefId);
        runCount = consciousness.cycleCount;
        activeRun = null;
      }

      // 4. START NEW RUN
      const runAbort = new AbortController();
      const newRunCount = runCount + 1;

      const runPromise = executeRun({
        haseefId,
        haseefName,
        events,
        consciousness,
        runCount: newRunCount,
        config,
        cachedConfigHash,
        runSignal: runAbort.signal,
        processSignal: signal,
      }).then((result) => {
        // Run completed normally — update local state
        consciousness = result.consciousness;
        runCount = result.runCount;
        config = result.config;
        cachedConfigHash = result.cachedConfigHash;
        haseef = result.haseef;
        activeRun = null;
      }).catch((err) => {
        // Run failed (not interrupted) — log and continue
        if (!runAbort.signal.aborted) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error(`[process] ${haseefName} run error:`, errMsg);
        }
        activeRun = null;
      });

      activeRun = {
        runId: `pending-${newRunCount}`,
        abortController: runAbort,
        promise: runPromise,
      };

      // Don't await — we go back to waiting for the next event immediately.
      // If a new event arrives while the run is in progress, we'll interrupt it.

    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[process] ${haseefName} event loop error:`, errMsg);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  // ── Shutdown ─────────────────────────────────────────────────────────────

  // Cancel any active run
  if (activeRun) {
    activeRun.abortController.abort();
    await activeRun.promise.catch(() => {});
  }

  blockingRedis.disconnect();
  console.log(`[process] ${haseefName} stopped`);
}

// =============================================================================
// Drain — Grab any events already queued (no waiting)
// =============================================================================

/**
 * After BRPOP returns the trigger event, instantly drain any other events
 * already sitting in the Redis list. No waiting, no debounce.
 */
async function drainPendingEvents(
  haseefId: string,
  triggerEvent: SenseEvent,
): Promise<SenseEvent[]> {
  const events: SenseEvent[] = [triggerEvent];
  const seen = new Set<string>([triggerEvent.eventId]);
  const key = `events:${haseefId}`;

  // Non-blocking drain — grab everything already in the list
  while (true) {
    const item = await redis.rpop(key);
    if (!item) break;

    try {
      const event = JSON.parse(item) as SenseEvent;
      if (!seen.has(event.eventId)) {
        seen.add(event.eventId);
        events.push(event);
      }
    } catch {
      // Skip unparseable
    }
  }

  return events;
}

// =============================================================================
// Execute Run — The actual thinking work
// =============================================================================

interface RunOptions {
  haseefId: string;
  haseefName: string;
  events: SenseEvent[];
  consciousness: { messages: ModelMessage[]; cycleCount: number };
  runCount: number;
  config: ReturnType<typeof HaseefConfigSchema.parse>;
  cachedConfigHash: string | null;
  /** Signal to abort THIS run (interrupt). */
  runSignal: AbortSignal;
  /** Signal for the entire process (shutdown). */
  processSignal: AbortSignal;
}

interface RunResult {
  consciousness: { messages: ModelMessage[]; cycleCount: number };
  runCount: number;
  config: ReturnType<typeof HaseefConfigSchema.parse>;
  cachedConfigHash: string | null;
  haseef: any;
}

async function executeRun(opts: RunOptions): Promise<RunResult> {
  const {
    haseefId,
    haseefName,
    events,
    consciousness,
    runCount,
    runSignal,
  } = opts;
  let { config, cachedConfigHash } = opts;

  const runStart = Date.now();

  // 1. FETCH per-run data (parallel)
  const [dbHaseef, dbTools, dbScopes] = await Promise.all([
    prisma.haseef.findUniqueOrThrow({ where: { id: haseefId } }),
    prisma.haseefTool.findMany({ where: { haseefId } }),
    prisma.haseefScope.findMany({ where: { haseefId }, select: { scope: true, instructions: true } }),
  ]);
  const haseef = dbHaseef;

  // v7: load global scope tools if haseef has scopes[] set
  const v7ScopeNames: string[] = haseef.scopes ?? [];
  let v7Tools: Record<string, unknown> = {};
  if (v7ScopeNames.length > 0) {
    const globalToolRows = await prisma.scopeTool.findMany({
      where: { scope: { name: { in: v7ScopeNames } } },
      include: { scope: { select: { name: true } } },
    }).catch(() => []);
    const v7ToolRows = globalToolRows.map((t: any) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      scopeName: t.scope.name,
    }));
    v7Tools = buildV7Tools(
      {
        id: haseef.id,
        name: haseef.name,
        profile: (haseef.profileJson as Record<string, unknown>) ?? {},
        scopes: v7ScopeNames,
      },
      v7ToolRows,
      config.actionTimeout,
    );
  }

  // Scope instructions from extensions
  const scopeInstructions = new Map<string, string>();
  for (const s of dbScopes) {
    if (s.instructions) scopeInstructions.set(s.scope, s.instructions);
  }

  // 2. CHECK CONFIG — rebuild model only if hash changed
  if (haseef.configHash !== cachedConfigHash) {
    config = HaseefConfigSchema.parse(haseef.configJson);
    cachedConfigHash = haseef.configHash;
    console.log(`[process] ${haseefName} config changed — rebuilt`);
  }

  // 3. Determine trigger info
  const firstEvent = events[0];
  const triggerScope = firstEvent?.scope ?? null;
  const triggerType = firstEvent?.type ?? null;

  // 4. Create run record
  const run = await prisma.run.create({
    data: {
      haseefId,
      cycleNumber: runCount,
      inboxEventCount: events.length,
      triggerScope,
      triggerType,
    },
  });

  // Log events to Postgres for audit trail
  for (const event of events) {
    await logEvent(haseefId, event, run.id);
  }

  // 5. SELECT MEMORIES
  const eventText = events.map((e) => JSON.stringify(e.data)).join(' ');
  const { selected: memories, totalCount: totalMemoryCount } = await selectMemories(haseefId, eventText);

  // 5b. SEARCH ARCHIVE
  const relevantPast = await searchArchive(haseefId, eventText);

  // 6. BUILD TOOLS
  const context = {
    haseefId,
    haseefName,
    runCount,
    currentRunId: run.id,
  };
  const built = await buildHaseef(haseef.configJson, context, dbTools, v7Tools);

  // 7. BUILD SYSTEM PROMPT
  const consciousnessRecord = await prisma.haseefConsciousness.findUnique({
    where: { haseefId },
    select: { lastCycleAt: true },
  });

  const connectedScopes = v7ScopeNames.length > 0
    ? v7ScopeNames
    : dbScopes.map((s) => s.scope);

  const systemPrompt = buildSystemPrompt({
    haseefId,
    haseefName,
    runCount,
    createdAt: haseef.createdAt,
    lastActiveAt: consciousnessRecord?.lastCycleAt ?? null,
    profileJson: haseef.profileJson as Record<string, unknown> | null,
    config,
    memories,
    totalMemoryCount,
    relevantPast,
    connectedScopes,
    scopeInstructions,
    persona: config.persona,
  });

  // 8. INJECT events into consciousness
  const preRunMessageCount = consciousness.messages.length;
  const eventContent = formatEventForConsciousness(events);
  const eventMessage: ModelMessage = {
    role: 'user',
    content: eventContent,
  };
  consciousness.messages.push(eventMessage);

  // 9. THINK — stream with AI SDK
  const messagesForLLM = consciousness.messages.filter((m) => m.role !== 'system');

  // Emit run.started — to Redis (legacy stream) + active scope SSE channels (v7)
  const triggerSpaceId = (firstEvent?.data as Record<string, unknown>)?.spaceId as string | undefined;
  const runStartedPayload = {
    runId: run.id,
    haseef: { id: haseefId, name: haseefName },
    triggerScope,
    triggerType,
  };
  await redis.publish(`haseef:${haseefId}:stream`, JSON.stringify({
    type: 'run.started',
    ...runStartedPayload,
    triggerSource: triggerSpaceId ?? null,
  }));
  for (const scope of connectedScopes) {
    emitLifecycleToScope(scope, 'run.started', runStartedPayload);
  }

  // Create abort-aware stream
  const { streamText } = await import('ai');
  const result = streamText({
    model: built.model as any,
    tools: built.tools as any,
    system: systemPrompt,
    messages: messagesForLLM as any,
    toolChoice: 'required' as any,
    stopWhen: [hasToolCall('done'), stepCountIs(MAX_STEPS)] as any,
    toolCallStreaming: true,
    abortSignal: runSignal,
    providerOptions: {
      openai: { parallelToolCalls: false },
      anthropic: { parallelToolCalls: false },
    },
  } as any);

  // 10. PROCESS stream
  let runToolCount = 0;
  let runError: string | null = null;
  let interrupted = false;

  try {
    const t0 = Date.now();
    const streamResult = await processStream(result.fullStream, {
      runId: run.id,
      haseefId,
    });
    const streamMs = Date.now() - t0;
    runToolCount = streamResult.toolCalls.length;

    if (streamMs > 3000) {
      const toolNames = streamResult.toolCalls.map((tc) => tc.toolName);
      console.log(`[process] ${haseefName} stream done (${streamMs}ms, tools: [${toolNames.join(', ')}])`);
    }

    // If the stream had errors and produced no output, throw
    if (streamResult.streamErrors.length > 0 && streamResult.toolCalls.length === 0 && !streamResult.text) {
      throw new Error(`LLM stream error: ${streamResult.streamErrors.join('; ')}`);
    }

    // 11. APPEND result messages to consciousness
    const responseMessages = await result.response;
    if (responseMessages?.messages) {
      for (const msg of responseMessages.messages) {
        consciousness.messages.push(msg as unknown as ModelMessage);
      }
    }

    // 12. PRUNE consciousness if over budget
    const maxTokens = config.consciousness?.maxTokens ?? DEFAULT_MAX_TOKENS;
    consciousness.messages = await pruneConsciousness(
      haseefId,
      consciousness.messages,
      runCount,
      maxTokens,
    );

    // 13. SAVE consciousness
    consciousness.cycleCount = runCount;
    await saveConsciousness(haseefId, consciousness.messages, runCount);

    // Auto-snapshot check
    await maybeAutoSnapshot(haseefId, runCount);

    // Extract token usage
    let promptTokens = 0;
    let completionTokens = 0;
    try {
      const usage = (responseMessages as any)?.usage;
      if (usage) {
        promptTokens = typeof usage.inputTokens === 'object'
          ? usage.inputTokens?.total ?? 0
          : usage.inputTokens ?? usage.promptTokens ?? 0;
        completionTokens = typeof usage.outputTokens === 'object'
          ? usage.outputTokens?.total ?? 0
          : usage.outputTokens ?? usage.completionTokens ?? 0;
      }
    } catch {
      // Non-fatal
    }

    // Update run record
    const durationMs = Date.now() - runStart;
    await prisma.run.update({
      where: { id: run.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        stepCount: streamResult.toolCalls.length,
        durationMs,
        promptTokens,
        completionTokens,
      },
    });

  } catch (innerErr) {
    interrupted = runSignal.aborted;

    if (interrupted) {
      // ── INTERRUPT ROLLBACK ──────────────────────────────────────────────
      // The stream was aborted mid-flight. We need to:
      //   1. Keep completed tool calls + results in consciousness
      //   2. Discard incomplete work (partial text, in-progress tool calls)
      //
      // The response messages may contain partial data. We extract only
      // the fully completed assistant+tool message pairs.
      try {
        const responseMessages = await Promise.resolve(result.response).catch(() => null);
        const completedMessages = extractCompletedMessages(
          responseMessages?.messages as unknown as ModelMessage[] | undefined,
        );

        if (completedMessages.length > 0) {
          // Keep completed work — append to consciousness
          for (const msg of completedMessages) {
            consciousness.messages.push(msg);
          }
          console.log(`[process] ${haseefName} interrupted — preserved ${completedMessages.length} completed messages`);
        } else {
          // Nothing completed — roll back the injected event message too
          consciousness.messages.length = preRunMessageCount;
          console.log(`[process] ${haseefName} interrupted — no completed work, full rollback`);
        }
      } catch {
        // Failed to extract — safe rollback
        consciousness.messages.length = preRunMessageCount;
      }

      // Save partial consciousness so the next run sees preserved work
      consciousness.cycleCount = runCount;
      await saveConsciousness(haseefId, consciousness.messages, runCount).catch(() => {});

      // Mark run as interrupted
      const durationMs = Date.now() - runStart;
      await prisma.run.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          completedAt: new Date(),
          stepCount: runToolCount,
          durationMs,
          errorMessage: 'interrupted: new event arrived',
        },
      }).catch(() => {});

    } else {
      // ── NORMAL ERROR ──────────────────────────────────────────────────
      // Roll back consciousness to pre-run state
      consciousness.messages.length = preRunMessageCount;

      runError = innerErr instanceof Error ? innerErr.message : String(innerErr);
      console.error(`[process] ${haseefName} run #${runCount} error:`, runError);

      const durationMs = Date.now() - runStart;
      await prisma.run.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          completedAt: new Date(),
          stepCount: runToolCount,
          durationMs,
          errorMessage: runError?.slice(0, 2000) ?? null,
        },
      }).catch(() => {});
    }

    if (!interrupted) throw innerErr;

  } finally {
    // ALWAYS emit run.finished / run.completed
    const durationMs = Date.now() - runStart;
    await redis.publish(`haseef:${haseefId}:stream`, JSON.stringify({
      type: 'run.finished',
      runId: run.id,
      haseefId,
      runCount,
      durationMs,
      stepCount: runToolCount,
      interrupted,
      ...(runError ? { error: runError } : {}),
    })).catch(() => {});
    // v7 SSE scope channels
    if (!interrupted) {
      const completedPayload = {
        runId: run.id,
        haseef: { id: haseefId, name: haseefName },
        durationMs,
      };
      for (const scope of connectedScopes) {
        emitLifecycleToScope(scope, 'run.completed', completedPayload);
      }
    }

    // Close MCP clients
    for (const client of built.mcpClients) {
      client.close().catch((err) => {
        console.warn(`[process] ${haseefName} MCP client close error:`, err instanceof Error ? err.message : err);
      });
    }
  }

  return {
    consciousness,
    runCount,
    config,
    cachedConfigHash,
    haseef,
  };
}

// =============================================================================
// Interrupt Rollback — Extract completed messages from a partial stream
// =============================================================================

/**
 * From a potentially incomplete list of response messages, extract only the
 * fully completed ones. A completed assistant message has all its tool calls
 * matched by a subsequent tool-result message.
 */
function extractCompletedMessages(
  messages: ModelMessage[] | undefined | null,
): ModelMessage[] {
  if (!messages || messages.length === 0) return [];

  const completed: ModelMessage[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (msg.role === 'assistant') {
      // Check if this assistant message has tool calls
      const hasToolCalls = Array.isArray(msg.content) &&
        msg.content.some((p: any) => p.type === 'tool-call');

      if (hasToolCalls) {
        // Look for the matching tool result message
        const nextMsg = messages[i + 1];
        if (nextMsg && nextMsg.role === 'tool') {
          // Both the tool call and result are complete — keep both
          completed.push(msg);
          completed.push(nextMsg);
          i++; // skip the tool message (we already added it)
        }
        // If no matching tool result, the tool call was in-progress — DISCARD
      } else {
        // Text-only assistant message — keep (text was fully generated)
        completed.push(msg);
      }
    }
    // tool messages are handled paired with their assistant messages above
  }

  return completed;
}
