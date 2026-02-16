import { parse as parsePartialJson, STR, OBJ, ARR, NUM, BOOL, NULL } from 'partial-json';
import { Prisma } from '@prisma/client';
import { prisma } from './db.js';
import type { EmitEventFn } from './run-events.js';
import { emitSmartSpaceEvent } from './smartspace-events.js';
import { createSmartSpaceMessage } from './smartspace-db.js';

const PARTIAL_JSON_ALLOW = STR | OBJ | ARR | NUM | BOOL | NULL;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

interface ToolCallPart {
  type: 'tool_call';
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
  status: 'complete' | 'requires_action';
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Remove auto-injected routing field from tool call args. */
function stripRoutingFields(args: Record<string, unknown>): Record<string, unknown> {
  const clean = { ...args };
  delete clean.targetSpaceId;
  return clean;
}

function buildToolCallPart(
  toolCallId: string, toolName: string, args: Record<string, unknown>,
  status: 'complete' | 'requires_action', result?: unknown,
): ToolCallPart {
  return { type: 'tool_call', toolCallId, toolName, args, ...(result !== undefined && { result }), status };
}

/** Persist a display tool call as a SmartSpaceMessage and optionally emit to the space. */
async function persistDisplayToolMessage(opts: {
  smartSpaceId: string;
  agentEntityId: string;
  runId: string;
  toolCallId: string;
  part: ToolCallPart;
  emit: boolean;
  spaceCtx: Record<string, unknown>;
}): Promise<void> {
  const agentEntity = await prisma.entity.findUnique({
    where: { id: opts.agentEntityId },
    select: { displayName: true },
  });
  const agentName = agentEntity?.displayName || 'AI Assistant';

  const dbMsg = await createSmartSpaceMessage({
    smartSpaceId: opts.smartSpaceId,
    entityId: opts.agentEntityId,
    role: 'assistant',
    content: null,
    metadata: {
      runId: opts.runId,
      streamId: opts.toolCallId,
      uiMessage: { parts: [opts.part] },
    } as unknown as Prisma.InputJsonValue,
    runId: opts.runId,
  });

  if (opts.emit) {
    await emitSmartSpaceEvent(opts.smartSpaceId, 'smartSpace.message', {
      message: {
        id: dbMsg.id,
        role: 'assistant',
        parts: [opts.part],
        entityId: opts.agentEntityId,
        entityType: 'agent',
        entityName: agentName,
      },
      streamId: opts.toolCallId,
    }, opts.spaceCtx);
  }

  return;
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
    displayTools?: Set<string>;
  },
): Promise<StreamResult> {
  const agentEntityId = options?.agentEntityId || '';
  const visibleTools = options?.visibleTools;
  const targetSpaceId = options?.targetSpaceId;
  const displayTools = options?.displayTools;
  const spaceCtx = { runId, entityId: agentEntityId, entityType: 'agent' as const, agentEntityId };

  // Internal state
  let reasoningId: string | null = null;
  let internalText = '';
  let delegateSignal: DelegateAgentSignal | null = null;

  const toolArgs = new Map<string, string>();              // toolCallId → accumulated JSON
  const toolCalls = new Map<string, { toolName: string; input: unknown }>();  // completed tool calls
  const toolResultIds = new Set<string>();

  // Display tool routing state
  const displayToolSpaces = new Map<string, string>();     // toolCallId → targetSpaceId
  const displayToolNames = new Map<string, string>();      // toolCallId → toolName

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
      if (displayTools?.has(toolName)) {
        displayToolNames.set(id, toolName);
      }
      await emitEvent('tool-input-start', { toolCallId: id, toolName });

      // Emit to space stream for visible tools (legacy — non-displayTool visible tools)
      if (visibleTools?.has(toolName) && targetSpaceId && !displayTools?.has(toolName)) {
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

      // Display tool routing: extract targetSpaceId + mention from partial args
      if (displayToolNames.has(id) && partial) {
        const tsId = partial.targetSpaceId;
        if (typeof tsId === 'string' && UUID_RE.test(tsId) && !displayToolSpaces.has(id)) {
          displayToolSpaces.set(id, tsId);
          const dtName = displayToolNames.get(id)!;
          await emitSmartSpaceEvent(tsId, 'tool-call.start', { toolCallId: id, toolName: dtName }, spaceCtx);

          // Flush all accumulated partial args now that the target space is known.
          // Earlier deltas were buffered while the UUID was being built character by character.
          const flushed = stripRoutingFields(partial as Record<string, unknown>);
          if (Object.keys(flushed).length > 0) {
            await emitSmartSpaceEvent(tsId, 'tool-input-delta', { toolCallId: id, partialArgs: flushed }, spaceCtx);
          }
        }
        // Stream partial args (stripped) to the display tool's target space
        const dtSpace = displayToolSpaces.get(id);
        if (dtSpace) {
          await emitSmartSpaceEvent(dtSpace, 'tool-input-delta', {
            toolCallId: id, partialArgs: stripRoutingFields(partial as Record<string, unknown>),
          }, spaceCtx);
        }
      }

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

      // Fallback: extract targetSpaceId from final input
      // (for models that don't stream tool-input-delta, or if partial parsing missed it)
      if (displayToolNames.has(toolCallId) && !displayToolSpaces.has(toolCallId)) {
        const args = input as Record<string, unknown> | undefined;
        if (args && typeof args.targetSpaceId === 'string' && args.targetSpaceId) {
          displayToolSpaces.set(toolCallId, args.targetSpaceId);
          await emitSmartSpaceEvent(args.targetSpaceId, 'tool-call.start', { toolCallId, toolName }, spaceCtx);
        }
      }

      // Display tool: emit full args (stripped) to target space
      const dtSpace = displayToolSpaces.get(toolCallId);
      if (dtSpace) {
        await emitSmartSpaceEvent(dtSpace, 'tool-call', {
          toolCallId, toolName, args: stripRoutingFields(input as Record<string, unknown>),
        }, spaceCtx);
      }
      // Legacy visible tools (non-displayTool)
      else if (visibleTools?.has(toolName) && targetSpaceId) {
        await emitSmartSpaceEvent(targetSpaceId, 'tool-call', { toolCallId, toolName, args: input }, spaceCtx);
      }

      toolCalls.set(toolCallId, { toolName, input });
    }

    // ── Tool result ──
    else if (t === 'tool-result') {
      const { toolCallId, toolName, output } = part as any;
      await emitEvent('tool-output-available', { toolCallId, toolName, output });
      toolResultIds.add(toolCallId);

      // Display tool: emit result to target space, persist as message
      const dtSpace = displayToolSpaces.get(toolCallId);
      if (dtSpace) {
        await emitSmartSpaceEvent(dtSpace, 'tool-call.result', { toolCallId, toolName, output }, spaceCtx);

        const tc = toolCalls.get(toolCallId);
        const cleanArgs = tc ? stripRoutingFields(tc.input as Record<string, unknown>) : {};
        const part = buildToolCallPart(toolCallId, toolName, cleanArgs, 'complete', output);

        try {
          await persistDisplayToolMessage({
            smartSpaceId: dtSpace, agentEntityId, runId, toolCallId, part,
            emit: true, spaceCtx,
          });
        } catch (err) {
          console.error(`[stream-processor] Failed to persist display tool message:`, err);
        }
      }
      // Legacy visible tools (non-displayTool)
      else if (visibleTools?.has(toolName) && targetSpaceId) {
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

      // Display tool: emit error to target space
      const dtSpace = displayToolSpaces.get(toolCallId);
      if (dtSpace) {
        await emitSmartSpaceEvent(dtSpace, 'tool-call.error', { toolCallId, toolName, error: errorStr }, spaceCtx);
      }
      // Legacy visible tools
      else if (visibleTools?.has(toolName) && targetSpaceId) {
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

      // Persist display client tool calls so they survive page refresh.
      // Do NOT emit smartSpace.message — the live tool call is displayed via
      // toolCalls state; emitting would clear it and break isRunning.
      const dtSpace = displayToolSpaces.get(toolCallId);
      if (dtSpace) {
        const cleanArgs = stripRoutingFields(tc.input as Record<string, unknown>);
        const part = buildToolCallPart(toolCallId, tc.toolName, cleanArgs, 'requires_action');
        try {
          await persistDisplayToolMessage({
            smartSpaceId: dtSpace, agentEntityId, runId, toolCallId, part,
            emit: false, spaceCtx,
          });
        } catch (err) {
          console.error(`[stream-processor] Failed to persist client display tool message:`, err);
        }
      }
    }
  }

  return {
    finalText: internalText || undefined,
    pendingClientToolCalls,
    delegateSignal,
  };
}
