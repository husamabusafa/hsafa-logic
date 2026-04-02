// =============================================================================
// Scheduler Scope — Tool Definitions + Instructions
// =============================================================================

/**
 * Scheduler scope tools — cron-based and one-time scheduled plans.
 */
export const SCHEDULER_TOOLS = [
  {
    name: "create_schedule",
    description:
      "Create a scheduled plan. Use type 'recurring' with a cron expression for repeating schedules (e.g. '0 6 * * *' = every day at 6am), or type 'one_time' with scheduledAt for a single future event. Always specify a timezone. Returns the created schedule with its ID.",
    inputSchema: {
      type: "object" as const,
      properties: {
        description: {
          type: "string",
          description: "What this schedule is for (e.g. 'Send daily morning briefing to Team Chat').",
        },
        type: {
          type: "string",
          enum: ["recurring", "one_time"],
          description: "Schedule type: 'recurring' for cron-based, 'one_time' for a single future date.",
        },
        cronExpression: {
          type: "string",
          description: "Cron expression for recurring schedules (5 fields: minute hour day month weekday). Examples: '0 6 * * *' = daily at 6am, '0 */3 * * *' = every 3 hours, '0 9 * * 1' = every Monday at 9am.",
        },
        scheduledAt: {
          type: "string",
          description: "ISO 8601 date string for one_time schedules (e.g. '2026-04-12T10:00:00'). Must be in the future.",
        },
        timezone: {
          type: "string",
          description: "IANA timezone (e.g. 'Asia/Riyadh', 'America/New_York', 'UTC'). Defaults to UTC.",
        },
      },
      required: ["description", "type"],
    },
    mode: "sync" as const,
  },
  {
    name: "delete_schedule",
    description:
      "Delete one of your scheduled plans by ID. Check your active schedules in the system prompt to find the ID.",
    inputSchema: {
      type: "object" as const,
      properties: {
        scheduleId: {
          type: "string",
          description: "The schedule ID to delete.",
        },
      },
      required: ["scheduleId"],
    },
    mode: "sync" as const,
  },
];

/**
 * Instructions injected into the Haseef's prompt when the scheduler scope is active.
 */
export const SCHEDULER_INSTRUCTIONS = `You can create scheduled plans that trigger you as sense events.

HOW IT WORKS:
  Use scheduler_create_schedule to set up recurring or one-time schedules.
  When the time comes, you will receive a scheduled_plan sense event.
  Respond to these events like any other — use spaces tools to take action.`;
