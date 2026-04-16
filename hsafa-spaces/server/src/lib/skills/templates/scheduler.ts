// =============================================================================
// Scheduler Skill Template
//
// Allows haseefs to create and manage scheduled tasks (cron + one-time).
// Uses the existing HaseefSchedule table in the Spaces DB.
// The Spaces server's schedule runner fires sense events to Core.
// =============================================================================

import { prisma } from "../../db.js";
import { CronExpressionParser } from "cron-parser";
import type { SkillTemplateDefinition, SkillHandler, ToolCallContext, SenseEventPusher } from "../types.js";

export const schedulerTemplate: SkillTemplateDefinition = {
  name: "scheduler",
  displayName: "Scheduler",
  description: "Create recurring (cron) and one-time scheduled tasks. Haseefs receive sense events when schedules fire.",
  category: "automation",
  configSchema: {
    type: "object",
    properties: {
      timezone: {
        type: "string",
        description: "Default timezone for schedules (e.g. 'Asia/Riyadh', 'UTC'). Default: UTC",
        default: "UTC",
      },
      maxSchedules: {
        type: "number",
        description: "Maximum number of active schedules per haseef (default: 50)",
        default: 50,
      },
    },
  },
  tools: [
    {
      name: "create_schedule",
      description:
        "Create a new schedule. For recurring: provide cronExpression (e.g. '0 9 * * *' for daily at 9am). For one-time: provide scheduledAt (ISO 8601 datetime).",
      inputSchema: {
        type: "object",
        properties: {
          description: { type: "string", description: "What this schedule is for." },
          type: { type: "string", enum: ["recurring", "one_time"], description: "Schedule type." },
          cronExpression: {
            type: "string",
            description: "Cron expression for recurring schedules (e.g. '0 9 * * *').",
          },
          scheduledAt: {
            type: "string",
            description: "ISO 8601 datetime for one-time schedules (e.g. '2026-04-17T09:00:00Z').",
          },
          timezone: {
            type: "string",
            description: "Timezone override for this schedule (default: instance timezone).",
          },
        },
        required: ["description", "type"],
      },
      mode: "sync" as const,
    },
    {
      name: "list_schedules",
      description: "List all active schedules for the current haseef.",
      inputSchema: {
        type: "object",
        properties: {
          includeInactive: {
            type: "boolean",
            description: "Include inactive/completed schedules (default: false).",
          },
        },
      },
      mode: "sync" as const,
    },
    {
      name: "update_schedule",
      description: "Update an existing schedule's description, cron expression, timezone, or active state.",
      inputSchema: {
        type: "object",
        properties: {
          scheduleId: { type: "string", description: "The schedule ID to update." },
          description: { type: "string", description: "New description." },
          cronExpression: { type: "string", description: "New cron expression (recurring only)." },
          timezone: { type: "string", description: "New timezone." },
          active: { type: "boolean", description: "Enable or disable the schedule." },
        },
        required: ["scheduleId"],
      },
      mode: "sync" as const,
    },
    {
      name: "delete_schedule",
      description: "Permanently delete a schedule.",
      inputSchema: {
        type: "object",
        properties: {
          scheduleId: { type: "string", description: "The schedule ID to delete." },
        },
        required: ["scheduleId"],
      },
      mode: "sync" as const,
    },
  ],
  instructions: `You can create and manage scheduled tasks through this skill.

USAGE:
  Use create_schedule to set up recurring (cron) or one-time tasks.
  Use list_schedules to see your current schedules.
  When a schedule fires, you'll receive a "schedule.triggered" sense event with the schedule details.

CRON SYNTAX (for recurring):
  ┌───── minute (0-59)
  │ ┌───── hour (0-23)
  │ │ ┌───── day of month (1-31)
  │ │ │ ┌───── month (1-12)
  │ │ │ │ ┌───── day of week (0-6, Sun=0)
  │ │ │ │ │
  * * * * *

  Examples:
    "0 9 * * *"     — Every day at 9:00 AM
    "0 9 * * 1-5"   — Weekdays at 9:00 AM
    "*/30 * * * *"   — Every 30 minutes
    "0 0 1 * *"     — First day of every month at midnight

TIPS:
  Always confirm the timezone with the user.
  For daily reminders, ask what time they prefer.
  Tell the user when their next run will be.`,

  createHandler: (config: Record<string, unknown>): SkillHandler => {
    return createSchedulerHandler(config);
  },
};

// =============================================================================
// Handler Implementation
// =============================================================================

function createSchedulerHandler(config: Record<string, unknown>): SkillHandler {
  const defaultTimezone = (config.timezone as string) || "UTC";
  const maxSchedules = (config.maxSchedules as number) || 50;

  return {
    async execute(toolName: string, args: Record<string, unknown>, ctx: ToolCallContext): Promise<unknown> {
      switch (toolName) {
        case "create_schedule":
          return handleCreateSchedule(args, ctx, defaultTimezone, maxSchedules);
        case "list_schedules":
          return handleListSchedules(args, ctx);
        case "update_schedule":
          return handleUpdateSchedule(args, ctx, defaultTimezone);
        case "delete_schedule":
          return handleDeleteSchedule(args, ctx);
        default:
          return { error: `Unknown tool: ${toolName}` };
      }
    },
  };
}

