import { tool, jsonSchema } from 'ai';
import { prisma } from '../../lib/db.js';
import { enqueuePlan, dequeuePlan } from '../../lib/plan-scheduler.js';
import type { AgentProcessContext } from '../types.js';

// =============================================================================
// set_plans — Create or update scheduled plans
// =============================================================================

/**
 * Parse a relative duration string like "2 hours", "30 minutes", "1 day"
 * into a future Date.
 */
function parseRunAfter(runAfter: string): Date | null {
  const match = runAfter.match(/^(\d+)\s*(minute|minutes|hour|hours|day|days|week|weeks)$/i);
  if (!match) return null;

  const amount = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  const now = new Date();
  switch (unit) {
    case 'minute':
    case 'minutes':
      return new Date(now.getTime() + amount * 60_000);
    case 'hour':
    case 'hours':
      return new Date(now.getTime() + amount * 3_600_000);
    case 'day':
    case 'days':
      return new Date(now.getTime() + amount * 86_400_000);
    case 'week':
    case 'weeks':
      return new Date(now.getTime() + amount * 604_800_000);
    default:
      return null;
  }
}

export function createSetPlansTool(ctx: AgentProcessContext) {
  return tool({
    description:
      'Create or update scheduled plans. Plans push events to your inbox on schedule. Use exactly one of: cron (recurring), scheduledAt (one-shot ISO timestamp), or runAfter (one-shot relative delay like "2 hours").',
    inputSchema: jsonSchema<{
      plans: Array<{
        id?: string;
        name: string;
        instruction?: string;
        cron?: string;
        scheduledAt?: string;
        runAfter?: string;
      }>;
    }>({
      type: 'object',
      properties: {
        plans: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Plan ID (omit to create new)' },
              name: { type: 'string', description: 'Plan name' },
              instruction: { type: 'string', description: 'What to do when the plan fires' },
              cron: { type: 'string', description: 'Cron expression for recurring plans' },
              scheduledAt: { type: 'string', description: 'ISO timestamp for one-shot plans' },
              runAfter: { type: 'string', description: 'Relative delay like "2 hours", "30 minutes", "1 day"' },
            },
            required: ['name'],
          },
          description: 'Plans to create or update',
        },
      },
      required: ['plans'],
    }),
    execute: async ({ plans }) => {
      let count = 0;
      for (const plan of plans) {
        // Resolve scheduling
        let nextRunAt: Date | null = null;
        let scheduledAt: Date | null = null;
        let isRecurring = false;

        if (plan.cron) {
          isRecurring = true;
          // For cron, nextRunAt will be calculated by the plan scheduler
          // For now, set it to a near-future time so the scheduler picks it up
          nextRunAt = new Date(Date.now() + 60_000);
        } else if (plan.scheduledAt) {
          scheduledAt = new Date(plan.scheduledAt);
          nextRunAt = scheduledAt;
        } else if (plan.runAfter) {
          const parsed = parseRunAfter(plan.runAfter);
          if (parsed) {
            scheduledAt = parsed;
            nextRunAt = parsed;
          }
        }

        if (plan.id) {
          // Remove old BullMQ job before re-scheduling
          const oldPlan = await prisma.plan.findUnique({ where: { id: plan.id }, select: { cron: true } });
          await dequeuePlan(plan.id, oldPlan?.cron);

          await prisma.plan.update({
            where: { id: plan.id },
            data: {
              name: plan.name,
              instruction: plan.instruction,
              cron: plan.cron ?? null,
              scheduledAt,
              nextRunAt,
              isRecurring,
              status: 'pending',
            },
          });

          // Enqueue updated plan
          await enqueuePlan({ id: plan.id, entityId: ctx.agentEntityId, cron: plan.cron ?? null, nextRunAt, isRecurring });
        } else {
          const created = await prisma.plan.create({
            data: {
              entityId: ctx.agentEntityId,
              name: plan.name,
              instruction: plan.instruction,
              cron: plan.cron ?? null,
              scheduledAt,
              nextRunAt,
              isRecurring,
              status: 'pending',
            },
          });

          // Enqueue new plan
          await enqueuePlan({ id: created.id, entityId: ctx.agentEntityId, cron: plan.cron ?? null, nextRunAt, isRecurring });
        }
        count++;
      }
      return { success: true, count };
    },
  });
}
