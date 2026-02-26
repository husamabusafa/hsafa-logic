import { parse as parsePartialJson } from 'partial-json';
import { emitSmartSpaceEvent, emitRunEvent } from './smartspace-events.js';
import { createSmartSpaceMessage } from './smartspace-db.js';
import { prisma } from './db.js';
import {
  buildToolCallContent,
  buildToolCallMessageMeta,
  buildToolCallMessagePayload,
  type ToolCallStatus,
} from './tool-call-utils.js';

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
   * `enter_space` is executed mid-cycle the correct space gets the events.
   */
  getActiveSpaceId: () => string | null;
  /**
   * Set of custom tool names where `visible: true` in the agent config.
   * Their streaming input and output will be published to the space channel.
   * `send_message` is always visible regardless of this set.
   */
  visibleTools: Set<string>;
  /**
   * Set of async tool names (space, external-without-url).
   * Their execute returns { status: 'pending' } — real result arrives via inbox.
   */
  asyncTools: Set<string>;
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
  /** ID of the persisted SmartSpaceMessage (set at tool-call time) */
  messageId?: string;
  /** Timestamp when tool-input-start fired */
  startedAt: number;
}

// =============================================================================
// processStream
// =============================================================================

/**
 * Consumes a Vercel AI SDK `fullStream` and:
 *  - Emits Hsafa-native SSE events to the appropriate Redis channels
 *  - Extracts `text` from `send_message` partial JSON and streams it as
 *    `space.message.streaming` deltas (so the UI shows real-time typing)
 *  - Collects all tool calls for the process loop
 *
 * Event naming convention (Hsafa-native):
 *
 *  space.message.streaming  — send_message text delta (start / delta / done)
 *  space.message.failed     — send_message errored during streaming
 *  tool.started             — a visible custom tool call began
 *  tool.streaming           — partial args for a visible custom tool
 *  tool.done                — a tool call completed (result available)
 *  tool.error               — a tool call failed
 */
export async function processStream(
  fullStream: AsyncIterable<any>,
  options: StreamProcessorOptions,
): Promise<StreamResult> {
  const { runId, agentEntityId, getActiveSpaceId, visibleTools, asyncTools } = options;

  const toolCalls: CollectedToolCall[] = [];
  const active = new Map<string, ActiveToolStream>();
  let internalText = '';
  let finishReason = 'unknown';

  // ── Redis emit helpers ────────────────────────────────────────────────────

  const toSpace = async (spaceId: string, payload: Record<string, unknown>) => {
    await emitSmartSpaceEvent(spaceId, payload as { type: string } & Record<string, unknown>);
  };

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
          startedAt: Date.now(),
        });

        if (isVisible && spaceId) {
          if (isSendMessage) {
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
        const toolCallId = (part.id ?? part.toolCallId) as string;
        const delta = ((part.delta ?? part.inputTextDelta) as string) ?? '';
        const tool = active.get(toolCallId);
        if (!tool || !delta) break;

        tool.argsText += delta;
        if (!tool.isVisible || !tool.spaceId) break;

        if (tool.isSendMessage) {
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
            // Partial JSON not yet parseable
          }
        } else {
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

        toolCalls.push({ toolCallId, toolName, args, durationMs: undefined });

        if (tool?.isVisible && tool.spaceId && !tool.isSendMessage) {
          await toSpace(tool.spaceId, {
            type: 'tool.streaming',
            streamId: toolCallId,
            runId,
            agentEntityId,
            toolName,
            partialArgs: args,
          });

          // Persist the tool call message
          const isAsyncTool = asyncTools.has(toolName);
          const finalStatus: ToolCallStatus = isAsyncTool ? 'requires_action' : 'running';
          try {
            const toolContent = buildToolCallContent(toolName, args, null, finalStatus);
            const toolMeta = buildToolCallMessageMeta({
              toolCallId, toolName, args, result: null, status: finalStatus, runId,
            });
            const dbMsg = await createSmartSpaceMessage({
              smartSpaceId: tool.spaceId,
              entityId: agentEntityId,
              role: 'assistant',
              content: toolContent,
              metadata: toolMeta as unknown as Record<string, unknown>,
              runId,
            });
            tool.messageId = dbMsg.id;

            await toSpace(tool.spaceId, {
              type: 'space.message',
              streamId: toolCallId,
              message: buildToolCallMessagePayload({
                messageId: dbMsg.id, smartSpaceId: tool.spaceId,
                entityId: agentEntityId, toolCallId, toolName, args,
                result: null, status: finalStatus, runId,
              }),
            });
          } catch (err) {
            console.warn(`[stream-processor] Failed to persist tool call ${toolCallId}:`, err);
          }
        }

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

        // Check if this is a pending async tool result (not a real completion)
        const isPendingResult = typeof result === 'object' && result !== null
          && (result as Record<string, unknown>).status === 'pending';

        if (tool?.isVisible && tool.spaceId) {
          if (tool.isSendMessage) {
            await toSpace(tool.spaceId, {
              type: 'space.message.streaming',
              streamId: toolCallId,
              runId,
              agentEntityId,
              phase: 'done',
            });
          } else if (!isPendingResult) {
            // Real result — update message to complete
            await toSpace(tool.spaceId, {
              type: 'tool.done',
              streamId: toolCallId,
              runId,
              agentEntityId,
              toolName,
              result,
            });

            if (tool.messageId) {
              const completedArgs = toolCalls.find((tc) => tc.toolCallId === toolCallId)?.args ?? null;
              const completeMeta = buildToolCallMessageMeta({
                toolCallId, toolName, args: completedArgs,
                result, status: 'complete', runId,
              });
              const completeContent = buildToolCallContent(toolName, completedArgs, result, 'complete');
              try {
                await prisma.smartSpaceMessage.update({
                  where: { id: tool.messageId },
                  data: { content: completeContent, metadata: completeMeta as any },
                });
                await toSpace(tool.spaceId, {
                  type: 'space.message',
                  streamId: toolCallId,
                  message: buildToolCallMessagePayload({
                    messageId: tool.messageId, smartSpaceId: tool.spaceId,
                    entityId: agentEntityId, toolCallId, toolName,
                    args: completedArgs, result, status: 'complete', runId,
                  }),
                });
              } catch (err) {
                console.warn(`[stream-processor] Failed to update tool message ${tool.messageId}:`, err);
              }
            }
          }
          // isPendingResult: message stays as requires_action — will be updated when real result arrives
        }

        // Record duration on the collected tool call
        if (tool) {
          const durationMs = Date.now() - tool.startedAt;
          const tc = toolCalls.find((t) => t.toolCallId === toolCallId);
          if (tc) tc.durationMs = durationMs;
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

      // ── Final finish ─────────────────────────────────────────────────────────────
      case 'finish':
        if (part.finishReason) finishReason = part.finishReason as string;
        break;

      // ── Stream error ─────────────────────────────────────────────────────────────
      case 'error': {
        const errMsg =
          part.error instanceof Error
            ? part.error.message
            : String(part.error ?? 'Stream error');
        console.error(`[stream-processor] runId=${runId} stream ERROR:`, errMsg, part.error);

        finishReason = 'error';

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
