import { Router } from "express";
import type { Request, Response } from "express";
import { prisma } from "../lib/db.js";
import {
  requireAnyAuth,
  requireSecretKeyAuth,
  isAuthError,
} from "../lib/spaces-auth.js";

const router = Router();

// POST /api/clients — Register a client
router.post("/", async (req: Request, res: Response) => {
  const auth = await requireAnyAuth(req);
  if (isAuthError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    let { entityId, clientKey, clientType, displayName, capabilities } = req.body;

    if (auth.method === "public_key_jwt") {
      entityId = auth.entityId;
    }

    if (!entityId || !clientKey) {
      res.status(400).json({ error: "entityId and clientKey are required" });
      return;
    }

    const client = await prisma.client.upsert({
      where: { clientKey },
      create: {
        entityId,
        clientKey,
        clientType: clientType ?? undefined,
        displayName: displayName ?? undefined,
        capabilities: capabilities ?? {},
        lastSeenAt: new Date(),
      },
      update: {
        lastSeenAt: new Date(),
        ...(clientType !== undefined && { clientType }),
        ...(displayName !== undefined && { displayName }),
        ...(capabilities !== undefined && { capabilities }),
      },
    });

    res.status(201).json({ client });
  } catch (error) {
    console.error("Register client error:", error);
    res.status(500).json({ error: "Failed to register client" });
  }
});

// GET /api/clients — List clients
router.get("/", async (req: Request, res: Response) => {
  const auth = await requireSecretKeyAuth(req);
  if (isAuthError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    const entityId = (req.query.entityId as string | undefined) || undefined;
    const where: Record<string, unknown> = {};
    if (entityId) where.entityId = entityId;

    const clients = await prisma.client.findMany({
      where,
      orderBy: { lastSeenAt: "desc" },
    });

    res.json({ clients });
  } catch (error) {
    console.error("List clients error:", error);
    res.status(500).json({ error: "Failed to list clients" });
  }
});

// DELETE /api/clients/:id — Delete client
router.delete("/:id", async (req: Request, res: Response) => {
  const auth = await requireSecretKeyAuth(req);
  if (isAuthError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    await prisma.client.delete({ where: { id: req.params.id as string } });
    res.json({ success: true });
  } catch (error) {
    console.error("Delete client error:", error);
    res.status(500).json({ error: "Failed to delete client" });
  }
});

export default router;
