import { parse as parsePartialJson, STR, OBJ, ARR, NUM, BOOL, NULL } from 'partial-json';
import type { EmitEventFn } from './run-events.js';
import { emitSmartSpaceEvent } from './smartspace-events.js';

// Allow all partial JSON types for tool input streaming
const PARTIAL_JSON_ALLOW = STR | OBJ | ARR | NUM | BOOL | NULL;

/**
 * Result of processing the AI stream.
 * Contains the ordered parts and final text for message persistence.
 */
export interface PendingClientToolCall {
  toolCallId: string;
  toolName: string;
  args: unknown;
}

export interface DelegateAgentSignal {
  targetAgentEntityId: string;
  reason: string | null;
}

export interface StreamResult {
  orderedParts: Array<{ type: string; [key: string]: unknown }>;
  finalText: string | undefined;
  skipped: boolean;
  /** Tool calls that had no server-side execute (client tools) — need external result */
  pendingClientToolCalls: PendingClientToolCall[];
  /** If the agent called delegateToAgent during the run */
  delegateSignal: DelegateAgentSignal | null;
}

/**
 * Processes the AI SDK fullStream, emitting events to Redis/SmartSpace
 * and collecting ordered parts for message persistence.
 *
 * Handles:
 * - Text: text-start / text-delta / text-end
 * - Reasoning: reasoning-start / reasoning-delta / reasoning-end
 * - Tools: tool-input-start / tool-input-delta / tool-input-available / tool-output-available
 * - Lifecycle: start / finish / error
 */
