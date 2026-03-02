import { parse as parsePartialJson } from 'partial-json';
import { emitSmartSpaceEvent } from './smartspace-events.js';
import { createSmartSpaceMessage } from './smartspace-db.js';
import { prisma } from './db.js';
import {
  buildToolCallContent,
  buildToolCallMessageMeta,
  buildToolCallMessagePayload,
  type ToolCallStatus,
} from './tool-call-utils.js';
import type { AgentProcessContext } from '../agent-builder/types.js';
import { getCtx } from '../agent-builder/types.js';

// =============================================================================
// Tool Streaming — Shared hook state + factories
//
// Tool lifecycle hooks (onInputStart, onInputDelta, onInputAvailable) run on
// the tool definitions themselves. This module provides:
//
// 1. A shared state map so hooks, execute wrappers, and stream-processor can
//    coordinate (e.g. pass messageId from onInputAvailable to execute wrapper)
//
// 2. Factory functions that create hooks for visible custom tools
//
// 3. A finalization function called by execute wrappers to update DB + emit
//    space events when a visible tool completes
// =============================================================================

// =============================================================================
// Shared hook state
// =============================================================================

export interface ToolHookState {
  toolName: string;
  runId: string;
  agentEntityId: string;
  argsText: string;
  lastTextLen: number;
  spaceId: string | null;
  startedAt: number;
  /** DB message ID — set by onInputAvailable for visible custom tools */
  messageId?: string;
  isSendMessage: boolean;
}

/**
 * Module-scoped state shared between tool lifecycle hooks and execute wrappers.
 * Keyed by toolCallId (globally unique UUID).
 * Entries are created in onInputStart and deleted after execute completes.
 */
export const hookStates = new Map<string, ToolHookState>();

// =============================================================================
// Visible custom tool hooks factory
// =============================================================================

/**
 * Create onInputStart / onInputDelta / onInputAvailable hooks for a visible
 * custom tool. These handle space-facing SSE events:
 *
 *   onInputStart     → emit tool.started
 *   onInputDelta     → partial JSON parse → emit tool.streaming
 *   onInputAvailable → emit tool.streaming (final) + persist SmartSpaceMessage
 */
