import { redis } from './redis.js';

// =============================================================================
// Stream Processor (v5)
//
// Consumes AI SDK fullStream and:
//   1. Collects tool calls for the process loop
//   2. Tracks tool durations
//   3. Publishes real-time events to haseef:{haseefId}:stream (Redis Pub/Sub)
//   4. Handles errors
//
// With toolChoice: 'required', the model cannot produce bare text — every
// step must contain a tool call. Text deltas are accumulated but not broadcast.
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
  /** Accumulated text output (vestigial with toolChoice: 'required') */
  text: string;
  /** Accumulated reasoning output from reasoning models */
  reasoning: string;
  /** Stream errors collected during processing (from LLM provider) */
  streamErrors: string[];
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
  /** Tracking: toolCallId → { toolName, startedAt } for duration */
  const activeTiming = new Map<string, { toolName: string; startedAt: number }>();
  let text = '';
  let reasoning = '';
  let finishReason = 'unknown';
  const streamErrors: string[] = [];

  // ── Run-stream emit helper ──────────────────────────────────────────────

  const emit = async (payload: Record<string, unknown>) => {
    const channel = `haseef:${haseefId}:stream`;
    await redis.publish(channel, JSON.stringify(payload)).catch(() => {});
  };

  // ── Stream loop ───────────────────────────────────────────────────────────

  for await (const part of fullStream) {
    switch (part.type as string) {

      // ── Text output — with toolChoice: 'required', the model cannot
      // produce bare text. Any text here is incidental (e.g. model bug).
      // We still accumulate it for the StreamResult but don't broadcast.
      case 'text-delta': {
        const delta = (part.text as string) ?? '';
        text += delta;
        break;
      }

      // ── Reasoning tokens — emitted for live UI display ─────────────────
      case 'reasoning-start': {
        await emit({
          type: 'reasoning.start',
          runId,
          haseefId,
        });
        break;
      }
      case 'reasoning':
      case 'reasoning-delta': {
        const delta = (part as any).textDelta ?? (part as any).text ?? (part as any).delta ?? '';
        if (delta) {
          reasoning += delta;
          await emit({
            type: 'reasoning.delta',
            runId,
            haseefId,
            delta,
          });
        }
        break;
      }
      case 'reasoning-end': {
        await emit({
          type: 'reasoning.end',
          runId,
          haseefId,
        });
        break;
      }

      // ── Tool call begins — record start time for duration tracking ──────
      case 'tool-input-start': {
        const toolCallId = (part.id ?? part.toolCallId) as string;
        const toolName = part.toolName as string;

        activeTiming.set(toolCallId, { toolName, startedAt: Date.now() });

        await emit({
          type: 'tool.started',
          streamId: toolCallId,
          runId,
          haseefId,
          toolName,
        });
        break;
      }

      // ── Full args collected (tool call ready to execute) ─────────────────
      case 'tool-call': {
        const toolCallId = part.toolCallId as string;
        const toolName = part.toolName as string;
        const args = part.input as unknown;

        toolCalls.push({ toolCallId, toolName, args, durationMs: undefined });

        await emit({
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
          if (durationMs > 1000) {
            console.log(`[stream] tool ${toolName} took ${durationMs}ms (runId=${runId.slice(0, 8)})`);
          }
        }

        await emit({
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
      case 'step-finish': {
        if (part.finishReason) finishReason = part.finishReason as string;
        await emit({
          type: 'step.finish',
          runId,
          haseefId,
          finishReason: part.finishReason as string,
        });
        break;
      }

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
            : (typeof part.error === 'object' && part.error !== null)
              ? JSON.stringify(part.error)
              : String(part.error ?? 'Stream error');
        streamErrors.push(errMsg);
        console.error(`[stream-processor] runId=${runId} stream ERROR:`, errMsg);

        finishReason = 'error';

        // Clean up any timing entries and emit run-stream errors
        for (const [toolCallId, timing] of activeTiming) {
          await emit({
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

  return { toolCalls, finishReason, text, reasoning, streamErrors };
}

