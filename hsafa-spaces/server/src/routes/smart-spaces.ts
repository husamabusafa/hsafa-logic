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
import { listSpaceActiveRuns } from "../lib/smartspace-events.js";
import { verifyToken } from "../lib/auth.js";

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
        role: "admin",
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
// PATCH /api/smart-spaces/:smartSpaceId — Update space
// =============================================================================
router.patch("/:smartSpaceId", async (req: Request, res: Response) => {
  const smartSpaceId = req.params.smartSpaceId as string;
  const auth = await requireAuthWithMembership(req, smartSpaceId);
  if (isAuthError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
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
  } catch (error) {
    console.error("Update space error:", error);
    res.status(500).json({ error: "Failed to update space" });
  }
});

// =============================================================================
// DELETE /api/smart-spaces/:smartSpaceId — Delete space
// =============================================================================
router.delete("/:smartSpaceId", async (req: Request, res: Response) => {
  const smartSpaceId = req.params.smartSpaceId as string;
  const auth = await requireSecretKeyAuth(req);
  if (isAuthError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    await prisma.smartSpace.delete({ where: { id: smartSpaceId } });
    res.json({ success: true });
  } catch (error) {
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
    let { entityId, role, content, metadata, streamId } = req.body;

    // Anti-impersonation: force entityId from JWT for public key auth
    if (auth.method === "public_key_jwt") {
      entityId = auth.entityId;
    }

    if (!entityId || !content) {
      res.status(400).json({ error: "entityId and content are required" });
      return;
    }

    const result = await postSpaceMessage({
      spaceId: smartSpaceId,
      entityId,
      role: role || "user",
      content,
      metadata,
      streamId,
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
// GET /api/smart-spaces/:smartSpaceId/stream — SSE event stream
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

  // Send initial online users + active runs
  if (entityId) {
    // Emit online event
    const onlineEvent = {
      type: "user.online",
      entityId,
    };
    res.write(`data: ${JSON.stringify(onlineEvent)}\n\n`);
  }

  // Send active runs
  try {
    const activeRuns = await listSpaceActiveRuns(smartSpaceId);
    for (const run of activeRuns) {
      res.write(
        `data: ${JSON.stringify({
          type: "agent.active",
          agentEntityId: run.entityId,
          runId: run.runId,
          data: { agentEntityId: run.entityId, agentName: run.entityName },
        })}\n\n`
      );
    }
  } catch {}

  // Forward Redis messages to SSE
  const messageHandler = (_ch: string, message: string) => {
    try {
      res.write(`data: ${message}\n\n`);
    } catch {}
  };
  sub.on("message", messageHandler);

  // Keepalive
  const keepalive = setInterval(() => {
    try {
      res.write(`:keepalive\n\n`);
    } catch {}
  }, 15_000);

  // Cleanup on close
  const cleanup = () => {
    clearInterval(keepalive);
    sub.unsubscribe(channel).catch(() => {});
    sub.disconnect();

    if (entityId) {
      // Could emit offline event here
    }
  };

  req.on("close", cleanup);
  req.on("error", cleanup);
});

// =============================================================================
// POST /api/smart-spaces/:smartSpaceId/members — Add member
// =============================================================================
router.post("/:smartSpaceId/members", async (req: Request, res: Response) => {
  const smartSpaceId = req.params.smartSpaceId as string;
  const auth = await requireSecretKeyAuth(req);
  if (isAuthError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    const { entityId, role } = req.body;
    if (!entityId) {
      res.status(400).json({ error: "entityId is required" });
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
  } catch (error) {
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
// DELETE /api/smart-spaces/:smartSpaceId/members/:entityId — Remove member
// =============================================================================
router.delete(
  "/:smartSpaceId/members/:entityId",
  async (req: Request, res: Response) => {
    const smartSpaceId = req.params.smartSpaceId as string;
    const entityId = req.params.entityId as string;
    const auth = await requireSecretKeyAuth(req);
    if (isAuthError(auth)) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    try {
      await prisma.smartSpaceMembership.delete({
        where: { smartSpaceId_entityId: { smartSpaceId, entityId } },
      });

      invalidateSpace(smartSpaceId);
      handleMembershipChanged(entityId, smartSpaceId, "removed");

      res.json({ success: true });
    } catch (error) {
      console.error("Remove member error:", error);
      res.status(500).json({ error: "Failed to remove member" });
    }
  }
);

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
