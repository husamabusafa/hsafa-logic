import { prisma } from '../../lib/db.js';
import { registerPrebuiltTool } from './registry.js';
import type { PrebuiltToolContext } from '../builder.js';

interface GetPreviousPlansInput {
  status?: string;
  limit?: number;
}

registerPrebuiltTool('getPreviousPlans', {
  defaultDescription:
    'Retrieve your previous plans that have already been completed or canceled. ' +
    'Your active plans (pending/running) are already visible to you — use this tool only when you need to look up past plan history.',

  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        description: 'Filter by status: "completed" or "canceled". Omit to return both.',
        enum: ['completed', 'canceled'],
      },
      limit: {
        type: 'number',
        description: 'Maximum number of plans to return. Default: 50.',
      },
    },
  },

  async execute(input: unknown, context: PrebuiltToolContext) {
    const { status, limit } = (input || {}) as GetPreviousPlansInput;
    const { agentEntityId } = context;

    const where: any = { entityId: agentEntityId };

    if (status) {
      where.status = status;
    } else {
      where.status = { in: ['completed', 'canceled'] };
    }

    const plans: any[] = await (prisma.plan as any).findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }],
      take: limit ?? 50,
    });

    return {
      plans: plans.map((p: any) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        instruction: p.instruction,
        type: p.isRecurring ? 'recurring' : 'one-time',
        cron: p.cron,
        scheduledAt: p.scheduledAt?.toISOString() ?? null,
        lastRunAt: p.lastRunAt?.toISOString() ?? null,
        status: p.status,
        createdAt: p.createdAt.toISOString(),
      })),
      totalPlans: plans.length,
    };
  },
});
