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
import { SCOPE_TEMPLATES, getTemplateById } from "../lib/scope-templates/index.js";
import {
  deployInstance,
  startInstance,
  stopInstance,
  restartInstance,
  removeInstance,
  getInstanceLogs,
  getContainerStatus,
  isDockerAvailable,
} from "../lib/scope-docker.js";

const router = Router();

// ── Core API helper ─────────────────────────────────────────────────────────

function getCoreConfig(): { coreUrl: string; serviceKey: string } {
  return {
    coreUrl: process.env.HSAFA_CORE_URL || process.env.HSAFA_GATEWAY_URL || "http://localhost:3001",
    serviceKey: process.env.CORE_SERVICE_KEY || "",
  };
}

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

// GET /api/scopes/templates — List all prebuilt templates (from code, not DB)
router.get("/templates", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) { res.status(auth.status).json({ error: auth.error }); return; }

  res.json({ templates: SCOPE_TEMPLATES });
});

// GET /api/scopes/templates/:id — Get template details (from code)
router.get("/templates/:id", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) { res.status(auth.status).json({ error: auth.error }); return; }

  const template = getTemplateById(req.params.id as string);
  if (!template) {
    res.status(404).json({ error: "Template not found" });
    return;
  }

  res.json({ template });
});

// =============================================================================
// INSTANCES
// =============================================================================

// GET /api/scopes/instances — List user's scope instances (owned + shared via base)
// Also includes the built-in "spaces" scope as a virtual entry.
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
    const pluginInstances = instances.map((inst) => ({
      ...inst,
      builtIn: false,
      configs: inst.configs.map((c) => ({
        id: c.id,
        key: c.key,
        isSecret: c.isSecret,
        hasValue: true,
      })),
    }));

    // Fetch connection status from Core for the built-in spaces scope
    const { coreUrl, serviceKey } = getCoreConfig();
    let spacesConnected = false;
    try {
      const scopesRes = await fetch(`${coreUrl}/api/scopes`, { headers: { "x-api-key": serviceKey } });
      if (scopesRes.ok) {
        const coreScopes = (await scopesRes.json()).scopes ?? [];
        const spacesScope = coreScopes.find((s: any) => s.name === "spaces");
        spacesConnected = spacesScope?.connected ?? false;
      }
    } catch { /* ignore — Core might be down */ }

    // Inject built-in "spaces" scope as virtual entry at the top
    const spacesEntry = {
      id: "built-in-spaces",
      templateId: "built-in",
      name: "Spaces",
      scopeName: "spaces",
      description: "Chat in smart spaces — built-in, always available.",
      ownerId: null,
      baseId: null,
      active: true,
      builtIn: true,
      deploymentType: "built-in",
      containerStatus: spacesConnected ? "running" : "stopped",
      containerId: null,
      imageUrl: null,
      createdAt: new Date(0).toISOString(),
      template: {
        id: "built-in",
        slug: "spaces",
        name: "Spaces",
        icon: "MessageSquare",
        category: "built-in",
        requiredProfileFields: [],
      },
      configs: [],
      connected: spacesConnected,
    };

    res.json({ instances: [spacesEntry, ...pluginInstances] });
  } catch (error) {
    console.error("List instances error:", error);
    res.status(500).json({ error: "Failed to list instances" });
  }
});

