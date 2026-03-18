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
                  entity: { select: { id: true, displayName: true, type: true } },
                },
              },
            },
          },
        },
      });
      spaces = memberships.map((m: any) => {
        const s = m.smartSpace;
        const members = (s.memberships || []).map((mb: any) => ({
          entityId: mb.entityId,
          displayName: mb.entity?.displayName || null,
          type: mb.entity?.type || "human",
          role: mb.role,
        }));
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

export default router;
