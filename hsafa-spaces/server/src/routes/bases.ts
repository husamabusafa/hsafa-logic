import { Router } from "express";
import type { Request, Response } from "express";
import crypto from "crypto";
import { prisma } from "../lib/db.js";
import { verifyToken } from "../lib/auth.js";

const router = Router();

// ── JWT auth helper ──────────────────────────────────────────────────────────

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

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Generate a short, readable invite code like "FAMILY-7Q4K" */
function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1 for readability
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/** Check if entity has a specific role (or higher) in a base */
async function requireBaseRole(
  baseId: string,
  entityId: string,
  minRole: "member" | "admin" | "owner",
): Promise<void> {
  const membership = await prisma.baseMember.findUnique({
    where: { baseId_entityId: { baseId, entityId } },
  });
  if (!membership) {
    throw { status: 403, error: "Not a member of this base" };
  }
  const hierarchy = { owner: 3, admin: 2, member: 1 };
  const memberLevel = hierarchy[membership.role as keyof typeof hierarchy] || 0;
  const requiredLevel = hierarchy[minRole];
  if (memberLevel < requiredLevel) {
    throw { status: 403, error: `Requires ${minRole} role or higher` };
  }
}

// =============================================================================
// GET /api/bases — List my bases
// =============================================================================
router.get("/", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    const memberships = await prisma.baseMember.findMany({
      where: { entityId: auth.entityId },
      include: {
        base: {
          include: {
            members: {
              include: {
                entity: {
                  select: { id: true, type: true, displayName: true, metadata: true },
                },
              },
            },
          },
        },
      },
      orderBy: { joinedAt: "asc" },
    });

    const bases = memberships.map((m) => ({
      id: m.base.id,
      name: m.base.name,
      avatarUrl: m.base.avatarUrl,
      inviteCode: m.base.inviteCode,
      myRole: m.role,
      memberCount: m.base.members.length,
      members: m.base.members.map((bm) => ({
        entityId: bm.entity.id,
        type: bm.entity.type,
        displayName: bm.entity.displayName,
        avatarUrl: (bm.entity.metadata as any)?.avatarUrl ?? null,
        role: bm.role,
        joinedAt: bm.joinedAt,
      })),
      createdAt: m.base.createdAt,
    }));

    res.json({ bases });
  } catch (error) {
    console.error("List bases error:", error);
    res.status(500).json({ error: "Failed to list bases" });
  }
});

// =============================================================================
// POST /api/bases — Create a new base
// =============================================================================
router.post("/", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    const { name } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "name is required" });
      return;
    }

    const inviteCode = generateInviteCode();

    const base = await prisma.base.create({
      data: {
        name: name.trim(),
        inviteCode,
        members: {
          create: {
            entityId: auth.entityId,
            role: "owner",
          },
        },
      },
      include: {
        members: {
          include: {
            entity: {
              select: { id: true, type: true, displayName: true, metadata: true },
            },
          },
        },
      },
    });

    // Set as default base if user doesn't have one
    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { defaultBaseId: true },
    });
    if (!user?.defaultBaseId) {
      await prisma.user.update({
        where: { id: auth.userId },
        data: { defaultBaseId: base.id },
      });
    }

    res.status(201).json({
      base: {
        id: base.id,
        name: base.name,
        avatarUrl: base.avatarUrl,
        inviteCode: base.inviteCode,
        myRole: "owner",
        memberCount: base.members.length,
        members: base.members.map((bm) => ({
          entityId: bm.entity.id,
          type: bm.entity.type,
          displayName: bm.entity.displayName,
          avatarUrl: (bm.entity.metadata as any)?.avatarUrl ?? null,
          role: bm.role,
          joinedAt: bm.joinedAt,
        })),
        createdAt: base.createdAt,
      },
    });
  } catch (error) {
    console.error("Create base error:", error);
    res.status(500).json({ error: "Failed to create base" });
  }
});

