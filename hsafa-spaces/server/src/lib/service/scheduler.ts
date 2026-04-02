// =============================================================================
// Haseef Scheduler — Background loop for scheduled plans
//
// Polls for due schedules every 30 seconds, fires sense events to Core,
// and advances recurring schedules to their next run.
// =============================================================================

import { getDueSchedules, markScheduleFired } from "./schedule-service.js";
import { pushSenseEvent } from "./core-api.js";
import { state } from "./types.js";
import { SCOPE } from "./manifest.js";
import { syncTools } from "./core-api.js";
import { prisma } from "../db.js";

const POLL_INTERVAL_MS = 30_000; // 30 seconds

let pollTimer: ReturnType<typeof setInterval> | null = null;

// =============================================================================
// Start / Stop
// =============================================================================

export function startScheduler(): void {
  if (pollTimer) return;
  console.log("[scheduler] Started — polling every 30s for due schedules");
  pollTimer = setInterval(pollDueSchedules, POLL_INTERVAL_MS);
  // Run once immediately
  pollDueSchedules();
}

export function stopScheduler(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    console.log("[scheduler] Stopped");
  }
}

// =============================================================================
// Poll Loop
// =============================================================================

async function pollDueSchedules(): Promise<void> {
  try {
    const due = await getDueSchedules();
    if (due.length === 0) return;

    console.log(`[scheduler] Found ${due.length} due schedule(s)`);

    for (const schedule of due) {
      // Only fire for connected haseefs
      const conn = state.connections.get(schedule.haseefId);
      if (!conn) {
        console.log(`[scheduler] Skipping schedule ${schedule.id.slice(0, 8)} — haseef ${schedule.haseefId.slice(0, 8)} not connected`);
        continue;
      }

      try {
        // Resolve target space — use enteredSpace, or fall back to first space
        let targetSpaceId = conn.enteredSpace?.spaceId ?? conn.spaceIds[0];
        let targetSpaceName = conn.enteredSpace?.spaceName ?? "Unknown";

        if (targetSpaceId && !conn.enteredSpace) {
          // Look up space name from DB
          try {
            const space = await prisma.smartSpace.findUnique({
              where: { id: targetSpaceId },
              select: { name: true },
            });
            if (space) targetSpaceName = space.name;
          } catch { /* non-fatal */ }
        }

        // Set activeSpace so tool handlers (send_message, etc.) know where to act
        if (targetSpaceId) {
          conn.activeSpace = { spaceId: targetSpaceId, spaceName: targetSpaceName };
        }

        console.log(`[scheduler] Firing schedule "${schedule.description}" for ${conn.haseefName} (space: ${targetSpaceName})`);

        // Push sense event to wake the haseef
        await pushSenseEvent(schedule.haseefId, {
          eventId: `schedule-${schedule.id}-${Date.now()}`,
          scope: SCOPE,
          type: "scheduled_plan",
          data: {
            scheduleId: schedule.id,
            description: schedule.description,
            type: schedule.type,
            cronExpression: schedule.cronExpression,
            timezone: schedule.timezone,
            firedAt: new Date().toISOString(),
            ...(targetSpaceId ? { spaceId: targetSpaceId, spaceName: targetSpaceName } : {}),
            formattedContext: buildScheduleContext(conn.haseefName, schedule, targetSpaceId, targetSpaceName),
          },
        });

        // Advance schedule (next run for recurring, deactivate for one-time)
        await markScheduleFired(
          schedule.id,
          schedule.type,
          schedule.cronExpression,
          schedule.timezone,
        );

        // Re-sync tools so prompt shows updated nextRunAt / active status
        syncTools(schedule.haseefId).catch((err) => {
          console.error(`[scheduler] Failed to re-sync tools after schedule fire:`, err);
        });

        console.log(`[scheduler] Schedule "${schedule.description}" fired + advanced`);
      } catch (err) {
        console.error(`[scheduler] Failed to fire schedule ${schedule.id.slice(0, 8)}:`, err);
      }
    }
  } catch (err) {
    console.error("[scheduler] Poll error:", err);
  }
}

// =============================================================================
// Formatted Context — human-readable text for Core's consciousness
// =============================================================================

function buildScheduleContext(
  haseefName: string,
  schedule: { id: string; description: string; type: string; cronExpression: string | null; timezone: string },
  spaceId?: string,
  spaceName?: string,
): string {
  const lines: string[] = [];
  lines.push(`[SCHEDULED PLAN TRIGGERED]`);
  lines.push(`[YOU ARE: ${haseefName}]`);
  if (spaceId && spaceName) {
    lines.push(`[ACTIVE SPACE: "${spaceName}" (spaceId:${spaceId})]`);
  }
  lines.push(`Schedule: "${schedule.description}" (id: ${schedule.id})`);
  lines.push(`Type: ${schedule.type === "recurring" ? `recurring (${schedule.cronExpression})` : "one-time"}`);
  lines.push(`Timezone: ${schedule.timezone}`);
  lines.push(`Fired at: ${new Date().toISOString()}`);
  lines.push(`>>> This is your scheduled plan firing. Execute whatever this plan is for. You are already in the active space — use spaces_send_message to communicate.`);
  return lines.join("\n");
}
