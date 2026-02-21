// =============================================================================
// Prebuilt Tool: set_plans
// =============================================================================
// Creates or updates scheduled plans that trigger the agent automatically.
// Supports: runAfter (relative delay), scheduledAt (absolute), cron (recurring)

import { tool } from 'ai';
import { z } from 'zod';
import { prisma } from '../../lib/db.js';
import { registerPrebuiltTool } from './registry.js';

// Parses human-readable durations like "2 hours", "30 minutes", "1 day"
function parseRunAfter(runAfter: string): Date {
  const now = new Date();
  const lower = runAfter.toLowerCase().trim();

  const match = lower.match(/^(\d+)\s*(second|minute|hour|day|week)s?$/);
  if (!match) {
    throw new Error(
      `Cannot parse runAfter: "${runAfter}". Use format like "2 hours", "30 minutes", "1 day".`,
    );
  }

  const amount = parseInt(match[1], 10);
  const unit = match[2];

  const ms: Record<string, number> = {
    second: 1_000,
    minute: 60_000,
    hour: 3_600_000,
    day: 86_400_000,
    week: 604_800_000,
  };

  return new Date(now.getTime() + amount * ms[unit]);
}

registerPrebuiltTool('set_plans', {
  asTool: (context) =>
    tool({
      description:
        'Create or update scheduled plans. Use runAfter for a relative delay, ' +
        'scheduledAt for a specific time, or cron for a recurring schedule.',
      inputSchema: z.object({
        plans: z.array(
          z.object({
            name: z.string().describe('Plan name (used as identifier for updates)'),
            instruction: z
              .string()
              .describe('What the agent should do when this plan triggers'),
            runAfter: z
              .string()
              .optional()
              .describe('One-shot trigger after a delay (e.g. "2 hours", "30 minutes")'),
            scheduledAt: z
              .string()
              .optional()
              .describe('One-shot trigger at a specific ISO 8601 timestamp'),
            cron: z
              .string()
              .optional()
              .describe('Recurring schedule as a cron expression (e.g. "0 9 * * *")'),
          }),
        ),
      }),
      execute: async ({ plans }) => {
        let created = 0;
        let updated = 0;

        for (const p of plans) {
          // Exactly one of runAfter / scheduledAt / cron must be set
          const schedCount = [p.runAfter, p.scheduledAt, p.cron].filter(Boolean).length;
          if (schedCount === 0) {
            return {
              success: false,
              error: `Plan "${p.name}" must have one of: runAfter, scheduledAt, or cron.`,
            };
          }
          if (schedCount > 1) {
            return {
              success: false,
              error: `Plan "${p.name}" must have only one of: runAfter, scheduledAt, or cron.`,
            };
          }

          let nextRunAt: Date | null = null;
          let scheduledAt: Date | null = null;
          let isRecurring = false;
          let cron: string | null = null;

          if (p.runAfter) {
            nextRunAt = parseRunAfter(p.runAfter);
          } else if (p.scheduledAt) {
            scheduledAt = new Date(p.scheduledAt);
            nextRunAt = scheduledAt;
          } else if (p.cron) {
            isRecurring = true;
            cron = p.cron;
            // nextRunAt will be computed by plan-scheduler at startup
            // For now set it to now so it gets picked up quickly
            nextRunAt = new Date();
          }

          // Upsert by entityId + name
          const existing = await prisma.plan.findFirst({
            where: { entityId: context.agentEntityId, name: p.name },
          });

          if (existing) {
            await prisma.plan.update({
              where: { id: existing.id },
              data: {
                instruction: p.instruction,
                isRecurring,
                cron,
                scheduledAt,
                nextRunAt,
                status: 'pending',
                completedAt: null,
              },
            });
            updated++;
          } else {
            await prisma.plan.create({
              data: {
                entityId: context.agentEntityId,
                name: p.name,
                instruction: p.instruction,
                isRecurring,
                cron,
                scheduledAt,
                nextRunAt,
                status: 'pending',
              },
            });
            created++;
          }
        }

        return { success: true, created, updated };
      },
    }),
});
