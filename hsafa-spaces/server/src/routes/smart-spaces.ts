import { Router } from "express";
import type { Request, Response } from "express";
import Redis from "ioredis";
import { prisma } from "../lib/db.js";
import {
  requireSecretKeyAuth,
  requireAnyAuth,
  requireAuthWithMembership,
  isAuthError,
} from "../lib/spaces-auth.js";
import { postSpaceMessage } from "../lib/space-service.js";
import { invalidateSpace } from "../lib/membership-service.js";
import { handleMembershipChanged } from "../lib/service/index.js";
import {
  listSpaceActiveRuns,
  markOnline,
  markOffline,
  refreshPresence,
  listOnlineEntities,
  broadcastTyping,
  broadcastSeen,
} from "../lib/smartspace-events.js";
import { verifyToken } from "../lib/auth.js";
import { requireRole, isAtLeast, type SpaceRole } from "../lib/role-auth.js";
import { generateSnippet, type MessageMetadata, type MessageType } from "../lib/message-types.js";

const router = Router();

// BigInt JSON serializer
function serializeBigInt(obj: unknown): unknown {
  return JSON.parse(
    JSON.stringify(obj, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value
    )
  );
}

// =============================================================================
// POST /api/smart-spaces — Create a space
// =============================================================================
router.post("/", async (req: Request, res: Response) => {
  const auth = await requireSecretKeyAuth(req);
  if (isAuthError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    const { name, description, metadata } = req.body;
    const space = await prisma.smartSpace.create({
      data: {
        name: name || null,
        description: description || null,
        metadata: metadata || undefined,
      },
    });
    res.status(201).json({ smartSpace: space });
  } catch (error) {
    console.error("Create space error:", error);
    res.status(500).json({ error: "Failed to create space" });
  }
});

// =============================================================================
// GET /api/smart-spaces — List spaces
// =============================================================================
router.get("/", async (req: Request, res: Response) => {
  const auth = await requireAnyAuth(req);
  if (isAuthError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    const entityId = (req.query.entityId as string) || auth.entityId;
    let spaces;

    if (entityId) {
      const memberships = await prisma.smartSpaceMembership.findMany({
        where: { entityId },
        include: { smartSpace: true },
      });
      spaces = memberships.map((m: any) => m.smartSpace);
    } else {
      spaces = await prisma.smartSpace.findMany({
        orderBy: { createdAt: "desc" },
      });
    }

    res.json({ smartSpaces: spaces });
  } catch (error) {
    console.error("List spaces error:", error);
    res.status(500).json({ error: "Failed to list spaces" });
  }
});

// =============================================================================
// POST /api/spaces/create — Create space (JWT auth, used by frontend)
// =============================================================================
router.post("/create-for-user", async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const payload = await verifyToken(authHeader.slice(7));
    if (!payload) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }

    const { name } = req.body as { name?: string };

    const smartSpace = await prisma.smartSpace.create({
      data: { name: name || `Chat ${new Date().toLocaleTimeString()}` },
    });

    await prisma.smartSpaceMembership.create({
      data: {
        smartSpaceId: smartSpace.id,
        entityId: payload.entityId,
        role: "owner",
      },
    });

    res.json({ smartSpace: { id: smartSpace.id, name: smartSpace.name } });
  } catch (error) {
    console.error("Create space error:", error);
    res.status(500).json({ error: "Failed to create space" });
  }
});

// =============================================================================
// GET /api/smart-spaces/:smartSpaceId — Get space
// =============================================================================
router.get("/:smartSpaceId", async (req: Request, res: Response) => {
  const smartSpaceId = req.params.smartSpaceId as string;
  const auth = await requireAuthWithMembership(req, smartSpaceId);
  if (isAuthError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    const space = await prisma.smartSpace.findUnique({
      where: { id: smartSpaceId },
    });
    if (!space) {
      res.status(404).json({ error: "Space not found" });
      return;
    }
    res.json({ smartSpace: space });
  } catch (error) {
    console.error("Get space error:", error);
    res.status(500).json({ error: "Failed to get space" });
  }
});

