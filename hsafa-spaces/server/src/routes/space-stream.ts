// =============================================================================
// Smart Spaces — SSE Event Stream Route
//
// GET /:smartSpaceId/stream — Server-Sent Events connection
//
// On connect: mark entity online, send initial state (online users, active runs,
// seen watermarks). On disconnect: mark offline. Keepalive refreshes presence TTL.
// =============================================================================

import { Router } from "express";
import type { Request, Response } from "express";
import Redis from "ioredis";
import { prisma } from "../lib/db.js";
import {
  requireAuthWithMembership,
  isAuthError,
} from "../lib/spaces-auth.js";
import {
  listSpaceActiveRuns,
  markOnline,
  markOffline,
  refreshPresence,
  listOnlineEntities,
} from "../lib/smartspace-events.js";

const router = Router();

// =============================================================================
// GET /api/smart-spaces/:smartSpaceId/stream — SSE event stream
// =============================================================================
router.get("/:smartSpaceId/stream", async (req: Request, res: Response) => {
  const smartSpaceId = req.params.smartSpaceId as string;

  // EventSource can't set headers — support ?token= query param for SSE auth
  if (!req.headers.authorization && req.query.token) {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }

  const auth = await requireAuthWithMembership(req, smartSpaceId);
  if (isAuthError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const entityId = auth.entityId;

  // Create a dedicated Redis subscriber for this SSE connection
  const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6380";
  const sub = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
  sub.on("error", (err) => {
    console.error(`[space-stream] Redis subscriber error (space=${smartSpaceId.slice(0, 8)}):`, err.message);
  });
  const channel = `smartspace:${smartSpaceId}`;

  await sub.subscribe(channel);

  // ── Mark this entity as online ──
  if (entityId) {
    await markOnline(smartSpaceId, entityId).catch(() => {});
  }

  // ── Send initial state: "connected" event with online users, active runs, seen watermarks ──
  try {
    const [onlineEntityIds, activeRuns, memberships] = await Promise.all([
      listOnlineEntities(smartSpaceId),
      listSpaceActiveRuns(smartSpaceId),
      prisma.smartSpaceMembership.findMany({
        where: { smartSpaceId },
        select: {
          entityId: true,
          lastSeenMessageId: true,
          entity: { select: { displayName: true } },
        },
      }),
    ]);

    // Build seen watermarks: { entityId → lastSeenMessageId }
    const seenWatermarks: Record<string, string> = {};
    for (const m of memberships) {
      if (m.lastSeenMessageId) seenWatermarks[m.entityId] = m.lastSeenMessageId;
    }

    res.write(`data: ${JSON.stringify({
      type: "connected",
      data: {
        onlineUsers: onlineEntityIds,
        activeAgents: activeRuns.map((r) => ({
          runId: r.runId,
          agentEntityId: r.entityId,
          agentName: r.entityName,
        })),
        seenWatermarks,
      },
    })}\n\n`);
  } catch {
    // Non-fatal — client will work without initial state
  }

  // Forward Redis messages to SSE (with dedup for stream bridge events)
  const recentSSEKeys = new Set<string>();
  const messageHandler = (_ch: string, message: string) => {
    try {
      const parsed = JSON.parse(message);
      const t = parsed.type as string | undefined;
      // Dedup agent/tool/typing events by type+runId+streamId (text.delta exempt)
      if (t && t !== "text.delta" && t !== "space.message" && t !== "message.seen") {
        const key = `${t}:${parsed.runId ?? ""}:${parsed.streamId ?? ""}`;
        if (recentSSEKeys.has(key)) return;
        recentSSEKeys.add(key);
        setTimeout(() => recentSSEKeys.delete(key), 5000);
      }
      res.write(`data: ${message}\n\n`);
    } catch (err) {
      console.error(`[space-stream] Error forwarding SSE message:`, err instanceof Error ? err.message : err);
    }
  };
  sub.on("message", messageHandler);

  // Keepalive — also refreshes presence TTL
  const keepalive = setInterval(() => {
    try {
      res.write(`:keepalive\n\n`);
      if (entityId) {
        refreshPresence(smartSpaceId, entityId).catch(() => {});
      }
    } catch {}
  }, 15_000);

  // Cleanup on close — mark offline (guarded against double-call)
  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    clearInterval(keepalive);
    sub.unsubscribe(channel).catch(() => {});
    sub.disconnect();

    if (entityId) {
      markOffline(smartSpaceId, entityId).catch(() => {});
    }
  };

  req.on("close", cleanup);
  req.on("error", cleanup);
});

export default router;
