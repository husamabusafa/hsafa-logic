import { tool, jsonSchema } from 'ai';
import { prisma } from '../../lib/db.js';
import type { AgentProcessContext } from '../types.js';

// =============================================================================
// read_messages — Read recent messages from a space
// =============================================================================

export function createReadMessagesTool(ctx: AgentProcessContext) {
  return tool({
    description:
      'Read recent messages from a space. Defaults to the active space. Use this for older history beyond what enter_space returned, or to read other spaces without switching.',
    inputSchema: jsonSchema<{ spaceId?: string; limit?: number; offset?: number }>({
      type: 'object',
      properties: {
        spaceId: { type: 'string', description: 'Space ID (defaults to active space)' },
        limit: { type: 'number', description: 'Number of messages to return (default 50)' },
        offset: { type: 'number', description: 'Skip this many recent messages (for paging back)' },
      },
    }),
    execute: async ({ spaceId, limit, offset }) => {
      const targetSpaceId = spaceId ?? ctx.getActiveSpaceId();
      if (!targetSpaceId) {
        return { error: 'No space specified and no active space. Call enter_space or provide spaceId.' };
      }

      const messageLimit = Math.min(limit ?? 50, 200);
      const skip = offset ?? 0;

      const messages = await prisma.smartSpaceMessage.findMany({
        where: { smartSpaceId: targetSpaceId },
        orderBy: { seq: 'desc' },
        take: messageLimit,
        skip,
        include: {
          entity: { select: { displayName: true, type: true } },
        },
      });

      const total = await prisma.smartSpaceMessage.count({
        where: { smartSpaceId: targetSpaceId },
      });

      return {
        messages: messages.reverse().map((m) => ({
          id: m.id,
          content: m.content,
          senderName: m.entity.displayName ?? 'Unknown',
          senderType: m.entity.type,
          timestamp: m.createdAt.toISOString(),
        })),
        total,
      };
    },
  });
}
