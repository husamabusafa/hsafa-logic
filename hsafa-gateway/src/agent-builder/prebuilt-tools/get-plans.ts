import { tool, jsonSchema } from 'ai';
import { prisma } from '../../lib/db.js';
import type { AgentProcessContext } from '../types.js';

// =============================================================================
// get_plans — Read the agent's current plans
// =============================================================================

export function createGetPlansTool(ctx: AgentProcessContext) {
  return tool({
    description: 'Read your current plans. Optionally filter by status.',
    inputSchema: jsonSchema<{ status?: string }>({
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Filter by status: pending, running, completed, canceled. Omit for all.',
        },
      },
    }),
    execute: async ({ status }) => {
      const where: Record<string, unknown> = { entityId: ctx.agentEntityId };
      if (status) where.status = status;

      const plans = await prisma.plan.findMany({
        where,
        select: {
          id: true,
          name: true,
          instruction: true,
          cron: true,
          scheduledAt: true,
          nextRunAt: true,
          status: true,
          isRecurring: true,
        },
        orderBy: { nextRunAt: 'asc' },
      });

      return {
        plans: plans.map((p) => ({
          id: p.id,
          name: p.name,
          instruction: p.instruction,
          cron: p.cron,
          scheduledAt: p.scheduledAt?.toISOString() ?? null,
          nextRunAt: p.nextRunAt?.toISOString() ?? null,
          status: p.status,
          isRecurring: p.isRecurring,
        })),
      };
    },
  });
}
