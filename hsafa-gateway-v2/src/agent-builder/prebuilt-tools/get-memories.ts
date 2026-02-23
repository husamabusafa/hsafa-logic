// =============================================================================
// Prebuilt Tool: get_memories
// =============================================================================
import { tool } from 'ai';
import { z } from 'zod';
import { prisma } from '../../lib/db.js';
import { registerPrebuiltTool } from './registry.js';

registerPrebuiltTool('get_memories', {
  asTool: (context) =>
    tool({
      description:
        'Read your stored memories. Returns all memories or specific keys if provided.',
      inputSchema: z.object({
        keys: z
          .array(z.string())
          .optional()
          .describe('Specific memory keys to retrieve. Omit to return all.'),
      }),
      execute: async ({ keys }) => {
        const memories = await prisma.memory.findMany({
          where: {
            entityId: context.agentEntityId,
            ...(keys && keys.length > 0 ? { key: { in: keys } } : {}),
          },
          orderBy: { updatedAt: 'desc' },
          select: { key: true, value: true, updatedAt: true },
        });

        return {
          memories: memories.map((m) => ({
            key: m.key,
            value: m.value,
            updatedAt: m.updatedAt.toISOString(),
          })),
        };
      },
    }),
});
