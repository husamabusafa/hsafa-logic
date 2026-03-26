// =============================================================================
// Spaces Service — Stream Bridge (v7 — @hsafa/sdk lifecycle events)
//
// Registers SDK lifecycle event handlers to forward Core run/tool events
// to space SSE channels. Replaces Redis psubscribe('haseef:*:stream').
//
// Typing & online indicators use the haseef's resolved space (enteredSpace ?? activeSpace).
//
// run.started   → auto-set activeSpace to trigger space, agent.active, online
// tool.input.start → tool.started event, typing=true for message tools
// tool.result   → tool.done event, typing=false for message tools
// tool.error    → tool.error event
// run.completed → typing=false (safety net), agent.inactive, offline, clear activeSpace
// =============================================================================

import {
  emitSmartSpaceEvent,
  setSpaceActiveRun,
  removeSpaceActiveRun,
  listSpaceActiveRuns,
  markOnline,
  markOffline,
  broadcastTyping,
} from "../smartspace-events.js";
import { state, type ActiveConnection } from "./types.js";
import { isMessageTool, getMessageToolActivity } from "./tool-handlers.js";
import { markHaseefSeen } from "./sense-events.js";
import { SCOPE } from "./manifest.js";
import type { HsafaSDK } from "@hsafa/sdk";

/**
 * Register SDK lifecycle event handlers on the spaces SDK instance.
 * Only the spaces SDK processes lifecycle events to avoid duplicate handling.
 * Must be called AFTER state.spacesSDK is created and BEFORE connect().
 */
export function registerLifecycleHandlers(): void {
  const sdk = state.spacesSDK;
  if (!sdk) return;

  sdk.on('run.started', (event) => {
    const conn = state.connections.get(event.haseef.id);
    if (!conn) return;
    onRunStarted(conn, event);
  });

  sdk.on('tool.input.start', (event) => {
    const conn = state.connections.get(event.haseef.id);
    if (!conn) return;
    onToolStarted(conn, event);
  });

  sdk.on('tool.result', (event) => {
    const conn = state.connections.get(event.haseef.id);
    if (!conn) return;
    onToolDone(conn, event);
  });

  sdk.on('tool.error', (event) => {
    const conn = state.connections.get(event.haseef.id);
    if (!conn) return;
    onToolError(conn, event);
  });

  sdk.on('run.completed', (event) => {
    const conn = state.connections.get(event.haseef.id);
    if (!conn) return;
    onRunFinished(conn, event);
  });

  console.log("[stream-bridge] Lifecycle event handlers registered on spaces SDK");
}

// =============================================================================
// Resolved Space — prefers explicitly entered space over auto-set trigger space
// =============================================================================

function resolvedSpaceId(conn: ActiveConnection): string | undefined {
  return (conn.enteredSpace ?? conn.activeSpace)?.spaceId;
}

// =============================================================================
// Event Handlers
// =============================================================================

function onRunStarted(
  conn: ActiveConnection,
  event: { runId: string; triggerScope: string | null; triggerType: string | null; haseef: { id: string; name: string } },
): void {
  const runId = event.runId;

  // Detect if this run was triggered by the spaces scope
  const isSpacesTrigger =
    (event.triggerScope === SCOPE) ||
    event.triggerType?.startsWith("ext-spaces:") ||
    event.triggerType?.startsWith("spaces:");

  // V7 lifecycle events don't include triggerSource directly.
  // Use haseef's entered/active space as the trigger space for routing.
  // In practice, the sense event that triggered this run set the spaceId in data.
  // The haseef's activeSpace will be set when it calls enter_space or when we
  // detect a spaces-scoped trigger.

  // Track current run ID for fallback space resolution
  conn.currentRunId = runId ?? null;

  // Auto-set activeSpace if we have trigger context
  const triggerSpaceId = runId ? conn.runSpaces.get(runId) : undefined;
  if (triggerSpaceId) {
    conn.activeSpace = { spaceId: triggerSpaceId, spaceName: triggerSpaceId };
  }

  // Broadcast agent.active + online to trigger space
  const targetSpaces = triggerSpaceId ? [triggerSpaceId] : conn.spaceIds;
  for (const spaceId of targetSpaces) {
    if (runId) {
      void setSpaceActiveRun(spaceId, runId, conn.agentEntityId, conn.haseefName);
    }
    void markOnline(spaceId, conn.agentEntityId);
    void emitSmartSpaceEvent(spaceId, {
      type: "agent.active",
      agentEntityId: conn.agentEntityId,
      runId,
      data: { agentEntityId: conn.agentEntityId, agentName: conn.haseefName, runId },
    });
  }

  // Flush pending seen messages — run.started means events were consumed from inbox
  if (conn.pendingSeenMessages.length > 0) {
    const pending = conn.pendingSeenMessages.splice(0);
    const latestPerSpace = new Map<string, string>();
    for (const p of pending) {
      latestPerSpace.set(p.spaceId, p.messageId);
    }
    for (const [sid, mid] of latestPerSpace) {
      markHaseefSeen(sid, conn.agentEntityId, mid).catch(() => {});
    }
  }
}

