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
import {
  getDecryptedHaseefKey,
  getDecryptedScopeKey,
  provisionAndStoreScopeKey,
} from "../lib/resource-keys.js";
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
  deploymentEvents,
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

// Helper: convert a DB ScopeTemplate row to the API shape
function dbTemplateToApi(t: any) {
  return {
    id: t.id,
    slug: t.slug,
    name: t.name,
    description: t.description ?? "",
    icon: t.icon ?? null,
    category: t.category ?? "custom",
    requiredProfileFields: t.requiredProfileFields ?? [],
    tools: (t.tools as any[]) ?? [],
    instructions: t.instructions ?? null,
    imageUrl: t.imageUrl ?? null,
    published: t.published ?? false,
    authorId: t.authorId ?? null,
    createdAt: t.createdAt?.toISOString?.() ?? t.createdAt,
    _count: t._count ?? undefined,
  };
}

// GET /api/scopes/templates — List all templates (prebuilt from code + custom from DB)
router.get("/templates", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) { res.status(auth.status).json({ error: auth.error }); return; }

  try {
    // Fetch custom templates from DB (published OR authored by this user)
    const dbTemplates = await prisma.scopeTemplate.findMany({
      where: {
        OR: [
          { published: true },
          { authorId: auth.userId },
        ],
        // Exclude prebuilt template IDs that are defined in code
        id: { notIn: SCOPE_TEMPLATES.map((t) => t.id) },
      },
      include: { _count: { select: { instances: true } } },
      orderBy: { createdAt: "desc" },
    });

    const customTemplates = dbTemplates.map(dbTemplateToApi);
    res.json({ templates: [...SCOPE_TEMPLATES, ...customTemplates] });
  } catch (error) {
    console.error("List templates error:", error);
    res.json({ templates: SCOPE_TEMPLATES });
  }
});

// GET /api/scopes/templates/mine — List only user's custom templates
router.get("/templates/mine", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) { res.status(auth.status).json({ error: auth.error }); return; }

  try {
    const templates = await prisma.scopeTemplate.findMany({
      where: { authorId: auth.userId },
      include: { _count: { select: { instances: true } } },
      orderBy: { createdAt: "desc" },
    });

    res.json({ templates: templates.map(dbTemplateToApi) });
  } catch (error) {
    console.error("List my templates error:", error);
    res.status(500).json({ error: "Failed to list templates" });
  }
});

// POST /api/scopes/templates — Create a custom template
router.post("/templates", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) { res.status(auth.status).json({ error: auth.error }); return; }

  try {
    const { name, slug, description, icon, tools, instructions, imageUrl, defaultEnv, published } = req.body;

    if (!name || !slug) {
      res.status(400).json({ error: "name and slug are required" });
      return;
    }

    // Validate slug format
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug) && slug.length > 1 || !/^[a-z0-9]$/.test(slug) && slug.length === 1) {
      res.status(400).json({ error: "Slug must be lowercase alphanumeric with hyphens (e.g. 'my-scope')" });
      return;
    }

    // Check uniqueness
    const existing = await prisma.scopeTemplate.findUnique({ where: { slug } });
    if (existing || SCOPE_TEMPLATES.some((t) => t.slug === slug)) {
      res.status(409).json({ error: `Slug "${slug}" is already taken` });
      return;
    }

    const template = await prisma.scopeTemplate.create({
      data: {
        name,
        slug,
        description: description || "",
        icon: icon || null,
        category: "custom",
        tools: tools || [],
        instructions: instructions || null,
        imageUrl: imageUrl || null,
        configSchema: defaultEnv ? { defaultEnv } : {},
        authorId: auth.userId,
        published: published ?? false,
      },
      include: { _count: { select: { instances: true } } },
    });

    res.status(201).json({ template: dbTemplateToApi(template) });
  } catch (error) {
    console.error("Create template error:", error);
    res.status(500).json({ error: "Failed to create template" });
  }
});

