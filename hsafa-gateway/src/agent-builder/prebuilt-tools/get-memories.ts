import { tool, jsonSchema } from 'ai';
import { prisma } from '../../lib/db.js';
import type { AgentProcessContext } from '../types.js';

// =============================================================================
// get_memories — Read the agent's stored memories
// =============================================================================

export function createGetMemoriesTool(ctx: AgentProcessContext) {
  return tool({
    description:
      'Read your stored memories. If keys are provided, returns only those. Otherwise returns all memories.',
    inputSchema: jsonSchema<{ keys?: string[] }>({
      type: 'object',
      properties: {
        keys: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific keys to retrieve. Omit for all memories.',
        },
      },
    }),
    execute: async ({ keys }) => {
      const where: Record<string, unknown> = { entityId: ctx.agentEntityId };
      if (keys && keys.length > 0) {
        where.key = { in: keys };
      }

      const memories = await prisma.memory.findMany({
        where,
        select: { key: true, value: true },
        orderBy: { updatedAt: 'desc' },
      });

      return { memories };
    },
  });
}