// GET /api/scopes/instances/:id — Get instance details
router.get("/instances/:id", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) { res.status(auth.status).json({ error: auth.error }); return; }

  // Handle built-in "spaces" scope (no DB row)
  if (req.params.id === "built-in-spaces") {
    const { coreUrl, serviceKey } = getCoreConfig();
    let spacesConnected = false;
    let toolCount = 0;
    try {
      const scopesRes = await fetch(`${coreUrl}/api/scopes/spaces/tools`, { headers: { "x-api-key": serviceKey } });
      if (scopesRes.ok) {
        const data = await scopesRes.json();
        spacesConnected = data.connected ?? false;
        toolCount = data.tools?.length ?? 0;
      }
    } catch { /* ignore */ }

    res.json({
      instance: {
        id: "built-in-spaces",
        templateId: "built-in",
        name: "Spaces",
        scopeName: "spaces",
        description: "Chat in smart spaces — built-in, always available.",
        ownerId: null,
        baseId: null,
        active: true,
        builtIn: true,
        createdAt: new Date(0).toISOString(),
        template: {
          id: "built-in",
          slug: "spaces",
          name: "Spaces",
          description: "Chat in smart spaces — built-in, always available.",
          icon: "MessageSquare",
          category: "built-in",
          configSchema: null,
          requiredProfileFields: [],
          tools: [],
          instructions: null,
        },
        configs: [],
        connected: spacesConnected,
        toolCount,
      },
    });
    return;
  }

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

    // Ownership check: user must own the instance or share a base
    if (instance.ownerId !== auth.userId) {
      // Check if shared via base membership
      if (instance.baseId) {
        const baseMembership = await prisma.baseMember.findFirst({
          where: { entityId: auth.entityId, baseId: instance.baseId },
        });
        if (!baseMembership) {
          res.status(403).json({ error: "Not authorized to view this instance" });
          return;
        }
      } else {
        res.status(403).json({ error: "Not authorized to view this instance" });
        return;
      }
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

    // Determine deployment type and image
    const deploymentType = req.body.deploymentType || "platform"; // "platform" | "custom" | "external"
    const imageUrl = req.body.imageUrl || template.imageUrl || null;

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
          deploymentType,
          imageUrl,
          containerStatus: "stopped",
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

    // Auto-deploy for platform/custom types (non-blocking)
    if ((deploymentType === "platform" || deploymentType === "custom") && imageUrl) {
      deployInstance(instance.id).catch((err) => {
        console.error(`[scopes] Auto-deploy failed for ${instance.scopeName}:`, err);
      });
    }

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

  if (req.params.id === "built-in-spaces") {
    res.status(403).json({ error: "The built-in Spaces scope cannot be modified" });
    return;
  }

  try {
    const instanceId = req.params.id as string;
    const instance = await prisma.scopeInstance.findUnique({
      where: { id: instanceId },
    });
    if (!instance) {
      res.status(404).json({ error: "Instance not found" });
      return;
    }

    // Only the owner can update
    if (instance.ownerId !== auth.userId) {
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

  if (req.params.id === "built-in-spaces") {
    res.status(403).json({ error: "The built-in Spaces scope cannot be deleted" });
    return;
  }

  try {
    const deleteId = req.params.id as string;
    const instance = await prisma.scopeInstance.findUnique({
      where: { id: deleteId },
    });
    if (!instance) {
      res.status(404).json({ error: "Instance not found" });
      return;
    }
    if (instance.ownerId !== auth.userId) {
      res.status(403).json({ error: "Not authorized to delete this instance" });
      return;
    }

    // Stop and remove Docker container if it exists
    if (instance.containerId) {
      try { await removeInstance(deleteId); } catch { /* best-effort */ }
    }

    await prisma.scopeInstance.delete({ where: { id: deleteId } });
    res.json({ success: true });
  } catch (error) {
    console.error("Delete instance error:", error);
    res.status(500).json({ error: "Failed to delete instance" });
  }
});

// =============================================================================
// INSTANCE LIFECYCLE — deploy, start, stop, restart, logs
// =============================================================================

// POST /api/scopes/instances/:id/deploy — Deploy (or re-deploy) as Docker container
router.post("/instances/:id/deploy", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) { res.status(auth.status).json({ error: auth.error }); return; }

  try {
    const instance = await prisma.scopeInstance.findUnique({ where: { id: req.params.id as string } });
    if (!instance) { res.status(404).json({ error: "Instance not found" }); return; }
    if (instance.ownerId !== auth.userId) { res.status(403).json({ error: "Not authorized" }); return; }
    if (instance.deploymentType === "built-in" || instance.deploymentType === "external") {
      res.status(400).json({ error: `Cannot deploy ${instance.deploymentType} instances` });
      return;
    }

    const dockerOk = await isDockerAvailable();
    if (!dockerOk) { res.status(503).json({ error: "Docker is not available" }); return; }

    const result = await deployInstance(instance.id);
    res.json({ success: true, ...result });
  } catch (error: any) {
    console.error("Deploy instance error:", error);
    res.status(500).json({ error: error.message || "Failed to deploy instance" });
  }
});