// =============================================================================
// PATCH /api/smart-spaces/:smartSpaceId — Update space (admin+)
// =============================================================================
router.patch("/:smartSpaceId", async (req: Request, res: Response) => {
  const smartSpaceId = req.params.smartSpaceId as string;
  const auth = await requireAuthWithMembership(req, smartSpaceId);
  if (isAuthError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    // Role check: admin+ required (secret key bypasses)
    if (auth.method !== "secret_key" && auth.entityId) {
      await requireRole(smartSpaceId, auth.entityId, "admin");
    }

    const { name, description, metadata } = req.body;
    const space = await prisma.smartSpace.update({
      where: { id: smartSpaceId },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(metadata !== undefined && { metadata }),
      },
    });
    res.json({ smartSpace: space });
  } catch (error: any) {
    if (error?.status) {
      res.status(error.status).json({ error: error.error });
      return;
    }
    console.error("Update space error:", error);
    res.status(500).json({ error: "Failed to update space" });
  }
});

// =============================================================================
// DELETE /api/smart-spaces/:smartSpaceId — Delete space (owner or secret key)
// =============================================================================
router.delete("/:smartSpaceId", async (req: Request, res: Response) => {
  const smartSpaceId = req.params.smartSpaceId as string;
  const auth = await requireAnyAuth(req);
  if (isAuthError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    // Role check: owner required (secret key bypasses)
    if (auth.method !== "secret_key" && auth.entityId) {
      await requireRole(smartSpaceId, auth.entityId, "owner");
    }

    await prisma.smartSpace.delete({ where: { id: smartSpaceId } });
    res.json({ success: true });
  } catch (error: any) {
    if (error?.status) {
      res.status(error.status).json({ error: error.error });
      return;
    }
    console.error("Delete space error:", error);
    res.status(500).json({ error: "Failed to delete space" });
  }
});

// =============================================================================
// POST /api/smart-spaces/:smartSpaceId/messages — Send message
// =============================================================================
router.post("/:smartSpaceId/messages", async (req: Request, res: Response) => {
  const smartSpaceId = req.params.smartSpaceId as string;
  const auth = await requireAuthWithMembership(req, smartSpaceId);
  if (isAuthError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    let { entityId, role, content, metadata, streamId, type: messageType, replyTo } = req.body;

    // Anti-impersonation: force entityId from JWT for public key auth
    if (auth.method === "public_key_jwt") {
      entityId = auth.entityId;
    }

    if (!entityId || !content) {
      res.status(400).json({ error: "entityId and content are required" });
      return;
    }

    // Resolve replyTo: if messageId provided, populate snippet/senderName/messageType
    let resolvedReplyTo = undefined;
    if (replyTo?.messageId) {
      const original = await prisma.smartSpaceMessage.findUnique({
        where: { id: replyTo.messageId },
        include: { entity: { select: { displayName: true } } },
      });
      if (original) {
        const origMeta = original.metadata as MessageMetadata | null;
        resolvedReplyTo = {
          messageId: original.id,
          snippet: generateSnippet(original.content, origMeta),
          senderName: original.entity?.displayName ?? "Unknown",
          messageType: origMeta?.type ?? "text",
        };
      }
    }

    const result = await postSpaceMessage({
      spaceId: smartSpaceId,
      entityId,
      role: role || "user",
      content,
      metadata,
      streamId,
      messageType: messageType as MessageType | undefined,
      replyTo: resolvedReplyTo,
    });

    res.status(201).json(result);
  } catch (error) {
    console.error("Send message error:", error);
    res.status(500).json({ error: "Failed to send message" });
  }
});

