// =============================================================================
// Smart Spaces — Routes
//
// Space CRUD, contacts, create-for-user.
// Sub-routers handle messages, members, and SSE stream.
// =============================================================================

import { Router } from "express";
import type { Request, Response } from "express";
import { prisma } from "../lib/db.js";
import {
  requireSecretKeyAuth,
  requireAnyAuth,
  requireAuthWithMembership,
  isAuthError,
} from "../lib/spaces-auth.js";
import { invalidateSpace } from "../lib/membership-service.js";
import { handleMembershipChanged, reSyncAllHaseefsInSpace } from "../lib/service/index.js";
import { verifyToken } from "../lib/auth.js";
import { requireRole } from "../lib/role-auth.js";
import spaceMessagesRouter from "./space-messages.js";
import spaceMembersRouter from "./space-members.js";
import spaceStreamRouter from "./space-stream.js";

const router = Router();

// Mount sub-routers
router.use("/", spaceMessagesRouter);
router.use("/", spaceMembersRouter);
router.use("/", spaceStreamRouter);

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
        include: {
          smartSpace: {
            include: {
              memberships: {
                select: {
                  entityId: true,
                  role: true,
                  entity: { select: { id: true, displayName: true, type: true, metadata: true } },
                },
              },
            },
          },
        },
      });

      // Collect all human entity IDs to look up avatarUrl from User table
      const allEntityIds: string[] = [];
      for (const m of memberships as any[]) {
        for (const mb of m.smartSpace.memberships || []) {
          if (mb.entity?.type === "human") allEntityIds.push(mb.entity.id);
        }
      }
      const avatarMap: Record<string, string> = {};
      if (allEntityIds.length > 0) {
        const users = await prisma.user.findMany({
          where: { hsafaEntityId: { in: [...new Set(allEntityIds)] } },
          select: { hsafaEntityId: true, avatarUrl: true },
        });
        for (const u of users) {
          if (u.hsafaEntityId && u.avatarUrl) avatarMap[u.hsafaEntityId] = u.avatarUrl;
        }
      }

      spaces = memberships.map((m: any) => {
        const s = m.smartSpace;
        const members = (s.memberships || []).map((mb: any) => {
          const agentAvatar = (mb.entity?.metadata as any)?.avatarUrl;
          return {
            entityId: mb.entityId,
            displayName: mb.entity?.displayName || null,
            type: mb.entity?.type || "human",
            role: mb.role,
            avatarUrl: avatarMap[mb.entity?.id] || agentAvatar || null,
          };
        });
        return { ...s, memberships: undefined, members };
      });
    } else {
      const rawSpaces = await prisma.smartSpace.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          memberships: {
            select: {
              entityId: true,
              role: true,
              entity: { select: { id: true, displayName: true, type: true } },
            },
          },
        },
      });
      spaces = rawSpaces.map((s: any) => {
        const members = (s.memberships || []).map((mb: any) => ({
          entityId: mb.entityId,
          displayName: mb.entity?.displayName || null,
          type: mb.entity?.type || "human",
          role: mb.role,
        }));
        return { ...s, memberships: undefined, members };
      });
    }

    res.json({ smartSpaces: spaces });
  } catch (error) {
    console.error("List spaces error:", error);
    res.status(500).json({ error: "Failed to list spaces" });
  }
});

