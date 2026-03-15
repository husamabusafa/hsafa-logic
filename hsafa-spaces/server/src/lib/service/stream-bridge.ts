// =============================================================================
// Spaces Service — Stream Bridge
//
// Shared Redis Subscriber — forwards Core run events to space SSE channels.
// Uses psubscribe('haseef:*:stream') to receive events for ALL connected
// haseefs through one Redis connection.
//
// Typing & online indicators use the haseef's activeSpace (set by enter_space
// tool or auto-set on run.started). No more guessing from partial tool args.
//
// run.started   → auto-set activeSpace to trigger space, agent.active, online, start typing heartbeat
// tool.started  → tool.started event (active space), typing in activeSpace for message tools
// tool.done     → tool.done event (active space)
// run.finished  → stop heartbeat, typing=false, agent.inactive, offline, clear activeSpace
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
import { prisma } from "../db.js";
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

// =============================================================================
// Typing Heartbeat — single interval per connection, broadcasts to activeSpace
// =============================================================================

function startTypingHeartbeat(conn: ActiveConnection): void {
  stopTypingHeartbeat(conn);
  conn.typingHeartbeat = setInterval(() => {
    if (conn.activeSpace) {
      void broadcastTyping(conn.activeSpace.spaceId, conn.agentEntityId, conn.haseefName, true);
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

      // Auto-set activeSpace to trigger space (haseef is "in" the conversation that triggered it)
      const triggerSpaceId = runId ? conn.runSpaces.get(runId) : undefined;
      if (triggerSpaceId) {
        // Quick name lookup — best effort, use spaceId as fallback
        prisma.smartSpace.findUnique({ where: { id: triggerSpaceId }, select: { name: true } })
          .then((s) => {
            if (conn.activeSpace?.spaceId === triggerSpaceId) {
              conn.activeSpace.spaceName = s?.name ?? triggerSpaceId;
            }
          })
          .catch(() => {});
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

      // Start typing heartbeat — broadcasts to activeSpace every 3s
      startTypingHeartbeat(conn);

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
      // Emit tool.started to the active space
      const spaceId = conn.activeSpace?.spaceId;
      if (spaceId) {
        void emitSmartSpaceEvent(spaceId, {
          type: "tool.started",
          streamId: event.streamId,
          toolName: event.toolName,
          agentEntityId: conn.agentEntityId,
          runId,
        });
        // Typing indicator fires in activeSpace — always correct since
        // haseef must enter_space before calling message tools
        if (isMessageTool(event.toolName)) {
          void broadcastTyping(spaceId, conn.agentEntityId, conn.haseefName, true);
        }
      }
    } else if (event.type === "tool-input.delta") {
      const spaceId = conn.activeSpace?.spaceId;
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
      const spaceId = conn.activeSpace?.spaceId;
      if (spaceId) {
        void emitSmartSpaceEvent(spaceId, {
          type: "tool.done",
          streamId: event.streamId,
          toolName: event.toolName,
          result: event.result,
          agentEntityId: conn.agentEntityId,
          runId,
        });
      }
    } else if (event.type === "tool.error") {
      const spaceId = conn.activeSpace?.spaceId;
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

      // Clear typing in the active space
      if (conn.activeSpace) {
        void broadcastTyping(conn.activeSpace.spaceId, conn.agentEntityId, conn.haseefName, false);
      }

      const triggerSpaceId = runId ? conn.runSpaces.get(runId) : undefined;
      const targetSpaces = triggerSpaceId ? [triggerSpaceId] : conn.spaceIds;

      if (hasError) {
        // On failed runs, only clear active run entries (no agent.inactive / offline)
        if (runId) {
          for (const spaceId of targetSpaces) {
            void removeSpaceActiveRun(spaceId, runId);
          }
          conn.runSpaces.delete(runId);
        }
      } else {
        // Successful completion — agent.inactive + offline
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
      }

      // Clear active space — run is over
      conn.activeSpace = null;
    }
  } catch {}
}
