// =============================================================================
// Scopes Routes — Scope-as-Plugin management API
//
// Templates: browse/search available scope templates
// Instances: create, update, delete scope instances from templates
// Haseef attachment: attach/detach scope instances to haseefs
// Connection status: query Core for live scope connection status
// =============================================================================

import { Router } from "express";
import type { Request, Response } from "express";
import { prisma } from "../lib/db.js";
import { verifyToken } from "../lib/auth.js";
import { encrypt, decrypt } from "../lib/encryption.js";

const router = Router();

// ── JWT auth helper ──────────────────────────────────────────────────────────

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
// TEMPLATES
// =============================================================================

// GET /api/scopes/templates — List all published templates (+ user's own drafts)
router.get("/templates", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) { res.status(auth.status).json({ error: auth.error }); return; }

  try {
    const templates = await prisma.scopeTemplate.findMany({
      where: {
        OR: [
          { published: true },
          { authorId: auth.userId },
        ],
      },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        icon: true,
        category: true,
        configSchema: true,
        requiredProfileFields: true,
        tools: true,
        instructions: true,
        published: true,
        createdAt: true,
        _count: { select: { instances: true } },
      },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });

    res.json({ templates });
  } catch (error) {
    console.error("List templates error:", error);
    res.status(500).json({ error: "Failed to list templates" });
  }
});

