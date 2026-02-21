// =============================================================================
// Prebuilt Tool: delete_goals
// =============================================================================
import { tool } from 'ai';
import { z } from 'zod';
import { prisma } from '../../lib/db.js';
import { registerPrebuiltTool } from './registry.js';

registerPrebuiltTool('delete_goals', {
  asTool: (context) =>
    tool({
      description: 'Delete one or more of your goals by ID.',
      inputSchema: z.object({
        goalIds: z.array(z.string()).describe('IDs of goals to delete.'),
      }),
      execute: async ({ goalIds }) => {
        const result = await prisma.goal.deleteMany({
          where: {
            id: { in: goalIds },
            entityId: context.agentEntityId,
          },
        });
        return { success: true, deleted: result.count };
      },
    }),
});