// =============================================================================
// PATCH /api/bases/:baseId — Update base (name, avatar) — admin+
// =============================================================================
router.patch("/:baseId", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    const baseId = req.params.baseId as string;
    await requireBaseRole(baseId, auth.entityId, "admin");

    const { name, avatarUrl } = req.body;
    const data: Record<string, unknown> = {};
    if (name && typeof name === "string" && name.trim()) data.name = name.trim();
    if (avatarUrl !== undefined) data.avatarUrl = avatarUrl || null;

    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: "Nothing to update" });
      return;
    }

    const base = await prisma.base.update({
      where: { id: baseId },
      data,
    });

    res.json({ base: { id: base.id, name: base.name, avatarUrl: base.avatarUrl } });
  } catch (error: any) {
    if (error?.status) {
      res.status(error.status).json({ error: error.error });
      return;
    }
    console.error("Update base error:", error);
    res.status(500).json({ error: "Failed to update base" });
  }
});

// =============================================================================
// DELETE /api/bases/:baseId — Delete base — owner only
// =============================================================================
router.delete("/:baseId", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    const baseId = req.params.baseId as string;
    await requireBaseRole(baseId, auth.entityId, "owner");

    await prisma.base.delete({ where: { id: baseId } });

    res.json({ success: true });
  } catch (error: any) {
    if (error?.status) {
      res.status(error.status).json({ error: error.error });
      return;
    }
    console.error("Delete base error:", error);
    res.status(500).json({ error: "Failed to delete base" });
  }
});

// =============================================================================
// POST /api/bases/:baseId/regenerate-code — Regenerate invite code — admin+
// =============================================================================
router.post("/:baseId/regenerate-code", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    const baseId = req.params.baseId as string;
    await requireBaseRole(baseId, auth.entityId, "admin");

    const newCode = generateInviteCode();
    const base = await prisma.base.update({
      where: { id: baseId },
      data: { inviteCode: newCode, inviteLinkActive: true },
    });

    res.json({ inviteCode: base.inviteCode, inviteLinkActive: base.inviteLinkActive });
  } catch (error: any) {
    if (error?.status) {
      res.status(error.status).json({ error: error.error });
      return;
    }
    console.error("Regenerate invite code error:", error);
    res.status(500).json({ error: "Failed to regenerate invite code" });
  }
});

// =============================================================================
// PATCH /api/bases/:baseId/invite-link — Toggle invite link active — admin+
// =============================================================================
router.patch("/:baseId/invite-link", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    const baseId = req.params.baseId as string;
    await requireBaseRole(baseId, auth.entityId, "admin");

    const { active } = req.body;
    if (typeof active !== "boolean") {
      res.status(400).json({ error: "active (boolean) is required" });
      return;
    }

    const base = await prisma.base.update({
      where: { id: baseId },
      data: { inviteLinkActive: active },
    });

    res.json({ inviteLinkActive: base.inviteLinkActive });
  } catch (error: any) {
    if (error?.status) {
      res.status(error.status).json({ error: error.error });
      return;
    }
    console.error("Toggle base invite link error:", error);
    res.status(500).json({ error: "Failed to toggle invite link" });
  }
});

// =============================================================================
// POST /api/bases/join — Join a base by invite code (human)
// =============================================================================
router.post("/join", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    const { code } = req.body;
    if (!code || typeof code !== "string") {
      res.status(400).json({ error: "code is required" });
      return;
    }

    const base = await prisma.base.findUnique({
      where: { inviteCode: code.toUpperCase().trim() },
    });
    if (!base) {
      res.status(404).json({ error: "Invalid invite code" });
      return;
    }
    if (!base.inviteLinkActive) {
      res.status(403).json({ error: "This invite link is no longer active" });
      return;
    }

    // Check if already a member
    const existing = await prisma.baseMember.findUnique({
      where: { baseId_entityId: { baseId: base.id, entityId: auth.entityId } },
    });
    if (existing) {
      res.status(409).json({ error: "Already a member of this base", baseId: base.id });
      return;
    }

    await prisma.baseMember.create({
      data: {
        baseId: base.id,
        entityId: auth.entityId,
        role: "member",
      },
    });

    // Load full base info to return
    const fullBase = await prisma.base.findUniqueOrThrow({
      where: { id: base.id },
      include: {
        members: {
          include: {
            entity: {
              select: { id: true, type: true, displayName: true, metadata: true },
            },
          },
        },
      },
    });

    res.json({
      base: {
        id: fullBase.id,
        name: fullBase.name,
        avatarUrl: fullBase.avatarUrl,
        inviteCode: fullBase.inviteCode,
        myRole: "member",
        memberCount: fullBase.members.length,
        members: fullBase.members.map((bm) => ({
          entityId: bm.entity.id,
          type: bm.entity.type,
          displayName: bm.entity.displayName,
          avatarUrl: (bm.entity.metadata as any)?.avatarUrl ?? null,
          role: bm.role,
          joinedAt: bm.joinedAt,
        })),
        createdAt: fullBase.createdAt,
      },
    });
  } catch (error) {
    console.error("Join base error:", error);
    res.status(500).json({ error: "Failed to join base" });
  }
});

