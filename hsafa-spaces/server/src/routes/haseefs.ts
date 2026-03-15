import { Router } from "express";
import type { Request, Response } from "express";
import crypto from "crypto";
import { prisma } from "../lib/db.js";
import { verifyToken } from "../lib/auth.js";
import { requireRole } from "../lib/role-auth.js";
import { invalidateSpace } from "../lib/membership-service.js";
import { handleMembershipChanged, connectNewHaseef } from "../lib/service/index.js";
import {
  createHaseef as coreCreateHaseef,
  getHaseef as coreGetHaseef,
  updateHaseef as coreUpdateHaseef,
  deleteHaseef as coreDeleteHaseef,
} from "../lib/core-proxy.js";

const router = Router();

// ── JWT auth helper (extracts userId + entityId from token) ─────────────────

async function requireJwtUser(req: Request): Promise<
  { userId: string; entityId: string; email: string } | { status: number; error: string }
> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return { status: 401, error: "Unauthorized" };
  }
  const payload = await verifyToken(authHeader.slice(7));
  if (!payload) {
    return { status: 401, error: "Invalid or expired token" };
  }
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, hsafaEntityId: true },
  });
  if (!user || !user.hsafaEntityId) {
    return { status: 404, error: "User not found or no entity" };
  }
  return { userId: user.id, entityId: user.hsafaEntityId, email: user.email };
}

function isJwtError(r: any): r is { status: number; error: string } {
  return "error" in r;
}

// =============================================================================
// POST /api/haseefs — Create a new haseef (JWT)
// =============================================================================
router.post("/", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    const { name, description, configJson, instructions, model, provider } = req.body;
    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }

    // Build configJson with sensible defaults if not provided
    // Accept "model" and "provider" fields as shorthand
    let config = configJson;
    if (!config) {
      const modelId = model || "gpt-4o-mini";
      // Use provided provider, or auto-detect from model name
      const detectedProvider = provider || (
        modelId.startsWith("gpt") ? "openai" :
        modelId.startsWith("claude") ? "anthropic" :
        (modelId.startsWith("qwen/") || modelId.startsWith("moonshotai/")) ? "openrouter" :
        "openai"
      );
      config = {
        model: { provider: detectedProvider, model: modelId },
        ...(instructions ? { instructions } : {}),
      };
    }

    // Create entity in Spaces for this agent
    const { avatarUrl } = req.body;
    const entityId = crypto.randomUUID();
    const entity = await prisma.entity.create({
      data: {
        id: entityId,
        type: "agent",
        displayName: name,
        ...(avatarUrl ? { metadata: { avatarUrl } } : {}),
      },
    });

    // Create in Core with profileJson linking to the spaces entity
    const coreHaseef = await coreCreateHaseef({
      name,
      description,
      configJson: config,
      profileJson: { entityId: entity.id },
    });

    // Create ownership record
    await prisma.haseefOwnership.create({
      data: {
        userId: auth.userId,
        haseefId: coreHaseef.id,
        entityId: entity.id,
      },
    });

    // Connect the new haseef to the spaces service (sync tools + start listening)
    try {
      await connectNewHaseef({
        id: coreHaseef.id,
        name: coreHaseef.name,
        profileJson: { entityId: entity.id },
      });
    } catch (err) {
      console.warn("[haseefs] Failed to auto-connect new haseef:", err);
    }

    res.status(201).json({
      haseef: {
        id: coreHaseef.id,
        name: coreHaseef.name,
        description: coreHaseef.description,
        entityId: entity.id,
      },
    });
  } catch (error: any) {
    if (error?.status) {
      res.status(error.status).json({ error: error.error });
      return;
    }
    console.error("Create haseef error:", error);
    res.status(500).json({ error: "Failed to create haseef" });
  }
});

// =============================================================================
// GET /api/haseefs — List my haseefs (JWT)
// =============================================================================
router.get("/", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    const ownerships = await prisma.haseefOwnership.findMany({
      where: { userId: auth.userId },
      include: {
        entity: { select: { id: true, displayName: true, type: true, metadata: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const haseefs = ownerships.map((o) => ({
      haseefId: o.haseefId,
      entityId: o.entityId,
      name: o.entity.displayName,
      avatarUrl: (o.entity.metadata as any)?.avatarUrl || null,
      createdAt: o.createdAt,
    }));

    res.json({ haseefs });
  } catch (error) {
    console.error("List haseefs error:", error);
    res.status(500).json({ error: "Failed to list haseefs" });
  }
});

// =============================================================================
// GET /api/haseefs/:id — Get haseef details (JWT, owner only)
// =============================================================================
router.get("/:id", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    const haseefId = req.params.id as string;

    // Verify ownership + fetch entity metadata for avatarUrl
    const ownership = await prisma.haseefOwnership.findUnique({
      where: { userId_haseefId: { userId: auth.userId, haseefId } },
      include: { entity: { select: { metadata: true } } },
    });
    if (!ownership) {
      res.status(404).json({ error: "Haseef not found or not owned by you" });
      return;
    }

    // Proxy to Core for full details
    const coreHaseef = await coreGetHaseef(haseefId);

    res.json({
      haseef: {
        ...coreHaseef,
        entityId: ownership.entityId,
        avatarUrl: (ownership.entity?.metadata as any)?.avatarUrl || null,
      },
    });
  } catch (error: any) {
    if (error?.status) {
      res.status(error.status).json({ error: error.error });
      return;
    }
    console.error("Get haseef error:", error);
    res.status(500).json({ error: "Failed to get haseef" });
  }
});

// =============================================================================
// PATCH /api/haseefs/:id — Update haseef (JWT, owner only)
// =============================================================================
router.patch("/:id", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    const haseefId = req.params.id as string;

    const ownership = await prisma.haseefOwnership.findUnique({
      where: { userId_haseefId: { userId: auth.userId, haseefId } },
    });
    if (!ownership) {
      res.status(404).json({ error: "Haseef not found or not owned by you" });
      return;
    }

    const { name, description, configJson, avatarUrl } = req.body;
    const coreHaseef = await coreUpdateHaseef(haseefId, {
      name,
      description,
      configJson,
    });

    // Update entity display name and/or avatar
    const entityUpdate: Record<string, unknown> = {};
    if (name) entityUpdate.displayName = name;
    if (avatarUrl !== undefined) {
      const existing = await prisma.entity.findUnique({ where: { id: ownership.entityId }, select: { metadata: true } });
      entityUpdate.metadata = { ...((existing?.metadata as any) || {}), avatarUrl };
    }
    if (Object.keys(entityUpdate).length > 0) {
      await prisma.entity.update({
        where: { id: ownership.entityId },
        data: entityUpdate,
      });
    }

    res.json({
      haseef: {
        ...coreHaseef,
        entityId: ownership.entityId,
      },
    });
  } catch (error: any) {
    if (error?.status) {
      res.status(error.status).json({ error: error.error });
      return;
    }
    console.error("Update haseef error:", error);
    res.status(500).json({ error: "Failed to update haseef" });
  }
});

