import { prisma } from '../../lib/db.js';
import { registerPrebuiltTool } from './registry.js';
import type { PrebuiltToolContext } from '../builder.js';

interface GoalInput {
  match?: string;
  description: string;
  priority?: number;
  isLongTerm?: boolean;
  isCompleted?: boolean;
}

interface SetGoalsInput {
  goals: GoalInput[];
  clearExisting?: boolean;
}

registerPrebuiltTool('setGoals', {
  defaultDescription: 'Set or update goals. To update an existing goal, provide a "match" string that partially matches its text. Omit "match" to create a new goal. You can also clear all goals and start fresh.',

  inputSchema: {
    type: 'object',
    properties: {
      goals: {
        type: 'array',
        description: 'Goals to set or update.',
        items: {
          type: 'object',
          properties: {
            match: {
              type: 'string',
              description: 'A unique phrase from the existing goal you want to update. Use a distinctive multi-word phrase to avoid ambiguity — never a single common word. Omit to create a new goal.',
            },
            description: {
              type: 'string',
              description: 'What you want to achieve (new text for the goal).',
            },
            priority: {
              type: 'number',
              description: 'Priority level (0 = lowest). Higher = more important.',
            },
            isLongTerm: {
              type: 'boolean',
              description: 'true for long-term/ongoing goals, false for short-term.',
            },
            isCompleted: {
              type: 'boolean',
              description: 'Mark as completed.',
            },
          },
          required: ['description'],
        },
      },
      clearExisting: {
        type: 'boolean',
        description: 'If true, remove all existing goals before setting new ones. Default: false.',
      },
    },
    required: ['goals'],
  },

  async execute(input: unknown, context: PrebuiltToolContext) {
    const { goals, clearExisting } = input as SetGoalsInput;
    const { agentEntityId } = context;

    if (clearExisting) {
      await prisma.goal.deleteMany({
        where: { entityId: agentEntityId },
      });
    }

    const results: Array<{ action: string; description: string; ambiguousCandidates?: string[] }> = [];

    // Load all goals once for matching
    const existingGoals = await prisma.goal.findMany({
      where: { entityId: agentEntityId },
    });

    for (const goal of goals) {
      if (goal.match) {
        const lower = goal.match.toLowerCase();
        const found = existingGoals.filter((g) => g.description.toLowerCase().includes(lower));

        if (found.length === 0) {
          results.push({ action: 'not_found', description: goal.description, ambiguousCandidates: [] });
        } else if (found.length === 1) {
          await prisma.goal.update({
            where: { id: found[0].id },
            data: {
              description: goal.description,
              priority: goal.priority ?? found[0].priority,
              isLongTerm: goal.isLongTerm ?? found[0].isLongTerm,
              isCompleted: goal.isCompleted ?? found[0].isCompleted,
            },
          });
          results.push({ action: 'updated', description: goal.description });
        } else {
          results.push({ action: 'ambiguous', description: goal.description, ambiguousCandidates: found.map((g) => g.description) });
        }
      } else {
        await prisma.goal.create({
          data: {
            entityId: agentEntityId,
            description: goal.description,
            priority: goal.priority ?? 0,
            isLongTerm: goal.isLongTerm ?? false,
            isCompleted: goal.isCompleted ?? false,
          },
        });
        results.push({ action: 'created', description: goal.description });
      }
    }

    const allGoals = await prisma.goal.findMany({
      where: { entityId: agentEntityId },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });

    return {
      success: true,
      goalsModified: results,
      currentGoals: allGoals.map((g) => ({
        description: g.description,
        priority: g.priority,
        isLongTerm: g.isLongTerm,
        isCompleted: g.isCompleted,
      })),
      totalGoals: allGoals.length,
    };
  },
});
