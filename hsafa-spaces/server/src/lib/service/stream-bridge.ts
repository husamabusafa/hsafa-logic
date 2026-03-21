// =============================================================================
// Spaces Service — Stream Bridge
//
// Shared Redis Subscriber — forwards Core run events to space SSE channels.
// Uses psubscribe('haseef:*:stream') to receive events for ALL connected
// haseefs through one Redis connection.
//
// Typing & online indicators use the haseef's resolved space (enteredSpace ?? activeSpace).
//
// run.started   → auto-set activeSpace to trigger space, agent.active, online
// tool.started  → tool.started event, typing for message tools
// tool.done     → tool.done event
// run.finished  → stop heartbeat, typing=false, agent.inactive, offline, clear activeSpace (NOT enteredSpace)
// =============================================================================

import Redis from "ioredis";
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

export async function startSharedSubscriber(): Promise<void> {
  if (state.sharedSubscriber) return;

  // MUST use Core's Redis — stream events are published there by Core
  const redisUrl = state.config!.coreRedisUrl;
  const sub = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy(times: number) {
      const delay = Math.min(times * 500, 30_000);
      console.log(`[spaces-service] Redis stream subscriber reconnecting in ${delay}ms (attempt ${times})`);
      return delay;
    },
  });

  sub.on("error", (err: Error) => {
    console.error(`[spaces-service] Redis stream subscriber error:`, err.message);
  });

  sub.on("connect", () => {
    console.log(`[spaces-service] Redis stream subscriber connected`);
  });

  await sub.psubscribe("haseef:*:stream");
  state.sharedSubscriber = sub;

  // Route events by extracting haseefId from channel name
  // Channel format: haseef:{haseefId}:stream
  sub.on("pmessage", (_pattern: string, channel: string, message: string) => {
    const haseefId = channel.split(":")[1];
    const conn = state.connections.get(haseefId);
    if (!conn) return;
    bridgeStreamEvent(conn, message);
  });
}

// =============================================================================
// Resolved Space — prefers explicitly entered space over auto-set trigger space
// =============================================================================

function resolvedSpaceId(conn: ActiveConnection): string | undefined {
  return (conn.enteredSpace ?? conn.activeSpace)?.spaceId;
}

// =============================================================================
// Typing Heartbeat — single interval per connection, broadcasts to resolved space
// =============================================================================

function startTypingHeartbeat(conn: ActiveConnection): void {
  // Don't restart if already running — just update activity via conn.typingActivity
  if (conn.typingHeartbeat) return;
  conn.typingHeartbeat = setInterval(() => {
    const spaceId = resolvedSpaceId(conn);
    if (spaceId) {
      void broadcastTyping(spaceId, conn.agentEntityId, conn.haseefName, true, conn.typingActivity);
    }
  }, 3000);
}

function stopTypingHeartbeat(conn: ActiveConnection): void {
  if (conn.typingHeartbeat) {
    clearInterval(conn.typingHeartbeat);
    conn.typingHeartbeat = null;
  }
}

// =============================================================================
// Event Bridge
// =============================================================================

function bridgeStreamEvent(conn: ActiveConnection, message: string): void {
  try {
    const event = JSON.parse(message) as {
      type: string;
      runId?: string;
      triggerType?: string;
      triggerSource?: string;
      triggerScope?: string;
      streamId?: string;
      toolName?: string;
      delta?: string;
      args?: unknown;
      result?: unknown;
      error?: string;
    };

    const runId = event.runId;

    if (event.type === "run.started") {
      // V5: triggerScope === "spaces" and triggerSource === spaceId
      const isSpacesTrigger =
        (event.triggerScope === SCOPE) ||
        event.triggerType?.startsWith("ext-spaces:") ||
        event.triggerType?.startsWith("spaces:");
      if (runId && isSpacesTrigger && event.triggerSource) {
        conn.runSpaces.set(runId, event.triggerSource);
      }

      // Track current run ID for fallback space resolution
      conn.currentRunId = runId ?? null;

      // Auto-set activeSpace to trigger space so the haseef can reply without calling enter_space.
      // enteredSpace (explicit enter_space) still takes priority in getActiveSpaceId().
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

      // NOTE: typing heartbeat is NOT started here — it only starts when
      // a message tool begins (tool.started). This prevents showing "typing..."
      // during the model's reasoning phase.

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
    } else if (event.type === "tool.started") {
      // Emit tool.started to the resolved space (enteredSpace ?? activeSpace)
      const spaceId = resolvedSpaceId(conn);
      if (spaceId) {
        void emitSmartSpaceEvent(spaceId, {
          type: "tool.started",
          streamId: event.streamId,
          toolName: event.toolName,
          agentEntityId: conn.agentEntityId,
          runId,
        });
        // For message tools: update activity, start heartbeat, broadcast
        if (isMessageTool(event.toolName)) {
          const activity = getMessageToolActivity(event.toolName);
          conn.typingActivity = activity;
          startTypingHeartbeat(conn);
          void broadcastTyping(spaceId, conn.agentEntityId, conn.haseefName, true, activity);
        }
      }
    } else if (event.type === "tool.done") {
      const spaceId = resolvedSpaceId(conn);
      if (spaceId) {
        void emitSmartSpaceEvent(spaceId, {
          type: "tool.done",
          streamId: event.streamId,
          toolName: event.toolName,
          result: event.result,
          agentEntityId: conn.agentEntityId,
          runId,
        });
        // NOTE: Do NOT stop typing heartbeat here. The model may call another
        // message tool immediately after this one (e.g. send_voice then send_message).
        // Stopping and restarting causes visible flicker. The heartbeat keeps the
        // indicator alive between tool calls. It will be stopped on run.finished.
      }
    } else if (event.type === "tool.error") {
      const spaceId = resolvedSpaceId(conn);
      if (spaceId) {
        void emitSmartSpaceEvent(spaceId, {
          type: "tool.error",
          streamId: event.streamId,
          toolName: event.toolName,
          error: event.error,
          agentEntityId: conn.agentEntityId,
          runId,
        });
      }
    } else if (event.type === "run.finished") {
      const hasError = !!(event as any).error;

      // Stop typing heartbeat
      stopTypingHeartbeat(conn);

      // Clear typing in the resolved space
      const resolvedSid = resolvedSpaceId(conn);
      if (resolvedSid) {
        void broadcastTyping(resolvedSid, conn.agentEntityId, conn.haseefName, false);
      }

      const triggerSpaceId = runId ? conn.runSpaces.get(runId) : undefined;
      const targetSpaces = triggerSpaceId ? [triggerSpaceId] : conn.spaceIds;

      // Both success and error: always emit agent.inactive + check offline
      // (Previously, failed runs skipped this — causing permanent "thinking" indicator)
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
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[stream-bridge] Error bridging event (type=${event?.type}, haseef=${conn.haseefName}):`, errMsg);
  }
}
