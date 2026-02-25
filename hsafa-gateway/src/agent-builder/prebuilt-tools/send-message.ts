import { tool, jsonSchema } from 'ai';
import { prisma } from '../../lib/db.js';
import { createSmartSpaceMessage } from '../../lib/smartspace-db.js';
import { emitSmartSpaceEvent } from '../../lib/smartspace-events.js';
import { pushSpaceMessageEvent, fetchRecentSpaceContext } from '../../lib/inbox.js';
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
    execute: async ({ text }, { toolCallId }) => {
      const spaceId = ctx.getActiveSpaceId();
      if (!spaceId) {
        console.warn(`[send_message] ${ctx.agentName} tried to send without active space — message NOT delivered: "${text.slice(0, 80)}"`);
        const memberships = await prisma.smartSpaceMembership.findMany({
          where: { entityId: ctx.agentEntityId },
          include: { smartSpace: { select: { id: true, name: true } } },
        });
        const spaceList = memberships.map((m) => `"${m.smartSpace.name}" (id: ${m.smartSpace.id})`).join(', ');
        return {
          success: false,
          error: `MESSAGE NOT SENT — you are not in any space. Call enter_space first, then retry send_message.`,
          action: `Call enter_space with one of your spaces: ${spaceList || 'none found'}`,
        };
      }

      // Persist the message
      const message = await createSmartSpaceMessage({
        smartSpaceId: spaceId,
        entityId: ctx.agentEntityId,
        role: 'assistant',
        content: text,
        runId: ctx.currentRunId ?? undefined,
      });

      // Emit to space SSE with toolCallId as streamId so the frontend can
      // remove the live space.message.streaming entry and replace it seamlessly.
      await emitSmartSpaceEvent(spaceId, {
        type: 'space.message',
        streamId: toolCallId,
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

      // Fetch recent context once for all agent pushes
      const recentContext = agentMembers.length > 0
        ? await fetchRecentSpaceContext(spaceId, message.id).catch(() => [])
        : [];

      for (const member of agentMembers) {
        pushSpaceMessageEvent(member.entityId, {
          spaceId,
          spaceName: space?.name ?? 'Unnamed',
          messageId: message.id,
          senderEntityId: ctx.agentEntityId,
          senderName: ctx.agentName,
          senderType: 'agent',
          content: text,
          recentContext: recentContext.length > 0 ? recentContext : undefined,
        }).catch((err) => {
          console.warn(`[send_message] Failed to push to inbox ${member.entityId}:`, err);
        });
      }

      return { success: true, messageId: message.id, status: 'delivered' };
    },
  });
}
