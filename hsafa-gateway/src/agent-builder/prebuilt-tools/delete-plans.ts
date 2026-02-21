// =============================================================================
// Prebuilt Tool: delete_plans
// =============================================================================
import { tool } from 'ai';
import { z } from 'zod';
import { prisma } from '../../lib/db.js';
import { registerPrebuiltTool } from './registry.js';

registerPrebuiltTool('delete_plans', {
  asTool: (context) =>
    tool({
      description: 'Delete one or more of your plans by ID.',
      inputSchema: z.object({
        planIds: z.array(z.string()).describe('IDs of plans to delete.'),
      }),
      execute: async ({ planIds }) => {
        const result = await prisma.plan.deleteMany({
          where: {
            id: { in: planIds },
            entityId: context.agentEntityId,
          },
        });
        return { success: true, deleted: result.count };
      },
    }),
});
