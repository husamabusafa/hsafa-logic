import { parse as parsePartialJson, STR, OBJ, ARR, NUM, BOOL, NULL } from 'partial-json';
import type { EmitEventFn } from './run-events.js';

// Allow all partial JSON types for tool input streaming
const PARTIAL_JSON_ALLOW = STR | OBJ | ARR | NUM | BOOL | NULL;

/**
 * Result of processing the AI stream.
 * Contains the ordered parts and final text for message persistence.
 */
export interface StreamResult {
  orderedParts: Array<{ type: string; [key: string]: unknown }>;
  finalText: string | undefined;
  skipped: boolean;
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
): Promise<StreamResult> {
  let textId: string | null = null;
  let reasoningId: string | null = null;
  let currentReasoningText = ''; // Current reasoning block accumulator
  let currentTextContent = '';   // Current text block accumulator
  const toolArgsAccumulator = new Map<string, string>(); // toolCallId -> accumulated args text
  const orderedParts: Array<{ type: string; [key: string]: unknown }> = [];
  let skipped = false;

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

    // Text streaming (AI SDK v6: text-delta has .text)
    if (t === 'text-delta') {
      const delta = (part as any).text || (part as any).textDelta || '';
      if (!delta) continue;
      if (!textId) {
        textId = `text-${messageId}-${Date.now()}`;
        await emitEvent('text-start', { id: textId });
      }
      currentTextContent += delta;
      await emitEvent('text-delta', { id: textId, delta });
    }
    else if (t === 'text-end') {
      if (textId) { await emitEvent('text-end', { id: textId }); textId = null; }
      flushText();
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
      if (textId) { await emitEvent('text-end', { id: textId }); textId = null; }
      flushText();
      if (reasoningId) { await emitEvent('reasoning-end', { id: reasoningId }); reasoningId = null; }
      flushReasoning();
      
      await emitEvent('tool-input-available', { toolCallId, toolName, input });

      if (toolName === 'skipResponse') {
        skipped = true;
      }
      
      orderedParts.push({ type: 'tool-call', toolCallId, toolName, args: input });
    }
    // Tool result (AI SDK v6: .output instead of .result)
    else if (t === 'tool-result') {
      const { toolCallId, toolName, output } = part as any;
      await emitEvent('tool-output-available', { toolCallId, toolName, output });
      orderedParts.push({ type: 'tool-result', toolCallId, toolName, result: output });
    }
    // Tool error
    else if (t === 'tool-error') {
      const { toolCallId, toolName, error } = part as any;
      console.error(`[Run ${runId}] Tool error: ${toolName}`, error);
      await emitEvent('tool-error', { toolCallId, toolName, error: error instanceof Error ? error.message : String(error) });
    }
    // Stream finish — flush any remaining open blocks
    else if (t === 'finish') {
      if (textId) { await emitEvent('text-end', { id: textId }); textId = null; }
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

  return { orderedParts, finalText, skipped };
}