// GET /api/scopes/templates/:id — Get template details (code-defined or DB)
router.get("/templates/:id", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) { res.status(auth.status).json({ error: auth.error }); return; }

  // Check code-defined templates first
  const codeTemplate = getTemplateById(req.params.id as string);
  if (codeTemplate) {
    res.json({ template: codeTemplate });
    return;
  }

  // Check DB
  try {
    const dbTemplate = await prisma.scopeTemplate.findUnique({
      where: { id: req.params.id as string },
      include: { _count: { select: { instances: true } } },
    });

    if (!dbTemplate) {
      res.status(404).json({ error: "Template not found" });
      return;
    }

    // Only author or published templates are visible
    if (!dbTemplate.published && dbTemplate.authorId !== auth.userId) {
      res.status(404).json({ error: "Template not found" });
      return;
    }

    res.json({ template: dbTemplateToApi(dbTemplate) });
  } catch (error) {
    console.error("Get template error:", error);
    res.status(500).json({ error: "Failed to get template" });
  }
});

// PATCH /api/scopes/templates/:id — Update a custom template (author only)
router.patch("/templates/:id", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) { res.status(auth.status).json({ error: auth.error }); return; }

  // Prevent editing code-defined templates
  if (getTemplateById(req.params.id as string)) {
    res.status(403).json({ error: "Cannot edit prebuilt templates" });
    return;
  }

  try {
    const template = await prisma.scopeTemplate.findUnique({ where: { id: req.params.id as string } });
    if (!template) { res.status(404).json({ error: "Template not found" }); return; }
    if (template.authorId !== auth.userId) { res.status(403).json({ error: "Not authorized" }); return; }

    const { name, description, icon, tools, instructions, imageUrl, defaultEnv, published } = req.body;

    const updated = await prisma.scopeTemplate.update({
      where: { id: req.params.id as string },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(icon !== undefined && { icon }),
        ...(tools !== undefined && { tools }),
        ...(instructions !== undefined && { instructions }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(defaultEnv !== undefined && { configSchema: { defaultEnv } }),
        ...(published !== undefined && { published }),
      },
      include: { _count: { select: { instances: true } } },
    });

    res.json({ template: dbTemplateToApi(updated) });
  } catch (error) {
    console.error("Update template error:", error);
    res.status(500).json({ error: "Failed to update template" });
  }
});

