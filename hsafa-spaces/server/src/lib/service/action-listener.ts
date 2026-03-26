// =============================================================================
// Spaces Service — Action Listener (v7 — @hsafa/sdk SSE)
//
// Registers onToolCall handlers on the SDK instances for "spaces" and
// "scheduler" scopes, then calls connect() to start receiving actions
// via SSE. The SDK handles result posting automatically.
//
// Replaces Redis Streams XREADGROUP from v5.
// =============================================================================

import { state } from "./types.js";
import { executeAction } from "./tool-handlers.js";
import { TOOLS, SCHEDULER_TOOLS } from "./manifest.js";

/**
 * Register all tool handlers on the SDK instances and start SSE connections.
 * Must be called AFTER state.spacesSDK and state.schedulerSDK are created.
 */
export async function startActionListener(): Promise<void> {
  const { spacesSDK, schedulerSDK } = state;

  // ── Register spaces tool handlers ──────────────────────────────────────────
  if (spacesSDK) {
    for (const tool of TOOLS) {
      spacesSDK.onToolCall(tool.name, async (args, ctx) => {
        return executeAction(ctx.haseef.id, ctx.actionId, tool.name, args);
      });
    }

    // Connect SSE — starts receiving actions + lifecycle events
    spacesSDK.connect();
    console.log("[spaces-service] Spaces SDK connected (SSE)");
  }

  // ── Register scheduler tool handlers ───────────────────────────────────────
  if (schedulerSDK) {
    for (const tool of SCHEDULER_TOOLS) {
      schedulerSDK.onToolCall(tool.name, async (args, ctx) => {
        return executeAction(ctx.haseef.id, ctx.actionId, tool.name, args);
      });
    }

    schedulerSDK.connect();
    console.log("[spaces-service] Scheduler SDK connected (SSE)");
  }
}
