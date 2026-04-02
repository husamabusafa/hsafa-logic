// =============================================================================
// Scheduler Scope — Init
//
// Self-contained scope template that fully uses @hsafa/sdk:
//   - Creates its own SDK instance
//   - Registers tools via sdk.registerTools()
//   - Handles tool calls via sdk.onToolCall()
//   - Pushes sense events via sdk.pushEvent()
//   - Starts background poller for due schedules
//   - Registers dynamic instruction provider for YOUR SCHEDULES
//
// The service layer only needs to call initSchedulerScope(config).
// =============================================================================

import { HsafaSDK } from "@hsafa/sdk";
import type { ToolCallContext } from "@hsafa/sdk";
import { state } from "../../service/types.js";
import { syncTools } from "../../service/core-api.js";
import { registerInstructionProvider } from "../instruction-providers.js";
import { SCHEDULER_TOOLS } from "./tools.js";
import {
  createSchedule,
  deleteSchedule,
  getActiveSchedules,
  getDueSchedules,
  markScheduleFired,
  syncSchedulesToRedis,
} from "./service.js";
import { prisma } from "../../db.js";

let sdk: HsafaSDK | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
const POLL_INTERVAL_MS = 30_000;

// =============================================================================
// Lifecycle
// =============================================================================

export async function initSchedulerScope(config: {
  coreUrl: string;
  apiKey: string;
}): Promise<void> {
  // Create SDK
  sdk = new HsafaSDK({
    coreUrl: config.coreUrl,
    apiKey: config.apiKey,
    scope: "scheduler",
  });

  // Register tools
  await sdk.registerTools(SCHEDULER_TOOLS);

  // Wire handlers
  sdk.onToolCall("create_schedule", handleCreate);
  sdk.onToolCall("delete_schedule", handleDelete);

  // Connect SSE (receive tool calls from Core)
  sdk.connect();

  // Register dynamic instruction provider
  registerInstructionProvider(buildScheduleInstructions);

  // Hydrate Redis + start poller
  await syncSchedulesToRedis();
  startPoller();

  console.log("[scheduler] Initialized — SDK connected, poller started");
}

export function stopScheduler(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  sdk?.disconnect();
  sdk = null;
  console.log("[scheduler] Stopped");
}

// =============================================================================
// Tool Handlers
// =============================================================================