function onToolStarted(
  conn: ActiveConnection,
  event: { actionId: string; toolName: string; haseef: { id: string; name: string } },
): void {
  const spaceId = resolvedSpaceId(conn);
  if (!spaceId) return;

  void emitSmartSpaceEvent(spaceId, {
    type: "tool.started",
    streamId: event.actionId,
    toolName: event.toolName,
    agentEntityId: conn.agentEntityId,
    runId: conn.currentRunId,
  });

  // For message tools: broadcast typing=true
  if (isMessageTool(event.toolName)) {
    conn.typingActivity = getMessageToolActivity(event.toolName);
    void broadcastTyping(spaceId, conn.agentEntityId, conn.haseefName, true, conn.typingActivity);
  }
}

function onToolDone(
  conn: ActiveConnection,
  event: { actionId: string; toolName: string; result: unknown; haseef: { id: string; name: string } },
): void {
  const spaceId = resolvedSpaceId(conn);
  if (!spaceId) return;

  void emitSmartSpaceEvent(spaceId, {
    type: "tool.done",
    streamId: event.actionId,
    toolName: event.toolName,
    result: event.result,
    agentEntityId: conn.agentEntityId,
    runId: conn.currentRunId,
  });

  // Clear typing when a message tool finishes
  if (isMessageTool(event.toolName)) {
    void broadcastTyping(spaceId, conn.agentEntityId, conn.haseefName, false);
  }
}

function onToolError(
  conn: ActiveConnection,
  event: { actionId: string; toolName: string; error: string; haseef: { id: string; name: string } },
): void {
  const spaceId = resolvedSpaceId(conn);
  if (!spaceId) return;

  void emitSmartSpaceEvent(spaceId, {
    type: "tool.error",
    streamId: event.actionId,
    toolName: event.toolName,
    error: event.error,
    agentEntityId: conn.agentEntityId,
    runId: conn.currentRunId,
  });
}

function onRunFinished(
  conn: ActiveConnection,
  event: { runId: string; haseef: { id: string; name: string } },
): void {
  const runId = event.runId;

  // Safety net: clear typing in the resolved space
  const resolvedSid = resolvedSpaceId(conn);
  if (resolvedSid) {
    void broadcastTyping(resolvedSid, conn.agentEntityId, conn.haseefName, false);
  }

  const triggerSpaceId = runId ? conn.runSpaces.get(runId) : undefined;
  const targetSpaces = triggerSpaceId ? [triggerSpaceId] : conn.spaceIds;

  // Both success and error: always emit agent.inactive + check offline
  for (const spaceId of targetSpaces) {
    if (runId) {
      void removeSpaceActiveRun(spaceId, runId);
    }
    void emitSmartSpaceEvent(spaceId, {
      type: "agent.inactive",
      agentEntityId: conn.agentEntityId,
      runId,
      data: { agentEntityId: conn.agentEntityId, runId },
    });
    listSpaceActiveRuns(spaceId).then((runs) => {
      const stillActive = runs.some((r) => r.entityId === conn.agentEntityId);
      if (!stillActive) {
        void markOffline(spaceId, conn.agentEntityId);
      }
    }).catch(() => {});
  }
  if (runId) conn.runSpaces.delete(runId);

  // Clear auto-set trigger space — run is over.
  // NOTE: enteredSpace is NOT cleared — it persists across cycles so that
  // a haseef that called enter_space in a previous cycle can still send
  // messages to that space in subsequent cycles.
  conn.activeSpace = null;
  conn.currentRunId = null;
  conn.typingActivity = "typing";
}
