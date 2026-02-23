import { tool, jsonSchema } from 'ai';
import { prisma } from '../../lib/db.js';
import type { AgentProcessContext } from '../types.js';

// =============================================================================
// delete_plans — Delete plans by ID
// =============================================================================

export function createDeletePlansTool(ctx: AgentProcessContext) {
  return tool({
    description: 'Delete one or more of your plans by ID.',
    inputSchema: jsonSchema<{ planIds: string[] }>({
      type: 'object',
      properties: {
        planIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Plan IDs to delete',
        },
      },
      required: ['planIds'],
    }),
    execute: async ({ planIds }) => {
      const result = await prisma.plan.deleteMany({
        where: { id: { in: planIds }, entityId: ctx.agentEntityId },
      });
      return { success: true, deleted: result.count };
    },
  });
}
