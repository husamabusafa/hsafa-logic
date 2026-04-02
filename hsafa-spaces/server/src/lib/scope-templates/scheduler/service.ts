// =============================================================================
// Scheduler Scope — Schedule Service (CRUD + Redis)
//
// Manages scheduled plans for haseefs: recurring (cron) or one-time.
// Uses cron-parser for cron expression parsing with timezone support.
// Redis sorted set for fast due-check polling.
// =============================================================================

import { CronExpressionParser } from "cron-parser";
import { prisma } from "../../db.js";
import { redis } from "../../redis.js";

// Redis sorted set key — score = nextRunAt epoch ms, member = scheduleId
const SCHEDULE_ZSET = "haseef:schedules:due";

// =============================================================================
// Types
// =============================================================================

export interface CreateScheduleParams {
  haseefId: string;
  agentEntityId: string;
  description: string;
  type: "recurring" | "one_time";
  cronExpression?: string;   // Required for recurring
  scheduledAt?: string;      // ISO date string, required for one_time
  timezone?: string;         // Default: "UTC"
}

export interface ScheduleInfo {
  id: string;
  description: string;
  type: string;
  cronExpression: string | null;
  scheduledAt: Date | null;
  timezone: string;
  nextRunAt: Date;
  lastRunAt: Date | null;
  active: boolean;
  createdAt: Date;
}

// =============================================================================
// Compute next run time
// =============================================================================

export function computeNextRun(
  type: "recurring" | "one_time",
  cronExpression?: string,
  scheduledAt?: string | Date,
  timezone?: string,
): Date {
  if (type === "recurring") {
    if (!cronExpression) throw new Error("cronExpression is required for recurring schedules");
    const tz = timezone || "UTC";
    const interval = CronExpressionParser.parse(cronExpression, {
      tz,
      currentDate: new Date(),
    });
    return interval.next().toDate();
  }

  if (type === "one_time") {
    if (!scheduledAt) throw new Error("scheduledAt is required for one_time schedules");
    const date = typeof scheduledAt === "string" ? new Date(scheduledAt) : scheduledAt;
    if (isNaN(date.getTime())) throw new Error("Invalid scheduledAt date");
    if (date.getTime() <= Date.now()) throw new Error("scheduledAt must be in the future");
    return date;
  }

  throw new Error(`Invalid schedule type: ${type}`);
}

/**
 * Compute the next run for a recurring schedule after it fires.
 * Returns null if the next occurrence can't be computed.
 */
export function computeNextRecurringRun(
  cronExpression: string,
  timezone: string,
): Date | null {
  try {
    const interval = CronExpressionParser.parse(cronExpression, {
      tz: timezone,
      currentDate: new Date(),
    });
    return interval.next().toDate();
  } catch {
    return null;
  }
}

// =============================================================================
// CRUD
// =============================================================================

export async function createSchedule(params: CreateScheduleParams): Promise<ScheduleInfo> {
  const { haseefId, agentEntityId, description, type, cronExpression, scheduledAt, timezone } = params;
  const tz = timezone || "UTC";

  // Validate
  if (type === "recurring" && !cronExpression) {
    throw new Error("cronExpression is required for recurring schedules");
  }
  if (type === "one_time" && !scheduledAt) {
    throw new Error("scheduledAt is required for one_time schedules");
  }

  // Validate cron expression
  if (type === "recurring" && cronExpression) {
    try {
      CronExpressionParser.parse(cronExpression, { tz });
    } catch (err: any) {
      throw new Error(`Invalid cron expression "${cronExpression}": ${err.message}`);
    }
  }

  const nextRunAt = computeNextRun(type, cronExpression, scheduledAt, tz);

  const schedule = await prisma.haseefSchedule.create({
    data: {
      haseefId,
      agentEntityId,
      description,
      type,
      cronExpression: cronExpression || null,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      timezone: tz,
      nextRunAt,
      active: true,
    },
  });

  // Add to Redis sorted set (score = nextRunAt epoch ms)
  await redis.zadd(SCHEDULE_ZSET, nextRunAt.getTime(), schedule.id);

  return formatSchedule(schedule);
}

export async function deleteSchedule(
  scheduleId: string,
  haseefId: string,
): Promise<{ success: boolean; error?: string }> {
  const schedule = await prisma.haseefSchedule.findUnique({
    where: { id: scheduleId },
  });

  if (!schedule) {
    return { success: false, error: "Schedule not found" };
  }
  if (schedule.haseefId !== haseefId) {
    return { success: false, error: "Schedule does not belong to this haseef" };
  }

  await prisma.haseefSchedule.delete({ where: { id: scheduleId } });

  // Remove from Redis sorted set
  await redis.zrem(SCHEDULE_ZSET, scheduleId);

  return { success: true };
}