// DELETE /api/scopes/templates/:id — Delete a custom template (author only, cascades instances)
router.delete("/templates/:id", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) { res.status(auth.status).json({ error: auth.error }); return; }

  // Prevent deleting code-defined templates
  if (getTemplateById(req.params.id as string)) {
    res.status(403).json({ error: "Cannot delete prebuilt templates" });
    return;
  }

  try {
    const template = await prisma.scopeTemplate.findUnique({ where: { id: req.params.id as string } });
    if (!template) { res.status(404).json({ error: "Template not found" }); return; }
    if (template.authorId !== auth.userId) { res.status(403).json({ error: "Not authorized" }); return; }

    // Remove associated containers first
    const instances = await prisma.scopeInstance.findMany({
      where: { templateId: template.id },
      select: { id: true, containerId: true },
    });
    for (const inst of instances) {
      if (inst.containerId) {
        try { await removeInstance(inst.id); } catch { /* best-effort */ }
      }
    }

    // Delete template (cascades to instances via schema)
    await prisma.scopeTemplate.delete({ where: { id: template.id } });

    res.json({ success: true });
  } catch (error) {
    console.error("Delete template error:", error);
    res.status(500).json({ error: "Failed to delete template" });
  }
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

    // Fetch connection status from Core for all scopes (used for built-in + external)
    const { coreUrl, serviceKey } = getCoreConfig();
    const coreConnectionMap = new Map<string, boolean>();
    try {
      const scopesRes = await fetch(`${coreUrl}/api/scopes`, { headers: { "x-api-key": serviceKey } });
      if (scopesRes.ok) {
        const coreScopes = (await scopesRes.json()).scopes ?? [];
        for (const s of coreScopes) {
          coreConnectionMap.set(s.name, s.connected ?? false);
        }
      }
    } catch { /* ignore — Core might be down */ }

    const spacesConnected = coreConnectionMap.get("spaces") ?? false;

    // Mask secret config values, synthesize template for templateless instances,
    // and add connected status for external instances
    const pluginInstances = instances.map((inst) => ({
      ...inst,
      builtIn: false,
      // For templateless instances (local/external), synthesize a minimal template object
      template: inst.template ?? {
        id: null,
        slug: inst.scopeName,
        name: inst.name,
        icon: "Plug",
        category: inst.deploymentType === "external" ? "external" : "custom",
        requiredProfileFields: [],
      },
      configs: inst.configs.map((c) => ({
        id: c.id,
        key: c.key,
        isSecret: c.isSecret,
        hasValue: true,
      })),
      ...(inst.deploymentType === "external" ? { connected: coreConnectionMap.get(inst.scopeName) ?? false } : {}),
    }));

    // Inject built-in "spaces" scope as virtual entry at the top.
    // Built-in scopes are always running (they're part of the server process).
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
      containerStatus: "running",
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
        deploymentType: "built-in",
        containerStatus: "running",
        containerId: null,
        imageUrl: null,
        createdAt: new Date(0).toISOString(),
        template: {
          id: "built-in",
          slug: "spaces",
          name: "Spaces",
          description: "Chat in smart spaces — built-in, always available.",
          icon: "MessageSquare",
          category: "built-in",
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

    // Decrypt secret values so the frontend can display them (Coolify-style).
    // This endpoint is already auth-gated + ownership-checked.
    const configs = instance.configs.map((c: { id: string; key: string; isSecret: boolean; value: string }) => {
      let value = c.value ?? "";
      if (c.isSecret && value) {
        try { value = decrypt(value); } catch { /* return raw if decrypt fails */ }
      }
      return { id: c.id, key: c.key, isSecret: c.isSecret, value, hasValue: !!c.value };
    });

    // Decrypt scope key for the owner
    let scopeKeyDecrypted: string | null = null;
    if (instance.ownerId === auth.userId && instance.coreScopeKey) {
      try { scopeKeyDecrypted = decrypt(instance.coreScopeKey); } catch { /* ignore */ }
    }

    // For external instances, fetch connection status from Core
    let connected: boolean | undefined;
    if (instance.deploymentType === "external") {
      const { coreUrl, serviceKey } = getCoreConfig();
      try {
        const statusRes = await fetch(`${coreUrl}/api/scopes/${encodeURIComponent(instance.scopeName)}/tools`, {
          headers: { "x-api-key": serviceKey },
        });
        if (statusRes.ok) {
          const data = await statusRes.json();
          connected = data.connected ?? false;
        } else {
          connected = false;
        }
      } catch { connected = false; }
    }

    res.json({
      instance: {
        ...instance,
        // Synthesize template for templateless instances
        template: instance.template ?? {
          id: null,
          slug: instance.scopeName,
          name: instance.name,
          description: instance.description || null,
          icon: "Plug",
          category: instance.deploymentType === "external" ? "external" : "custom",
          requiredProfileFields: [],
          tools: [],
          instructions: null,
        },
        configs,
        coreScopeKey: scopeKeyDecrypted,
        ...(connected !== undefined ? { connected } : {}),
      },
    });
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

      // Create config entries: user-provided or template defaults
      const cfgList = (configs && Array.isArray(configs) && configs.length > 0)
        ? configs
        : (getTemplateById(templateId)?.defaultEnv ?? []);
      for (const cfg of cfgList) {
        if (!cfg.key) continue;
        await tx.scopeInstanceConfig.create({
          data: {
            instanceId: inst.id,
            key: cfg.key,
            value: cfg.isSecret && cfg.value ? encrypt(cfg.value) : (cfg.value ?? ""),
            isSecret: !!cfg.isSecret,
          },
        });
      }

      return inst;
    });

    // Provision a Core scope key for this instance (non-blocking)
    provisionAndStoreScopeKey(instance.id, instance.scopeName).catch((err) => {
      console.error(`[scopes] Scope key provisioning failed for ${instance.scopeName}:`, err);
    });

    // Auto-deploy for platform/custom types (non-blocking)
    const autoDeploy = req.body.autoDeploy === true;
    if (autoDeploy && (deploymentType === "platform" || deploymentType === "custom") && imageUrl) {
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

    const { name, description, active, configs, _replaceAllConfigs } = req.body;

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
        if (_replaceAllConfigs) {
          // Full replace mode: the payload is the complete set of configs.
          // 1. Read existing configs so we can preserve encrypted secret values
          const existingConfigs = await tx.scopeInstanceConfig.findMany({
            where: { instanceId: inst.id },
            select: { key: true, value: true, isSecret: true },
          });
          const existingMap = new Map(existingConfigs.map((c) => [c.key, c]));

          // 2. Delete all existing configs
          await tx.scopeInstanceConfig.deleteMany({ where: { instanceId: inst.id } });

          // 3. Re-create from payload
          for (const cfg of configs) {
            if (!cfg.key) continue;
            let value: string;
            if (cfg._keepExisting) {
              // Secret with no new value — preserve existing encrypted value as-is
              const existing = existingMap.get(cfg.key);
              value = existing?.value ?? "";
            } else {
              value = cfg.isSecret ? encrypt(cfg.value) : cfg.value;
            }
            await tx.scopeInstanceConfig.create({
              data: {
                instanceId: inst.id,
                key: cfg.key,
                value,
                isSecret: !!cfg.isSecret,
              },
            });
          }
        } else {
          // Legacy upsert mode (for backward compatibility)
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
      }

      return inst;
    });

    // Refetch configs so the response includes them (decrypted, Coolify-style)
    const updatedConfigs = await prisma.scopeInstanceConfig.findMany({
      where: { instanceId },
      select: { id: true, key: true, isSecret: true, value: true },
    });
    const decryptedConfigs = updatedConfigs.map((c) => {
      let value = c.value ?? "";
      if (c.isSecret && value) {
        try { value = decrypt(value); } catch { /* return raw if decrypt fails */ }
      }
      return { id: c.id, key: c.key, isSecret: c.isSecret, value, hasValue: !!c.value };
    });

    res.json({
      instance: {
        ...updated,
        template: updated.template ?? {
          id: null,
          slug: updated.scopeName,
          name: updated.name,
          icon: "Plug",
          category: updated.deploymentType === "external" ? "external" : "custom",
        },
        configs: decryptedConfigs,
      },
    });
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

    const result = await deployInstance(instance.id, auth.userId);
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
// DEPLOYMENT HISTORY
// =============================================================================

