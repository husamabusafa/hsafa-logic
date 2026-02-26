import { emitSmartSpaceEvent, emitRunEvent } from './smartspace-events.js';
import { hookStates } from './tool-streaming.js';

// =============================================================================
// Stream Processor (v3 — simplified with Tool Lifecycle Hooks)
//
// Space-facing streaming logic (tool.started, tool.streaming,
// space.message.streaming, tool.done, DB persistence) has been moved into
// tool lifecycle hooks (onInputStart / onInputDelta / onInputAvailable) on the
// tool definitions themselves. See:
//   - send-message.ts      — owns send_message streaming
//   - tool-streaming.ts    — factory for visible custom tool hooks
//   - builder.ts           — wires hooks + wraps execute for result finalization
//
// This module now ONLY handles:
//   1. Tool call collection (for the process loop return value)
//   2. Duration tracking (tool-input-start → tool-result)
//   3. Run-stream events (tool.started, tool.ready, tool.done, tool.error)
//   4. Internal text collection (debug)
//   5. Finish / error handling (including error cleanup via hookStates)
// =============================================================================

// =============================================================================
// Types
// =============================================================================

export interface StreamProcessorOptions {
  runId: string;
  agentEntityId: string;
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
  /** Agent's internal text output (never streamed — collected for debug) */
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
  const { runId, agentEntityId } = options;

  const toolCalls: CollectedToolCall[] = [];
  /** Minimal tracking: toolCallId → { toolName, startedAt } for duration + error cleanup */
  const activeTiming = new Map<string, { toolName: string; startedAt: number }>();
  let internalText = '';
  let finishReason = 'unknown';

  // ── Run-stream emit helper ──────────────────────────────────────────────

  const toRun = async (payload: Record<string, unknown>) => {
    await emitRunEvent(runId, payload as { type: string } & Record<string, unknown>);
  };

  // ── Stream loop ───────────────────────────────────────────────────────────

  for await (const part of fullStream) {
    switch (part.type as string) {

      // ── Agent text — internal planning, never streamed ───────────────────
      case 'text-delta':
        internalText += (part.text as string) ?? '';
        break;

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

        await toRun({
          type: 'tool.started',
          streamId: toolCallId,
          runId,
          agentEntityId,
          toolName,
        });
        break;
      }

      // ── Partial args — handled by tool hooks, nothing to do here ────────
      case 'tool-input-delta':
        break;

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
          agentEntityId,
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
          agentEntityId,
          toolName,
          result,
        });
        break;
      }

      // ── Step finish (multi-step streaming) ──────────────────────────────
      case 'step-finish':
        if (part.finishReason) finishReason = part.finishReason as string;
        break;

      // ── Final finish ────────────────────────────────────────────────────
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

        // Clean up in-flight tool hooks — emit error events to spaces
        for (const [toolCallId, state] of hookStates) {
          if (state.runId !== runId) continue;

          if (state.spaceId) {
            const errorType = state.isSendMessage ? 'space.message.failed' : 'tool.error';
            await emitSmartSpaceEvent(state.spaceId, {
              type: errorType,
              streamId: toolCallId,
              runId,
              agentEntityId,
              toolName: state.toolName,
              error: errMsg,
            });
          }
          hookStates.delete(toolCallId);
        }

        // Also clean up any timing entries and emit run-stream errors
        for (const [toolCallId, timing] of activeTiming) {
          await toRun({
            type: 'tool.error',
            streamId: toolCallId,
            runId,
            agentEntityId,
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