export async function getActiveSchedules(haseefId: string): Promise<ScheduleInfo[]> {
  const schedules = await prisma.haseefSchedule.findMany({
    where: { haseefId, active: true },
    orderBy: { nextRunAt: "asc" },
  });
  return schedules.map(formatSchedule);
}

export async function getDueSchedules(): Promise<Array<{
  id: string;
  haseefId: string;
  agentEntityId: string;
  description: string;
  type: string;
  cronExpression: string | null;
  timezone: string;
  nextRunAt: Date;
}>> {
  const now = Date.now();

  // ZRANGEBYSCORE: all schedule IDs with score <= now
  const dueIds = await redis.zrangebyscore(SCHEDULE_ZSET, "-inf", now);
  if (dueIds.length === 0) return [];

  // Fetch full schedule data from DB
  const schedules = await prisma.haseefSchedule.findMany({
    where: {
      id: { in: dueIds },
      active: true,
    },
    select: {
      id: true,
      haseefId: true,
      agentEntityId: true,
      description: true,
      type: true,
      cronExpression: true,
      timezone: true,
      nextRunAt: true,
    },
  });

  // Clean up any orphaned Redis entries (schedule deleted from DB but still in Redis)
  const foundIds = new Set(schedules.map(s => s.id));
  const orphaned = dueIds.filter(id => !foundIds.has(id));
  if (orphaned.length > 0) {
    await redis.zrem(SCHEDULE_ZSET, ...orphaned);
  }

  return schedules;
}

/**
 * After a schedule fires:
 * - Recurring: compute next run, update lastRunAt + nextRunAt
 * - One-time: deactivate
 */
export async function markScheduleFired(scheduleId: string, type: string, cronExpression: string | null, timezone: string): Promise<void> {
  const now = new Date();

  if (type === "recurring" && cronExpression) {
    const nextRun = computeNextRecurringRun(cronExpression, timezone);
    if (nextRun) {
      await prisma.haseefSchedule.update({
        where: { id: scheduleId },
        data: { lastRunAt: now, nextRunAt: nextRun },
      });
      // Update Redis score to next run time
      await redis.zadd(SCHEDULE_ZSET, nextRun.getTime(), scheduleId);
    } else {
      // Can't compute next run — deactivate + remove from Redis
      await prisma.haseefSchedule.update({
        where: { id: scheduleId },
        data: { lastRunAt: now, active: false },
      });
      await redis.zrem(SCHEDULE_ZSET, scheduleId);
    }
  } else {
    // One-time: deactivate + remove from Redis
    await prisma.haseefSchedule.update({
      where: { id: scheduleId },
      data: { lastRunAt: now, active: false },
    });
    await redis.zrem(SCHEDULE_ZSET, scheduleId);
  }
}

/**
 * Sync Redis sorted set from DB — called on bootstrap to ensure
 * Redis is in sync after restarts or Redis flushes.
 */
export async function syncSchedulesToRedis(): Promise<void> {
  const active = await prisma.haseefSchedule.findMany({
    where: { active: true },
    select: { id: true, nextRunAt: true },
  });

  if (active.length === 0) {
    // Clear any stale entries
    await redis.del(SCHEDULE_ZSET);
    console.log("[scheduler] Redis sync: no active schedules");
    return;
  }

  // Pipeline: DEL + ZADD all in one round-trip
  const pipeline = redis.pipeline();
  pipeline.del(SCHEDULE_ZSET);
  for (const s of active) {
    pipeline.zadd(SCHEDULE_ZSET, s.nextRunAt.getTime(), s.id);
  }
  await pipeline.exec();

  console.log(`[scheduler] Redis sync: loaded ${active.length} active schedule(s)`);
}

// =============================================================================
// Helpers
// =============================================================================

function formatSchedule(s: any): ScheduleInfo {
  return {
    id: s.id,
    description: s.description,
    type: s.type,
    cronExpression: s.cronExpression,
    scheduledAt: s.scheduledAt,
    timezone: s.timezone,
    nextRunAt: s.nextRunAt,
    lastRunAt: s.lastRunAt,
    active: s.active,
    createdAt: s.createdAt,
  };
}