// GET /api/scopes/instances/:id/deployments — List deployment history for an instance
router.get("/instances/:id/deployments", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) { res.status(auth.status).json({ error: auth.error }); return; }

  try {
    const instance = await prisma.scopeInstance.findUnique({ where: { id: req.params.id as string } });
    if (!instance) { res.status(404).json({ error: "Instance not found" }); return; }
    if (instance.ownerId !== auth.userId) { res.status(403).json({ error: "Not authorized" }); return; }

    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const [deployments, total] = await Promise.all([
      prisma.scopeDeployment.findMany({
        where: { instanceId: instance.id },
        orderBy: { startedAt: "desc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          status: true,
          triggeredBy: true,
          imageUrl: true,
          containerId: true,
          errorMessage: true,
          startedAt: true,
          finishedAt: true,
        },
      }),
      prisma.scopeDeployment.count({ where: { instanceId: instance.id } }),
    ]);

    res.json({ deployments, total });
  } catch (error: any) {
    console.error("List deployments error:", error);
    res.status(500).json({ error: "Failed to list deployments" });
  }
});

// GET /api/scopes/instances/:id/deployments/:deploymentId — Get deployment details + logs
router.get("/instances/:id/deployments/:deploymentId", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) { res.status(auth.status).json({ error: auth.error }); return; }

  try {
    const instance = await prisma.scopeInstance.findUnique({ where: { id: req.params.id as string } });
    if (!instance) { res.status(404).json({ error: "Instance not found" }); return; }
    if (instance.ownerId !== auth.userId) { res.status(403).json({ error: "Not authorized" }); return; }

    const deployment = await prisma.scopeDeployment.findUnique({
      where: { id: req.params.deploymentId as string },
    });
    if (!deployment || deployment.instanceId !== instance.id) {
      res.status(404).json({ error: "Deployment not found" });
      return;
    }

    res.json({ deployment });
  } catch (error: any) {
    console.error("Get deployment error:", error);
    res.status(500).json({ error: "Failed to get deployment" });
  }
});

