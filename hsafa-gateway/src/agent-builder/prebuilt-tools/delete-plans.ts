import { prisma } from '../../lib/db.js';
import { registerPrebuiltTool } from './registry.js';
import type { PrebuiltToolContext } from '../builder.js';

interface DeletePlansInput {
  planIds?: string[];
  deleteAll?: boolean;
}

registerPrebuiltTool('deletePlans', {
  defaultDescription: 'Delete specific plans by ID, or delete all plans at once. Use this when a scheduled task is no longer needed.',

  inputSchema: {
    type: 'object',
    properties: {
      planIds: {
        type: 'array',
        description: 'IDs of specific plans to delete.',
        items: { type: 'string' },
      },
      deleteAll: {
        type: 'boolean',
        description: 'If true, delete all plans. Default: false.',
      },
    },
  },

  async execute(input: unknown, context: PrebuiltToolContext) {
    const { planIds, deleteAll } = (input || {}) as DeletePlansInput;
    const { agentEntityId } = context;

    const deleted: Array<{ id: string; name: string }> = [];

    if (deleteAll) {
      const all: any[] = await (prisma.plan as any).findMany({
        where: { entityId: agentEntityId },
      });
      await (prisma.plan as any).deleteMany({
        where: { entityId: agentEntityId },
      });
      for (const p of all) {
        deleted.push({ id: p.id, name: p.name });
      }
    } else if (planIds && planIds.length > 0) {
      const toDelete: any[] = await (prisma.plan as any).findMany({
        where: { id: { in: planIds }, entityId: agentEntityId },
      });
      await (prisma.plan as any).deleteMany({
        where: { id: { in: planIds }, entityId: agentEntityId },
      });
      for (const p of toDelete) {
        deleted.push({ id: p.id, name: p.name });
      }
    }

    const remaining: any[] = await (prisma.plan as any).findMany({
      where: { entityId: agentEntityId },
      orderBy: [{ nextRunAt: 'asc' }],
    });

    return {
      success: true,
      deleted,
      deletedCount: deleted.length,
      remainingPlans: remaining.map((p: any) => ({
        id: p.id,
        name: p.name,
        type: p.isRecurring ? 'recurring' : 'one-time',
        nextRunAt: p.nextRunAt?.toISOString() ?? null,
        status: p.status,
      })),
      totalRemaining: remaining.length,
    };
  },
});
