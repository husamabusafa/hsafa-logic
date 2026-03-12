import { Router } from "express";
import type { Request, Response } from "express";
import crypto from "crypto";
import { prisma } from "../lib/db.js";
import {
  requireSecretKeyAuth,
  requireAnyAuth,
  isAuthError,
} from "../lib/spaces-auth.js";

const router = Router();

// POST /api/entities — Create entity
router.post("/", async (req: Request, res: Response) => {
  const auth = await requireSecretKeyAuth(req);
  if (isAuthError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    const { type, externalId, displayName, metadata } = req.body;

    if (!type || !["human", "agent"].includes(type)) {
      res.status(400).json({ error: "type must be 'human' or 'agent'" });
      return;
    }

    // Upsert by externalId if provided
    if (externalId) {
      const existing = await prisma.entity.findUnique({
        where: { externalId },
      });
      if (existing) {
        const updated = await prisma.entity.update({
          where: { externalId },
          data: {
            ...(displayName !== undefined && { displayName }),
            ...(metadata !== undefined && { metadata }),
          },
        });
        res.json({ entity: updated });
        return;
      }
    }

    const entity = await prisma.entity.create({
      data: {
        id: crypto.randomUUID(),
        type,
        externalId: externalId ?? undefined,
        displayName: displayName ?? undefined,
        metadata: metadata ?? undefined,
      },
    });

    res.status(201).json({ entity });
  } catch (error) {
    console.error("Create entity error:", error);
    res.status(500).json({ error: "Failed to create entity" });
  }
});

// GET /api/entities — List entities
router.get("/", async (req: Request, res: Response) => {
  const auth = await requireAnyAuth(req);
  if (isAuthError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    const type = (req.query.type as string | undefined) || undefined;
    const where: Record<string, unknown> = {};
    if (type) where.type = type;

    const entities = await prisma.entity.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    res.json({ entities });
  } catch (error) {
    console.error("List entities error:", error);
    res.status(500).json({ error: "Failed to list entities" });
  }
});

// GET /api/entities/:id — Get entity
router.get("/:id", async (req: Request, res: Response) => {
  const auth = await requireAnyAuth(req);
  if (isAuthError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    const entity = await prisma.entity.findUnique({
      where: { id: req.params.id as string },
    });
    if (!entity) {
      res.status(404).json({ error: "Entity not found" });
      return;
    }
    res.json({ entity });
  } catch (error) {
    console.error("Get entity error:", error);
    res.status(500).json({ error: "Failed to get entity" });
  }
});

export default router;