async function handleCreate(
  args: Record<string, unknown>,
  ctx: ToolCallContext,
): Promise<unknown> {
  const conn = state.connections.get(ctx.haseef.id);
  if (!conn) return { error: "Haseef not connected" };

  const description = args.description as string;
  const scheduleType = args.type as "recurring" | "one_time";
  if (!description || !scheduleType)
    return { error: "description and type are required" };

  const schedule = await createSchedule({
    haseefId: conn.haseefId,
    agentEntityId: conn.agentEntityId,
    description,
    type: scheduleType,
    cronExpression: args.cronExpression as string | undefined,
    scheduledAt: args.scheduledAt as string | undefined,
    timezone: args.timezone as string | undefined,
  });

  // Re-sync so prompt shows the new schedule
  syncTools(conn.haseefId).catch((err) =>
    console.error(`[scheduler] Re-sync failed:`, err),
  );

  console.log(
    `[scheduler] Created "${description}" (${schedule.id.slice(0, 8)}) for ${conn.haseefName}`,
  );
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

async function handleDelete(
  args: Record<string, unknown>,
  ctx: ToolCallContext,
): Promise<unknown> {
  const conn = state.connections.get(ctx.haseef.id);
  if (!conn) return { error: "Haseef not connected" };

  const scheduleId = args.scheduleId as string;
  if (!scheduleId) return { error: "scheduleId is required" };

  const result = await deleteSchedule(scheduleId, conn.haseefId);
  if (!result.success) return { error: result.error };

  // Re-sync so prompt removes the deleted schedule
  syncTools(conn.haseefId).catch((err) =>
    console.error(`[scheduler] Re-sync failed:`, err),
  );

  console.log(
    `[scheduler] Deleted ${scheduleId.slice(0, 8)} for ${conn.haseefName}`,
  );
  return { success: true };
}

// =============================================================================
// Poller — checks for due schedules every 30s
// =============================================================================

function startPoller(): void {
  if (pollTimer) return;
  pollTimer = setInterval(pollDueSchedules, POLL_INTERVAL_MS);
  pollDueSchedules(); // run once immediately
  console.log("[scheduler] Poller started — every 30s");
}

async function pollDueSchedules(): Promise<void> {
  if (!sdk) return;

  try {
    const due = await getDueSchedules();
    if (due.length === 0) return;

    console.log(`[scheduler] Found ${due.length} due schedule(s)`);

    for (const schedule of due) {
      const conn = state.connections.get(schedule.haseefId);
      if (!conn) {
        console.log(
          `[scheduler] Skipping ${schedule.id.slice(0, 8)} — haseef not connected`,
        );
        continue;
      }

      try {
        // Resolve target space
        let targetSpaceId = conn.enteredSpace?.spaceId ?? conn.spaceIds[0];
        let targetSpaceName = conn.enteredSpace?.spaceName ?? "Unknown";

        if (targetSpaceId && !conn.enteredSpace) {
          try {
            const space = await prisma.smartSpace.findUnique({
              where: { id: targetSpaceId },
              select: { name: true },
            });
            if (space?.name) targetSpaceName = space.name;
          } catch {
            /* non-fatal */
          }
        }

        // Set activeSpace so spaces tool handlers know where to act
        if (targetSpaceId) {
          conn.activeSpace = {
            spaceId: targetSpaceId,
            spaceName: targetSpaceName,
          };
        }

        console.log(
          `[scheduler] Firing "${schedule.description}" for ${conn.haseefName}`,
        );

        // Push sense event via SDK
        await sdk.pushEvent({
          type: "scheduled_plan",
          haseefId: schedule.haseefId,
          data: {
            scheduleId: schedule.id,
            description: schedule.description,
            type: schedule.type,
            cronExpression: schedule.cronExpression,
            timezone: schedule.timezone,
            firedAt: new Date().toISOString(),
            ...(targetSpaceId
              ? { spaceId: targetSpaceId, spaceName: targetSpaceName }
              : {}),
            formattedContext: buildScheduleContext(
              conn.haseefName,
              schedule,
              targetSpaceId,
              targetSpaceName,
            ),
          },
        });

        // Advance schedule (next run for recurring, deactivate for one-time)
        await markScheduleFired(
          schedule.id,
          schedule.type,
          schedule.cronExpression,
          schedule.timezone,
        );

        // Re-sync so prompt shows updated nextRunAt
        syncTools(schedule.haseefId).catch((err) =>
          console.error(`[scheduler] Re-sync failed:`, err),
        );

        console.log(`[scheduler] "${schedule.description}" fired + advanced`);
      } catch (err) {
        console.error(
          `[scheduler] Failed to fire ${schedule.id.slice(0, 8)}:`,
          err,
        );
      }
    }
  } catch (err) {
    console.error("[scheduler] Poll error:", err);
  }
}

// =============================================================================
// Instruction Provider — dynamic YOUR SCHEDULES section
// =============================================================================

async function buildScheduleInstructions(
  haseefId: string,
): Promise<string | null> {
  try {
    const schedules = await getActiveSchedules(haseefId);
    if (schedules.length === 0) return "YOUR SCHEDULES:\n  (none active)";

    const lines = schedules.map((s) => {
      const nextRun = s.nextRunAt
        ? new Date(s.nextRunAt).toISOString()
        : "unknown";
      if (s.type === "recurring") {
        return `  - "${s.description}" (scheduleId: ${s.id}, cron: ${s.cronExpression}, tz: ${s.timezone}, nextRun: ${nextRun})`;
      } else {
        return `  - "${s.description}" (scheduleId: ${s.id}, one-time: ${s.scheduledAt?.toISOString() ?? nextRun}, tz: ${s.timezone})`;
      }
    });

    return (
      "YOUR SCHEDULES:\n" +
      "  To stop a schedule, use scheduler_delete_schedule with the scheduleId.\n" +
      '  If someone asks you to stop, cancel, or delete a schedule — DO IT immediately with delete_schedule. Do not just say "understood".\n' +
      lines.join("\n")
    );
  } catch {
    return null;
  }
}

// =============================================================================
// Formatted Context — human-readable text injected into the sense event
// =============================================================================

function buildScheduleContext(
  haseefName: string,
  schedule: {
    id: string;
    description: string;
    type: string;
    cronExpression: string | null;
    timezone: string;
  },
  spaceId?: string,
  spaceName?: string,
): string {
  const lines: string[] = [];
  lines.push(`[SCHEDULED PLAN TRIGGERED]`);
  lines.push(`[YOU ARE: ${haseefName}]`);
  if (spaceId && spaceName) {
    lines.push(`[ACTIVE SPACE: "${spaceName}" (spaceId:${spaceId})]`);
  }
  lines.push(
    `Schedule: "${schedule.description}" (scheduleId: ${schedule.id})`,
  );
  lines.push(
    `Type: ${schedule.type === "recurring" ? `recurring (${schedule.cronExpression})` : "one-time"}`,
  );
  lines.push(`Timezone: ${schedule.timezone}`);
  lines.push(`Fired at: ${new Date().toISOString()}`);

  lines.push(``);
  lines.push(
    `>>> Your scheduled plan fired. Execute what this plan describes.`,
  );
  lines.push(
    `>>> If you remember being asked to stop or cancel this schedule, call scheduler_delete_schedule with scheduleId "${schedule.id}" instead of executing.`,
  );
  return lines.join("\n");
}
