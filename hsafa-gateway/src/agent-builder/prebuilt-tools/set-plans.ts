import { prisma } from '../../lib/db.js';
import { registerPrebuiltTool } from './registry.js';
import type { PrebuiltToolContext } from '../builder.js';
import { CronExpressionParser } from 'cron-parser';

interface PlanInput {
  match?: string;
  name: string;
  description?: string;
  instruction?: string;
  cron?: string;
  scheduledAt?: string;
  status?: string;
}

interface SetPlansInput {
  plans: PlanInput[];
  clearExisting?: boolean;
}

function computeNextRunAt(cron?: string | null, scheduledAt?: string | Date | null): Date | null {
  if (cron) {
    try {
      const expr = CronExpressionParser.parse(cron);
      return expr.next().toDate();
    } catch {
      return null;
    }
  }
  if (scheduledAt) {
    const dt = scheduledAt instanceof Date ? scheduledAt : new Date(scheduledAt);
    return isNaN(dt.getTime()) ? null : dt;
  }
  return null;
}

registerPrebuiltTool('setPlans', {
  defaultDescription:
    'Create or update plans. A plan is a scheduled task that runs at a specific time or on a recurring schedule.\n' +
    '- For one-time plans: provide "scheduledAt" with an ISO datetime (e.g. "2026-02-15T09:00:00Z").\n' +
    '- For recurring plans: provide "cron" with a cron expression (e.g. "0 9 * * 1" = every Monday at 9am UTC).\n' +
    'You must provide either "cron" or "scheduledAt", not both.',

  inputSchema: {
    type: 'object',
    properties: {
      plans: {
        type: 'array',
        description: 'Plans to create or update.',
        items: {
          type: 'object',
          properties: {
            match: {
              type: 'string',
              description: 'A unique phrase from the existing plan name you want to update. Use a distinctive multi-word phrase to avoid ambiguity — never a single common word. Omit to create a new plan.',
            },
            name: {
              type: 'string',
              description: 'A short descriptive name for the plan.',
            },
            description: {
              type: 'string',
              description: 'Longer description of what this plan is about.',
            },
            instruction: {
              type: 'string',
              description: 'What to do when this plan triggers.',
            },
            cron: {
              type: 'string',
              description: 'Cron expression for recurring plans. Examples: "0 9 * * *" (daily 9am), "0 9 * * 1" (every Monday 9am), "0 */6 * * *" (every 6 hours).',
            },
            scheduledAt: {
              type: 'string',
              description: 'ISO datetime for one-time plans. Example: "2026-02-15T09:00:00Z".',
            },
            status: {
              type: 'string',
              description: 'Plan status.',
              enum: ['pending', 'completed', 'canceled'],
            },
          },
          required: ['name'],
        },
      },
      clearExisting: {
        type: 'boolean',
        description: 'If true, remove all existing plans before creating new ones. Default: false.',
      },
    },
    required: ['plans'],
  },

  async execute(input: unknown, context: PrebuiltToolContext) {
    const { plans, clearExisting } = input as SetPlansInput;
    const { agentEntityId } = context;

    if (clearExisting) {
      await prisma.plan.deleteMany({
        where: { entityId: agentEntityId },
      });
    }

    const results: Array<{ action: string; name: string; nextRunAt: string | null; ambiguousCandidates?: string[] }> = [];

    // Load all plans once for matching
    const existingPlans: any[] = await (prisma.plan as any).findMany({
      where: { entityId: agentEntityId },
    });

    for (const plan of plans) {
      const isRecurring = !!plan.cron;
      const nextRunAt = computeNextRunAt(plan.cron, plan.scheduledAt);

      if (plan.match) {
        const lower = plan.match.toLowerCase();
        const found = existingPlans.filter((p: any) => (p.name || '').toLowerCase().includes(lower));

        if (found.length === 0) {
          results.push({ action: 'not_found', name: plan.name, nextRunAt: null, ambiguousCandidates: [] });
        } else if (found.length === 1) {
          await (prisma.plan as any).update({
            where: { id: found[0].id },
            data: {
              name: plan.name,
              description: plan.description ?? undefined,
              instruction: plan.instruction ?? undefined,
              isRecurring,
              cron: plan.cron ?? found[0].cron,
              scheduledAt: plan.scheduledAt ? new Date(plan.scheduledAt) : found[0].scheduledAt,
              nextRunAt: nextRunAt ?? found[0].nextRunAt,
              status: plan.status ?? undefined,
            },
          });
          results.push({ action: 'updated', name: plan.name, nextRunAt: nextRunAt?.toISOString() ?? null });
        } else {
          results.push({ action: 'ambiguous', name: plan.name, nextRunAt: null, ambiguousCandidates: found.map((p: any) => p.name) });
        }
      } else {
        if (!plan.cron && !plan.scheduledAt) {
          results.push({
            action: 'error',
            name: plan.name,
            nextRunAt: null,
          });
          continue;
        }
        await (prisma.plan as any).create({
          data: {
            entityId: agentEntityId,
            name: plan.name,
            description: plan.description ?? null,
            instruction: plan.instruction ?? null,
            isRecurring,
            cron: plan.cron ?? null,
            scheduledAt: plan.scheduledAt ? new Date(plan.scheduledAt) : null,
            nextRunAt,
            status: plan.status ?? 'pending',
          },
        });
        results.push({ action: 'created', name: plan.name, nextRunAt: nextRunAt?.toISOString() ?? null });
      }
    }

    const allPlans: any[] = await (prisma.plan as any).findMany({
      where: { entityId: agentEntityId },
      orderBy: [{ nextRunAt: 'asc' }],
    });

    return {
      success: true,
      plansModified: results,
      currentPlans: allPlans.map((p: any) => ({
        name: p.name,
        description: p.description,
        type: p.isRecurring ? 'recurring' : 'one-time',
        cron: p.cron,
        scheduledAt: p.scheduledAt?.toISOString() ?? null,
        nextRunAt: p.nextRunAt?.toISOString() ?? null,
        status: p.status,
      })),
      totalPlans: allPlans.length,
    };
  },
});
