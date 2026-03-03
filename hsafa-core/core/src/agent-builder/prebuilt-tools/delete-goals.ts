import { tool, jsonSchema } from 'ai';
import { prisma } from '../../lib/db.js';
import type { HaseefProcessContext } from '../types.js';

// =============================================================================
// delete_goals — Delete goals by ID
// =============================================================================

export function createDeleteGoalsTool(ctx: HaseefProcessContext) {
  return tool({
    description: 'Delete one or more of your goals by ID.',
    inputSchema: jsonSchema<{ goalIds: string[] }>({
      type: 'object',
      properties: {
        goalIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Goal IDs to delete',
        },
      },
      required: ['goalIds'],
    }),
    execute: async ({ goalIds }) => {
      const result = await prisma.goal.deleteMany({
        where: { id: { in: goalIds }, entityId: ctx.haseefEntityId },
      });
      return { success: true, deleted: result.count };
    },
  });
}
