import { emitRunEvent } from './run-events.js';

// =============================================================================
// Stream Processor (v4)
//
// v4: Domain-specific streaming is handled by extensions, not core.
// This module handles:
//   1. Tool call collection (for the process loop return value)
//   2. Duration tracking (tool-input-start → tool-result)
//   3. Run-stream events (text.delta, tool-input.delta, tool.started,
//      tool.ready, tool.done, tool.error, step.finish, run.finish)
//   4. Internal text collection (debug)
//   5. Finish / error handling
//
// Extensions that want real-time streaming (e.g. ext-spaces) subscribe
// to run:{runId} and forward relevant events. Extensions that don't
// support streaming (e.g. ext-whatsapp) simply ignore these events.
// =============================================================================

// =============================================================================
// Types
// =============================================================================

export interface StreamProcessorOptions {
  runId: string;
  haseefId: string;
}

export interface CollectedToolCall {
  toolCallId: string;
  toolName: string;
  /** Fully parsed args — available after the tool-call part */
  args: unknown;
  /** Duration in milliseconds (set after tool-result) */
  durationMs?: number;
}

export interface StreamResult {
  /** All tool calls the LLM made in this generation step */
  toolCalls: CollectedToolCall[];
  /** LLM finish reason */
  finishReason: string;
  /** Haseef's internal text output (never streamed — collected for debug) */
  internalText: string;
}

// =============================================================================
// processStream
// =============================================================================

/**
 * Consumes a Vercel AI SDK `fullStream` and:
 *  - Collects all tool calls for the process loop
 *  - Tracks tool durations (input start → result)
 *  - Emits run-stream events (for node-sdk `runs.subscribe()`)
 *  - Handles stream errors (cleans up in-flight hooks)
 *
 * Space-facing events are handled by tool lifecycle hooks on each tool.
 */