// =============================================================================
// GET /api/smart-spaces/:smartSpaceId/messages — List messages
// =============================================================================
router.get("/:smartSpaceId/messages", async (req: Request, res: Response) => {
  const smartSpaceId = req.params.smartSpaceId as string;
  const auth = await requireAuthWithMembership(req, smartSpaceId);
  if (isAuthError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const afterSeq = req.query.afterSeq ? BigInt(req.query.afterSeq as string) : undefined;
    const beforeSeq = req.query.beforeSeq ? BigInt(req.query.beforeSeq as string) : undefined;

    const where: any = { smartSpaceId };
    if (afterSeq !== undefined) where.seq = { ...where.seq, gt: afterSeq };
    if (beforeSeq !== undefined) where.seq = { ...where.seq, lt: beforeSeq };

    const messages = await prisma.smartSpaceMessage.findMany({
      where,
      orderBy: { seq: "desc" },
      take: limit,
      include: {
        entity: {
          select: { id: true, displayName: true, type: true },
        },
      },
    });

    res.json({ messages: serializeBigInt(messages.reverse()) });
  } catch (error) {
    console.error("List messages error:", error);
    res.status(500).json({ error: "Failed to list messages" });
  }
});

// =============================================================================
// GET /api/smart-spaces/:smartSpaceId/messages/:msgId/thread — Get message thread
// =============================================================================
router.get(
  "/:smartSpaceId/messages/:msgId/thread",
  async (req: Request, res: Response) => {
    const smartSpaceId = req.params.smartSpaceId as string;
    const msgId = req.params.msgId as string;
    const auth = await requireAuthWithMembership(req, smartSpaceId);
    if (isAuthError(auth)) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    try {
      // Get the original message
      const original = await prisma.smartSpaceMessage.findUnique({
        where: { id: msgId },
        include: {
          entity: { select: { id: true, displayName: true, type: true } },
        },
      });
      if (!original || original.smartSpaceId !== smartSpaceId) {
        res.status(404).json({ error: "Message not found" });
        return;
      }

      // Find all replies to this message using JSON path filter (§8.3)
      const replies = await prisma.smartSpaceMessage.findMany({
        where: {
          smartSpaceId,
          metadata: {
            path: ["replyTo", "messageId"],
            equals: msgId,
          },
        },
        orderBy: { seq: "asc" },
        include: {
          entity: { select: { id: true, displayName: true, type: true } },
        },
      });

      res.json({
        original: serializeBigInt(original),
        replies: serializeBigInt(replies),
      });
    } catch (error) {
      console.error("Get thread error:", error);
      res.status(500).json({ error: "Failed to get thread" });
    }
  }
);