// =============================================================================
// POST /api/bases/:baseId/members — Add a Haseef entity to the base — admin+
// =============================================================================
router.post("/:baseId/members", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    const baseId = req.params.baseId as string;
    await requireBaseRole(baseId, auth.entityId, "admin");

    const { entityId } = req.body;
    if (!entityId) {
      res.status(400).json({ error: "entityId is required" });
      return;
    }

    // Verify entity exists
    const entity = await prisma.entity.findUnique({
      where: { id: entityId },
      select: { id: true, type: true, displayName: true, metadata: true },
    });
    if (!entity) {
      res.status(404).json({ error: "Entity not found" });
      return;
    }

    // Only agent (haseef) entities can be added via this route
    // Humans join via invite code
    if (entity.type !== "agent") {
      res.status(400).json({ error: "Only Haseefs can be added via this route. Humans join via invite code." });
      return;
    }

    // Verify the caller owns this haseef
    const ownership = await prisma.haseefOwnership.findFirst({
      where: { entityId, userId: auth.userId },
    });
    if (!ownership) {
      res.status(403).json({ error: "You can only add Haseefs that you own" });
      return;
    }

    // Check if already a member
    const existing = await prisma.baseMember.findUnique({
      where: { baseId_entityId: { baseId, entityId } },
    });
    if (existing) {
      res.status(409).json({ error: "Already a member of this base" });
      return;
    }

    await prisma.baseMember.create({
      data: {
        baseId,
        entityId,
        role: "member",
      },
    });

    res.status(201).json({
      member: {
        entityId: entity.id,
        type: entity.type,
        displayName: entity.displayName,
        avatarUrl: (entity.metadata as any)?.avatarUrl ?? null,
        role: "member",
      },
    });
  } catch (error: any) {
    if (error?.status) {
      res.status(error.status).json({ error: error.error });
      return;
    }
    console.error("Add base member error:", error);
    res.status(500).json({ error: "Failed to add member" });
  }
});

// =============================================================================
// PATCH /api/bases/:baseId/members/:entityId — Update member role — owner only
// =============================================================================
router.patch("/:baseId/members/:entityId", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    const baseId = req.params.baseId as string;
    const targetEntityId = req.params.entityId as string;
    await requireBaseRole(baseId, auth.entityId, "owner");

    const { role } = req.body;
    if (!role || !["member", "admin"].includes(role)) {
      res.status(400).json({ error: "role must be 'member' or 'admin'" });
      return;
    }

    // Cannot change own role
    if (targetEntityId === auth.entityId) {
      res.status(400).json({ error: "Cannot change your own role" });
      return;
    }

    const member = await prisma.baseMember.update({
      where: {
        baseId_entityId: {
          baseId,
          entityId: targetEntityId,
        },
      },
      data: { role },
    });

    res.json({ role: member.role });
  } catch (error: any) {
    if (error?.status) {
      res.status(error.status).json({ error: error.error });
      return;
    }
    console.error("Update member role error:", error);
    res.status(500).json({ error: "Failed to update member role" });
  }
});

