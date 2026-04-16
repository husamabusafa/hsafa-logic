import { Router } from "express";
import type { Request, Response } from "express";
import { prisma } from "../lib/db.js";
import { verifyToken } from "../lib/auth.js";
import {
  createInstance,
  deleteInstance,
  updateInstanceConfig,
  isInstanceConnected,
} from "../lib/skills/manager.js";
import { addSkillToHaseef, removeSkillFromHaseef } from "../lib/core-proxy.js";

const router = Router();

// =============================================================================
// JWT auth helper
// =============================================================================

async function requireJwtUser(req: Request): Promise<
  { userId: string; entityId: string } | { status: number; error: string }
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
    select: { id: true, hsafaEntityId: true },
  });
  if (!user || !user.hsafaEntityId) {
    return { status: 404, error: "User not found or no entity" };
  }
  return { userId: user.id, entityId: user.hsafaEntityId };
}

function isJwtError(r: any): r is { status: number; error: string } {
  return "error" in r;
}

// =============================================================================
// GET /api/skills/templates — List all prebuilt skill templates
// =============================================================================

router.get("/templates", async (_req: Request, res: Response) => {
  try {
    const templates = await prisma.skillTemplate.findMany({
      orderBy: { name: "asc" },
    });
    res.json({ templates });
  } catch (error) {
    console.error("List templates error:", error);
    res.status(500).json({ error: "Failed to list templates" });
  }
});

// =============================================================================
// GET /api/skills/templates/:name — Get template details
// =============================================================================

router.get("/templates/:name", async (req: Request, res: Response) => {
  try {
    const template = await prisma.skillTemplate.findUnique({
      where: { name: req.params.name as string },
    });
    if (!template) {
      res.status(404).json({ error: "Template not found" });
      return;
    }
    res.json({ template });
  } catch (error) {
    console.error("Get template error:", error);
    res.status(500).json({ error: "Failed to get template" });
  }
});

// =============================================================================
// GET /api/skills/instances — List user's skill instances
// =============================================================================

router.get("/instances", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    const instances = await prisma.skillInstance.findMany({
      where: { userId: auth.userId },
      include: { template: true },
      orderBy: { createdAt: "desc" },
    });

    res.json({
      instances: instances.map((i) => ({
        ...i,
        connected: isInstanceConnected(i.id),
      })),
    });
  } catch (error) {
    console.error("List instances error:", error);
    res.status(500).json({ error: "Failed to list instances" });
  }
});

// =============================================================================
// POST /api/skills/instances — Create a new skill instance from a template
// =============================================================================

router.post("/instances", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    const { name, displayName, templateName, config } = req.body;

    if (!name || !templateName) {
      res.status(400).json({ error: "name and templateName are required" });
      return;
    }

    // Validate name format (lowercase, underscores, no spaces)
    if (!/^[a-z][a-z0-9_]{1,48}$/.test(name)) {
      res.status(400).json({
        error: "name must be lowercase, start with a letter, use only a-z, 0-9, _ (2-49 chars)",
      });
      return;
    }

    const result = await createInstance({
      name,
      displayName: displayName || name,
      templateName,
      config: config || {},
      userId: auth.userId,
    });

    res.status(201).json(result);
  } catch (error: any) {
    if (error?.code === "P2002") {
      res.status(409).json({ error: "An instance with this name already exists" });
      return;
    }
    console.error("Create instance error:", error);
    res.status(500).json({ error: error.message || "Failed to create instance" });
  }
});

// =============================================================================
// PATCH /api/skills/instances/:id — Update instance config
// =============================================================================

router.patch("/instances/:id", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    const instance = await prisma.skillInstance.findUnique({
      where: { id: req.params.id as string },
    });
    if (!instance || instance.userId !== auth.userId) {
      res.status(404).json({ error: "Instance not found" });
      return;
    }

    const { config } = req.body;
    if (!config) {
      res.status(400).json({ error: "config is required" });
      return;
    }

    const result = await updateInstanceConfig(instance.id, config);
    res.json(result);
  } catch (error: any) {
    console.error("Update instance error:", error);
    res.status(500).json({ error: error.message || "Failed to update instance" });
  }
});