// =============================================================================
// GET /api/smart-spaces/:smartSpaceId/stream — SSE event stream
//
// On connect: mark entity online, send initial state (online users, active runs,
// seen watermarks). On disconnect: mark offline. Keepalive refreshes presence TTL.
// =============================================================================
router.get("/:smartSpaceId/stream", async (req: Request, res: Response) => {
  const smartSpaceId = req.params.smartSpaceId as string;
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

  // Forward Redis messages to SSE
  const messageHandler = (_ch: string, message: string) => {
    try {
      res.write(`data: ${message}\n\n`);
    } catch {}
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

  // Cleanup on close — mark offline
  const cleanup = () => {
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

// =============================================================================
// POST /api/smart-spaces/:smartSpaceId/typing — Typing indicator (ephemeral)
// =============================================================================
router.post("/:smartSpaceId/typing", async (req: Request, res: Response) => {
  const smartSpaceId = req.params.smartSpaceId as string;
  const auth = await requireAuthWithMembership(req, smartSpaceId);
  if (isAuthError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  if (!auth.entityId) {
    res.status(400).json({ error: "No entity resolved" });
    return;
  }

  const typing = req.body.typing !== false; // default true

  try {
    // Look up entity name for the broadcast
    const entity = await prisma.entity.findUnique({
      where: { id: auth.entityId },
      select: { displayName: true },
    });

    await broadcastTyping(
      smartSpaceId,
      auth.entityId,
      entity?.displayName ?? "Unknown",
      typing,
    );
    res.json({ success: true });
  } catch (error) {
    console.error("Typing broadcast error:", error);
    res.status(500).json({ error: "Failed to broadcast typing" });
  }
});

// =============================================================================
// POST /api/smart-spaces/:smartSpaceId/seen — Mark messages as seen (watermark)
//
// Updates the caller's lastSeenMessageId on their membership and broadcasts
// a message.seen event so other clients can update read receipt indicators.
// =============================================================================
router.post("/:smartSpaceId/seen", async (req: Request, res: Response) => {
  const smartSpaceId = req.params.smartSpaceId as string;
  const auth = await requireAuthWithMembership(req, smartSpaceId);
  if (isAuthError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  if (!auth.entityId) {
    res.status(400).json({ error: "No entity resolved" });
    return;
  }

  const { messageId } = req.body;
  if (!messageId) {
    res.status(400).json({ error: "messageId is required" });
    return;
  }

  try {
    // Verify message exists in this space
    const msg = await prisma.smartSpaceMessage.findUnique({
      where: { id: messageId },
      select: { smartSpaceId: true, seq: true },
    });
    if (!msg || msg.smartSpaceId !== smartSpaceId) {
      res.status(404).json({ error: "Message not found in this space" });
      return;
    }

    // Only advance the watermark forward (never go backward)
    const membership = await prisma.smartSpaceMembership.findUnique({
      where: { smartSpaceId_entityId: { smartSpaceId, entityId: auth.entityId } },
      select: { lastSeenMessageId: true },
    });

    if (membership?.lastSeenMessageId) {
      const currentSeen = await prisma.smartSpaceMessage.findUnique({
        where: { id: membership.lastSeenMessageId },
        select: { seq: true },
      });
      // If current watermark is already ahead, skip
      if (currentSeen && currentSeen.seq >= msg.seq) {
        res.json({ success: true, lastSeenMessageId: membership.lastSeenMessageId });
        return;
      }
    }

    // Update the watermark
    await prisma.smartSpaceMembership.update({
      where: { smartSpaceId_entityId: { smartSpaceId, entityId: auth.entityId } },
      data: { lastSeenMessageId: messageId },
    });

    // Broadcast seen event
    const entity = await prisma.entity.findUnique({
      where: { id: auth.entityId },
      select: { displayName: true },
    });
    await broadcastSeen(
      smartSpaceId,
      auth.entityId,
      entity?.displayName ?? "Unknown",
      messageId,
    );

    res.json({ success: true, lastSeenMessageId: messageId });
  } catch (error) {
    console.error("Mark seen error:", error);
    res.status(500).json({ error: "Failed to mark as seen" });
  }
});

// =============================================================================
// POST /api/smart-spaces/:smartSpaceId/members — Add member (admin+ or secret key)
// =============================================================================
router.post("/:smartSpaceId/members", async (req: Request, res: Response) => {
  const smartSpaceId = req.params.smartSpaceId as string;
  const auth = await requireAnyAuth(req);
  if (isAuthError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    // Role check: admin+ required (secret key bypasses)
    if (auth.method !== "secret_key" && auth.entityId) {
      await requireRole(smartSpaceId, auth.entityId, "admin");
    }

    const { entityId, role } = req.body;
    if (!entityId) {
      res.status(400).json({ error: "entityId is required" });
      return;
    }

    // Cannot add someone as owner
    if (role === "owner") {
      res.status(400).json({ error: "Cannot add a member as owner. Use transfer-ownership instead." });
      return;
    }

    const membership = await prisma.smartSpaceMembership.create({
      data: {
        smartSpaceId,
        entityId,
        role: role || "member",
      },
    });

    invalidateSpace(smartSpaceId);
    handleMembershipChanged(entityId, smartSpaceId, "added");

    res.status(201).json({ membership });
  } catch (error: any) {
    if (error?.status) {
      res.status(error.status).json({ error: error.error });
      return;
    }
    console.error("Add member error:", error);
    res.status(500).json({ error: "Failed to add member" });
  }
});

// =============================================================================
// GET /api/smart-spaces/:smartSpaceId/members — List members
// =============================================================================
router.get("/:smartSpaceId/members", async (req: Request, res: Response) => {
  const smartSpaceId = req.params.smartSpaceId as string;
  const auth = await requireAuthWithMembership(req, smartSpaceId);
  if (isAuthError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    const memberships = await prisma.smartSpaceMembership.findMany({
      where: { smartSpaceId },
      include: {
        entity: {
          select: { id: true, displayName: true, type: true },
        },
      },
    });

    res.json({ members: memberships });
  } catch (error) {
    console.error("List members error:", error);
    res.status(500).json({ error: "Failed to list members" });
  }
});

// =============================================================================
// DELETE /api/smart-spaces/:smartSpaceId/members/:entityId — Remove member (admin+ or secret key)
// =============================================================================
router.delete(
  "/:smartSpaceId/members/:entityId",
  async (req: Request, res: Response) => {
    const smartSpaceId = req.params.smartSpaceId as string;
    const entityId = req.params.entityId as string;
    const auth = await requireAnyAuth(req);
    if (isAuthError(auth)) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    try {
      // Role check: admin+ required (secret key bypasses)
      if (auth.method !== "secret_key" && auth.entityId) {
        await requireRole(smartSpaceId, auth.entityId, "admin");
      }

      // Cannot remove the owner
      const targetMembership = await prisma.smartSpaceMembership.findUnique({
        where: { smartSpaceId_entityId: { smartSpaceId, entityId } },
        select: { role: true },
      });
      if (targetMembership?.role === "owner") {
        res.status(403).json({ error: "Cannot remove the owner. Transfer ownership first." });
        return;
      }

      await prisma.smartSpaceMembership.delete({
        where: { smartSpaceId_entityId: { smartSpaceId, entityId } },
      });

      invalidateSpace(smartSpaceId);
      handleMembershipChanged(entityId, smartSpaceId, "removed");

      res.json({ success: true });
    } catch (error: any) {
      if (error?.status) {
        res.status(error.status).json({ error: error.error });
        return;
      }
      console.error("Remove member error:", error);
      res.status(500).json({ error: "Failed to remove member" });
    }
  }
);

// =============================================================================
// POST /api/smart-spaces/:smartSpaceId/transfer-ownership — Transfer ownership (owner only)
// =============================================================================
router.post(
  "/:smartSpaceId/transfer-ownership",
  async (req: Request, res: Response) => {
    const smartSpaceId = req.params.smartSpaceId as string;
    const auth = await requireAuthWithMembership(req, smartSpaceId);
    if (isAuthError(auth)) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    try {
      if (!auth.entityId) {
        res.status(400).json({ error: "No entity resolved" });
        return;
      }

      // Must be owner (secret key not enough — ownership is identity-based)
      await requireRole(smartSpaceId, auth.entityId, "owner");

      const { newOwnerId } = req.body;
      if (!newOwnerId) {
        res.status(400).json({ error: "newOwnerId is required" });
        return;
      }

      if (newOwnerId === auth.entityId) {
        res.status(400).json({ error: "You are already the owner" });
        return;
      }

      // New owner must be a member
      const newOwnerMembership = await prisma.smartSpaceMembership.findUnique({
        where: { smartSpaceId_entityId: { smartSpaceId, entityId: newOwnerId } },
      });
      if (!newOwnerMembership) {
        res.status(400).json({ error: "New owner must be a member of the space" });
        return;
      }

      // Transaction: swap roles
      await prisma.$transaction([
        prisma.smartSpaceMembership.update({
          where: { smartSpaceId_entityId: { smartSpaceId, entityId: auth.entityId } },
          data: { role: "admin" },
        }),
        prisma.smartSpaceMembership.update({
          where: { smartSpaceId_entityId: { smartSpaceId, entityId: newOwnerId } },
          data: { role: "owner" },
        }),
      ]);

      res.json({ success: true });
    } catch (error: any) {
      if (error?.status) {
        res.status(error.status).json({ error: error.error });
        return;
      }
      console.error("Transfer ownership error:", error);
      res.status(500).json({ error: "Failed to transfer ownership" });
    }
  }
);

// =============================================================================
// PATCH /api/smart-spaces/:smartSpaceId/members/:entityId — Update member role (admin+)
// =============================================================================
router.patch(
  "/:smartSpaceId/members/:entityId",
  async (req: Request, res: Response) => {
    const smartSpaceId = req.params.smartSpaceId as string;
    const targetEntityId = req.params.entityId as string;
    const auth = await requireAuthWithMembership(req, smartSpaceId);
    if (isAuthError(auth)) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    try {
      // Role check: admin+ required (secret key bypasses)
      if (auth.method !== "secret_key" && auth.entityId) {
        await requireRole(smartSpaceId, auth.entityId, "admin");
      }

      const { role } = req.body as { role?: string };
      if (!role || !(["member", "admin"] as string[]).includes(role)) {
        res.status(400).json({ error: "role must be 'member' or 'admin'" });
        return;
      }

      // Cannot change the owner's role
      const targetMembership = await prisma.smartSpaceMembership.findUnique({
        where: { smartSpaceId_entityId: { smartSpaceId, entityId: targetEntityId } },
        select: { role: true },
      });
      if (!targetMembership) {
        res.status(404).json({ error: "Member not found" });
        return;
      }
      if (targetMembership.role === "owner") {
        res.status(403).json({ error: "Cannot change the owner's role. Use transfer-ownership." });
        return;
      }

      const updated = await prisma.smartSpaceMembership.update({
        where: { smartSpaceId_entityId: { smartSpaceId, entityId: targetEntityId } },
        data: { role },
      });

      res.json({ membership: updated });
    } catch (error: any) {
      if (error?.status) {
        res.status(error.status).json({ error: error.error });
        return;
      }
      console.error("Update member role error:", error);
      res.status(500).json({ error: "Failed to update member role" });
    }
  }
);

// =============================================================================
// POST /api/smart-spaces/:smartSpaceId/leave — Leave space (any member, owner must transfer first)
// =============================================================================
router.post("/:smartSpaceId/leave", async (req: Request, res: Response) => {
  const smartSpaceId = req.params.smartSpaceId as string;
  const auth = await requireAuthWithMembership(req, smartSpaceId);
  if (isAuthError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    if (!auth.entityId) {
      res.status(400).json({ error: "No entity resolved" });
      return;
    }

    // Owner cannot leave without transferring ownership
    const membership = await prisma.smartSpaceMembership.findUnique({
      where: { smartSpaceId_entityId: { smartSpaceId, entityId: auth.entityId } },
      select: { role: true },
    });
    if (membership?.role === "owner") {
      res.status(403).json({ error: "Owner cannot leave. Transfer ownership first." });
      return;
    }

    await prisma.smartSpaceMembership.delete({
      where: { smartSpaceId_entityId: { smartSpaceId, entityId: auth.entityId } },
    });

    invalidateSpace(smartSpaceId);
    handleMembershipChanged(auth.entityId, smartSpaceId, "removed");

    res.json({ success: true });
  } catch (error) {
    console.error("Leave space error:", error);
    res.status(500).json({ error: "Failed to leave space" });
  }
});

// =============================================================================
// PATCH /api/smart-spaces/:smartSpaceId/read — Mark messages as seen
// =============================================================================
router.patch("/:smartSpaceId/read", async (req: Request, res: Response) => {
  const smartSpaceId = req.params.smartSpaceId as string;
  const auth = await requireAuthWithMembership(req, smartSpaceId);
  if (isAuthError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    const { entityId, lastSeenMessageId } = req.body;
    const targetEntityId =
      auth.method === "public_key_jwt" ? auth.entityId : entityId;

    if (!targetEntityId || !lastSeenMessageId) {
      res.status(400).json({ error: "entityId and lastSeenMessageId are required" });
      return;
    }

    await prisma.smartSpaceMembership.update({
      where: {
        smartSpaceId_entityId: { smartSpaceId, entityId: targetEntityId },
      },
      data: { lastSeenMessageId },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Mark read error:", error);
    res.status(500).json({ error: "Failed to mark messages as read" });
  }
});

export default router;
