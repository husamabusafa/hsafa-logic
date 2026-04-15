import { Router } from "express";
import type { Request, Response } from "express";
import { prisma } from "../lib/db.js";
import { verifyToken } from "../lib/auth.js";

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
// GET /api/skills — List all available skills
// =============================================================================

router.get("/", async (_req: Request, res: Response) => {
  try {
    const skills = await prisma.skill.findMany({
      orderBy: [{ isBuiltin: "desc" }, { name: "asc" }],
    });

    res.json({ skills });
  } catch (error) {
    console.error("List skills error:", error);
    res.status(500).json({ error: "Failed to list skills" });
  }
});

// =============================================================================
// GET /api/skills/:id — Get skill details
// =============================================================================

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const skill = await prisma.skill.findUnique({
      where: { id },
    });

    if (!skill) {
      res.status(404).json({ error: "Skill not found" });
      return;
    }

    res.json({ skill });
  } catch (error) {
    console.error("Get skill error:", error);
    res.status(500).json({ error: "Failed to get skill" });
  }
});

// =============================================================================
// POST /api/skills — Create a new custom skill (admin only in future)
// =============================================================================

router.post("/", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    const { name, description, tools, config } = req.body;

    if (!name || !tools || !Array.isArray(tools)) {
      res.status(400).json({ error: "name and tools array are required" });
      return;
    }

    const skill = await prisma.skill.create({
      data: {
        name,
        description: description || null,
        tools: tools as any,
        config: config || null,
        isBuiltin: false,
      },
    });

    res.status(201).json({ skill });
  } catch (error) {
    console.error("Create skill error:", error);
    res.status(500).json({ error: "Failed to create skill" });
  }
});

// =============================================================================
// GET /api/haseefs/:haseefId/skills — List skills attached to a haseef
// =============================================================================

router.get("/haseefs/:haseefId/skills", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    const haseefId = req.params.haseefId as string;

    // Verify ownership
    const ownership = await prisma.haseefOwnership.findFirst({
      where: { userId: auth.userId, haseefId },
    });
    if (!ownership) {
      res.status(404).json({ error: "Haseef not found or not owned by you" });
      return;
    }

    const haseefSkills = await prisma.haseefSkill.findMany({
      where: { haseefId },
      include: { skill: true },
      orderBy: { createdAt: "desc" },
    });

    res.json({ skills: haseefSkills });
  } catch (error) {
    console.error("List haseef skills error:", error);
    res.status(500).json({ error: "Failed to list haseef skills" });
  }
});

// =============================================================================
// POST /api/haseefs/:haseefId/skills — Attach a skill to haseef
// =============================================================================

router.post("/haseefs/:haseefId/skills", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    const haseefId = req.params.haseefId as string;
    const { skillId, config } = req.body;

    if (!skillId) {
      res.status(400).json({ error: "skillId is required" });
      return;
    }

    // Verify ownership
    const ownership = await prisma.haseefOwnership.findFirst({
      where: { userId: auth.userId, haseefId },
    });
    if (!ownership) {
      res.status(404).json({ error: "Haseef not found or not owned by you" });
      return;
    }

    // Verify skill exists
    const skill = await prisma.skill.findUnique({
      where: { id: skillId },
    });
    if (!skill) {
      res.status(404).json({ error: "Skill not found" });
      return;
    }

    // Create attachment
    const haseefSkill = await prisma.haseefSkill.create({
      data: {
        haseefId,
        skillId,
        config: config || null,
        isActive: true,
      },
      include: { skill: true },
    });

    res.status(201).json({ haseefSkill });
  } catch (error: any) {
    if (error.code === "P2002") {
      res.status(409).json({ error: "Skill already attached to this haseef" });
      return;
    }
    console.error("Attach skill error:", error);
    res.status(500).json({ error: "Failed to attach skill" });
  }
});

// =============================================================================
// DELETE /api/haseefs/:haseefId/skills/:skillId — Detach a skill
// =============================================================================

router.delete("/haseefs/:haseefId/skills/:skillId", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    const haseefId = req.params.haseefId as string;
    const skillId = req.params.skillId as string;

    // Verify ownership
    const ownership = await prisma.haseefOwnership.findFirst({
      where: { userId: auth.userId, haseefId },
    });
    if (!ownership) {
      res.status(404).json({ error: "Haseef not found or not owned by you" });
      return;
    }

    await prisma.haseefSkill.deleteMany({
      where: { haseefId, skillId },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Detach skill error:", error);
    res.status(500).json({ error: "Failed to detach skill" });
  }
});

// =============================================================================
// PATCH /api/haseefs/:haseefId/skills/:skillId — Update skill config/active state
// =============================================================================

router.patch("/haseefs/:haseefId/skills/:skillId", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    const haseefId = req.params.haseefId as string;
    const skillId = req.params.skillId as string;
    const { config, isActive } = req.body;

    // Verify ownership
    const ownership = await prisma.haseefOwnership.findFirst({
      where: { userId: auth.userId, haseefId },
    });
    if (!ownership) {
      res.status(404).json({ error: "Haseef not found or not owned by you" });
      return;
    }

    const updateData: Record<string, any> = {};
    if (config !== undefined) updateData.config = config;
    if (isActive !== undefined) updateData.isActive = isActive;
    updateData.updatedAt = new Date();

    const haseefSkill = await prisma.haseefSkill.update({
      where: { haseefId_skillId: { haseefId, skillId } },
      data: updateData,
      include: { skill: true },
    });

    res.json({ haseefSkill });
  } catch (error) {
    console.error("Update haseef skill error:", error);
    res.status(500).json({ error: "Failed to update haseef skill" });
  }
});

export default router;
