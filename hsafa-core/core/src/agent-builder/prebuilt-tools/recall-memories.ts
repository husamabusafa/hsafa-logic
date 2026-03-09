import { tool, jsonSchema } from 'ai';
import { prisma } from '../../lib/db.js';
import type { HaseefProcessContext } from '../types.js';

// =============================================================================
// recall_memories — Search stored memories by key pattern or keyword
// =============================================================================

export function createRecallMemoriesTool(ctx: HaseefProcessContext) {
  return tool({
    description:
      'Search your stored memories by key pattern or keyword. Use when you need information that may not be in your current prompt. ' +
      'Returns matching memories with their importance levels and timestamps.',
    inputSchema: jsonSchema<{ query: string; limit?: number }>({
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query — matches against memory keys and values (case-insensitive substring match).',
        },
        limit: {
          type: 'number',
          description: 'Max results to return (default 10, max 50).',
        },
      },
      required: ['query'],
    }),
    execute: async ({ query, limit }) => {
      const maxResults = Math.min(limit ?? 10, 50);

      // Search by key or value containing the query (case-insensitive)
      const memories = await prisma.memory.findMany({
        where: {
          haseefId: ctx.haseefId,
          OR: [
            { key: { contains: query, mode: 'insensitive' } },
            { value: { contains: query, mode: 'insensitive' } },
          ],
        },
        orderBy: { importance: 'desc' },
        take: maxResults,
        select: {
          key: true,
          value: true,
          importance: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      // Update lastRecalledAt for all found memories
      const keys = memories.map((m) => m.key);
      if (keys.length > 0) {
        await prisma.memory.updateMany({
          where: { haseefId: ctx.haseefId, key: { in: keys } },
          data: { lastRecalledAt: new Date() },
        });
      }

      return {
        found: memories.length,
        memories: memories.map((m) => ({
          key: m.key,
          value: m.value,
          importance: m.importance,
          created: m.createdAt.toISOString(),
          updated: m.updatedAt.toISOString(),
        })),
      };
    },
  });
}