// =============================================================================
// DELETE /api/skills/instances/:id — Delete a skill instance
// =============================================================================

router.delete("/instances/:id", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    const instance = await prisma.skillInstance.findUnique({
      where: { id: req.params.id as string },
    });
    if (!instance || instance.userId !== auth.userId) {
      res.status(404).json({ error: "Instance not found" });
      return;
    }

    await deleteInstance(instance.id);
    res.json({ success: true });
  } catch (error) {
    console.error("Delete instance error:", error);
    res.status(500).json({ error: "Failed to delete instance" });
  }
});

// =============================================================================
// POST /api/skills/instances/:id/attach — Attach instance to a haseef
// =============================================================================

router.post("/instances/:id/attach", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    const { haseefId } = req.body;
    if (!haseefId) {
      res.status(400).json({ error: "haseefId is required" });
      return;
    }

    // Verify instance ownership
    const instance = await prisma.skillInstance.findUnique({
      where: { id: req.params.id as string },
    });
    if (!instance || instance.userId !== auth.userId) {
      res.status(404).json({ error: "Instance not found" });
      return;
    }

    // Verify haseef ownership
    const ownership = await prisma.haseefOwnership.findFirst({
      where: { userId: auth.userId, haseefId },
    });
    if (!ownership) {
      res.status(404).json({ error: "Haseef not found or not owned by you" });
      return;
    }

    // Create junction
    const haseefSkill = await prisma.haseefSkill.create({
      data: { haseefId, instanceId: instance.id },
      include: { instance: { include: { template: true } } },
    });

    // Sync: add instance skill name to haseef's skills[] in Core
    try {
      await addSkillToHaseef(haseefId, instance.name);
    } catch (err) {
      console.error(`[skills] Failed to sync skill "${instance.name}" to Core for haseef ${haseefId}:`, err);
    }

    res.status(201).json({ haseefSkill });
  } catch (error: any) {
    if (error?.code === "P2002") {
      res.status(409).json({ error: "Instance already attached to this haseef" });
      return;
    }
    console.error("Attach instance error:", error);
    res.status(500).json({ error: "Failed to attach instance" });
  }
});

// =============================================================================
// DELETE /api/skills/instances/:id/detach — Detach instance from a haseef
// =============================================================================

router.delete("/instances/:id/detach", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    const { haseefId } = req.body;
    if (!haseefId) {
      res.status(400).json({ error: "haseefId is required" });
      return;
    }

    const instance = await prisma.skillInstance.findUnique({
      where: { id: req.params.id as string },
    });
    if (!instance || instance.userId !== auth.userId) {
      res.status(404).json({ error: "Instance not found" });
      return;
    }

    await prisma.haseefSkill.deleteMany({
      where: { haseefId, instanceId: instance.id },
    });

    // Sync: remove instance skill name from haseef's skills[] in Core
    try {
      await removeSkillFromHaseef(haseefId, instance.name);
    } catch (err) {
      console.error(`[skills] Failed to remove skill "${instance.name}" from Core for haseef ${haseefId}:`, err);
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Detach instance error:", error);
    res.status(500).json({ error: "Failed to detach instance" });
  }
});

// =============================================================================
// GET /api/skills/haseefs/:haseefId — List skill instances attached to a haseef
// =============================================================================

router.get("/haseefs/:haseefId", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    const haseefId = req.params.haseefId as string;

    const ownership = await prisma.haseefOwnership.findFirst({
      where: { userId: auth.userId, haseefId },
    });
    if (!ownership) {
      res.status(404).json({ error: "Haseef not found or not owned by you" });
      return;
    }

    const haseefSkills = await prisma.haseefSkill.findMany({
      where: { haseefId },
      include: { instance: { include: { template: true } } },
      orderBy: { createdAt: "desc" },
    });

    res.json({
      skills: haseefSkills.map((hs) => ({
        ...hs,
        connected: isInstanceConnected(hs.instanceId),
      })),
    });
  } catch (error) {
    console.error("List haseef skills error:", error);
    res.status(500).json({ error: "Failed to list haseef skills" });
  }
});

export default router;
