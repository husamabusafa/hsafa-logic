// =============================================================================
// Schedule Runner
//
// Polls the HaseefSchedule table for due schedules and fires sense events
// to Core. Runs on a configurable interval (default 30s).
//
// For recurring schedules: computes the next run time after firing.
// For one-time schedules: deactivates after firing.
// =============================================================================

import { prisma } from "../db.js";
import { pushSenseEvent } from "../service/core-api.js";
import { CronExpressionParser } from "cron-parser";

const POLL_INTERVAL_MS = 30_000; // 30 seconds

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

/**
 * Start the schedule runner polling loop.
 */
export function startScheduleRunner(): void {
  if (timer) return;
  console.log(`[schedule-runner] Starting (poll every ${POLL_INTERVAL_MS / 1000}s)`);
  // Run immediately on start, then on interval
  tick();
  timer = setInterval(tick, POLL_INTERVAL_MS);
}

/**
 * Stop the schedule runner.
 */
export function stopScheduleRunner(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

async function tick(): Promise<void> {
  if (running) return; // prevent overlapping ticks
  running = true;
  try {
    await processDueSchedules();
  } catch (err) {
    console.error("[schedule-runner] Tick error:", err);
  } finally {
    running = false;
  }
}

async function processDueSchedules(): Promise<void> {
  const now = new Date();

  // Find all active schedules where nextRunAt has passed
  const due = await prisma.haseefSchedule.findMany({
    where: {
      active: true,
      nextRunAt: { lte: now },
    },
  });

  if (due.length === 0) return;

  console.log(`[schedule-runner] ${due.length} schedule(s) due`);

  for (const schedule of due) {
    try {
      // Look up which skill instance name to use for the event
      // The scheduler skill's instance name is stored in HaseefSkill
      const haseefSkill = await prisma.haseefSkill.findFirst({
        where: { haseefId: schedule.haseefId },
        include: { instance: { include: { template: true } } },
      });

      // Find the scheduler instance attached to this haseef
      const schedulerSkill = haseefSkill?.instance?.template?.name === "scheduler"
        ? haseefSkill
        : await prisma.haseefSkill.findFirst({
            where: {
              haseefId: schedule.haseefId,
              instance: { template: { name: "scheduler" } },
            },
            include: { instance: true },
          });

      const skillName = schedulerSkill?.instance?.name ?? "scheduler";

      // Push sense event to Core
      await pushSenseEvent(schedule.haseefId, {
        eventId: `schedule-${schedule.id}-${now.getTime()}`,
        skill: skillName,
        type: "schedule.triggered",
        data: {
          scheduleId: schedule.id,
          description: schedule.description,
          type: schedule.type,
          cronExpression: schedule.cronExpression,
          timezone: schedule.timezone,
          scheduledAt: schedule.scheduledAt?.toISOString() ?? null,
          firedAt: now.toISOString(),
          formattedContext: buildScheduleContext(schedule),
        },
      });

      console.log(`[schedule-runner] Fired schedule "${schedule.description}" (${schedule.id.slice(0, 8)}) for haseef ${schedule.haseefId.slice(0, 8)}`);

      // Update schedule
      if (schedule.type === "one_time") {
        // Deactivate one-time schedules after firing
        await prisma.haseefSchedule.update({
          where: { id: schedule.id },
          data: { active: false, lastRunAt: now },
        });
      } else if (schedule.type === "recurring" && schedule.cronExpression) {
        // Compute next run time for recurring schedules
        try {
          const interval = CronExpressionParser.parse(schedule.cronExpression, {
            tz: schedule.timezone || "UTC",
            currentDate: now,
          });
          const nextRunAt = interval.next().toDate();
          await prisma.haseefSchedule.update({
            where: { id: schedule.id },
            data: { lastRunAt: now, nextRunAt },
          });
        } catch {
          // If cron parse fails, deactivate
          console.error(`[schedule-runner] Invalid cron for schedule ${schedule.id}, deactivating`);
          await prisma.haseefSchedule.update({
            where: { id: schedule.id },
            data: { active: false, lastRunAt: now },
          });
        }
      }
    } catch (err) {
      console.error(`[schedule-runner] Failed to fire schedule ${schedule.id}:`, err);
    }
  }
}

function buildScheduleContext(schedule: {
  id: string;
  description: string;
  type: string;
  cronExpression: string | null;
  timezone: string | null;
}): string {
  const lines: string[] = [];
  lines.push(`[SCHEDULED TASK TRIGGERED]`);
  lines.push(`Description: ${schedule.description}`);
  lines.push(`Type: ${schedule.type}`);
  if (schedule.cronExpression) {
    lines.push(`Cron: ${schedule.cronExpression}`);
  }
  if (schedule.timezone) {
    lines.push(`Timezone: ${schedule.timezone}`);
  }
  lines.push(`\nThis scheduled task has fired. Please carry out the described action.`);
  return lines.join("\n");
}
