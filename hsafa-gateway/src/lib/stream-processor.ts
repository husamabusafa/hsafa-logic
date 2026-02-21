import { parse as parsePartialJson } from 'partial-json';
import { emitSmartSpaceEvent, emitRunEvent } from './smartspace-events.js';

// =============================================================================
// Constants
// =============================================================================

/** The prebuilt tool name that sends a message to the active space */
export const TOOL_SEND_MESSAGE = 'send_message';

// =============================================================================
// Types
// =============================================================================

export interface StreamProcessorOptions {
  runId: string;
  agentEntityId: string;
  /**
   * Returns the current active spaceId. Called per event so that if
   * `enter_space` is executed mid-run the correct space gets the events.
   */
  getActiveSpaceId: () => string | null;
  /**
   * Set of custom tool names where `visible: true` in the agent config.
   * Their streaming input and output will be published to the space channel.
   * `send_message` is always visible regardless of this set.
   */
  visibleTools: Set<string>;
}

export interface CollectedToolCall {
  toolCallId: string;
  toolName: string;
  /** Fully parsed args — available after the tool-call part */
  args: unknown;
}

export interface StreamResult {
  /** All tool calls the LLM made in this generation step */
  toolCalls: CollectedToolCall[];
  /** LLM finish reason: 'tool-calls' | 'stop' | 'length' | 'content-filter' | 'error' */
  finishReason: string;
  /**
   * Agent's internal text output.
   * In v2 this is NEVER streamed — it's internal planning/reasoning.
   * Collected here for debug logging only.
   */
  internalText: string;
}

// =============================================================================
// Internal per-tool tracking
// =============================================================================

interface ActiveToolStream {
  toolName: string;
  /** activeSpaceId captured at the moment the tool call started */
  spaceId: string | null;
  /** Accumulated partial JSON string of args */
  argsText: string;
  /** For send_message: length of the `text` field we've already emitted */
  lastTextLen: number;
  /** Should stream events to the space channel */
  isVisible: boolean;
  /** Special-cased: extract text field and stream as message content */
  isSendMessage: boolean;
}

// =============================================================================
// Helpers
// =============================================================================

function now(): string {
  return new Date().toISOString();
}

// =============================================================================
// processStream
// =============================================================================

/**
 * Consumes a Vercel AI SDK `fullStream` and:
 *  - Emits Hsafa-native SSE events to the appropriate Redis channels
 *  - Extracts `text` from `send_message` partial JSON and streams it as
 *    `space.message.streaming` deltas (so the UI shows real-time typing)
 *  - Collects all tool calls for the run-runner to execute
 *
 * Event naming convention (Hsafa-native):
 *
 *  space.message.streaming  — send_message text delta (start / delta / done)
 *  space.message.failed     — send_message errored during streaming
 *  tool.started             — a visible custom tool call began
 *  tool.streaming           — partial args for a visible custom tool
 *  tool.done                — a tool call completed (result available)
 *  tool.error               — a tool call failed
 *
 * The run.started / run.completed / run.failed / agent.active / agent.inactive
 * events are emitted by the run-runner, not here.
 */
