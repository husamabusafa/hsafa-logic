import { tool, jsonSchema } from 'ai';
import { prisma } from '../../lib/db.js';
import type { AgentProcessContext } from '../types.js';

// =============================================================================
// enter_space — Set the active space and load recent history
// =============================================================================

export function createEnterSpaceTool(ctx: AgentProcessContext) {
  return tool({
    description:
      'Set the active space for this cycle. All subsequent send_message calls and visible tool results go to this space. Returns recent message history.',
    inputSchema: jsonSchema<{ spaceId: string; limit?: number }>({
      type: 'object',
      properties: {
        spaceId: { type: 'string', description: 'ID of the space to enter' },
        limit: { type: 'number', description: 'Number of recent messages to load (default 50)' },
      },
      required: ['spaceId'],
    }),
    execute: async ({ spaceId, limit }) => {
      const messageLimit = Math.min(limit ?? 50, 200);

      // Validate membership
      const membership = await prisma.smartSpaceMembership.findUnique({
        where: {
          smartSpaceId_entityId: { smartSpaceId: spaceId, entityId: ctx.agentEntityId },
        },
        include: {
          smartSpace: { select: { name: true } },
        },
      });

      if (!membership) {
        return { success: false, error: 'Not a member of this space' };
      }

      // Set active space (in-memory only)
      ctx.setActiveSpaceId(spaceId);

      // Load recent messages
      const messages = await prisma.smartSpaceMessage.findMany({
        where: { smartSpaceId: spaceId },
        orderBy: { seq: 'desc' },
        take: messageLimit,
        include: {
          entity: { select: { displayName: true, type: true } },
        },
      });

      const total = await prisma.smartSpaceMessage.count({
        where: { smartSpaceId: spaceId },
      });

      const history = messages.reverse().map((m) => ({
        id: m.id,
        senderName: m.entity.displayName ?? 'Unknown',
        senderType: m.entity.type,
        content: m.content,
        timestamp: m.createdAt.toISOString(),
      }));

      return {
        success: true,
        spaceId,
        spaceName: membership.smartSpace.name ?? 'Unnamed',
        history,
        totalMessages: total,
      };
    },
  });
}