// POST /api/scopes/instances/:id/start — Start a stopped container
router.post("/instances/:id/start", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) { res.status(auth.status).json({ error: auth.error }); return; }

  try {
    const instance = await prisma.scopeInstance.findUnique({ where: { id: req.params.id as string } });
    if (!instance) { res.status(404).json({ error: "Instance not found" }); return; }
    if (instance.ownerId !== auth.userId) { res.status(403).json({ error: "Not authorized" }); return; }
    if (!instance.containerId) { res.status(400).json({ error: "No container — deploy first" }); return; }

    await startInstance(instance.id);
    res.json({ success: true, containerStatus: "running" });
  } catch (error: any) {
    console.error("Start instance error:", error);
    res.status(500).json({ error: error.message || "Failed to start instance" });
  }
});

// POST /api/scopes/instances/:id/stop — Stop a running container
router.post("/instances/:id/stop", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) { res.status(auth.status).json({ error: auth.error }); return; }

  try {
    const instance = await prisma.scopeInstance.findUnique({ where: { id: req.params.id as string } });
    if (!instance) { res.status(404).json({ error: "Instance not found" }); return; }
    if (instance.ownerId !== auth.userId) { res.status(403).json({ error: "Not authorized" }); return; }
    if (!instance.containerId) { res.status(400).json({ error: "No container to stop" }); return; }

    await stopInstance(instance.id);
    res.json({ success: true, containerStatus: "stopped" });
  } catch (error: any) {
    console.error("Stop instance error:", error);
    res.status(500).json({ error: error.message || "Failed to stop instance" });
  }
});

// POST /api/scopes/instances/:id/restart — Restart a container
router.post("/instances/:id/restart", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) { res.status(auth.status).json({ error: auth.error }); return; }

  try {
    const instance = await prisma.scopeInstance.findUnique({ where: { id: req.params.id as string } });
    if (!instance) { res.status(404).json({ error: "Instance not found" }); return; }
    if (instance.ownerId !== auth.userId) { res.status(403).json({ error: "Not authorized" }); return; }
    if (!instance.containerId) { res.status(400).json({ error: "No container to restart" }); return; }

    await restartInstance(instance.id);
    res.json({ success: true, containerStatus: "running" });
  } catch (error: any) {
    console.error("Restart instance error:", error);
    res.status(500).json({ error: error.message || "Failed to restart instance" });
  }
});

// GET /api/scopes/instances/:id/logs — Get container logs
router.get("/instances/:id/logs", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) { res.status(auth.status).json({ error: auth.error }); return; }

  try {
    const instance = await prisma.scopeInstance.findUnique({ where: { id: req.params.id as string } });
    if (!instance) { res.status(404).json({ error: "Instance not found" }); return; }
    if (instance.ownerId !== auth.userId) { res.status(403).json({ error: "Not authorized" }); return; }

    const tail = parseInt(req.query.tail as string) || 200;
    const logs = await getInstanceLogs(instance.id, { tail });
    res.json({ logs });
  } catch (error: any) {
    console.error("Get logs error:", error);
    res.status(500).json({ error: error.message || "Failed to get logs" });
  }
});