// =============================================================================
// GET /api/smart-spaces/contacts — List known contacts (humans sharing spaces)
// =============================================================================
router.get("/contacts", async (req: Request, res: Response) => {
  const auth = await requireAnyAuth(req);
  if (isAuthError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    const myEntityId = auth.entityId;
    if (!myEntityId) {
      res.json({ contacts: [] });
      return;
    }

    // Find all spaces I belong to
    const myMemberships = await prisma.smartSpaceMembership.findMany({
      where: { entityId: myEntityId },
      select: { smartSpaceId: true },
    });
    const mySpaceIds = myMemberships.map((m: any) => m.smartSpaceId);

    if (mySpaceIds.length === 0) {
      res.json({ contacts: [] });
      return;
    }

    // Find all human entities in those spaces (excluding myself)
    const coMembers = await prisma.smartSpaceMembership.findMany({
      where: {
        smartSpaceId: { in: mySpaceIds },
        entityId: { not: myEntityId },
        entity: { type: "human" },
      },
      include: {
        entity: {
          select: { id: true, displayName: true, type: true },
        },
      },
      distinct: ["entityId"],
    });

    // Enrich with avatarUrl from User table
    const entityIds = coMembers.map((m: any) => m.entity.id);
    const avatarMap: Record<string, string> = {};
    if (entityIds.length > 0) {
      const users = await prisma.user.findMany({
        where: { hsafaEntityId: { in: entityIds } },
        select: { hsafaEntityId: true, avatarUrl: true, email: true },
      });
      for (const u of users) {
        if (u.hsafaEntityId) {
          if (u.avatarUrl) avatarMap[u.hsafaEntityId] = u.avatarUrl;
        }
      }
    }

    const contacts = coMembers.map((m: any) => ({
      entityId: m.entity.id,
      displayName: m.entity.displayName,
      type: m.entity.type,
      avatarUrl: avatarMap[m.entity.id] || null,
    }));

    res.json({ contacts });
  } catch (error) {
    console.error("List contacts error:", error);
    res.status(500).json({ error: "Failed to list contacts" });
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

    const { name, description, memberEntityIds, isGroup } = req.body as {
      name?: string;
      description?: string;
      memberEntityIds?: string[];
      isGroup?: boolean;
    };

    // Validate all members share a base with the creator
    if (memberEntityIds && memberEntityIds.length > 0) {
      const uniqueIds = [...new Set(memberEntityIds)].filter(
        (id) => id !== payload.entityId,
      );

      if (uniqueIds.length > 0) {
        // Get creator's bases
        const creatorBases = await prisma.baseMember.findMany({
          where: { entityId: payload.entityId },
          select: { baseId: true },
        });
        const creatorBaseIds = creatorBases.map((b) => b.baseId);

        if (creatorBaseIds.length > 0) {
          // Check each member shares at least one base
          for (const memberId of uniqueIds) {
            const shared = await prisma.baseMember.findFirst({
              where: { entityId: memberId, baseId: { in: creatorBaseIds } },
            });
            if (!shared) {
              res.status(403).json({
                error: `Cannot add entity ${memberId} — they are not in any of your bases`,
              });
              return;
            }
          }
        }
      }
    }

    // Use transaction to create space + all memberships atomically
    const smartSpace = await prisma.$transaction(async (tx) => {
      const space = await tx.smartSpace.create({
        data: {
          name: name || `Chat ${new Date().toLocaleTimeString()}`,
          description: description || null,
          metadata: isGroup === false ? { isDirect: true } : undefined,
        },
      });

      // Creator is always owner
      await tx.smartSpaceMembership.create({
        data: {
          smartSpaceId: space.id,
          entityId: payload.entityId,
          role: "owner",
        },
      });

      // Add additional members (skip if same as creator)
      if (memberEntityIds && memberEntityIds.length > 0) {
        const uniqueIds = [...new Set(memberEntityIds)].filter(
          (id) => id !== payload.entityId,
        );
        if (uniqueIds.length > 0) {
          await tx.smartSpaceMembership.createMany({
            data: uniqueIds.map((entityId) => ({
              smartSpaceId: space.id,
              entityId,
              role: "member",
            })),
          });
        }
      }

      return space;
    });

    // Notify new members about membership change (outside transaction)
    if (memberEntityIds && memberEntityIds.length > 0) {
      const uniqueIds = [...new Set(memberEntityIds)].filter(
        (id) => id !== payload.entityId,
      );
      for (const entityId of uniqueIds) {
        invalidateSpace(smartSpace.id);
        handleMembershipChanged(entityId, smartSpace.id, "added");
      }
    }

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
      include: {
        memberships: {
          select: {
            entityId: true,
            role: true,
            entity: { select: { id: true, displayName: true, type: true } },
          },
        },
      },
    });
    if (!space) {
      res.status(404).json({ error: "Space not found" });
      return;
    }

    // Format members like the list endpoint
    const members = (space.memberships || []).map((mb: any) => ({
      entityId: mb.entityId,
      displayName: mb.entity?.displayName || null,
      type: mb.entity?.type || "human",
      role: mb.role,
    }));

    res.json({ smartSpace: { ...space, memberships: undefined, members } });
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

    // Re-sync all haseefs in this space so their prompts show fresh metadata
    reSyncAllHaseefsInSpace(smartSpaceId);

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

// ── Invite code helper ──────────────────────────────────────────────────────

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// =============================================================================
// POST /api/smart-spaces/:smartSpaceId/regenerate-code — Generate/regenerate invite code (admin+)
// =============================================================================
router.post("/:smartSpaceId/regenerate-code", async (req: Request, res: Response) => {
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

    const newCode = generateInviteCode();
    const space = await prisma.smartSpace.update({
      where: { id: smartSpaceId },
      data: { inviteCode: newCode, inviteLinkActive: true },
    });

    res.json({ inviteCode: space.inviteCode, inviteLinkActive: space.inviteLinkActive });
  } catch (error: any) {
    if (error?.status) {
      res.status(error.status).json({ error: error.error });
      return;
    }
    console.error("Regenerate space invite code error:", error);
    res.status(500).json({ error: "Failed to regenerate invite code" });
  }
});

