import { prisma } from '../../lib/db.js';
import { registerPrebuiltTool } from './registry.js';
import type { PrebuiltToolContext } from '../builder.js';

interface GetPlansInput {
  status?: string;
  includeCompleted?: boolean;
  limit?: number;
}

function formatRemainingTime(targetDate: Date): string {
  const now = new Date();
  const diffMs = targetDate.getTime() - now.getTime();

  if (diffMs <= 0) return 'overdue';

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);

  const parts: string[] = [];

  if (months > 0) {
    parts.push(`${months} month${months > 1 ? 's' : ''}`);
    const remDays = days - months * 30;
    if (remDays > 0) parts.push(`${remDays} day${remDays > 1 ? 's' : ''}`);
  } else if (weeks > 0) {
    parts.push(`${weeks} week${weeks > 1 ? 's' : ''}`);
    const remDays = days - weeks * 7;
    if (remDays > 0) parts.push(`${remDays} day${remDays > 1 ? 's' : ''}`);
  } else if (days > 0) {
    parts.push(`${days} day${days > 1 ? 's' : ''}`);
    const remHours = hours - days * 24;
    if (remHours > 0) parts.push(`${remHours} hour${remHours > 1 ? 's' : ''}`);
  } else if (hours > 0) {
    parts.push(`${hours} hour${hours > 1 ? 's' : ''}`);
    const remMins = minutes - hours * 60;
    if (remMins > 0) parts.push(`${remMins} minute${remMins > 1 ? 's' : ''}`);
  } else if (minutes > 0) {
    parts.push(`${minutes} minute${minutes > 1 ? 's' : ''}`);
  } else {
    parts.push(`${seconds} second${seconds > 1 ? 's' : ''}`);
  }

  return parts.join(', ');
}

registerPrebuiltTool('getPlans', {
  defaultDescription:
    'Retrieve your current plans. Shows scheduled tasks with their next run time and how much time remains until execution.',

  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        description: 'Filter by status: "pending", "running", "completed", or "canceled". Omit to return pending plans.',
        enum: ['pending', 'running', 'completed', 'canceled'],
      },
      includeCompleted: {
        type: 'boolean',
        description: 'Include completed and canceled plans. Default: false (only pending/running).',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of plans to return. Default: 50.',
      },
    },
  },

  async execute(input: unknown, context: PrebuiltToolContext) {
    const { status, includeCompleted, limit } = (input || {}) as GetPlansInput;
    const { agentEntityId } = context;

    const where: any = { entityId: agentEntityId };

    if (status) {
      where.status = status;
    } else if (!includeCompleted) {
      where.status = { in: ['pending', 'running'] };
    }

    const plans: any[] = await (prisma.plan as any).findMany({
      where,
      orderBy: [{ nextRunAt: 'asc' }],
      take: limit ?? 50,
    });

    const now = new Date();

    return {
      currentTime: now.toISOString(),
      plans: plans.map((p: any) => {
        const nextRun = p.nextRunAt ? new Date(p.nextRunAt) : null;
        const isPast = nextRun ? nextRun.getTime() <= now.getTime() : false;

        return {
          id: p.id,
          name: p.name,
          description: p.description,
          instruction: p.instruction,
          type: p.isRecurring ? 'recurring' : 'one-time',
          cron: p.cron,
          scheduledAt: p.scheduledAt?.toISOString() ?? null,
          nextRunAt: nextRun?.toISOString() ?? null,
          remainingTime: nextRun ? (isPast ? 'overdue' : formatRemainingTime(nextRun)) : null,
          lastRunAt: p.lastRunAt?.toISOString() ?? null,
          status: p.status,
          createdAt: p.createdAt.toISOString(),
        };
      }),
      totalPlans: plans.length,
    };
  },
});
