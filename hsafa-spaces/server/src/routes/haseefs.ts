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
import { getDecryptedApiKey } from "./api-keys.js";

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
    const { name, description, configJson, instructions, model, provider, persona } = req.body;
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

    // Inject user's API key for the model provider if they have one stored
    if (config.model?.provider) {
      const userKey = await getDecryptedApiKey(auth.userId, config.model.provider);
      if (userKey) {
        config = { ...config, model: { ...config.model, apiKey: userKey } };
      }
    }

    // Inject persona if provided
    if (persona && persona.id && persona.name && persona.description) {
      config = { ...config, persona };
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

    // Inject user's API key for the model provider if they have one stored
    let finalConfigJson = configJson;
    if (configJson?.model?.provider) {
      const userKey = await getDecryptedApiKey(auth.userId, configJson.model.provider);
      if (userKey) {
        finalConfigJson = { ...configJson, model: { ...configJson.model, apiKey: userKey } };
      }
    }

    const coreHaseef = await coreUpdateHaseef(haseefId, {
      name,
      description,
      configJson: finalConfigJson,
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
// GET /api/haseefs/:id/spaces — List all spaces a haseef is in (JWT, owner only)
// =============================================================================
router.get("/:id/spaces", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    const haseefId = req.params.id as string;

    // Verify haseef ownership
    const ownership = await prisma.haseefOwnership.findUnique({
      where: { userId_haseefId: { userId: auth.userId, haseefId } },
    });
    if (!ownership) {
      res.status(404).json({ error: "Haseef not found or not owned by you" });
      return;
    }

    // Get all spaces this haseef is a member of
    const memberships = await prisma.smartSpaceMembership.findMany({
      where: { entityId: ownership.entityId },
      include: {
        smartSpace: {
          select: {
            id: true,
            name: true,
            description: true,
            createdAt: true,
            metadata: true,
            _count: { select: { memberships: true } },
          },
        },
      },
      orderBy: { joinedAt: "desc" },
    });

    // For each space, also get the member list + owner's role in the space
    const spaces = await Promise.all(
      memberships.map(async (m: any) => {
        const members = await prisma.smartSpaceMembership.findMany({
          where: { smartSpaceId: m.smartSpaceId },
          include: {
            entity: { select: { id: true, displayName: true, type: true } },
          },
        });

        const meta = (m.smartSpace.metadata ?? {}) as Record<string, unknown>;
        const directType = (meta.directType as string) ?? null;
        // Owner can view all spaces EXCEPT haseef-human direct (private)
        const canView = directType !== "haseef-human";

        return {
          id: m.smartSpace.id,
          name: m.smartSpace.name,
          description: m.smartSpace.description,
          role: m.role,
          memberCount: members.length,
          createdAt: m.smartSpace.createdAt,
          isDirect: meta.isDirect ?? false,
          directType,
          canView,
          members: members
            .map((mem: any) => ({
              entityId: mem.entityId,
              name: mem.entity?.displayName ?? "Unknown",
              type: mem.entity?.type ?? "unknown",
              role: mem.role,
            })),
        };
      }),
    );

    res.json({ spaces });
  } catch (error) {
    console.error("List haseef spaces error:", error);
    res.status(500).json({ error: "Failed to list haseef spaces" });
  }
});

// =============================================================================
// POST /api/haseefs/:id/spaces — Create a group space with the haseef as a member (JWT, owner)
// Body: { name, description? }
// Owner is NOT added as a member — they can view via haseef ownership.
// NOTE: Must be registered before /:id/spaces/:spaceId to avoid matching 'direct' as spaceId
// =============================================================================
router.post("/:id/spaces", async (req: Request, res: Response) => {
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

    const { name, description } = req.body;
    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }

    // Create the group space
    const space = await prisma.smartSpace.create({
      data: {
        name,
        description: description || null,
        metadata: { isDirect: false } as any,
      },
    });

    // Add haseef as member (owner is NOT added — views via ownership)
    await prisma.smartSpaceMembership.create({
      data: { smartSpaceId: space.id, entityId: ownership.entityId, role: "member" },
    });

    invalidateSpace(space.id);
    handleMembershipChanged(ownership.entityId, space.id, "added");

    res.status(201).json({
      space: {
        id: space.id,
        name: space.name,
        description: space.description,
      },
    });
  } catch (error) {
    console.error("Create haseef space error:", error);
    res.status(500).json({ error: "Failed to create space" });
  }
});