// =============================================================================
// DELETE /api/haseefs/:id — Delete haseef (JWT, owner only)
// =============================================================================
router.delete("/:id", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    const haseefId = req.params.id as string;

    const ownership = await prisma.haseefOwnership.findUnique({
      where: { userId_haseefId: { userId: auth.userId, haseefId } },
    });
    if (!ownership) {
      res.status(404).json({ error: "Haseef not found or not owned by you" });
      return;
    }

    // Delete from Core first
    await coreDeleteHaseef(haseefId);

    // Remove all space memberships for this entity
    const memberships = await prisma.smartSpaceMembership.findMany({
      where: { entityId: ownership.entityId },
      select: { smartSpaceId: true },
    });
    await prisma.smartSpaceMembership.deleteMany({
      where: { entityId: ownership.entityId },
    });
    for (const m of memberships) {
      invalidateSpace(m.smartSpaceId);
      handleMembershipChanged(ownership.entityId, m.smartSpaceId, "removed");
    }

    // Delete ownership + entity
    await prisma.haseefOwnership.delete({ where: { id: ownership.id } });
    await prisma.entity.delete({ where: { id: ownership.entityId } });

    res.json({ success: true });
  } catch (error: any) {
    if (error?.status) {
      res.status(error.status).json({ error: error.error });
      return;
    }
    console.error("Delete haseef error:", error);
    res.status(500).json({ error: "Failed to delete haseef" });
  }
});

// =============================================================================
// POST /api/haseefs/:id/spaces/:spaceId — Add haseef to space (JWT, admin+ in space)
// =============================================================================
router.post("/:id/spaces/:spaceId", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    const haseefId = req.params.id as string;
    const spaceId = req.params.spaceId as string;

    // Verify caller is admin+ in the space
    await requireRole(spaceId, auth.entityId, "admin");

    // Verify haseef ownership
    const ownership = await prisma.haseefOwnership.findUnique({
      where: { userId_haseefId: { userId: auth.userId, haseefId } },
    });
    if (!ownership) {
      res.status(404).json({ error: "Haseef not found or not owned by you" });
      return;
    }

    // Check if already a member
    const existing = await prisma.smartSpaceMembership.findUnique({
      where: {
        smartSpaceId_entityId: {
          smartSpaceId: spaceId,
          entityId: ownership.entityId,
        },
      },
    });
    if (existing) {
      res.status(409).json({ error: "Haseef is already a member of this space" });
      return;
    }

    await prisma.smartSpaceMembership.create({
      data: {
        smartSpaceId: spaceId,
        entityId: ownership.entityId,
        role: "member",
      },
    });

    invalidateSpace(spaceId);
    handleMembershipChanged(ownership.entityId, spaceId, "added");

    res.status(201).json({ success: true });
  } catch (error: any) {
    if (error?.status) {
      res.status(error.status).json({ error: error.error });
      return;
    }
    console.error("Add haseef to space error:", error);
    res.status(500).json({ error: "Failed to add haseef to space" });
  }
});

// =============================================================================
// DELETE /api/haseefs/:id/spaces/:spaceId — Remove haseef from space (JWT, admin+ in space)
// =============================================================================
router.delete("/:id/spaces/:spaceId", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    const haseefId = req.params.id as string;
    const spaceId = req.params.spaceId as string;

    // Verify caller is admin+ in the space
    await requireRole(spaceId, auth.entityId, "admin");

    // Verify haseef ownership
    const ownership = await prisma.haseefOwnership.findUnique({
      where: { userId_haseefId: { userId: auth.userId, haseefId } },
    });
    if (!ownership) {
      res.status(404).json({ error: "Haseef not found or not owned by you" });
      return;
    }

    await prisma.smartSpaceMembership.delete({
      where: {
        smartSpaceId_entityId: {
          smartSpaceId: spaceId,
          entityId: ownership.entityId,
        },
      },
    });

    invalidateSpace(spaceId);
    handleMembershipChanged(ownership.entityId, spaceId, "removed");

    res.json({ success: true });
  } catch (error: any) {
    if (error?.status) {
      res.status(error.status).json({ error: error.error });
      return;
    }
    console.error("Remove haseef from space error:", error);
    res.status(500).json({ error: "Failed to remove haseef from space" });
  }
});

export default router;