export async function processStream(
  fullStream: AsyncIterable<any>,
  options: StreamProcessorOptions,
): Promise<StreamResult> {
  const { runId, haseefId } = options;

  const toolCalls: CollectedToolCall[] = [];
  /** Tracking: toolCallId → { toolName, startedAt, accumulatedArgs } for duration + partial args */
  const activeTiming = new Map<string, { toolName: string; startedAt: number; accumulatedArgs: string }>();
  let internalText = '';
  let finishReason = 'unknown';

  // ── Run-stream emit helper ──────────────────────────────────────────────

  const toRun = async (payload: Record<string, unknown>) => {
    await emitRunEvent(runId, payload as { type: string } & Record<string, unknown>);
  };

  // ── Stream loop ───────────────────────────────────────────────────────────

  for await (const part of fullStream) {
    switch (part.type as string) {

      // ── Agent text — published for extensions that want streaming ────────
      case 'text-delta': {
        const delta = (part.text as string) ?? '';
        internalText += delta;
        if (delta) {
          await toRun({
            type: 'text.delta',
            runId,
            haseefId,
            text: delta,
          });
        }
        break;
      }

      // ── Reasoning tokens — internal, ignored ────────────────────────────
      case 'reasoning':
      case 'reasoning-start':
      case 'reasoning-delta':
      case 'reasoning-end':
        break;

      // ── Tool call begins — record start time for duration tracking ──────
      case 'tool-input-start': {
        const toolCallId = (part.id ?? part.toolCallId) as string;
        const toolName = part.toolName as string;

        activeTiming.set(toolCallId, { toolName, startedAt: Date.now(), accumulatedArgs: '' });

        await toRun({
          type: 'tool.started',
          streamId: toolCallId,
          runId,
          haseefId,
          toolName,
        });
        break;
      }

      // ── Partial args — published for streaming-capable extensions ────────
      // Core accumulates the raw args text and attempts to parse it into
      // `partialArgs` on each delta. Extensions receive pre-parsed partial
      // args — no manual JSON parsing needed on their side.
      case 'tool-input-delta': {
        const toolCallId = (part.id ?? part.toolCallId) as string;
        const argsDelta = (part.argsTextDelta ?? part.inputTextDelta ?? '') as string;
        const timing = activeTiming.get(toolCallId);
        if (argsDelta && timing) {
          timing.accumulatedArgs += argsDelta;

          // Try to parse accumulated args into a usable object
          const partialArgs = tryParsePartialJson(timing.accumulatedArgs);

          await toRun({
            type: 'tool-input.delta',
            streamId: toolCallId,
            runId,
            haseefId,
            toolName: timing.toolName,
            delta: argsDelta,
            accumulatedArgs: timing.accumulatedArgs,
            ...(partialArgs ? { partialArgs } : {}),
          });
        }
        break;
      }

      // ── Full args collected (tool call ready to execute) ─────────────────
      case 'tool-call': {
        const toolCallId = part.toolCallId as string;
        const toolName = part.toolName as string;
        const args = part.input as unknown;

        toolCalls.push({ toolCallId, toolName, args, durationMs: undefined });

        await toRun({
          type: 'tool.ready',
          streamId: toolCallId,
          runId,
          haseefId,
          toolName,
          args,
        });
        break;
      }

      // ── Tool execution result ────────────────────────────────────────────
      case 'tool-result': {
        const toolCallId = part.toolCallId as string;
        const toolName = part.toolName as string;
        const result = part.output as unknown;

        // Record duration on the collected tool call
        const timing = activeTiming.get(toolCallId);
        if (timing) {
          const durationMs = Date.now() - timing.startedAt;
          const tc = toolCalls.find((t) => t.toolCallId === toolCallId);
          if (tc) tc.durationMs = durationMs;
          activeTiming.delete(toolCallId);
        }

        await toRun({
          type: 'tool.done',
          streamId: toolCallId,
          runId,
          haseefId,
          toolName,
          result,
        });
        break;
      }

      // ── Step finish (multi-step streaming) ──────────────────────────────
      case 'step-finish':
      case 'finish-step':
        if (part.finishReason) finishReason = part.finishReason as string;
        await toRun({
          type: 'step.finish',
          runId,
          haseefId,
          finishReason: part.finishReason as string,
        });
        break;

      // ── Final finish ────────────────────────────────────────────────────
      // Note: run.finish is NOT emitted here — agent-process emits it
      // at step 15 after all DB operations (consciousness save, run update)
      // are complete. Emitting here would cause duplicate events.
      case 'finish':
        if (part.finishReason) finishReason = part.finishReason as string;
        break;

      // ── Stream error ────────────────────────────────────────────────────
      case 'error': {
        const errMsg =
          part.error instanceof Error
            ? part.error.message
            : String(part.error ?? 'Stream error');
        console.error(`[stream-processor] runId=${runId} stream ERROR:`, errMsg, part.error);

        finishReason = 'error';

        // Clean up any timing entries and emit run-stream errors
        for (const [toolCallId, timing] of activeTiming) {
          await toRun({
            type: 'tool.error',
            streamId: toolCallId,
            runId,
            haseefId,
            toolName: timing.toolName,
            error: errMsg,
          });
        }
        activeTiming.clear();
        break;
      }

      default:
        break;
    }
  }

  return { toolCalls, finishReason, internalText };
}

// =============================================================================
// Partial JSON Parser
//
// Attempts to parse incomplete JSON by trying common closing suffixes.
// This is the general-purpose helper that lets extensions receive pre-parsed
// partial args without implementing their own JSON parsing.
//
// Example: '{"spaceId":"abc","text":"Hello, how are'
//   → try + '"}' → {"spaceId":"abc","text":"Hello, how are"} ✓
// =============================================================================

const CLOSE_SUFFIXES = ['', '"}', '}', '"]}', ']}'];

function tryParsePartialJson(text: string): Record<string, unknown> | null {
  for (const suffix of CLOSE_SUFFIXES) {
    try {
      const result = JSON.parse(text + suffix);
      if (result && typeof result === 'object' && !Array.isArray(result)) {
        return result as Record<string, unknown>;
      }
    } catch {
      // Try next suffix
    }
  }
  return null;
}
