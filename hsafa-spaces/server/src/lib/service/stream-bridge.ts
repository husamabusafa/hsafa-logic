// =============================================================================
// Spaces Service — Stream Bridge
//
// Shared Redis Subscriber — forwards Core run events to space SSE channels.
// Uses psubscribe('haseef:*:stream') to receive events for ALL connected
// haseefs through one Redis connection.
//
// run.start / run.finish  → agent.active / agent.inactive (all spaces)
// tool.started            → tool.started  (trigger space only)
// tool-input.delta        → tool.streaming (trigger space only)
// tool.done               → tool.done      (trigger space only)
// tool.error              → tool.error     (trigger space only)
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
import { isMessageTool } from "./tool-handlers.js";
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
      // Only broadcast to the trigger space (the space that caused this run)
      const targetSpaceId = runId ? conn.runSpaces.get(runId) : undefined;
      const targetSpaces = targetSpaceId ? [targetSpaceId] : conn.spaceIds;
      for (const spaceId of targetSpaces) {
        if (runId) {
          void setSpaceActiveRun(spaceId, runId, conn.agentEntityId, conn.haseefName);
        }
        // Mark haseef online when cycle starts
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
        // Group by spaceId and take the latest messageId per space
        const latestPerSpace = new Map<string, string>();
        for (const p of pending) {
          latestPerSpace.set(p.spaceId, p.messageId);
        }
        for (const [sid, mid] of latestPerSpace) {
          markHaseefSeen(sid, conn.agentEntityId, mid).catch(() => {});
        }
      }
    } else if (event.type === "tool.started") {
      const spaceId = runId ? conn.runSpaces.get(runId) : undefined;
      if (spaceId) {
        void emitSmartSpaceEvent(spaceId, {
          type: "tool.started",
          streamId: event.streamId,
          toolName: event.toolName,
          agentEntityId: conn.agentEntityId,
          runId,
        });
        // Show typing when agent starts composing a message
        if (isMessageTool(event.toolName)) {
          void broadcastTyping(spaceId, conn.agentEntityId, conn.haseefName, true);
          // Start typing heartbeat — re-broadcast every 3s so client's 5s auto-expire
          // doesn't kill the indicator during long message composition
          if (runId && !conn.typingHeartbeats.has(runId)) {
            const hb = setInterval(() => {
              void broadcastTyping(spaceId, conn.agentEntityId, conn.haseefName, true);
            }, 3000);
            conn.typingHeartbeats.set(runId, hb);
          }
        }
      }
    } else if (event.type === "tool-input.delta") {
      const spaceId = runId ? conn.runSpaces.get(runId) : undefined;
      if (spaceId) {
        void emitSmartSpaceEvent(spaceId, {
          type: "tool.streaming",
          streamId: event.streamId,
          toolName: event.toolName,
          delta: event.delta,
          agentEntityId: conn.agentEntityId,
          runId,
        });
      }
    } else if (event.type === "tool.done") {
      const spaceId = runId ? conn.runSpaces.get(runId) : undefined;
      if (spaceId) {
        void emitSmartSpaceEvent(spaceId, {
          type: "tool.done",
          streamId: event.streamId,
          toolName: event.toolName,
          result: event.result,
          agentEntityId: conn.agentEntityId,
          runId,
        });
        // Stop typing when message tool finishes
        if (isMessageTool(event.toolName)) {
          void broadcastTyping(spaceId, conn.agentEntityId, conn.haseefName, false);
        }
      }
    } else if (event.type === "tool.error") {
      const spaceId = runId ? conn.runSpaces.get(runId) : undefined;
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
      // Stop typing heartbeat FIRST
      if (runId) {
        const hb = conn.typingHeartbeats.get(runId);
        if (hb) {
          clearInterval(hb);
          conn.typingHeartbeats.delete(runId);
        }
      }
      // Only broadcast to the trigger space
      const targetSpaceId = runId ? conn.runSpaces.get(runId) : undefined;
      const targetSpaces = targetSpaceId ? [targetSpaceId] : conn.spaceIds;
      for (const spaceId of targetSpaces) {
        if (runId) {
          void removeSpaceActiveRun(spaceId, runId);
        }
        // Typing=false BEFORE agent.inactive so UI clears typing before removing active state
        void broadcastTyping(spaceId, conn.agentEntityId, conn.haseefName, false);
        void emitSmartSpaceEvent(spaceId, {
          type: "agent.inactive",
          agentEntityId: conn.agentEntityId,
          runId,
          data: { agentEntityId: conn.agentEntityId, runId },
        });
        // Mark haseef offline when cycle finishes (only if no other active runs in this space)
        listSpaceActiveRuns(spaceId).then((runs) => {
          const stillActive = runs.some((r) => r.entityId === conn.agentEntityId);
          if (!stillActive) {
            void markOffline(spaceId, conn.agentEntityId);
          }
        }).catch(() => {});
      }
      if (runId) conn.runSpaces.delete(runId);
    }
  } catch {}
}