// GET /api/scopes/templates/:id — Get template details
router.get("/templates/:id", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) { res.status(auth.status).json({ error: auth.error }); return; }

  try {
    const template = await prisma.scopeTemplate.findUnique({
      where: { id: req.params.id as string },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        icon: true,
        category: true,
        configSchema: true,
        requiredProfileFields: true,
        tools: true,
        instructions: true,
        published: true,
        createdAt: true,
        _count: { select: { instances: true } },
      },
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
// INSTANCES
// =============================================================================

// GET /api/scopes/instances — List user's scope instances (owned + shared via base)
router.get("/instances", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) { res.status(auth.status).json({ error: auth.error }); return; }

  try {
    // Find user's base memberships for shared scope access
    const baseMemberships = await prisma.baseMember.findMany({
      where: { entityId: auth.entityId },
      select: { baseId: true },
    });
    const baseIds = baseMemberships.map((b) => b.baseId);

    const instances = await prisma.scopeInstance.findMany({
      where: {
        OR: [
          { ownerId: auth.userId },
          { ownerId: null }, // platform-owned
          ...(baseIds.length > 0 ? [{ baseId: { in: baseIds } }] : []),
        ],
      },
      include: {
        template: {
          select: {
            id: true,
            slug: true,
            name: true,
            icon: true,
            category: true,
            requiredProfileFields: true,
          },
        },
        configs: {
          select: {
            id: true,
            key: true,
            isSecret: true,
            // Don't send actual secret values
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Mask secret config values
    const result = instances.map((inst) => ({
      ...inst,
      configs: inst.configs.map((c) => ({
        id: c.id,
        key: c.key,
        isSecret: c.isSecret,
        hasValue: true,
      })),
    }));

    res.json({ instances: result });
  } catch (error) {
    console.error("List instances error:", error);
    res.status(500).json({ error: "Failed to list instances" });
  }
});

// GET /api/scopes/instances/:id — Get instance details
router.get("/instances/:id", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) { res.status(auth.status).json({ error: auth.error }); return; }

  try {
    const instance = await prisma.scopeInstance.findUnique({
      where: { id: req.params.id as string },
      include: {
        template: {
          select: {
            id: true,
            slug: true,
            name: true,
            description: true,
            icon: true,
            category: true,
            configSchema: true,
            requiredProfileFields: true,
            tools: true,
            instructions: true,
          },
        },
        configs: {
          select: { id: true, key: true, isSecret: true, value: true },
        },
      },
    });

    if (!instance) {
      res.status(404).json({ error: "Instance not found" });
      return;
    }

    // Mask secret values, decrypt non-secrets for display
    const configs = instance.configs.map((c: { id: string; key: string; isSecret: boolean; value: string }) => ({
      id: c.id,
      key: c.key,
      isSecret: c.isSecret,
      value: c.isSecret ? "••••••••" : c.value,
      hasValue: !!c.value,
    }));

    res.json({ instance: { ...instance, configs } });
  } catch (error) {
    console.error("Get instance error:", error);
    res.status(500).json({ error: "Failed to get instance" });
  }
});

// POST /api/scopes/instances — Create a new scope instance from a template
router.post("/instances", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) { res.status(auth.status).json({ error: auth.error }); return; }

  try {
    const { templateId, name, scopeName, description, baseId, configs } = req.body;

    if (!templateId || !name) {
      res.status(400).json({ error: "templateId and name are required" });
      return;
    }

    // Verify template exists
    const template = await prisma.scopeTemplate.findUnique({
      where: { id: templateId },
    });
    if (!template) {
      res.status(404).json({ error: "Template not found" });
      return;
    }

    // Generate scope name if not provided (slug-ify the name)
    const finalScopeName = scopeName || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    // Check uniqueness
    const existing = await prisma.scopeInstance.findUnique({
      where: { scopeName: finalScopeName },
    });
    if (existing) {
      res.status(409).json({ error: `Scope name "${finalScopeName}" is already taken` });
      return;
    }

    // Create instance + configs in a transaction
    const instance = await prisma.$transaction(async (tx) => {
      const inst = await tx.scopeInstance.create({
        data: {
          templateId,
          name,
          scopeName: finalScopeName,
          description: description || null,
          ownerId: auth.userId,
          baseId: baseId || null,
          active: true,
        },
        include: {
          template: {
            select: { id: true, slug: true, name: true, icon: true, category: true },
          },
        },
      });

      // Create config entries
      if (configs && Array.isArray(configs)) {
        for (const cfg of configs) {
          if (!cfg.key || cfg.value === undefined) continue;
          await tx.scopeInstanceConfig.create({
            data: {
              instanceId: inst.id,
              key: cfg.key,
              value: cfg.isSecret ? encrypt(cfg.value) : cfg.value,
              isSecret: !!cfg.isSecret,
            },
          });
        }
      }

      return inst;
    });

    res.status(201).json({ instance });
  } catch (error) {
    console.error("Create instance error:", error);
    res.status(500).json({ error: "Failed to create instance" });
  }
});

// PATCH /api/scopes/instances/:id — Update instance (name, description, active, configs)
router.patch("/instances/:id", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) { res.status(auth.status).json({ error: auth.error }); return; }

  try {
    const instanceId = req.params.id as string;
    const instance = await prisma.scopeInstance.findUnique({
      where: { id: instanceId },
    });
    if (!instance) {
      res.status(404).json({ error: "Instance not found" });
      return;
    }

    // Only owner or platform instances can be updated
    if (instance.ownerId && instance.ownerId !== auth.userId) {
      res.status(403).json({ error: "Not authorized to update this instance" });
      return;
    }

    const { name, description, active, configs } = req.body;

    const updated = await prisma.$transaction(async (tx) => {
      const inst = await tx.scopeInstance.update({
        where: { id: instanceId },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(active !== undefined ? { active } : {}),
        },
        include: {
          template: {
            select: { id: true, slug: true, name: true, icon: true, category: true },
          },
        },
      });

      // Update configs if provided
      if (configs && Array.isArray(configs)) {
        for (const cfg of configs) {
          if (!cfg.key) continue;
          await tx.scopeInstanceConfig.upsert({
            where: {
              instanceId_key: { instanceId: inst.id, key: cfg.key },
            },
            update: {
              value: cfg.isSecret ? encrypt(cfg.value) : cfg.value,
              isSecret: !!cfg.isSecret,
            },
            create: {
              instanceId: inst.id,
              key: cfg.key,
              value: cfg.isSecret ? encrypt(cfg.value) : cfg.value,
              isSecret: !!cfg.isSecret,
            },
          });
        }
      }

      return inst;
    });

    res.json({ instance: updated });
  } catch (error) {
    console.error("Update instance error:", error);
    res.status(500).json({ error: "Failed to update instance" });
  }
});