// =============================================================================
// POST /api/haseefs/:id/spaces/direct — Create a direct space for a haseef
// Body: { targetHaseefId } OR { targetEntityId }
//   targetHaseefId → haseef-to-haseef direct: owner can view via ownership
//   targetEntityId → haseef-to-human direct: owner can see in list but can't open
// NOTE: Must be registered before /:id/spaces/:spaceId to avoid matching 'direct' as spaceId
// =============================================================================
router.post("/:id/spaces/direct", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    const haseefId = req.params.id as string;
    const { targetHaseefId, targetEntityId } = req.body;

    if (!targetHaseefId && !targetEntityId) {
      res.status(400).json({ error: "targetHaseefId or targetEntityId is required" });
      return;
    }

    // Verify ownership of the source haseef
    const ownership = await prisma.haseefOwnership.findUnique({
      where: { userId_haseefId: { userId: auth.userId, haseefId } },
      include: { entity: { select: { displayName: true } } },
    });
    if (!ownership) {
      res.status(404).json({ error: "Haseef not found or not owned by you" });
      return;
    }

    const haseefName = ownership.entity.displayName ?? "Haseef";

    // ── Case A: haseef-to-haseef ──
    if (targetHaseefId) {
      if (haseefId === targetHaseefId) {
        res.status(400).json({ error: "Cannot create a direct space with the same haseef" });
        return;
      }

      const targetOwnership = await prisma.haseefOwnership.findFirst({
        where: { haseefId: targetHaseefId },
        include: { entity: { select: { id: true, displayName: true } } },
      });
      if (!targetOwnership) {
        res.status(404).json({ error: "Target haseef not found" });
        return;
      }

      const targetName = targetOwnership.entity.displayName ?? "Haseef";
      const spaceName = `${haseefName} ↔ ${targetName}`;

      const space = await prisma.smartSpace.create({
        data: {
          name: spaceName,
          description: `Direct space between ${haseefName} and ${targetName}`,
          metadata: { isDirect: true, directType: "haseef-haseef" } as any,
        },
      });

      // Add both haseefs as members (owner is NOT added — views via ownership)
      await prisma.smartSpaceMembership.createMany({
        data: [
          { smartSpaceId: space.id, entityId: ownership.entityId, role: "member" },
          { smartSpaceId: space.id, entityId: targetOwnership.entityId, role: "member" },
        ],
      });

      invalidateSpace(space.id);
      handleMembershipChanged(ownership.entityId, space.id, "added");
      handleMembershipChanged(targetOwnership.entityId, space.id, "added");

      res.status(201).json({
        space: {
          id: space.id,
          name: space.name,
          description: space.description,
          directType: "haseef-haseef",
          members: [
            { entityId: ownership.entityId, name: haseefName, role: "member" },
            { entityId: targetOwnership.entityId, name: targetName, role: "member" },
          ],
        },
      });
      return;
    }

    // ── Case B: haseef-to-human ──
    const targetEntity = await prisma.entity.findUnique({
      where: { id: targetEntityId },
      select: { id: true, displayName: true, type: true },
    });
    if (!targetEntity) {
      res.status(404).json({ error: "Target entity not found" });
      return;
    }

    const targetName = targetEntity.displayName ?? "User";
    const spaceName = `${haseefName} ↔ ${targetName}`;

    const space = await prisma.smartSpace.create({
      data: {
        name: spaceName,
        description: `Direct space between ${haseefName} and ${targetName}`,
        metadata: { isDirect: true, directType: "haseef-human" } as any,
      },
    });

    // Add haseef + human as members — owner is NOT added
    await prisma.smartSpaceMembership.createMany({
      data: [
        { smartSpaceId: space.id, entityId: ownership.entityId, role: "member" },
        { smartSpaceId: space.id, entityId: targetEntity.id, role: "member" },
      ],
    });

    invalidateSpace(space.id);
    handleMembershipChanged(ownership.entityId, space.id, "added");
    handleMembershipChanged(targetEntity.id, space.id, "added");

    res.status(201).json({
      space: {
        id: space.id,
        name: space.name,
        description: space.description,
        directType: "haseef-human",
        members: [
          { entityId: ownership.entityId, name: haseefName, role: "member" },
          { entityId: targetEntity.id, name: targetName, role: "member" },
        ],
      },
    });
  } catch (error) {
    console.error("Create direct haseef space error:", error);
    res.status(500).json({ error: "Failed to create direct space" });
  }
});

// =============================================================================
// POST /api/haseefs/:id/spaces/:spaceId — Add haseef to existing space (JWT, admin+ in space)
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
