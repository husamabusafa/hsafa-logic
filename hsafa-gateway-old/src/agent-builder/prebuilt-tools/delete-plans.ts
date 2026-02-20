import { prisma } from '../../lib/db.js';
import { registerPrebuiltTool } from './registry.js';
import type { PrebuiltToolContext } from '../builder.js';

interface DeletePlansInput {
  matches?: string[];
  deleteAll?: boolean;
}

registerPrebuiltTool('deletePlans', {
  defaultDescription: 'Delete plans by describing them, or delete all plans at once. You do not need IDs — just describe which plan to remove using a word or phrase from its name.',

  inputSchema: {
    type: 'object',
    properties: {
      matches: {
        type: 'array',
        description: 'A unique phrase from the plan name you want to delete. Use a distinctive multi-word phrase to avoid ambiguity — never a single common word. Example: ["weekly standup sync", "birthday reminder for Sarah"].',
        items: { type: 'string' },
      },
      deleteAll: {
        type: 'boolean',
        description: 'If true, delete all plans. Default: false.',
      },
    },
  },

  async execute(input: unknown, context: PrebuiltToolContext) {
    const { matches, deleteAll } = (input || {}) as DeletePlansInput;
    const { agentEntityId } = context;

    const deleted: Array<{ name: string }> = [];
    const ambiguous: Array<{ match: string; candidates: string[] }> = [];
    const notFound: string[] = [];

    if (deleteAll) {
      const all: any[] = await (prisma.plan as any).findMany({
        where: { entityId: agentEntityId },
      });
      await (prisma.plan as any).deleteMany({
        where: { entityId: agentEntityId },
      });
      for (const p of all) {
        deleted.push({ name: p.name });
      }
    } else if (matches && matches.length > 0) {
      const allPlans: any[] = await (prisma.plan as any).findMany({
        where: { entityId: agentEntityId },
      });

      const idsToDelete = new Set<string>();

      for (const match of matches) {
        const lower = match.toLowerCase();
        const found = allPlans.filter((p: any) => (p.name || '').toLowerCase().includes(lower));

        if (found.length === 0) {
          notFound.push(match);
        } else if (found.length === 1) {
          idsToDelete.add(found[0].id);
          deleted.push({ name: found[0].name });
        } else {
          ambiguous.push({ match, candidates: found.map((p: any) => p.name) });
        }
      }

      if (idsToDelete.size > 0) {
        await (prisma.plan as any).deleteMany({
          where: { id: { in: [...idsToDelete] }, entityId: agentEntityId },
        });
      }
    }

    const remaining: any[] = await (prisma.plan as any).findMany({
      where: { entityId: agentEntityId },
      orderBy: [{ nextRunAt: 'asc' }],
    });

    return {
      success: ambiguous.length === 0 && notFound.length === 0,
      deleted,
      deletedCount: deleted.length,
      ...(ambiguous.length > 0 ? { ambiguous, ambiguousMessage: 'Some matches found multiple plans. Be more specific.' } : {}),
      ...(notFound.length > 0 ? { notFound, notFoundMessage: 'No plans matched these terms.' } : {}),
      remainingPlans: remaining.map((p: any) => ({
        name: p.name,
        type: p.isRecurring ? 'recurring' : 'one-time',
        nextRunAt: p.nextRunAt?.toISOString() ?? null,
        status: p.status,
      })),
      totalRemaining: remaining.length,
    };
  },
});
