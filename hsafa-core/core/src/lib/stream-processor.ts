import { redis } from './redis.js';

// =============================================================================
// Stream Processor (v5)
//
// Consumes AI SDK fullStream and:
//   1. Collects tool calls for the process loop
//   2. Tracks tool durations
//   3. Publishes real-time events to haseef:{haseefId}:stream (Redis Pub/Sub)
//   4. Streams text deltas (usable by services for TTS, display, etc.)
//   5. Handles errors
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
  /** Haseef's text output — also streamed as text.delta events for services */
  text: string;
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

      // ── Text output — streamed to services (TTS, display, etc.) ────────
      case 'text-delta': {
        const delta = (part.text as string) ?? '';
        text += delta;
        if (delta) {
          // Fire-and-forget: never block the AI stream for per-token events
          void emit({
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
      case 'step-finish':
      case 'finish-step': {
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
        console.error(`[stream-processor] runId=${runId} stream ERROR:`, errMsg, part.error);

        // For quota / billing errors, throw so agent-process error recovery
        // kicks in (5-minute rest + proper backoff). These won't fix themselves
        // within a normal cycle retry.
        const errObj = part.error as any;
        const nested = errObj?.error ?? errObj;
        const errCode = nested?.code ?? nested?.type ?? errObj?.code ?? errObj?.type ?? '';
        const errMsgLower = errMsg.toLowerCase();
        if (
          errCode === 'insufficient_quota' ||
          errCode === 'billing_hard_limit_reached' ||
          errMsgLower.includes('insufficient_quota') ||
          errMsgLower.includes('exceeded your current quota') ||
          errMsgLower.includes('billing')
        ) {
          throw new Error(`LLM quota/billing error: ${errMsg}`);
        }

        // Anthropic rate limit errors — throw so agent-process applies backoff
        if (
          errMsgLower.includes('rate limit') ||
          errMsgLower.includes('rate_limit') ||
          errCode === 'rate_limit_error' ||
          errCode === 'too_many_requests'
        ) {
          throw new Error(`LLM rate limit: ${errMsg}`);
        }

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

  return { toolCalls, finishReason, text, streamErrors };
}