export function createVisibleToolHooks(
  toolName: string,
  asyncTools: Set<string>,
) {
  return {
    onInputStart: async (options: { toolCallId: string; experimental_context?: unknown }) => {
      const ctx = getCtx(options as { experimental_context?: unknown });
      const toolCallId = options.toolCallId;
      const spaceId = ctx.getActiveSpaceId();

      hookStates.set(toolCallId, {
        toolName,
        runId: ctx.currentRunId!,
        agentEntityId: ctx.agentEntityId,
        argsText: '',
        lastTextLen: 0,
        spaceId,
        startedAt: Date.now(),
        isSendMessage: false,
      });

      if (spaceId) {
        await emitSmartSpaceEvent(spaceId, {
          type: 'tool.started',
          streamId: toolCallId,
          runId: ctx.currentRunId!,
          agentEntityId: ctx.agentEntityId,
          toolName,
        });
      }
    },

    onInputDelta: async (options: { toolCallId: string; inputTextDelta: string; experimental_context?: unknown }) => {
      const toolCallId = options.toolCallId;
      const delta = options.inputTextDelta ?? '';
      const state = hookStates.get(toolCallId);
      if (!state || !delta || !state.spaceId) return;

      state.argsText += delta;

      try {
        const partialArgs = parsePartialJson(state.argsText);
        if (partialArgs !== undefined) {
          const ctx = getCtx(options as { experimental_context?: unknown });
          await emitSmartSpaceEvent(state.spaceId, {
            type: 'tool.streaming',
            streamId: toolCallId,
            runId: ctx.currentRunId!,
            agentEntityId: ctx.agentEntityId,
            toolName,
            partialArgs,
          });
        }
      } catch {
        // Partial JSON not yet parseable — skip
      }
    },

    onInputAvailable: async (options: { toolCallId: string; input: unknown; experimental_context?: unknown }) => {
      const toolCallId = options.toolCallId;
      const input = options.input;
      const state = hookStates.get(toolCallId);
      if (!state?.spaceId) return;

      const ctx = getCtx(options as { experimental_context?: unknown });

      // Emit final args
      await emitSmartSpaceEvent(state.spaceId, {
        type: 'tool.streaming',
        streamId: toolCallId,
        runId: ctx.currentRunId!,
        agentEntityId: ctx.agentEntityId,
        toolName,
        partialArgs: input,
      });

      // Persist tool call as SmartSpaceMessage
      const isAsync = asyncTools.has(toolName);
      const finalStatus: ToolCallStatus = isAsync ? 'requires_action' : 'running';

      try {
        const toolContent = buildToolCallContent(toolName, input, null, finalStatus);
        const toolMeta = buildToolCallMessageMeta({
          toolCallId,
          toolName,
          args: input,
          result: null,
          status: finalStatus,
          runId: ctx.currentRunId!,
        });
        const dbMsg = await createSmartSpaceMessage({
          smartSpaceId: state.spaceId,
          entityId: ctx.agentEntityId,
          role: 'assistant',
          content: toolContent,
          metadata: toolMeta as unknown as Record<string, unknown>,
          runId: ctx.currentRunId!,
        });
        state.messageId = dbMsg.id;

        await emitSmartSpaceEvent(state.spaceId, {
          type: 'space.message',
          streamId: toolCallId,
          message: buildToolCallMessagePayload({
            messageId: dbMsg.id,
            smartSpaceId: state.spaceId,
            entityId: ctx.agentEntityId,
            toolCallId,
            toolName,
            args: input,
            result: null,
            status: finalStatus,
            runId: ctx.currentRunId!,
          }),
        });
      } catch (err) {
        console.warn(`[tool-streaming] Failed to persist tool call ${toolCallId}:`, err);
      }
    },
  };
}

// =============================================================================
// Execute wrapper finalization
// =============================================================================

/**
 * Called by the execute wrapper of visible custom tools AFTER the original
 * execute returns. Updates the persisted SmartSpaceMessage with the result
 * and emits tool.done + space.message events.
 *
 * For async tools that return { status: 'pending' }, this is a no-op —
 * the message stays as 'requires_action' until the real result arrives.
 */
export async function finalizeVisibleToolResult(
  toolCallId: string,
  toolName: string,
  args: unknown,
  result: unknown,
  ctx: AgentProcessContext,
): Promise<void> {
  const state = hookStates.get(toolCallId);

  // Skip finalization for pending async results
  const isPending =
    typeof result === 'object' &&
    result !== null &&
    (result as Record<string, unknown>).status === 'pending';

  if (isPending || !state?.spaceId || !state.messageId) {
    hookStates.delete(toolCallId);
    return;
  }

  try {
    const completeMeta = buildToolCallMessageMeta({
      toolCallId,
      toolName,
      args,
      result,
      status: 'complete',
      runId: ctx.currentRunId!,
    });
    const completeContent = buildToolCallContent(toolName, args, result, 'complete');

    await prisma.smartSpaceMessage.update({
      where: { id: state.messageId },
      data: { content: completeContent, metadata: completeMeta as any },
    });

    await emitSmartSpaceEvent(state.spaceId, {
      type: 'tool.done',
      streamId: toolCallId,
      runId: ctx.currentRunId!,
      agentEntityId: ctx.agentEntityId,
      toolName,
      result,
    });

    await emitSmartSpaceEvent(state.spaceId, {
      type: 'space.message',
      streamId: toolCallId,
      message: buildToolCallMessagePayload({
        messageId: state.messageId,
        smartSpaceId: state.spaceId,
        entityId: ctx.agentEntityId,
        toolCallId,
        toolName,
        args,
        result,
        status: 'complete',
        runId: ctx.currentRunId!,
      }),
    });
  } catch (err) {
    console.warn(`[tool-streaming] Failed to update tool message ${state.messageId}:`, err);
  }

  hookStates.delete(toolCallId);
}