// =============================================================================
// DELETE /api/bases/:baseId/members/:entityId — Remove member — admin+
// =============================================================================
router.delete("/:baseId/members/:entityId", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    const baseId = req.params.baseId as string;
    const targetEntityId = req.params.entityId as string;

    // Self-leave: any member can leave
    if (targetEntityId === auth.entityId) {
      // Owners cannot leave — must transfer ownership first
      const membership = await prisma.baseMember.findUnique({
        where: { baseId_entityId: { baseId, entityId: auth.entityId } },
      });
      if (membership?.role === "owner") {
        res.status(400).json({ error: "Owner cannot leave. Transfer ownership first." });
        return;
      }
      await prisma.baseMember.delete({
        where: { baseId_entityId: { baseId, entityId: auth.entityId } },
      });
      res.json({ success: true });
      return;
    }

    // Removing someone else: admin+ required
    await requireBaseRole(baseId, auth.entityId, "admin");

    // Cannot remove the owner
    const targetMembership = await prisma.baseMember.findUnique({
      where: { baseId_entityId: { baseId, entityId: targetEntityId } },
    });
    if (!targetMembership) {
      res.status(404).json({ error: "Member not found" });
      return;
    }
    if (targetMembership.role === "owner") {
      res.status(403).json({ error: "Cannot remove the owner" });
      return;
    }

    await prisma.baseMember.delete({
      where: { baseId_entityId: { baseId, entityId: targetEntityId } },
    });

    res.json({ success: true });
  } catch (error: any) {
    if (error?.status) {
      res.status(error.status).json({ error: error.error });
      return;
    }
    console.error("Remove base member error:", error);
    res.status(500).json({ error: "Failed to remove member" });
  }
});

// =============================================================================
// GET /api/bases/:baseId/haseefs — List Haseefs available in this base
// =============================================================================
router.get("/:baseId/haseefs", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    const baseId = req.params.baseId as string;
    await requireBaseRole(baseId, auth.entityId, "member");

    // Get all agent entities in this base
    const agentMembers = await prisma.baseMember.findMany({
      where: {
        baseId,
        entity: { type: "agent" },
      },
      include: {
        entity: {
          select: { id: true, displayName: true, metadata: true },
        },
      },
    });

    // Resolve haseef ownership info for each agent entity
    const entityIds = agentMembers.map((m: any) => m.entity.id);
    const ownerships = await prisma.haseefOwnership.findMany({
      where: { entityId: { in: entityIds } },
      select: { entityId: true, haseefId: true, userId: true },
    });
    const ownershipMap = new Map(ownerships.map((o) => [o.entityId, o]));

    const haseefs = agentMembers.map((m: any) => {
      const ownership = ownershipMap.get(m.entity.id);
      return {
        entityId: m.entity.id,
        haseefId: ownership?.haseefId ?? null,
        displayName: m.entity.displayName,
        avatarUrl: (m.entity.metadata as any)?.avatarUrl ?? null,
        joinedAt: m.joinedAt,
      };
    });

    res.json({ haseefs });
  } catch (error: any) {
    if (error?.status) {
      res.status(error.status).json({ error: error.error });
      return;
    }
    console.error("List base haseefs error:", error);
    res.status(500).json({ error: "Failed to list haseefs" });
  }
});

// =============================================================================
// GET /api/bases/resolve/:code — Resolve invite code to base info (public)
// =============================================================================
router.get("/resolve/:code", async (req: Request, res: Response) => {
  try {
    const code = (req.params.code as string).toUpperCase().trim();
    const base = await prisma.base.findUnique({
      where: { inviteCode: code },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        inviteLinkActive: true,
        _count: { select: { members: true } },
      },
    });

    if (!base || !base.inviteLinkActive) {
      res.status(404).json({ error: "Invalid or inactive invite link" });
      return;
    }

    res.json({
      base: {
        id: base.id,
        name: base.name,
        avatarUrl: base.avatarUrl,
        memberCount: base._count.members,
      },
    });
  } catch (error) {
    console.error("Resolve invite code error:", error);
    res.status(500).json({ error: "Failed to resolve invite code" });
  }
});

export default router;