async function handleCreateSchedule(
  args: Record<string, unknown>,
  ctx: ToolCallContext,
  defaultTimezone: string,
  maxSchedules: number,
): Promise<unknown> {
  const description = args.description as string;
  const type = args.type as string;
  const cronExpression = args.cronExpression as string | undefined;
  const scheduledAt = args.scheduledAt as string | undefined;
  const timezone = (args.timezone as string) || defaultTimezone;

  if (!description || !type) return { error: "description and type are required" };
  if (type !== "recurring" && type !== "one_time") return { error: "type must be 'recurring' or 'one_time'" };

  // Check limit
  const count = await prisma.haseefSchedule.count({
    where: { haseefId: ctx.haseefId, active: true },
  });
  if (count >= maxSchedules) {
    return { error: `Maximum active schedules (${maxSchedules}) reached. Delete some before creating new ones.` };
  }

  let nextRunAt: Date;

  if (type === "recurring") {
    if (!cronExpression) return { error: "cronExpression is required for recurring schedules" };
    try {
      const interval = CronExpressionParser.parse(cronExpression, { tz: timezone });
      nextRunAt = interval.next().toDate();
    } catch {
      return { error: `Invalid cron expression: ${cronExpression}` };
    }
  } else {
    if (!scheduledAt) return { error: "scheduledAt is required for one-time schedules" };
    nextRunAt = new Date(scheduledAt);
    if (isNaN(nextRunAt.getTime())) return { error: `Invalid date: ${scheduledAt}` };
    if (nextRunAt <= new Date()) return { error: "scheduledAt must be in the future" };
  }

  // We need agentEntityId — look it up from haseef ownership
  const ownership = await prisma.haseefOwnership.findFirst({
    where: { haseefId: ctx.haseefId },
    select: { entityId: true },
  });

  const schedule = await prisma.haseefSchedule.create({
    data: {
      haseefId: ctx.haseefId,
      agentEntityId: ownership?.entityId ?? ctx.haseefId,
      description,
      type,
      cronExpression: type === "recurring" ? cronExpression! : null,
      scheduledAt: type === "one_time" ? nextRunAt : null,
      timezone,
      nextRunAt,
      active: true,
    },
  });

  return {
    success: true,
    schedule: {
      id: schedule.id,
      description: schedule.description,
      type: schedule.type,
      cronExpression: schedule.cronExpression,
      timezone: schedule.timezone,
      nextRunAt: schedule.nextRunAt.toISOString(),
    },
  };
}

async function handleListSchedules(
  args: Record<string, unknown>,
  ctx: ToolCallContext,
): Promise<unknown> {
  const includeInactive = args.includeInactive === true;

  const schedules = await prisma.haseefSchedule.findMany({
    where: {
      haseefId: ctx.haseefId,
      ...(includeInactive ? {} : { active: true }),
    },
    orderBy: { nextRunAt: "asc" },
  });

  return {
    schedules: schedules.map((s) => ({
      id: s.id,
      description: s.description,
      type: s.type,
      cronExpression: s.cronExpression,
      scheduledAt: s.scheduledAt?.toISOString() ?? null,
      timezone: s.timezone,
      nextRunAt: s.nextRunAt.toISOString(),
      lastRunAt: s.lastRunAt?.toISOString() ?? null,
      active: s.active,
    })),
    count: schedules.length,
  };
}

async function handleUpdateSchedule(
  args: Record<string, unknown>,
  ctx: ToolCallContext,
  defaultTimezone: string,
): Promise<unknown> {
  const scheduleId = args.scheduleId as string;
  if (!scheduleId) return { error: "scheduleId is required" };

  const schedule = await prisma.haseefSchedule.findFirst({
    where: { id: scheduleId, haseefId: ctx.haseefId },
  });
  if (!schedule) return { error: "Schedule not found" };

  const data: Record<string, unknown> = {};
  if (args.description !== undefined) data.description = args.description;
  if (args.active !== undefined) data.active = args.active;
  if (args.timezone !== undefined) data.timezone = args.timezone;

  if (args.cronExpression !== undefined && schedule.type === "recurring") {
    const tz = (args.timezone as string) || schedule.timezone || defaultTimezone;
    try {
      const interval = CronExpressionParser.parse(args.cronExpression as string, { tz });
      data.cronExpression = args.cronExpression;
      data.nextRunAt = interval.next().toDate();
    } catch {
      return { error: `Invalid cron expression: ${args.cronExpression}` };
    }
  }

  const updated = await prisma.haseefSchedule.update({
    where: { id: scheduleId },
    data,
  });

  return {
    success: true,
    schedule: {
      id: updated.id,
      description: updated.description,
      type: updated.type,
      cronExpression: updated.cronExpression,
      timezone: updated.timezone,
      nextRunAt: updated.nextRunAt.toISOString(),
      active: updated.active,
    },
  };
}

async function handleDeleteSchedule(
  args: Record<string, unknown>,
  ctx: ToolCallContext,
): Promise<unknown> {
  const scheduleId = args.scheduleId as string;
  if (!scheduleId) return { error: "scheduleId is required" };

  const schedule = await prisma.haseefSchedule.findFirst({
    where: { id: scheduleId, haseefId: ctx.haseefId },
  });
  if (!schedule) return { error: "Schedule not found" };

  await prisma.haseefSchedule.delete({ where: { id: scheduleId } });

  return { success: true, deletedId: scheduleId };
}

export default schedulerTemplate;