// DELETE /api/scopes/instances/:id — Delete instance
router.delete("/instances/:id", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) { res.status(auth.status).json({ error: auth.error }); return; }

  try {
    const deleteId = req.params.id as string;
    const instance = await prisma.scopeInstance.findUnique({
      where: { id: deleteId },
    });
    if (!instance) {
      res.status(404).json({ error: "Instance not found" });
      return;
    }
    if (instance.ownerId && instance.ownerId !== auth.userId) {
      res.status(403).json({ error: "Not authorized to delete this instance" });
      return;
    }

    await prisma.scopeInstance.delete({ where: { id: deleteId } });
    res.json({ success: true });
  } catch (error) {
    console.error("Delete instance error:", error);
    res.status(500).json({ error: "Failed to delete instance" });
  }
});

// =============================================================================
// HASEEF ↔ SCOPE ATTACHMENT
// =============================================================================

// GET /api/scopes/haseef/:haseefId — List scopes attached to a haseef (reads from Core)
router.get("/haseef/:haseefId", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) { res.status(auth.status).json({ error: auth.error }); return; }

  try {
    const haseefId = req.params.haseefId as string;

    // Verify ownership
    const ownership = await prisma.haseefOwnership.findUnique({
      where: { userId_haseefId: { userId: auth.userId, haseefId } },
    });
    if (!ownership) {
      res.status(404).json({ error: "Haseef not found or not owned by you" });
      return;
    }

    // Get haseef from Core to read scopes[]
    const coreUrl = process.env.HSAFA_CORE_URL || process.env.HSAFA_GATEWAY_URL || "http://localhost:3001";
    const apiKey = process.env.CORE_API_KEY || "";
    const coreRes = await fetch(`${coreUrl}/api/haseefs/${haseefId}`, {
      headers: { "x-api-key": apiKey },
    });

    if (!coreRes.ok) {
      res.status(502).json({ error: "Failed to fetch haseef from Core" });
      return;
    }

    const { haseef } = await coreRes.json();
    const attachedScopeNames: string[] = haseef.scopes ?? [];

    // Resolve scope instances from our DB
    const instances = attachedScopeNames.length > 0
      ? await prisma.scopeInstance.findMany({
          where: { scopeName: { in: attachedScopeNames } },
          include: {
            template: {
              select: { id: true, slug: true, name: true, icon: true, category: true, requiredProfileFields: true },
            },
          },
        })
      : [];

    // Get live connection status from Core
    const scopesRes = await fetch(`${coreUrl}/api/scopes`, {
      headers: { "x-api-key": apiKey },
    });
    const coreScopes = scopesRes.ok ? (await scopesRes.json()).scopes ?? [] : [];
    const connectionMap = new Map<string, boolean>();
    for (const s of coreScopes) {
      connectionMap.set(s.name, s.connected ?? false);
    }

    const result = instances.map((inst) => ({
      ...inst,
      connected: connectionMap.get(inst.scopeName) ?? false,
    }));

    res.json({
      attachedScopes: attachedScopeNames,
      instances: result,
    });
  } catch (error) {
    console.error("List haseef scopes error:", error);
    res.status(500).json({ error: "Failed to list haseef scopes" });
  }
});

