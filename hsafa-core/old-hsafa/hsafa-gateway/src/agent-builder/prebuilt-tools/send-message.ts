import { tool, jsonSchema } from 'ai';
import { parse as parsePartialJson } from 'partial-json';
import { emitSmartSpaceEvent } from '../../lib/smartspace-events.js';
import { hookStates } from '../../lib/tool-streaming.js';
import { getSpacesForEntity } from '../../lib/membership-service.js';
import { postSpaceMessage } from '../../lib/space-service.js';
import type { AgentProcessContext } from '../types.js';

// =============================================================================
// send_message — Post a message to the active space
// =============================================================================

export function createSendMessageTool(ctx: AgentProcessContext) {
  return tool({
    description:
      'Send a message to the active space. This is your only way to communicate externally. You must call enter_space first. Returns { success: true } on delivery — do NOT retry.',
    inputSchema: jsonSchema<{ text: string }>({
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Message content' },
      },
      required: ['text'],
    }),

    // ── Tool Lifecycle Hooks ──────────────────────────────────────────────
    // The tool owns its own streaming. onInputStart fires when the model
    // begins generating args; onInputDelta fires for each JSON chunk.
    // We extract the `text` field via partial-json and emit real-time
    // typing deltas to the space SSE channel.

    onInputStart: async (options: { toolCallId: string; experimental_context?: unknown }) => {
      const spaceId = ctx.getActiveSpaceId();
      hookStates.set(options.toolCallId, {
        toolName: 'send_message',
        runId: ctx.currentRunId!,
        agentEntityId: ctx.agentEntityId,
        argsText: '',
        lastTextLen: 0,
        spaceId,
        startedAt: Date.now(),
        isSendMessage: true,
      });

      if (spaceId) {
        await emitSmartSpaceEvent(spaceId, {
          type: 'space.message.streaming',
          streamId: options.toolCallId,
          runId: ctx.currentRunId!,
          agentEntityId: ctx.agentEntityId,
          phase: 'start',
          delta: '',
        });
      }
    },

    onInputDelta: async (options: { toolCallId: string; inputTextDelta: string; experimental_context?: unknown }) => {
      const state = hookStates.get(options.toolCallId);
      if (!state || !state.spaceId) return;
      const delta = options.inputTextDelta ?? '';
      if (!delta) return;

      state.argsText += delta;

      try {
        const parsed = parsePartialJson(state.argsText) as Record<string, unknown> | null;
        if (parsed && typeof parsed.text === 'string') {
          const newText = parsed.text;
          const textDelta = newText.slice(state.lastTextLen);
          if (textDelta) {
            state.lastTextLen = newText.length;
            await emitSmartSpaceEvent(state.spaceId, {
              type: 'space.message.streaming',
              streamId: options.toolCallId,
              runId: ctx.currentRunId!,
              agentEntityId: ctx.agentEntityId,
              phase: 'delta',
              delta: textDelta,
              text: newText,
            });
          }
        }
      } catch {
        // Partial JSON not yet parseable
      }
    },

    // ── Execute ───────────────────────────────────────────────────────────

    execute: async ({ text }, { toolCallId }) => {
      const spaceId = ctx.getActiveSpaceId();
      if (!spaceId) {
        console.warn(`[send_message] ${ctx.agentName} tried to send without active space — message NOT delivered: "${text.slice(0, 80)}"`);
        const spaces = await getSpacesForEntity(ctx.agentEntityId);
        const spaceList = spaces.map((s) => `"${s.spaceName}" (id: ${s.spaceId})`).join(', ');
        return {
          success: false,
          error: `MESSAGE NOT SENT — you are not in any space. Call enter_space first, then retry send_message.`,
          action: `Call enter_space with one of your spaces: ${spaceList || 'none found'}`,
        };
      }

      try {
        // Persist + emit SSE + fan-out to agent inboxes (via SpaceService)
        const result = await postSpaceMessage({
          spaceId,
          entityId: ctx.agentEntityId,
          role: 'assistant',
          content: text,
          runId: ctx.currentRunId ?? undefined,
          senderName: ctx.agentName,
          senderType: 'agent',
          streamId: toolCallId,
        });

        // Emit streaming done so the frontend replaces the live typing entry
        const hookState = hookStates.get(toolCallId);
        if (hookState?.spaceId) {
          await emitSmartSpaceEvent(hookState.spaceId, {
            type: 'space.message.streaming',
            streamId: toolCallId,
            runId: ctx.currentRunId!,
            agentEntityId: ctx.agentEntityId,
            phase: 'done',
          });
        }
        hookStates.delete(toolCallId);

        console.log(`[send_message] ${ctx.agentName} delivered to space ${spaceId} messageId=${result.messageId}`);
        return { success: true, messageId: result.messageId, status: 'delivered' };
      } catch (err) {
        console.error(`[send_message] ${ctx.agentName} FAILED to deliver to space ${spaceId}:`, err);
        return {
          success: false,
          error: `MESSAGE FAILED — internal error: ${err instanceof Error ? err.message : String(err)}. You may retry once.`,
        };
      }
    },
  });
}
