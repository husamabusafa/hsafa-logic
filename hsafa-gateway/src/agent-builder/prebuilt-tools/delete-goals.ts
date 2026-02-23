import { tool, jsonSchema } from 'ai';
import { prisma } from '../../lib/db.js';
import type { AgentProcessContext } from '../types.js';

// =============================================================================
// delete_goals — Delete goals by ID
// =============================================================================

export function createDeleteGoalsTool(ctx: AgentProcessContext) {
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
        where: { id: { in: goalIds }, entityId: ctx.agentEntityId },
      });
      return { success: true, deleted: result.count };
    },
  });
}