// POST /api/scopes/haseef/:haseefId/attach — Attach a scope instance to a haseef
router.post("/haseef/:haseefId/attach", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) { res.status(auth.status).json({ error: auth.error }); return; }

  try {
    const haseefId = req.params.haseefId as string;
    const { instanceId } = req.body;

    if (!instanceId) {
      res.status(400).json({ error: "instanceId is required" });
      return;
    }

    // Verify ownership
    const ownership = await prisma.haseefOwnership.findUnique({
      where: { userId_haseefId: { userId: auth.userId, haseefId } },
    });
    if (!ownership) {
      res.status(404).json({ error: "Haseef not found or not owned by you" });
      return;
    }

    // Get the scope instance
    const instance = await prisma.scopeInstance.findUnique({
      where: { id: instanceId },
      include: {
        template: { select: { requiredProfileFields: true } },
      },
    });
    if (!instance) {
      res.status(404).json({ error: "Scope instance not found" });
      return;
    }
    if (!instance.active) {
      res.status(400).json({ error: "Scope instance is not active" });
      return;
    }

    // Validate requiredProfileFields against haseef profile
    const coreUrl = process.env.HSAFA_CORE_URL || process.env.HSAFA_GATEWAY_URL || "http://localhost:3001";
    const apiKey = process.env.CORE_API_KEY || "";

    const coreRes = await fetch(`${coreUrl}/api/haseefs/${haseefId}`, {
      headers: { "x-api-key": apiKey },
    });
    if (!coreRes.ok) {
      res.status(502).json({ error: "Failed to fetch haseef from Core" });
      return;
    }
    const { haseef } = await coreRes.json();
    const profile = haseef.profileJson ?? {};
    const requiredFields = instance.template.requiredProfileFields ?? [];

    const missingFields = requiredFields.filter((f: string) => !profile[f]);
    if (missingFields.length > 0) {
      res.status(400).json({
        error: `Haseef profile is missing required fields: ${missingFields.join(", ")}`,
        missingFields,
      });
      return;
    }

    // Add scope to haseef's scopes[] in Core
    const currentScopes: string[] = haseef.scopes ?? [];
    if (currentScopes.includes(instance.scopeName)) {
      res.status(409).json({ error: "Scope is already attached to this haseef" });
      return;
    }

    const updateRes = await fetch(`${coreUrl}/api/haseefs/${haseefId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({ scopes: [...currentScopes, instance.scopeName] }),
    });

    if (!updateRes.ok) {
      const text = await updateRes.text();
      res.status(502).json({ error: `Failed to attach scope in Core: ${text}` });
      return;
    }

    res.json({ success: true, scopeName: instance.scopeName });
  } catch (error) {
    console.error("Attach scope error:", error);
    res.status(500).json({ error: "Failed to attach scope" });
  }
});

// POST /api/scopes/haseef/:haseefId/detach — Detach a scope instance from a haseef
router.post("/haseef/:haseefId/detach", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) { res.status(auth.status).json({ error: auth.error }); return; }

  try {
    const haseefId = req.params.haseefId as string;
    const { scopeName } = req.body;

    if (!scopeName) {
      res.status(400).json({ error: "scopeName is required" });
      return;
    }

    // Verify ownership
    const ownership = await prisma.haseefOwnership.findUnique({
      where: { userId_haseefId: { userId: auth.userId, haseefId } },
    });
    if (!ownership) {
      res.status(404).json({ error: "Haseef not found or not owned by you" });
      return;
    }

    // Get current scopes from Core
    const coreUrl = process.env.HSAFA_CORE_URL || process.env.HSAFA_GATEWAY_URL || "http://localhost:3001";
    const apiKey = process.env.CORE_API_KEY || "";

    const coreRes = await fetch(`${coreUrl}/api/haseefs/${haseefId}`, {
      headers: { "x-api-key": apiKey },
    });
    if (!coreRes.ok) {
      res.status(502).json({ error: "Failed to fetch haseef from Core" });
      return;
    }
    const { haseef } = await coreRes.json();
    const currentScopes: string[] = haseef.scopes ?? [];

    if (!currentScopes.includes(scopeName)) {
      res.status(404).json({ error: "Scope is not attached to this haseef" });
      return;
    }

    // Remove scope from haseef
    const updateRes = await fetch(`${coreUrl}/api/haseefs/${haseefId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({ scopes: currentScopes.filter((s) => s !== scopeName) }),
    });

    if (!updateRes.ok) {
      const text = await updateRes.text();
      res.status(502).json({ error: `Failed to detach scope in Core: ${text}` });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Detach scope error:", error);
    res.status(500).json({ error: "Failed to detach scope" });
  }
});

// =============================================================================
// CONNECTION STATUS
// =============================================================================

// GET /api/scopes/status — Get live connection status for all scopes from Core
router.get("/status", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) { res.status(auth.status).json({ error: auth.error }); return; }

  try {
    const coreUrl = process.env.HSAFA_CORE_URL || process.env.HSAFA_GATEWAY_URL || "http://localhost:3001";
    const apiKey = process.env.CORE_API_KEY || "";

    const scopesRes = await fetch(`${coreUrl}/api/scopes`, {
      headers: { "x-api-key": apiKey },
    });

    if (!scopesRes.ok) {
      res.status(502).json({ error: "Failed to fetch scopes from Core" });
      return;
    }

    const data = await scopesRes.json();
    res.json({ scopes: data.scopes ?? [] });
  } catch (error) {
    console.error("Scope status error:", error);
    res.status(500).json({ error: "Failed to get scope status" });
  }
});

export default router;
