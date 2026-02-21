// =============================================================================
// Prebuilt Tool: set_goals
// =============================================================================
import { tool } from 'ai';
import { z } from 'zod';
import { prisma } from '../../lib/db.js';
import { registerPrebuiltTool } from './registry.js';

registerPrebuiltTool('set_goals', {
  asTool: (context) =>
    tool({
      description:
        'Define or update your goals. Goals are injected into every future run under a GOALS block.',
      inputSchema: z.object({
        goals: z.array(
          z.object({
            id: z.string().optional().describe('Existing goal ID to update. Omit to create a new goal.'),
            description: z.string().describe('Goal description'),
            status: z
              .enum(['active', 'completed', 'abandoned'])
              .optional()
              .describe('Goal status. Default: active.'),
            priority: z
              .number()
              .optional()
              .describe('Priority (lower = higher priority). Default: 0.'),
          }),
        ),
      }),
      execute: async ({ goals }) => {
        let created = 0;
        let updated = 0;

        for (const g of goals) {
          if (g.id) {
            // Update existing
            await prisma.goal.updateMany({
              where: { id: g.id, entityId: context.agentEntityId },
              data: {
                description: g.description,
                ...(g.status !== undefined ? { status: g.status } : {}),
                ...(g.priority !== undefined ? { priority: g.priority } : {}),
              },
            });
            updated++;
          } else {
            // Create new
            await prisma.goal.create({
              data: {
                entityId: context.agentEntityId,
                description: g.description,
                status: g.status ?? 'active',
                priority: g.priority ?? 0,
              },
            });
            created++;
          }
        }

        return { success: true, created, updated };
      },
    }),
});
