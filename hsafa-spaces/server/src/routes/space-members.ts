// =============================================================================
// Smart Spaces — Member Routes
//
// POST   /:smartSpaceId/members — Add member
// GET    /:smartSpaceId/members — List members
// DELETE /:smartSpaceId/members/:entityId — Remove member
// PATCH  /:smartSpaceId/members/:entityId — Update member role
// POST   /:smartSpaceId/transfer-ownership — Transfer ownership
// POST   /:smartSpaceId/leave — Leave space
// =============================================================================

import { Router } from "express";
import type { Request, Response } from "express";
import { prisma } from "../lib/db.js";
import {
  requireAnyAuth,
  requireAuthWithMembership,
  isAuthError,
} from "../lib/spaces-auth.js";
import { invalidateSpace } from "../lib/membership-service.js";
import { handleMembershipChanged, reSyncAllHaseefsInSpace } from "../lib/service/index.js";
import { requireRole } from "../lib/role-auth.js";

const router = Router();

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
          select: { id: true, displayName: true, type: true, metadata: true },
        },
      },
    });

    // Enrich human entities with avatarUrl from User table
    const humanEntityIds = memberships
      .filter((m: any) => m.entity?.type === "human")
      .map((m: any) => m.entity.id);

    const avatarMap: Record<string, string> = {};
    if (humanEntityIds.length > 0) {
      const users = await prisma.user.findMany({
        where: { hsafaEntityId: { in: humanEntityIds } },
        select: { hsafaEntityId: true, avatarUrl: true },
      });
      for (const u of users) {
        if (u.hsafaEntityId && u.avatarUrl) {
          avatarMap[u.hsafaEntityId] = u.avatarUrl;
        }
      }
    }

    const enriched = memberships.map((m: any) => {
      // For agents: avatarUrl from entity.metadata; for humans: from User table
      const agentAvatar = (m.entity.metadata as any)?.avatarUrl;
      return {
        ...m,
        entity: {
          id: m.entity.id,
          displayName: m.entity.displayName,
          type: m.entity.type,
          avatarUrl: avatarMap[m.entity.id] || agentAvatar || null,
        },
      };
    });

    res.json({ members: enriched });
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

      // Re-sync all haseefs in this space so their prompts show fresh role info
      reSyncAllHaseefsInSpace(smartSpaceId);

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

      // Re-sync all haseefs in this space so their prompts show fresh ownership
      reSyncAllHaseefsInSpace(smartSpaceId);

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

export default router;
