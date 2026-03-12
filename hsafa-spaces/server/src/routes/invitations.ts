import { Router } from "express";
import type { Request, Response } from "express";
import { prisma } from "../lib/db.js";
import {
  requireAnyAuth,
  requireAuthWithMembership,
  isAuthError,
} from "../lib/spaces-auth.js";
import { requireRole } from "../lib/role-auth.js";
import { verifyToken } from "../lib/auth.js";
import { emitSmartSpaceEvent } from "../lib/smartspace-events.js";
import { redis } from "../lib/redis.js";

const router = Router();

// =============================================================================
// POST /api/smart-spaces/:smartSpaceId/invitations — Create invitation (admin+)
// =============================================================================
router.post(
  "/smart-spaces/:smartSpaceId/invitations",
  async (req: Request, res: Response) => {
    const smartSpaceId = req.params.smartSpaceId as string;
    const auth = await requireAuthWithMembership(req, smartSpaceId);
    if (isAuthError(auth)) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    try {
      // Role check: admin+ required (secret key bypasses)
      let inviterId: string | undefined;
      if (auth.method !== "secret_key") {
        if (!auth.entityId) {
          res.status(400).json({ error: "No entity resolved" });
          return;
        }
        await requireRole(smartSpaceId, auth.entityId, "admin");
        inviterId = auth.entityId;
      } else {
        inviterId = auth.entityId || req.body.inviterId;
      }

      if (!inviterId) {
        res.status(400).json({ error: "inviterId is required" });
        return;
      }

      const { email, role, message } = req.body;
      if (!email) {
        res.status(400).json({ error: "email is required" });
        return;
      }

      const inviteRole = role || "member";
      if (!["member", "admin"].includes(inviteRole)) {
        res.status(400).json({ error: "role must be 'member' or 'admin'" });
        return;
      }

      // Check if invitee is already a member (by email → entity lookup)
      const existingEntity = await prisma.entity.findUnique({
        where: { externalId: email },
        select: { id: true },
      });
      if (existingEntity) {
        const existingMembership = await prisma.smartSpaceMembership.findUnique({
          where: {
            smartSpaceId_entityId: {
              smartSpaceId,
              entityId: existingEntity.id,
            },
          },
        });
        if (existingMembership) {
          res.status(409).json({ error: "This person is already a member of the space" });
          return;
        }
      }

      // Upsert: if declined/expired/revoked, update back to pending
      const existing = await prisma.invitation.findUnique({
        where: { smartSpaceId_inviteeEmail: { smartSpaceId, inviteeEmail: email } },
      });

      let invitation;
      if (existing) {
        if (existing.status === "pending") {
          res.status(409).json({ error: "Invitation already pending for this email" });
          return;
        }
        if (existing.status === "accepted") {
          res.status(409).json({ error: "Invitation already accepted" });
          return;
        }
        // Re-invite: update declined/expired/revoked → pending
        invitation = await prisma.invitation.update({
          where: { id: existing.id },
          data: {
            status: "pending",
            role: inviteRole,
            inviterId,
            message: message || null,
          },
        });
      } else {
        invitation = await prisma.invitation.create({
          data: {
            smartSpaceId,
            inviterId,
            inviteeEmail: email,
            inviteeId: existingEntity?.id || null,
            role: inviteRole,
            status: "pending",
            message: message || null,
          },
        });
      }

      // Emit SSE: invitation.created to the invitee's entity channel (if they exist)
      if (existingEntity) {
        const space = await prisma.smartSpace.findUnique({
          where: { id: smartSpaceId },
          select: { name: true },
        });
        const inviter = await prisma.entity.findUnique({
          where: { id: inviterId },
          select: { displayName: true },
        });
        await emitEntityEvent(existingEntity.id, {
          type: "invitation.created",
          invitationId: invitation.id,
          smartSpaceId,
          spaceName: space?.name,
          inviterName: inviter?.displayName,
          role: inviteRole,
          message: message || null,
        });
      }

      res.status(201).json({ invitation });
    } catch (error: any) {
      if (error?.status) {
        res.status(error.status).json({ error: error.error });
        return;
      }
      console.error("Create invitation error:", error);
      res.status(500).json({ error: "Failed to create invitation" });
    }
  }
);

// =============================================================================
// GET /api/smart-spaces/:smartSpaceId/invitations — List space invitations (admin+)
// =============================================================================
router.get(
  "/smart-spaces/:smartSpaceId/invitations",
  async (req: Request, res: Response) => {
    const smartSpaceId = req.params.smartSpaceId as string;
    const auth = await requireAuthWithMembership(req, smartSpaceId);
    if (isAuthError(auth)) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    try {
      if (auth.method !== "secret_key" && auth.entityId) {
        await requireRole(smartSpaceId, auth.entityId, "admin");
      }

      const status = req.query.status as string | undefined;
      const where: any = { smartSpaceId };
      if (status) where.status = status;

      const invitations = await prisma.invitation.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: {
          inviter: { select: { id: true, displayName: true } },
        },
      });

      res.json({ invitations });
    } catch (error: any) {
      if (error?.status) {
        res.status(error.status).json({ error: error.error });
        return;
      }
      console.error("List invitations error:", error);
      res.status(500).json({ error: "Failed to list invitations" });
    }
  }
);

// =============================================================================
// GET /api/invitations — List my pending invitations (JWT auth)
// =============================================================================
router.get("/invitations", async (req: Request, res: Response) => {
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

    // Get user email to find invitations
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { email: true },
    });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const status = (req.query.status as string) || "pending";
    const invitations = await prisma.invitation.findMany({
      where: { inviteeEmail: user.email, status },
      orderBy: { createdAt: "desc" },
      include: {
        smartSpace: { select: { id: true, name: true } },
        inviter: { select: { id: true, displayName: true } },
      },
    });

    res.json({ invitations });
  } catch (error) {
    console.error("List my invitations error:", error);
    res.status(500).json({ error: "Failed to list invitations" });
  }
});