export async function processStream(
  fullStream: AsyncIterable<any>,
  options: StreamProcessorOptions,
): Promise<StreamResult> {
  const { runId, agentEntityId, getActiveSpaceId, visibleTools } = options;

  const toolCalls: CollectedToolCall[] = [];
  const active = new Map<string, ActiveToolStream>();
  let internalText = '';
  let finishReason = 'unknown';

  // ── Redis emit helpers ────────────────────────────────────────────────────

  /** Publish to a space channel (visible events only) */
  const toSpace = async (spaceId: string, payload: Record<string, unknown>) => {
    await emitSmartSpaceEvent(spaceId, payload as { type: string } & Record<string, unknown>);
  };

  /** Publish to the run channel (all tool events, for node-sdk consumers) */
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

      // ── Tool call begins — args will follow as deltas ────────────────────
      case 'tool-input-start': {
        // fullStream (TextStreamPart) uses .id, not .toolCallId
        const toolCallId = (part.id ?? part.toolCallId) as string;
        const toolName = part.toolName as string;
        const spaceId = getActiveSpaceId();
        const isSendMessage = toolName === TOOL_SEND_MESSAGE;
        const isVisible = isSendMessage || visibleTools.has(toolName);

        active.set(toolCallId, {
          toolName,
          spaceId,
          argsText: '',
          lastTextLen: 0,
          isVisible,
          isSendMessage,
        });

        if (isVisible && spaceId) {
          if (isSendMessage) {
            // Signal the start of a new streaming message to the UI
            await toSpace(spaceId, {
              type: 'space.message.streaming',
              streamId: toolCallId,
              runId,
              agentEntityId,
              phase: 'start',
              delta: '',
            });
          } else {
            await toSpace(spaceId, {
              type: 'tool.started',
              streamId: toolCallId,
              runId,
              agentEntityId,
              toolName,
            });
          }
        }

        // All tool starts go to the run channel for programmatic consumers
        await toRun({
          type: 'tool.started',
          streamId: toolCallId,
          runId,
          agentEntityId,
          toolName,
          spaceId,
        });
        break;
      }

      // ── Partial args arriving ────────────────────────────────────────────
      case 'tool-input-delta': {
        // fullStream (TextStreamPart) uses .id and .delta
        const toolCallId = (part.id ?? part.toolCallId) as string;
        const delta = ((part.delta ?? part.inputTextDelta) as string) ?? '';
        const tool = active.get(toolCallId);
        if (!tool || !delta) break;

        tool.argsText += delta;

        if (!tool.isVisible || !tool.spaceId) break;

        if (tool.isSendMessage) {
          // Extract the growing `text` field from partial JSON and emit deltas
          try {
            const parsed = parsePartialJson(tool.argsText) as Record<string, unknown> | null;
            if (parsed && typeof parsed.text === 'string') {
              const newText = parsed.text;
              const textDelta = newText.slice(tool.lastTextLen);
              if (textDelta) {
                tool.lastTextLen = newText.length;
                await toSpace(tool.spaceId, {
                  type: 'space.message.streaming',
                  streamId: toolCallId,
                  runId,
                  agentEntityId,
                  phase: 'delta',
                  delta: textDelta,
                  text: newText,
                });
              }
            }
          } catch {
            // Partial JSON not yet parseable — skip
          }
        } else {
          // Visible custom tool: stream the partial args object
          try {
            const partialArgs = parsePartialJson(tool.argsText);
            if (partialArgs !== undefined) {
              await toSpace(tool.spaceId, {
                type: 'tool.streaming',
                streamId: toolCallId,
                runId,
                agentEntityId,
                toolName: tool.toolName,
                partialArgs,
              });
            }
          } catch {
            // Skip unparseable
          }
        }
        break;
      }

      // ── Full args collected (tool call is now ready to execute) ──────────
      case 'tool-call': {
        const toolCallId = part.toolCallId as string;
        const toolName = part.toolName as string;
        const args = part.input as unknown;
        const tool = active.get(toolCallId);

        toolCalls.push({ toolCallId, toolName, args });

        // For visible non-send_message tools, emit final args to the space
        if (tool?.isVisible && tool.spaceId && !tool.isSendMessage) {
          await toSpace(tool.spaceId, {
            type: 'tool.streaming',
            streamId: toolCallId,
            runId,
            agentEntityId,
            toolName,
            partialArgs: args,
          });
        }

        // Notify run channel that args are fully available
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
        const tool = active.get(toolCallId);

        if (tool?.isVisible && tool.spaceId) {
          if (tool.isSendMessage) {
            // Signal end of streaming — the send_message prebuilt tool will
            // separately emit space.message (persisted) with the full content
            await toSpace(tool.spaceId, {
              type: 'space.message.streaming',
              streamId: toolCallId,
              runId,
              agentEntityId,
              phase: 'done',
            });
          } else {
            await toSpace(tool.spaceId, {
              type: 'tool.done',
              streamId: toolCallId,
              runId,
              agentEntityId,
              toolName,
              result,
            });
          }
        }

        await toRun({
          type: 'tool.done',
          streamId: toolCallId,
          runId,
          agentEntityId,
          toolName,
          result,
        });

        active.delete(toolCallId);
        break;
      }

      // ── Step finish (multi-step streaming) ──────────────────────────────
      case 'step-finish':
        if (part.finishReason) finishReason = part.finishReason as string;
        break;

      // ── Final finish ─────────────────────────────────────────────────────
      case 'finish':
        if (part.finishReason) finishReason = part.finishReason as string;
        break;

      // ── Stream error ─────────────────────────────────────────────────────
      case 'error': {
        const errMsg =
          part.error instanceof Error
            ? part.error.message
            : String(part.error ?? 'Stream error');

        finishReason = 'error';

        // Emit error for every tool call that was mid-stream
        for (const [toolCallId, tool] of active) {
          if (tool.isVisible && tool.spaceId) {
            await toSpace(tool.spaceId, {
              type: tool.isSendMessage ? 'space.message.failed' : 'tool.error',
              streamId: toolCallId,
              runId,
              agentEntityId,
              toolName: tool.toolName,
              error: errMsg,
            });
          }
          await toRun({
            type: 'tool.error',
            streamId: toolCallId,
            runId,
            agentEntityId,
            toolName: tool.toolName,
            error: errMsg,
          });
        }
        active.clear();
        break;
      }

      default:
        break;
    }
  }

  return { toolCalls, finishReason, internalText };
}