// GET /api/scopes/instances/:id/container-status — Get live container status
router.get("/instances/:id/container-status", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) { res.status(auth.status).json({ error: auth.error }); return; }

  try {
    const instance = await prisma.scopeInstance.findUnique({ where: { id: req.params.id as string } });
    if (!instance) { res.status(404).json({ error: "Instance not found" }); return; }
    if (instance.ownerId !== auth.userId) { res.status(403).json({ error: "Not authorized" }); return; }

    const status = await getContainerStatus(instance.id);
    res.json(status);
  } catch (error: any) {
    console.error("Container status error:", error);
    res.status(500).json({ error: error.message || "Failed to get status" });
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
    const { coreUrl, serviceKey } = getCoreConfig();
    const coreRes = await fetch(`${coreUrl}/api/haseefs/${haseefId}`, {
      headers: { "x-api-key": serviceKey },
    });

    if (!coreRes.ok) {
      res.status(502).json({ error: "Failed to fetch haseef from Core" });
      return;
    }

    const { haseef } = await coreRes.json();
    const attachedScopeNames: string[] = haseef.scopes ?? [];

    // Resolve plugin scope instances from our DB (excludes built-in "spaces")
    const pluginScopeNames = attachedScopeNames.filter((s) => s !== "spaces");
    const instances = pluginScopeNames.length > 0
      ? await prisma.scopeInstance.findMany({
          where: { scopeName: { in: pluginScopeNames } },
          include: {
            template: {
              select: { id: true, slug: true, name: true, icon: true, category: true, requiredProfileFields: true },
            },
          },
        })
      : [];

    // Get live connection status from Core
    const scopesRes = await fetch(`${coreUrl}/api/scopes`, {
      headers: { "x-api-key": serviceKey },
    });
    const coreScopes = scopesRes.ok ? (await scopesRes.json()).scopes ?? [] : [];
    const connectionMap = new Map<string, boolean>();
    for (const s of coreScopes) {
      connectionMap.set(s.name, s.connected ?? false);
    }

    // Build result: built-in "spaces" as virtual entry + plugin instances
    const result: Array<Record<string, unknown>> = [];

    if (attachedScopeNames.includes("spaces")) {
      result.push({
        id: null,
        scopeName: "spaces",
        name: "Spaces",
        description: "Chat in smart spaces — built-in, always available.",
        builtIn: true,
        active: true,
        template: { slug: "spaces", name: "Spaces", icon: "MessageSquare", category: "built-in" },
        connected: connectionMap.get("spaces") ?? false,
      });
    }

    for (const inst of instances) {
      result.push({
        ...inst,
        builtIn: false,
        connected: connectionMap.get(inst.scopeName) ?? false,
      });
    }

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

    // Verify user has access to this scope instance (owns it or shares a base)
    if (instance.ownerId !== auth.userId) {
      if (instance.baseId) {
        const baseMembership = await prisma.baseMember.findFirst({
          where: { entityId: auth.entityId, baseId: instance.baseId },
        });
        if (!baseMembership) {
          res.status(403).json({ error: "Not authorized to attach this scope instance" });
          return;
        }
      } else {
        res.status(403).json({ error: "Not authorized to attach this scope instance" });
        return;
      }
    }

    // Validate requiredProfileFields against haseef profile
    const { coreUrl, serviceKey } = getCoreConfig();

    const coreRes = await fetch(`${coreUrl}/api/haseefs/${haseefId}`, {
      headers: { "x-api-key": serviceKey },
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
      headers: { "Content-Type": "application/json", "x-api-key": serviceKey },
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
    const { coreUrl, serviceKey } = getCoreConfig();

    const coreRes = await fetch(`${coreUrl}/api/haseefs/${haseefId}`, {
      headers: { "x-api-key": serviceKey },
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
      headers: { "Content-Type": "application/json", "x-api-key": serviceKey },
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
    const { coreUrl, serviceKey } = getCoreConfig();

    const scopesRes = await fetch(`${coreUrl}/api/scopes`, {
      headers: { "x-api-key": serviceKey },
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