// =============================================================================
// PATCH /api/smart-spaces/:smartSpaceId/invite-link — Toggle invite link active (admin+)
// =============================================================================
router.patch("/:smartSpaceId/invite-link", async (req: Request, res: Response) => {
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

    const { active } = req.body;
    if (typeof active !== "boolean") {
      res.status(400).json({ error: "active (boolean) is required" });
      return;
    }

    const space = await prisma.smartSpace.update({
      where: { id: smartSpaceId },
      data: { inviteLinkActive: active },
    });

    res.json({ inviteLinkActive: space.inviteLinkActive });
  } catch (error: any) {
    if (error?.status) {
      res.status(error.status).json({ error: error.error });
      return;
    }
    console.error("Toggle space invite link error:", error);
    res.status(500).json({ error: "Failed to toggle invite link" });
  }
});

// =============================================================================
// GET /api/smart-spaces/resolve/:code — Resolve space invite code (public)
// =============================================================================
router.get("/resolve/:code", async (req: Request, res: Response) => {
  try {
    const code = (req.params.code as string).toUpperCase().trim();
    const space = await prisma.smartSpace.findUnique({
      where: { inviteCode: code },
      select: {
        id: true,
        name: true,
        inviteLinkActive: true,
        _count: { select: { memberships: true } },
      },
    });

    if (!space || !space.inviteLinkActive) {
      res.status(404).json({ error: "Invalid or inactive invite link" });
      return;
    }

    res.json({
      space: {
        id: space.id,
        name: space.name,
        memberCount: space._count.memberships,
      },
    });
  } catch (error) {
    console.error("Resolve space invite code error:", error);
    res.status(500).json({ error: "Failed to resolve invite code" });
  }
});

// =============================================================================
// POST /api/smart-spaces/join — Join space by invite code (JWT)
// =============================================================================
router.post("/join", async (req: Request, res: Response) => {
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

    const { code } = req.body;
    if (!code || typeof code !== "string") {
      res.status(400).json({ error: "code is required" });
      return;
    }

    const space = await prisma.smartSpace.findUnique({
      where: { inviteCode: code.toUpperCase().trim() },
    });
    if (!space) {
      res.status(404).json({ error: "Invalid invite code" });
      return;
    }
    if (!space.inviteLinkActive) {
      res.status(403).json({ error: "This invite link is no longer active" });
      return;
    }

    // Check if already a member
    const existing = await prisma.smartSpaceMembership.findUnique({
      where: { smartSpaceId_entityId: { smartSpaceId: space.id, entityId: payload.entityId } },
    });
    if (existing) {
      res.status(409).json({ error: "Already a member of this space", spaceId: space.id });
      return;
    }

    await prisma.smartSpaceMembership.create({
      data: {
        smartSpaceId: space.id,
        entityId: payload.entityId,
        role: "member",
      },
    });

    // Notify haseefs about new member
    invalidateSpace(space.id);
    handleMembershipChanged(payload.entityId, space.id, "added");

    res.json({
      space: {
        id: space.id,
        name: space.name,
      },
    });
  } catch (error) {
    console.error("Join space error:", error);
    res.status(500).json({ error: "Failed to join space" });
  }
});

export default router;