// GET /api/scopes/instances/:id/deployments/:deploymentId/stream — SSE real-time deployment logs
// Supports auth via ?token= query param (EventSource doesn't support custom headers)
router.get("/instances/:id/deployments/:deploymentId/stream", async (req: Request, res: Response) => {
  // Accept token from query param for SSE (EventSource can't set headers)
  const tokenFromQuery = req.query.token as string | undefined;
  if (tokenFromQuery && !req.headers.authorization) {
    req.headers.authorization = `Bearer ${tokenFromQuery}`;
  }
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) { res.status(auth.status).json({ error: auth.error }); return; }

  try {
    const instance = await prisma.scopeInstance.findUnique({ where: { id: req.params.id as string } });
    if (!instance) { res.status(404).json({ error: "Instance not found" }); return; }
    if (instance.ownerId !== auth.userId) { res.status(403).json({ error: "Not authorized" }); return; }

    const deployment = await prisma.scopeDeployment.findUnique({
      where: { id: req.params.deploymentId as string },
    });
    if (!deployment || deployment.instanceId !== instance.id) {
      res.status(404).json({ error: "Deployment not found" });
      return;
    }

    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const deploymentId = deployment.id;

    // Send existing logs first (replay)
    if (deployment.logs) {
      for (const line of deployment.logs.split("\n").filter(Boolean)) {
        res.write(`data: ${JSON.stringify({ type: "log", line })}\n\n`);
      }
    }

    // If already finished, send done event and close
    if (deployment.status === "success" || deployment.status === "failed" || deployment.status === "stopped") {
      res.write(`data: ${JSON.stringify({ type: "done", status: deployment.status })}\n\n`);
      res.end();
      return;
    }

    // Subscribe to live log events
    const onLog = (line: string) => {
      res.write(`data: ${JSON.stringify({ type: "log", line })}\n\n`);
    };
    const onDone = (status: string) => {
      res.write(`data: ${JSON.stringify({ type: "done", status })}\n\n`);
      cleanup();
      res.end();
    };

    function cleanup() {
      deploymentEvents.removeListener(`log:${deploymentId}`, onLog);
      deploymentEvents.removeListener(`done:${deploymentId}`, onDone);
    }

    deploymentEvents.on(`log:${deploymentId}`, onLog);
    deploymentEvents.on(`done:${deploymentId}`, onDone);

    // Cleanup on client disconnect
    req.on("close", cleanup);

    // Safety timeout: close after 5 minutes
    const timeout = setTimeout(() => {
      cleanup();
      res.write(`data: ${JSON.stringify({ type: "timeout" })}\n\n`);
      res.end();
    }, 5 * 60 * 1000);

    req.on("close", () => clearTimeout(timeout));
  } catch (error: any) {
    console.error("Deployment stream error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to stream deployment logs" });
    }
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
        template: inst.template ?? {
          id: null,
          slug: inst.scopeName,
          name: inst.name,
          icon: "Plug",
          category: inst.deploymentType === "external" ? "external" : "custom",
          requiredProfileFields: [],
        },
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

    const { coreUrl, serviceKey } = getCoreConfig();

    // Handle built-in "spaces" scope — no DB instance, just add to haseef's scopes[]
    if (instanceId === "built-in-spaces") {
      const coreRes = await fetch(`${coreUrl}/api/haseefs/${haseefId}`, {
        headers: { "x-api-key": serviceKey },
      });
      if (!coreRes.ok) {
        res.status(502).json({ error: "Failed to fetch haseef from Core" });
        return;
      }
      const { haseef } = await coreRes.json();
      const currentScopes: string[] = haseef.scopes ?? [];
      if (currentScopes.includes("spaces")) {
        res.status(409).json({ error: "Scope is already attached to this haseef" });
        return;
      }

      const haseefKey = await getDecryptedHaseefKey(auth.userId, haseefId);
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (haseefKey) {
        headers["x-haseef-key"] = haseefKey;
      } else {
        headers["x-api-key"] = serviceKey;
      }

      const updateRes = await fetch(`${coreUrl}/api/haseefs/${haseefId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ scopes: [...currentScopes, "spaces"] }),
      });
      if (!updateRes.ok) {
        const text = await updateRes.text();
        res.status(502).json({ error: `Failed to attach scope in Core: ${text}` });
        return;
      }

      res.json({ success: true, scopeName: "spaces" });
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
    const coreRes = await fetch(`${coreUrl}/api/haseefs/${haseefId}`, {
      headers: { "x-api-key": serviceKey },
    });
    if (!coreRes.ok) {
      res.status(502).json({ error: "Failed to fetch haseef from Core" });
      return;
    }
    const { haseef } = await coreRes.json();
    const profile = haseef.profileJson ?? {};
    const requiredFields = instance.template?.requiredProfileFields ?? [];

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

    // Retrieve per-resource keys for dual-ownership proof
    const haseefKey = await getDecryptedHaseefKey(auth.userId, haseefId);
    const scopeKey = await getDecryptedScopeKey(instanceId);

    // Build headers: prefer per-resource keys, fall back to service key
    const attachHeaders: Record<string, string> = { "Content-Type": "application/json" };
    if (haseefKey && scopeKey) {
      attachHeaders["x-haseef-key"] = haseefKey;
      attachHeaders["x-scope-key"] = scopeKey;
    } else {
      attachHeaders["x-api-key"] = serviceKey;
    }

    const updateRes = await fetch(`${coreUrl}/api/haseefs/${haseefId}`, {
      method: "PATCH",
      headers: attachHeaders,
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

    // Retrieve per-haseef key for ownership proof (only haseef key needed for detach)
    const haseefKey = await getDecryptedHaseefKey(auth.userId, haseefId);

    const detachHeaders: Record<string, string> = { "Content-Type": "application/json" };
    if (haseefKey) {
      detachHeaders["x-haseef-key"] = haseefKey;
    } else {
      detachHeaders["x-api-key"] = serviceKey;
    }

    // Remove scope from haseef
    const updateRes = await fetch(`${coreUrl}/api/haseefs/${haseefId}`, {
      method: "PATCH",
      headers: detachHeaders,
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

// =============================================================================
// KEY ROTATION
// =============================================================================

// POST /api/scopes/instances/:id/rotate-key — Rotate the Core scope key for an instance
router.post("/instances/:id/rotate-key", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) { res.status(auth.status).json({ error: auth.error }); return; }

  if (req.params.id === "built-in-spaces") {
    res.status(403).json({ error: "Cannot rotate key for built-in scopes" });
    return;
  }

  try {
    const instance = await prisma.scopeInstance.findUnique({
      where: { id: req.params.id as string },
    });
    if (!instance) {
      res.status(404).json({ error: "Instance not found" });
      return;
    }
    if (instance.ownerId !== auth.userId) {
      res.status(403).json({ error: "Not authorized" });
      return;
    }

    const newKey = await provisionAndStoreScopeKey(instance.id, instance.scopeName);
    if (!newKey) {
      res.status(502).json({ error: "Failed to rotate scope key via Core" });
      return;
    }

    res.json({ success: true, keyHint: "..." + newKey.slice(-4) });
  } catch (error) {
    console.error("Rotate scope key error:", error);
    res.status(500).json({ error: "Failed to rotate scope key" });
  }
});

// =============================================================================
// EXTERNAL SCOPE REGISTRATION (self-hosted)
// =============================================================================

// POST /api/scopes/external/verify — Verify a scope key against Core and check for duplicates
router.post("/external/verify", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) { res.status(auth.status).json({ error: auth.error }); return; }

  try {
    const { scopeKey } = req.body;
    if (!scopeKey || typeof scopeKey !== "string") {
      res.status(400).json({ error: "scopeKey is required" });
      return;
    }

    // Basic format check
    if (!scopeKey.startsWith("hsk_scope_")) {
      res.status(400).json({ error: "This is not a scope key. Scope keys start with hsk_scope_" });
      return;
    }

    const { coreUrl, serviceKey } = getCoreConfig();

    // 1. Verify the key is valid by calling GET /api/scopes on Core with it.
    //    Core's requireApiKey() middleware validates the key hash. If 200, the key is active.
    const coreRes = await fetch(`${coreUrl}/api/scopes`, {
      headers: { "x-api-key": scopeKey },
    });

    if (!coreRes.ok) {
      const status = coreRes.status;
      if (status === 401) {
        res.status(400).json({ error: "Invalid or revoked scope key" });
      } else {
        res.status(502).json({ error: `Core returned ${status} — could not verify key` });
      }
      return;
    }

    // Key is valid. Now find the scope name (resourceId) by looking up keys via service key.
    // The key prefix is the first 16 chars of the key.
    const keyPrefix = scopeKey.slice(0, 16);
    const keysRes = await fetch(`${coreUrl}/api/keys?type=scope`, {
      headers: { "x-api-key": serviceKey },
    });

    let scopeName: string | null = null;
    if (keysRes.ok) {
      const { keys } = await keysRes.json();
      const matchedKey = (keys ?? []).find((k: any) => k.keyPrefix === keyPrefix && k.active);
      if (matchedKey) {
        scopeName = matchedKey.resourceId;
      }
    }

    if (!scopeName) {
      res.status(400).json({ error: "Key is valid but could not determine scope name. The key may not be associated with a scope." });
      return;
    }

    // 2. Check if already registered in Spaces DB
    const existing = await prisma.scopeInstance.findUnique({ where: { scopeName } });
    if (existing) {
      res.status(409).json({ error: `Scope "${scopeName}" is already registered in Spaces`, scopeName });
      return;
    }

    // 3. Fetch connection status and tools from Core
    let connected = false;
    let toolCount = 0;
    try {
      const statusRes = await fetch(`${coreUrl}/api/scopes/${encodeURIComponent(scopeName)}/tools`, {
        headers: { "x-api-key": serviceKey },
      });
      if (statusRes.ok) {
        const data = await statusRes.json();
        connected = data.connected ?? false;
        toolCount = data.tools?.length ?? 0;
      }
    } catch { /* ignore */ }

    res.json({ valid: true, scopeName, connected, toolCount });
  } catch (error) {
    console.error("Verify external scope error:", error);
    res.status(500).json({ error: "Failed to verify scope key" });
  }
});

// POST /api/scopes/external — Register a self-hosted scope using scope key
router.post("/external", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) { res.status(auth.status).json({ error: auth.error }); return; }

  try {
    const { scopeName, displayName, scopeKey, description } = req.body;

    if (!scopeName || !displayName || !scopeKey) {
      res.status(400).json({ error: "scopeName, displayName, and scopeKey are required" });
      return;
    }

    if (!/^[a-z][a-z0-9_-]{1,48}$/.test(scopeName)) {
      res.status(400).json({ error: "Scope name must be lowercase, start with a letter, and only contain a-z, 0-9, _, -" });
      return;
    }

    // Check for duplicate in Spaces DB
    const existing = await prisma.scopeInstance.findUnique({ where: { scopeName } });
    if (existing) {
      res.status(409).json({ error: `Scope "${scopeName}" is already registered` });
      return;
    }

    // Verify scope key against Core
    if (!scopeKey.startsWith("hsk_scope_")) {
      res.status(400).json({ error: "This is not a scope key. Scope keys start with hsk_scope_" });
      return;
    }

    const { coreUrl, serviceKey } = getCoreConfig();

    // Validate key by calling Core with it
    const coreRes = await fetch(`${coreUrl}/api/scopes`, {
      headers: { "x-api-key": scopeKey },
    });
    if (!coreRes.ok) {
      res.status(400).json({ error: coreRes.status === 401 ? "Invalid or revoked scope key" : "Could not verify scope key against Core" });
      return;
    }

    // Look up key metadata via service key to confirm it belongs to this scope
    const keyPrefix = scopeKey.slice(0, 16);
    const keysRes = await fetch(`${coreUrl}/api/keys?type=scope`, {
      headers: { "x-api-key": serviceKey },
    });
    if (keysRes.ok) {
      const { keys } = await keysRes.json();
      const matchedKey = (keys ?? []).find((k: any) => k.keyPrefix === keyPrefix && k.active);
      if (matchedKey && matchedKey.resourceId !== scopeName) {
        res.status(400).json({ error: `This scope key belongs to scope "${matchedKey.resourceId}", not "${scopeName}"` });
        return;
      }
      if (!matchedKey) {
        res.status(400).json({ error: "Could not match scope key to a registered scope on Core" });
        return;
      }
    } else {
      res.status(502).json({ error: "Could not verify scope key metadata from Core" });
      return;
    }

    // Create a templateless instance for the external scope
    const instance = await prisma.scopeInstance.create({
      data: {
        name: displayName,
        scopeName,
        description: description || null,
        ownerId: auth.userId,
        active: true,
        deploymentType: "external",
        containerStatus: "stopped",
        coreScopeKey: encrypt(scopeKey),
      },
    });

    res.status(201).json({ instance });
  } catch (error) {
    console.error("Register external scope error:", error);
    res.status(500).json({ error: "Failed to register external scope" });
  }
});

// =============================================================================
// POST /api/scopes/quick-create — One-shot scope creation for CLI
//
// Creates a templateless ScopeInstance + provisions scope key synchronously.
// Returns the plaintext scope key so the CLI can write it to .env.
// =============================================================================
router.post("/quick-create", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) { res.status(auth.status).json({ error: auth.error }); return; }

  try {
    const { scopeName, displayName, description } = req.body;

    if (!scopeName) {
      res.status(400).json({ error: "scopeName is required" });
      return;
    }

    // Validate scope name format
    const finalName = scopeName.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "");
    if (!finalName || finalName.length < 2) {
      res.status(400).json({ error: "Scope name must be at least 2 characters (lowercase letters, numbers, hyphens)" });
      return;
    }

    // Check if already exists — if so, return existing + re-provision key
    const existing = await prisma.scopeInstance.findUnique({ where: { scopeName: finalName } });
    if (existing) {
      // Re-provision key for the existing instance
      const scopeKey = await provisionAndStoreScopeKey(existing.id, existing.scopeName);
      if (!scopeKey) {
        res.status(502).json({ error: "Scope exists but failed to provision key from Core" });
        return;
      }

      const { coreUrl } = getCoreConfig();
      res.json({
        instance: {
          id: existing.id,
          scopeName: existing.scopeName,
          name: existing.name,
          deploymentType: existing.deploymentType,
        },
        scopeKey,
        coreUrl,
        alreadyExisted: true,
      });
      return;
    }

    // Create instance (no template — local/external scopes are templateless)
    const instance = await prisma.scopeInstance.create({
      data: {
        name: displayName || scopeName,
        scopeName: finalName,
        description: description || null,
        ownerId: auth.userId,
        active: true,
        deploymentType: "external",
        containerStatus: "stopped",
      },
    });

    // Provision scope key synchronously
    const scopeKey = await provisionAndStoreScopeKey(instance.id, instance.scopeName);
    if (!scopeKey) {
      res.status(502).json({ error: "Scope created but failed to provision key from Core. Check CORE_SERVICE_KEY." });
      return;
    }

    const { coreUrl } = getCoreConfig();

    res.status(201).json({
      instance: {
        id: instance.id,
        scopeName: instance.scopeName,
        name: instance.name,
        deploymentType: instance.deploymentType,
      },
      scopeKey,
      coreUrl,
      alreadyExisted: false,
    });
  } catch (error) {
    console.error("Quick create scope error:", error);
    res.status(500).json({ error: "Failed to create scope" });
  }
});

// =============================================================================
// GET /api/scopes/resolve-haseef?name=atlas — Resolve haseef by name
// =============================================================================
router.get("/resolve-haseef", async (req: Request, res: Response) => {
  const auth = await requireJwtUser(req);
  if (isJwtError(auth)) { res.status(auth.status).json({ error: auth.error }); return; }

  try {
    const nameQuery = (req.query.name as string || "").trim().toLowerCase();
    if (!nameQuery) {
      res.status(400).json({ error: "name query parameter is required" });
      return;
    }

    // Search user's haseefs by name
    const ownerships = await prisma.haseefOwnership.findMany({
      where: { userId: auth.userId },
      include: { entity: { select: { displayName: true } } },
    });

    const matches = ownerships.filter(o =>
      o.entity.displayName?.toLowerCase() === nameQuery
    );

    if (matches.length === 0) {
      // Try partial match for better UX
      const partial = ownerships.filter(o =>
        o.entity.displayName?.toLowerCase().includes(nameQuery)
      );
      if (partial.length > 0) {
        const names = partial.map(o => o.entity.displayName).join(", ");
        res.status(404).json({ error: `No exact match for "${nameQuery}". Did you mean: ${names}?` });
      } else {
        const allNames = ownerships.map(o => o.entity.displayName).join(", ");
        res.status(404).json({ error: `Haseef "${nameQuery}" not found. Available: ${allNames || "(none)"}` });
      }
      return;
    }

    if (matches.length > 1) {
      res.status(409).json({ error: `Multiple haseefs named "${nameQuery}". Use the haseef ID instead.` });
      return;
    }

    res.json({
      haseef: {
        id: matches[0].haseefId,
        name: matches[0].entity.displayName,
      },
    });
  } catch (error) {
    console.error("Resolve haseef error:", error);
    res.status(500).json({ error: "Failed to resolve haseef" });
  }
});

export default router;