export async function processStream(
  fullStream: AsyncIterable<any>,
  messageId: string,
  runId: string,
  emitEvent: EmitEventFn,
  options?: {
    agentEntityId?: string;
  },
): Promise<StreamResult> {
  let reasoningId: string | null = null;
  let currentReasoningText = ''; // Current reasoning block accumulator
  let currentTextContent = '';   // Current text block accumulator (internal only)
  const toolArgsAccumulator = new Map<string, string>(); // toolCallId -> accumulated args text
  const orderedParts: Array<{ type: string; [key: string]: unknown }> = [];
  let skipped = false;
  let delegateSignal: DelegateAgentSignal | null = null;
  const toolCallIds = new Set<string>();
  const toolResultIds = new Set<string>();

  // Track sendSpaceMessage tool calls for real LLM streaming
  // When the agent calls sendSpaceMessage, we intercept the 'text' field from
  // tool-input-delta and relay it as text-delta to the TARGET space's SSE channel.
  const sendMsgToolCalls = new Map<string, { spaceId: string | null; textStreamId: string | null; accumulatedText: string }>();

  // Flush current reasoning block into orderedParts
  const flushReasoning = () => {
    if (currentReasoningText) {
      orderedParts.push({ type: 'reasoning', text: currentReasoningText });
      currentReasoningText = '';
    }
  };
  // Flush current text block into orderedParts
  const flushText = () => {
    if (currentTextContent) {
      orderedParts.push({ type: 'text', text: currentTextContent });
      currentTextContent = '';
    }
  };

  await emitEvent('start', { messageId });

  // Stream ALL events to Redis
  for await (const part of fullStream) {
    const t = part.type as string;

    // Text streaming — INTERNAL ONLY (never emitted to Redis/space)
    // Agent's LLM text output is a private summary, not shown anywhere.
    if (t === 'text-delta') {
      const delta = (part as any).text || (part as any).textDelta || '';
      if (!delta) continue;
      currentTextContent += delta;
      // No emit — text is internal
    }
    else if (t === 'text-end') {
      flushText();
      // No emit — text is internal
    }
    // Reasoning streaming (AI SDK v6: reasoning-delta has .text)
    else if (t === 'reasoning' || t === 'reasoning-delta') {
      const delta = (part as any).text || (part as any).textDelta || (part as any).delta || '';
      if (!delta) continue;
      if (!reasoningId) {
        reasoningId = `reasoning-${messageId}-${Date.now()}`;
        await emitEvent('reasoning-start', { id: reasoningId });
      }
      currentReasoningText += delta;
      await emitEvent('reasoning-delta', { id: reasoningId, delta });
    }
    else if (t === 'reasoning-end') {
      if (reasoningId) { await emitEvent('reasoning-end', { id: reasoningId }); reasoningId = null; }
      flushReasoning();
    }
    // Tool input streaming start (AI SDK v6: tool-input-start with .id, .toolName)
    else if (t === 'tool-input-start') {
      const { id, toolName } = part as any;
      toolArgsAccumulator.set(id, '');
      await emitEvent('tool-input-start', { toolCallId: id, toolName });

      // Track sendSpaceMessage calls for real-time text streaming
      if (toolName === 'sendSpaceMessage') {
        sendMsgToolCalls.set(id, { spaceId: null, textStreamId: null, accumulatedText: '' });
      }
    }
    // Tool input args delta (AI SDK v6: tool-input-delta with .id, .delta)
    else if (t === 'tool-input-delta') {
      const { id, delta: argsDelta } = part as any;
      if (argsDelta) {
        const accumulated = (toolArgsAccumulator.get(id) || '') + argsDelta;
        toolArgsAccumulator.set(id, accumulated);
        
        let partialInput: unknown = null;
        try {
          partialInput = parsePartialJson(accumulated, PARTIAL_JSON_ALLOW);
        } catch {
          // Malformed JSON - emit null for partialInput
        }
        
        await emitEvent('tool-input-delta', {
          toolCallId: id,
          delta: argsDelta,
          accumulated,
          partialInput,
        });

        // ── sendSpaceMessage real-time streaming ──
        // Extract the 'text' field from partial JSON and relay as text-delta
        // to the TARGET space's SSE channel, so it looks like real LLM streaming.
        const sendMsgState = sendMsgToolCalls.get(id);
        if (sendMsgState && partialInput && typeof partialInput === 'object') {
          const partial = partialInput as Record<string, unknown>;

          // Always update spaceId — partial-json may return truncated strings
          // early on. By the time 'text' appears, spaceId will be complete.
          if (typeof partial.spaceId === 'string') {
            sendMsgState.spaceId = partial.spaceId;
          }

          // Stream the 'text' field delta to the target space
          if (typeof partial.text === 'string' && sendMsgState.spaceId) {
            const newText = partial.text;
            const prevText = sendMsgState.accumulatedText;

            if (newText.length > prevText.length) {
              const textDelta = newText.slice(prevText.length);
              sendMsgState.accumulatedText = newText;

              // Start a text stream on the space if not yet started
              if (!sendMsgState.textStreamId) {
                sendMsgState.textStreamId = `text-${messageId}-${id}-${Date.now()}`;
                const spaceCtx = { runId, entityId: options?.agentEntityId || '', entityType: 'agent' as const, agentEntityId: options?.agentEntityId || '' };
                await emitSmartSpaceEvent(sendMsgState.spaceId, 'start', { messageId }, spaceCtx);
                await emitSmartSpaceEvent(sendMsgState.spaceId, 'text-start', { id: sendMsgState.textStreamId }, spaceCtx);
              }

              // Emit text-delta to the target space (real LLM streaming)
              const spaceCtx = { runId, entityId: options?.agentEntityId || '', entityType: 'agent' as const, agentEntityId: options?.agentEntityId || '' };
              await emitSmartSpaceEvent(sendMsgState.spaceId, 'text-delta', { id: sendMsgState.textStreamId, delta: textDelta }, spaceCtx);
            }
          }
        }
      }
    }
    // Tool input end
    else if (t === 'tool-input-end') {
      // No action needed, tool-call follows
    }
    // Tool call complete (AI SDK v6: .input instead of .args)
    else if (t === 'tool-call') {
      const { toolCallId, toolName, input } = part as any;
      
      // Close & flush text/reasoning blocks if open (preserves order)
      flushText();
      if (reasoningId) { await emitEvent('reasoning-end', { id: reasoningId }); reasoningId = null; }
      flushReasoning();

      // Close sendSpaceMessage text stream on the target space
      const sendMsgState = sendMsgToolCalls.get(toolCallId);
      if (sendMsgState?.textStreamId && sendMsgState.spaceId) {
        const spaceCtx = { runId, entityId: options?.agentEntityId || '', entityType: 'agent' as const, agentEntityId: options?.agentEntityId || '' };
        await emitSmartSpaceEvent(sendMsgState.spaceId, 'text-end', { id: sendMsgState.textStreamId }, spaceCtx);
        await emitSmartSpaceEvent(sendMsgState.spaceId, 'finish', { messageId }, spaceCtx);
      }
      
      await emitEvent('tool-input-available', { toolCallId, toolName, input });

      if (toolName === 'skipResponse') {
        skipped = true;
      } else if (toolName === 'delegateToAgent') {
        skipped = true; // delegate also cancels the current run (no message posted)
      }
      
      orderedParts.push({ type: 'tool-call', toolCallId, toolName, args: input });
      toolCallIds.add(toolCallId);
    }
    // Tool result (AI SDK v6: .output instead of .result)
    else if (t === 'tool-result') {
      const { toolCallId, toolName, output } = part as any;
      await emitEvent('tool-output-available', { toolCallId, toolName, output });
      orderedParts.push({ type: 'tool-result', toolCallId, toolName, result: output });
      toolResultIds.add(toolCallId);

      // Detect delegate signal from tool results
      if (toolName === 'delegateToAgent' && output && typeof output === 'object') {
        const o = output as Record<string, unknown>;
        if (o.__delegateSignal) {
          delegateSignal = {
            targetAgentEntityId: o.targetAgentEntityId as string,
            reason: (o.reason as string) ?? null,
          };
        }
      }
    }
    // Tool error
    else if (t === 'tool-error') {
      const { toolCallId, toolName, error } = part as any;
      console.error(`[Run ${runId}] Tool error: ${toolName}`, error);
      await emitEvent('tool-error', { toolCallId, toolName, error: error instanceof Error ? error.message : String(error) });
    }
    // Stream finish — flush any remaining open blocks
    else if (t === 'finish') {
      flushText();
      if (reasoningId) { await emitEvent('reasoning-end', { id: reasoningId }); reasoningId = null; }
      flushReasoning();
    }
    // Error
    else if (t === 'error') {
      const err = (part as any).error;
      await emitEvent('stream.error', { error: err instanceof Error ? err.message : String(err) });
    }
    // Other events (sources, files, steps) - emit as-is for full visibility
    else if (t === 'source-url' || t === 'source-document') {
      await emitEvent(t, part as any);
    }
  }

  // Flush any remaining blocks that weren't closed by a finish event
  flushReasoning();
  flushText();

  const finalText = orderedParts.find(p => p.type === 'text')?.text as string | undefined;

  // Identify tool calls without a server-side result (client tools)
  const pendingClientToolCalls: PendingClientToolCall[] = [];
  for (const part of orderedParts) {
    if (part.type === 'tool-call' && !toolResultIds.has(part.toolCallId as string)) {
      pendingClientToolCalls.push({
        toolCallId: part.toolCallId as string,
        toolName: part.toolName as string,
        args: part.args,
      });
    }
  }

  return { orderedParts, finalText, skipped, pendingClientToolCalls, delegateSignal };
}
