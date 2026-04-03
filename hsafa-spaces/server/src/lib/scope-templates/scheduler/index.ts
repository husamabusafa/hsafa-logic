// =============================================================================
// Scheduler Scope — ScopePlugin implementation
//
// Manages scheduled plans (cron or one-time). CRUD in service.ts,
// tool definitions in tools.ts. This file is the plugin glue.
// =============================================================================

import type { HsafaSDK } from "@hsafa/sdk";
import type { ScopePlugin, ToolCallContext } from "../../service/scope-plugin.js";
import { state } from "../../service/types.js";
import { syncInstructions } from "../../service/core-api.js";
import { prisma } from "../../db.js";
import { SCHEDULER_TOOLS, SCHEDULER_INSTRUCTIONS } from "./tools.js";
import {
  createSchedule, deleteSchedule, getActiveSchedules,
  getDueSchedules, markScheduleFired, syncSchedulesToRedis,
} from "./service.js";

export { SCHEDULER_TOOLS, SCHEDULER_INSTRUCTIONS };

// ── Runtime state ────────────────────────────────────────────────────────────
let sdk: HsafaSDK | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

// ── Plugin ───────────────────────────────────────────────────────────────────
export const schedulerPlugin: ScopePlugin = {
  name: "scheduler",
  tools: SCHEDULER_TOOLS,
  staticInstructions: SCHEDULER_INSTRUCTIONS,

  async init(s) { sdk = s; await syncSchedulesToRedis(); timer = setInterval(poll, 30_000); poll(); },
  async stop() { if (timer) { clearInterval(timer); timer = null; } sdk = null; },

  async handleToolCall(name, args, ctx) {
    const conn = state.connections.get(ctx.haseef.id);
    if (!conn) return { error: "Not connected" };

    if (name === "create_schedule") {
      const sched = await createSchedule({
        haseefId: conn.haseefId, agentEntityId: conn.agentEntityId,
        description: args.description as string, type: args.type as "recurring" | "one_time",
        cronExpression: args.cronExpression as string | undefined,
        scheduledAt: args.scheduledAt as string | undefined,
        timezone: args.timezone as string | undefined,
      });
      syncInstructions(conn.haseefId).catch(() => {});
      return { success: true, schedule: { id: sched.id, description: sched.description, type: sched.type, cronExpression: sched.cronExpression, timezone: sched.timezone, nextRunAt: sched.nextRunAt.toISOString() } };
    }

    if (name === "delete_schedule") {
      const r = await deleteSchedule(args.scheduleId as string, conn.haseefId);
      if (!r.success) return { error: r.error };
      syncInstructions(conn.haseefId).catch(() => {});
      return { success: true };
    }

    return { error: `Unknown scheduler tool: ${name}` };
  },

  async getDynamicInstructions(haseefId) {
    const schedules = await getActiveSchedules(haseefId);
    if (schedules.length === 0) return "YOUR SCHEDULES:\n  (none active)";
    const lines = schedules.map(s => {
      const next = s.nextRunAt ? new Date(s.nextRunAt).toISOString() : "?";
      return s.type === "recurring"
        ? `  - "${s.description}" (id:${s.id}, cron:${s.cronExpression}, tz:${s.timezone}, next:${next})`
        : `  - "${s.description}" (id:${s.id}, at:${s.scheduledAt?.toISOString() ?? next}, tz:${s.timezone})`;
    });
    return "YOUR SCHEDULES:\n  To stop: scheduler_delete_schedule with the scheduleId.\n" + lines.join("\n");
  },
};

// ── Poller — fires due schedules every 30s ───────────────────────────────────
async function poll() {
  if (!sdk) return;
  try {
    for (const s of await getDueSchedules()) {
      const conn = state.connections.get(s.haseefId);
      if (!conn) continue;

      const spaceId = conn.enteredSpace?.spaceId ?? conn.spaceIds[0];
      let spaceName = conn.enteredSpace?.spaceName ?? "Unknown";
      if (spaceId && !conn.enteredSpace) {
        const sp = await prisma.smartSpace.findUnique({ where: { id: spaceId }, select: { name: true } });
        if (sp?.name) spaceName = sp.name;
      }
      if (spaceId) conn.activeSpace = { spaceId, spaceName };

      await sdk!.pushEvent({
        type: "scheduled_plan", haseefId: s.haseefId,
        data: {
          scheduleId: s.id, description: s.description, type: s.type,
          cronExpression: s.cronExpression, timezone: s.timezone,
          firedAt: new Date().toISOString(),
          ...(spaceId ? { spaceId, spaceName } : {}),
          formattedContext: [
            `[SCHEDULED PLAN TRIGGERED]`, `[YOU ARE: ${conn.haseefName}]`,
            ...(spaceId ? [`[ACTIVE SPACE: "${spaceName}" (spaceId:${spaceId})]`] : []),
            `Schedule: "${s.description}" (scheduleId: ${s.id})`,
            `Type: ${s.type === "recurring" ? `recurring (${s.cronExpression})` : "one-time"}`,
            `Timezone: ${s.timezone}`, `Fired at: ${new Date().toISOString()}`, ``,
            `>>> Execute what this plan describes.`,
          ].join("\n"),
        },
      });

      await markScheduleFired(s.id, s.type, s.cronExpression, s.timezone);
      syncInstructions(s.haseefId).catch(() => {});
    }
  } catch (err) { console.error("[scheduler] Poll error:", err); }
}