// =============================================================================
// POST /api/invitations/:id/accept — Accept invitation (JWT auth)
// =============================================================================
router.post("/invitations/:id/accept", async (req: Request, res: Response) => {
  try {
    const invitationId = req.params.id as string;

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

    // Verify this invitation belongs to the user
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { email: true, hsafaEntityId: true },
    });
    if (!user || !user.hsafaEntityId) {
      res.status(404).json({ error: "User not found or no entity" });
      return;
    }

    const invitation = await prisma.invitation.findUnique({
      where: { id: invitationId },
    });
    if (!invitation) {
      res.status(404).json({ error: "Invitation not found" });
      return;
    }

    if (invitation.inviteeEmail !== user.email) {
      res.status(403).json({ error: "This invitation is not for you" });
      return;
    }

    if (invitation.status !== "pending") {
      res.status(400).json({ error: `Invitation is ${invitation.status}, cannot accept` });
      return;
    }

    // Check expiry
    if (invitation.expiresAt && invitation.expiresAt < new Date()) {
      await prisma.invitation.update({
        where: { id: invitationId },
        data: { status: "expired" },
      });
      res.status(400).json({ error: "Invitation has expired" });
      return;
    }

    // Transaction: update invitation + create membership
    await prisma.$transaction([
      prisma.invitation.update({
        where: { id: invitationId },
        data: {
          status: "accepted",
          inviteeId: user.hsafaEntityId,
        },
      }),
      prisma.smartSpaceMembership.create({
        data: {
          smartSpaceId: invitation.smartSpaceId,
          entityId: user.hsafaEntityId,
          role: invitation.role,
        },
      }),
    ]);

    // Emit SSE: invitation.accepted to space channel + member.joined
    const entity = await prisma.entity.findUnique({
      where: { id: user.hsafaEntityId },
      select: { displayName: true, type: true },
    });

    await emitSmartSpaceEvent(invitation.smartSpaceId, {
      type: "invitation.accepted",
      invitationId,
      entityId: user.hsafaEntityId,
      entityName: entity?.displayName,
    });

    await emitSmartSpaceEvent(invitation.smartSpaceId, {
      type: "member.joined",
      entityId: user.hsafaEntityId,
      entityName: entity?.displayName,
      entityType: entity?.type,
      role: invitation.role,
    });

    res.json({ success: true, smartSpaceId: invitation.smartSpaceId });
  } catch (error) {
    console.error("Accept invitation error:", error);
    res.status(500).json({ error: "Failed to accept invitation" });
  }
});

// =============================================================================
// POST /api/invitations/:id/decline — Decline invitation (JWT auth)
// =============================================================================
router.post("/invitations/:id/decline", async (req: Request, res: Response) => {
  try {
    const invitationId = req.params.id as string;

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

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { email: true },
    });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const invitation = await prisma.invitation.findUnique({
      where: { id: invitationId },
    });
    if (!invitation) {
      res.status(404).json({ error: "Invitation not found" });
      return;
    }

    if (invitation.inviteeEmail !== user.email) {
      res.status(403).json({ error: "This invitation is not for you" });
      return;
    }

    if (invitation.status !== "pending") {
      res.status(400).json({ error: `Invitation is ${invitation.status}, cannot decline` });
      return;
    }

    await prisma.invitation.update({
      where: { id: invitationId },
      data: { status: "declined" },
    });

    // Emit SSE: invitation.declined to space channel
    await emitSmartSpaceEvent(invitation.smartSpaceId, {
      type: "invitation.declined",
      invitationId,
      inviteeEmail: invitation.inviteeEmail,
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Decline invitation error:", error);
    res.status(500).json({ error: "Failed to decline invitation" });
  }
});

// =============================================================================
// DELETE /api/invitations/:id — Revoke invitation (inviter or admin)
// =============================================================================
router.delete("/invitations/:id", async (req: Request, res: Response) => {
  const invitationId = req.params.id as string;
  const auth = await requireAnyAuth(req);
  if (isAuthError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    const invitation = await prisma.invitation.findUnique({
      where: { id: invitationId },
    });
    if (!invitation) {
      res.status(404).json({ error: "Invitation not found" });
      return;
    }

    if (invitation.status !== "pending") {
      res.status(400).json({ error: `Invitation is ${invitation.status}, cannot revoke` });
      return;
    }

    // Must be the inviter or admin+ in the space (secret key bypasses)
    if (auth.method !== "secret_key") {
      if (!auth.entityId) {
        res.status(400).json({ error: "No entity resolved" });
        return;
      }
      const isInviter = auth.entityId === invitation.inviterId;
      if (!isInviter) {
        // Check if they're admin+ in the space
        try {
          await requireRole(invitation.smartSpaceId, auth.entityId, "admin");
        } catch {
          res.status(403).json({ error: "Only the inviter or a space admin can revoke" });
          return;
        }
      }
    }

    await prisma.invitation.update({
      where: { id: invitationId },
      data: { status: "revoked" },
    });

    res.json({ success: true });
  } catch (error: any) {
    if (error?.status) {
      res.status(error.status).json({ error: error.error });
      return;
    }
    console.error("Revoke invitation error:", error);
    res.status(500).json({ error: "Failed to revoke invitation" });
  }
});

// =============================================================================
// Helper: Emit event to an entity's personal channel
// =============================================================================
async function emitEntityEvent(
  entityId: string,
  event: Record<string, unknown>
): Promise<void> {
  const channel = `entity:${entityId}`;
  await redis.publish(channel, JSON.stringify(event));
}

export default router;
