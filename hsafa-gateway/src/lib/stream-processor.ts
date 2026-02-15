import { parse as parsePartialJson, STR, OBJ, ARR, NUM, BOOL, NULL } from 'partial-json';
import type { EmitEventFn } from './run-events.js';
import { emitSmartSpaceEvent } from './smartspace-events.js';

const PARTIAL_JSON_ALLOW = STR | OBJ | ARR | NUM | BOOL | NULL;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PendingClientToolCall {
  toolCallId: string;
  toolName: string;
  args: unknown;
}

export interface DelegateAgentSignal {
  targetAgentEntityId: string;
}

export interface StreamResult {
  finalText: string | undefined;
  pendingClientToolCalls: PendingClientToolCall[];
  delegateSignal: DelegateAgentSignal | null;
}

// ─── Stream Processor ────────────────────────────────────────────────────────

/**
 * Processes the AI SDK fullStream.
 *
 * Core responsibilities:
 * 1. Intercept sendSpaceMessage tool-input-delta → stream text to target space (real LLM streaming)
 * 2. Emit reasoning events to the run stream
 * 3. Track tool calls & detect delegate signals
 * 4. Identify pending client tool calls (no server-side result)
 */
export async function processStream(
  fullStream: AsyncIterable<any>,
  messageId: string,
  runId: string,
  emitEvent: EmitEventFn,
  options?: {
    agentEntityId?: string;
    visibleTools?: Set<string>;
    targetSpaceId?: string;
  },
): Promise<StreamResult> {
  const agentEntityId = options?.agentEntityId || '';
  const visibleTools = options?.visibleTools;
  const targetSpaceId = options?.targetSpaceId;
  const spaceCtx = { runId, entityId: agentEntityId, entityType: 'agent' as const, agentEntityId };

  // Internal state
  let reasoningId: string | null = null;
  let internalText = '';
  let delegateSignal: DelegateAgentSignal | null = null;

  const toolArgs = new Map<string, string>();              // toolCallId → accumulated JSON
  const toolCalls = new Map<string, { toolName: string; input: unknown }>();  // completed tool calls
  const toolResultIds = new Set<string>();

  // sendSpaceMessage streaming state: intercept the `text` field and relay to target space
  const msgStreams = new Map<string, { spaceId: string | null; streamStarted: boolean; prevText: string }>();

  await emitEvent('start', { messageId });

  for await (const part of fullStream) {
    const t = part.type as string;

    // ── LLM text (internal — never shown to users) ──
    if (t === 'text-delta') {
      internalText += (part as any).text || (part as any).textDelta || '';
    }

    // ── Reasoning ──
    else if (t === 'reasoning' || t === 'reasoning-delta') {
      const delta = (part as any).text || (part as any).textDelta || (part as any).delta || '';
      if (!delta) continue;
      if (!reasoningId) {
        reasoningId = `reasoning-${messageId}-${Date.now()}`;
        await emitEvent('reasoning-start', { id: reasoningId });
      }
      await emitEvent('reasoning-delta', { id: reasoningId, delta });
    }
    else if (t === 'reasoning-end') {
      if (reasoningId) { await emitEvent('reasoning-end', { id: reasoningId }); reasoningId = null; }
    }

    // ── Tool input start ──
    else if (t === 'tool-input-start') {
      const { id, toolName } = part as any;
      toolArgs.set(id, '');
      if (toolName === 'sendSpaceMessage') {
        msgStreams.set(id, { spaceId: null, streamStarted: false, prevText: '' });
      }
      await emitEvent('tool-input-start', { toolCallId: id, toolName });

      // Emit to space stream for visible tools
      if (visibleTools?.has(toolName) && targetSpaceId) {
        await emitSmartSpaceEvent(targetSpaceId, 'tool-call.start', { toolCallId: id, toolName }, spaceCtx);
      }
    }

    // ── Tool input delta — this is where sendSpaceMessage streaming happens ──
    else if (t === 'tool-input-delta') {
      const { id, delta: argsDelta } = part as any;
      if (!argsDelta) continue;

      const accumulated = (toolArgs.get(id) || '') + argsDelta;
      toolArgs.set(id, accumulated);

      let partial: Record<string, unknown> | null = null;
      try {
        const parsed = parsePartialJson(accumulated, PARTIAL_JSON_ALLOW);
        if (parsed && typeof parsed === 'object') partial = parsed as Record<string, unknown>;
      } catch { /* ignore malformed JSON */ }

      await emitEvent('tool-input-delta', { toolCallId: id, delta: argsDelta, accumulated, partialInput: partial });

      // Stream sendSpaceMessage text to the target space in real-time
      const state = msgStreams.get(id);
      if (state && partial) {
        if (typeof partial.spaceId === 'string') state.spaceId = partial.spaceId;

        if (typeof partial.text === 'string' && state.spaceId && partial.text.length > state.prevText.length) {
          const delta = partial.text.slice(state.prevText.length);
          state.prevText = partial.text;

          if (!state.streamStarted) {
            state.streamStarted = true;
            await emitSmartSpaceEvent(state.spaceId, 'start', { messageId }, spaceCtx);
            await emitSmartSpaceEvent(state.spaceId, 'text-start', { id }, spaceCtx);
          }
          await emitSmartSpaceEvent(state.spaceId, 'text-delta', { id, delta }, spaceCtx);
        }
      }
    }

    // ── Tool call complete ──
    else if (t === 'tool-call') {
      const { toolCallId, toolName, input } = part as any;

      // Close sendSpaceMessage stream on the target space
      const state = msgStreams.get(toolCallId);
      if (state?.streamStarted && state.spaceId) {
        await emitSmartSpaceEvent(state.spaceId, 'text-end', { id: toolCallId }, spaceCtx);
        await emitSmartSpaceEvent(state.spaceId, 'finish', { messageId, streamId: toolCallId }, spaceCtx);
      }

      if (reasoningId) { await emitEvent('reasoning-end', { id: reasoningId }); reasoningId = null; }
      await emitEvent('tool-input-available', { toolCallId, toolName, input });

      // Emit to space stream for visible tools
      if (visibleTools?.has(toolName) && targetSpaceId) {
        await emitSmartSpaceEvent(targetSpaceId, 'tool-call', { toolCallId, toolName, args: input }, spaceCtx);
      }

      toolCalls.set(toolCallId, { toolName, input });
    }

    // ── Tool result ──
    else if (t === 'tool-result') {
      const { toolCallId, toolName, output } = part as any;
      await emitEvent('tool-output-available', { toolCallId, toolName, output });
      toolResultIds.add(toolCallId);

      // Emit to space stream for visible tools
      if (visibleTools?.has(toolName) && targetSpaceId) {
        await emitSmartSpaceEvent(targetSpaceId, 'tool-call.result', { toolCallId, toolName, output }, spaceCtx);
      }

      if (toolName === 'delegateToAgent' && output?.__delegateSignal) {
        delegateSignal = { targetAgentEntityId: output.targetAgentEntityId as string };
      }
    }

    // ── Tool error ──
    else if (t === 'tool-error') {
      const { toolCallId, toolName, error } = part as any;
      console.error(`[Run ${runId}] Tool error: ${toolName}`, error);
      const errorStr = error instanceof Error ? error.message : String(error);
      await emitEvent('tool-error', { toolCallId, toolName, error: errorStr });

      // Emit to space stream for visible tools
      if (visibleTools?.has(toolName) && targetSpaceId) {
        await emitSmartSpaceEvent(targetSpaceId, 'tool-call.error', { toolCallId, toolName, error: errorStr }, spaceCtx);
      }
    }

    // ── Finish ──
    else if (t === 'finish') {
      if (reasoningId) { await emitEvent('reasoning-end', { id: reasoningId }); reasoningId = null; }
    }

    // ── Error ──
    else if (t === 'error') {
      const err = (part as any).error;
      await emitEvent('stream.error', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  // Close any unclosed reasoning
  if (reasoningId) { await emitEvent('reasoning-end', { id: reasoningId }); }

  // Pending client tool calls = tool-call without a matching tool-result
  const pendingClientToolCalls: PendingClientToolCall[] = [];
  for (const [toolCallId, tc] of toolCalls) {
    if (!toolResultIds.has(toolCallId)) {
      pendingClientToolCalls.push({ toolCallId, toolName: tc.toolName, args: tc.input });
    }
  }

  return {
    finalText: internalText || undefined,
    pendingClientToolCalls,
    delegateSignal,
  };
}
