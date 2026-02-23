import { tool, jsonSchema } from 'ai';
import { prisma } from '../../lib/db.js';
import { createSmartSpaceMessage } from '../../lib/smartspace-db.js';
import { emitSmartSpaceEvent } from '../../lib/smartspace-events.js';
import { pushSpaceMessageEvent } from '../../lib/inbox.js';
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
    execute: async ({ text }) => {
      const spaceId = ctx.getActiveSpaceId();
      if (!spaceId) {
        return { success: false, error: 'No active space. Call enter_space first.' };
      }

      // Persist the message
      const message = await createSmartSpaceMessage({
        smartSpaceId: spaceId,
        entityId: ctx.agentEntityId,
        role: 'assistant',
        content: text,
        runId: ctx.currentRunId ?? undefined,
      });

      // Emit to space SSE (the stream-processor handles streaming deltas;
      // this emits the final persisted message for clients joining late)
      await emitSmartSpaceEvent(spaceId, {
        type: 'space.message',
        streamId: null,
        message: {
          id: message.id,
          smartSpaceId: spaceId,
          entityId: ctx.agentEntityId,
          role: 'assistant',
          content: text,
          metadata: null,
          seq: message.seq.toString(),
          createdAt: message.createdAt.toISOString(),
        },
      });

      // Push to all OTHER agent members' inboxes (sender excluded)
      const space = await prisma.smartSpace.findUnique({
        where: { id: spaceId },
        select: { name: true },
      });

      const agentMembers = await prisma.smartSpaceMembership.findMany({
        where: {
          smartSpaceId: spaceId,
          entityId: { not: ctx.agentEntityId },
          entity: { type: 'agent' },
        },
        select: { entityId: true },
      });

      for (const member of agentMembers) {
        pushSpaceMessageEvent(member.entityId, {
          spaceId,
          spaceName: space?.name ?? 'Unnamed',
          messageId: message.id,
          senderEntityId: ctx.agentEntityId,
          senderName: ctx.agentName,
          senderType: 'agent',
          content: text,
        }).catch((err) => {
          console.warn(`[send_message] Failed to push to inbox ${member.entityId}:`, err);
        });
      }

      return { success: true, messageId: message.id, status: 'delivered' };
    },
  });
}
