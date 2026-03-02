import { tool, jsonSchema } from 'ai';
import { prisma } from '../../lib/db.js';
import type { AgentProcessContext } from '../types.js';

// =============================================================================
// set_goals — Define or update agent goals
// =============================================================================

export function createSetGoalsTool(ctx: AgentProcessContext) {
  return tool({
    description:
      'Define or update your goals. Goals appear in your system prompt every cycle, helping you maintain long-term focus. Set status to "active", "completed", or "abandoned".',
    inputSchema: jsonSchema<{
      goals: Array<{ id?: string; description: string; status?: string; priority?: number }>;
    }>({
      type: 'object',
      properties: {
        goals: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Goal ID (omit to create new)' },
              description: { type: 'string', description: 'Goal description' },
              status: { type: 'string', description: 'active, completed, or abandoned (default: active)' },
              priority: { type: 'number', description: 'Priority (higher = more important, default 0)' },
            },
            required: ['description'],
          },
          description: 'Goals to create or update',
        },
      },
      required: ['goals'],
    }),
    execute: async ({ goals }) => {
      let count = 0;
      for (const goal of goals) {
        if (goal.id) {
          await prisma.goal.update({
            where: { id: goal.id },
            data: {
              description: goal.description,
              status: goal.status ?? 'active',
              priority: goal.priority ?? 0,
            },
          });
        } else {
          await prisma.goal.create({
            data: {
              entityId: ctx.agentEntityId,
              description: goal.description,
              status: goal.status ?? 'active',
              priority: goal.priority ?? 0,
            },
          });
        }
        count++;
      }
      return { success: true, count };
    },
  });
}
