// =============================================================================
// Prebuilt Tool: get_plans
// =============================================================================
import { tool } from 'ai';
import { z } from 'zod';
import { prisma } from '../../lib/db.js';
import { registerPrebuiltTool } from './registry.js';

registerPrebuiltTool('get_plans', {
  asTool: (context) =>
    tool({
      description: 'Read your current plans. Optionally filter by status.',
      inputSchema: z.object({
        status: z
          .enum(['pending', 'running', 'completed', 'canceled'])
          .optional()
          .describe('Filter by plan status. Omit for all.'),
      }),
      execute: async ({ status }) => {
        const plans = await prisma.plan.findMany({
          where: {
            entityId: context.agentEntityId,
            ...(status ? { status } : {}),
          },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            name: true,
            instruction: true,
            isRecurring: true,
            cron: true,
            scheduledAt: true,
            nextRunAt: true,
            lastRunAt: true,
            status: true,
          },
        });

        return {
          plans: plans.map((p) => ({
            id: p.id,
            name: p.name,
            instruction: p.instruction ?? '',
            isRecurring: p.isRecurring,
            cron: p.cron ?? undefined,
            scheduledAt: p.scheduledAt?.toISOString() ?? undefined,
            nextRunAt: p.nextRunAt?.toISOString() ?? undefined,
            lastRunAt: p.lastRunAt?.toISOString() ?? undefined,
            status: p.status,
          })),
        };
      },
    }),
});
