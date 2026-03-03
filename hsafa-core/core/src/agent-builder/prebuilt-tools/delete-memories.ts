import { tool, jsonSchema } from 'ai';
import { prisma } from '../../lib/db.js';
import type { HaseefProcessContext } from '../types.js';

// =============================================================================
// delete_memories — Delete memories by key
// =============================================================================

export function createDeleteMemoriesTool(ctx: HaseefProcessContext) {
  return tool({
    description:
      'Delete one or more of your stored memories by key. Use when information is no longer relevant.',
    inputSchema: jsonSchema<{ keys: string[] }>({
      type: 'object',
      properties: {
        keys: {
          type: 'array',
          items: { type: 'string' },
          description: 'Memory keys to delete',
        },
      },
      required: ['keys'],
    }),
    execute: async ({ keys }) => {
      const result = await prisma.memory.deleteMany({
        where: { entityId: ctx.haseefEntityId, key: { in: keys } },
      });
      return { success: true, deleted: result.count };
    },
  });
}
