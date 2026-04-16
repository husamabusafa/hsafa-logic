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
import { isMessageTool, getMessageToolActivity, resolvedSpaceId } from "./tools/index.js";
import { markHaseefSeen } from "./sense-events.js";
import { SKILL } from "./manifest.js";
import type { HsafaSDK } from "@hsafa/sdk";

/** Per-run snapshot of activeSpaceVersion at run.started time */
const runActiveSpaceVersions = new Map<string, number>();

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
// Event Handlers
// =============================================================================

function onRunStarted(
  conn: ActiveConnection,
  event: { runId: string; triggerSkill: string | null; triggerType: string | null; haseef: { id: string; name: string } },
): void {
  const runId = event.runId;

  // Detect if this run was triggered by the spaces skill
  const isSpacesTrigger =
    (event.triggerSkill === SKILL) ||
    event.triggerType?.startsWith("ext-spaces:") ||
    event.triggerType?.startsWith("spaces:");

  // V7 lifecycle events don't include triggerSource directly.
  // Use haseef's entered/active space as the trigger space for routing.
  // In practice, the sense event that triggered this run set the spaceId in data.
  // The haseef's activeSpace will be set when it calls enter_space or when we
  // detect a spaces-skill trigger.

  // Track current run ID for fallback space resolution
  conn.currentRunId = runId ?? null;

  // Determine trigger space: first check runSpaces map, then fall back to activeSpace
  // (sense-events.ts sets conn.activeSpace before pushing the event that triggers this run)
  let triggerSpaceId = runId ? conn.runSpaces.get(runId) : undefined;
  if (!triggerSpaceId && conn.activeSpace) {
    triggerSpaceId = conn.activeSpace.spaceId;
  }

  // Populate runSpaces so onRunFinished can route events to the correct space
  if (runId && triggerSpaceId) {
    conn.runSpaces.set(runId, triggerSpaceId);
  }

  // Snapshot the current activeSpaceVersion so onRunFinished can detect
  // if a newer handleInboxMessage updated activeSpace after this run started.
  if (runId) {
    runActiveSpaceVersions.set(runId, conn.activeSpaceVersion);
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
  //
  // IMPORTANT: Only clear activeSpace if its version hasn't changed since this
  // run started. A newer handleInboxMessage increments activeSpaceVersion when
  // setting activeSpace for the NEXT run. If versions differ, a new message
  // arrived and we must NOT clear its activeSpace.
  const snapshotVersion = runId ? runActiveSpaceVersions.get(runId) : undefined;
  if (snapshotVersion !== undefined && conn.activeSpaceVersion === snapshotVersion) {
    conn.activeSpace = null;
  } else if (snapshotVersion === undefined) {
    // No snapshot — non-spaces run or unknown run; safe to clear
    conn.activeSpace = null;
  }
  // else: activeSpaceVersion changed → a newer message set activeSpace; leave it alone

  if (runId) runActiveSpaceVersions.delete(runId);
  conn.currentRunId = null;
  conn.typingActivity = "typing";
}
