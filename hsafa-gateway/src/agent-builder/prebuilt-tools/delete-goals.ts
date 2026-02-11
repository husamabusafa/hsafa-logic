import { prisma } from '../../lib/db.js';
import { registerPrebuiltTool } from './registry.js';
import type { PrebuiltToolContext } from '../builder.js';

interface DeleteGoalsInput {
  matches?: string[];
  deleteAll?: boolean;
}

registerPrebuiltTool('deleteGoals', {
  defaultDescription: 'Delete goals by describing them, or delete all goals at once. You do not need IDs — just describe which goal(s) to remove using a word or phrase from the goal text.',

  inputSchema: {
    type: 'object',
    properties: {
      matches: {
        type: 'array',
        description: 'A unique phrase from the goal you want to delete. Use a distinctive multi-word phrase to avoid ambiguity — never a single common word. Example: ["finish quarterly report", "onboarding new hires"].',
        items: { type: 'string' },
      },
      deleteAll: {
        type: 'boolean',
        description: 'If true, delete all goals. Default: false.',
      },
    },
  },

  async execute(input: unknown, context: PrebuiltToolContext) {
    const { matches, deleteAll } = (input || {}) as DeleteGoalsInput;
    const { agentEntityId } = context;

    const deleted: Array<{ description: string }> = [];
    const ambiguous: Array<{ match: string; candidates: string[] }> = [];
    const notFound: string[] = [];

    if (deleteAll) {
      const all = await prisma.goal.findMany({
        where: { entityId: agentEntityId },
      });
      await prisma.goal.deleteMany({
        where: { entityId: agentEntityId },
      });
      for (const g of all) {
        deleted.push({ description: g.description });
      }
    } else if (matches && matches.length > 0) {
      const allGoals = await prisma.goal.findMany({
        where: { entityId: agentEntityId },
      });

      const idsToDelete = new Set<string>();

      for (const match of matches) {
        const lower = match.toLowerCase();
        const found = allGoals.filter((g) => g.description.toLowerCase().includes(lower));

        if (found.length === 0) {
          notFound.push(match);
        } else if (found.length === 1) {
          idsToDelete.add(found[0].id);
          deleted.push({ description: found[0].description });
        } else {
          ambiguous.push({ match, candidates: found.map((g) => g.description) });
        }
      }

      if (idsToDelete.size > 0) {
        await prisma.goal.deleteMany({
          where: { id: { in: [...idsToDelete] }, entityId: agentEntityId },
        });
      }
    }

    const remaining = await prisma.goal.findMany({
      where: { entityId: agentEntityId },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });

    return {
      success: ambiguous.length === 0 && notFound.length === 0,
      deleted,
      deletedCount: deleted.length,
      ...(ambiguous.length > 0 ? { ambiguous, ambiguousMessage: 'Some matches found multiple goals. Be more specific.' } : {}),
      ...(notFound.length > 0 ? { notFound, notFoundMessage: 'No goals matched these terms.' } : {}),
      remainingGoals: remaining.map((g) => ({
        description: g.description,
        priority: g.priority,
        isLongTerm: g.isLongTerm,
        isCompleted: g.isCompleted,
      })),
      totalRemaining: remaining.length,
    };
  },
});
