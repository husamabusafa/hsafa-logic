// =============================================================================
// Scope Registry — Built-in spaces scope + dynamic plugin loading from DB
//
// Architecture:
//   "spaces" = BUILT-IN scope. Always created, always connected, not a template.
//              Managed entirely in code — no ScopeInstance row needed.
//
//   Other scopes (scheduler, whatsapp, custom, etc.) = PLUGINS.
//              Loaded from ScopeInstance rows in DB, grouped by scopeName,
//              one HsafaSDK per unique scope. Templates define tools.
//
// Provides backward-compatible aliases: state.spacesSDK / state.schedulerSDK
// =============================================================================

import { HsafaSDK } from "@hsafa/sdk";
import { prisma } from "../db.js";
import { state } from "./types.js";
import { executeAction } from "./tool-handlers.js";
import { SCOPE_TEMPLATES } from "../scope-templates.js";
import { SCOPE, TOOLS, SCOPE_INSTRUCTIONS } from "./manifest.js";

export interface RegisteredScope {
  scopeName: string;
  templateSlug: string | null; // null for built-in (spaces)
  sdk: HsafaSDK;
  tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
  instructions: string | null;
  instanceIds: string[]; // empty for built-in
  builtIn: boolean;
}

/** Map of scopeName → RegisteredScope */
export const scopeRegistry = new Map<string, RegisteredScope>();

// =============================================================================
// Ensure Prebuilt Templates — sync installable plugin templates to DB
// =============================================================================

/**
 * Ensure prebuilt plugin templates and their platform-owned instances exist in DB.
 * Upserts from the code-defined SCOPE_TEMPLATES — no seed script needed.
 *
 * NOTE: "spaces" is NOT a template. It's a built-in scope handled separately.
 */
export async function ensurePrebuiltScopes(): Promise<void> {
  for (const tmpl of SCOPE_TEMPLATES) {
    // Upsert template row (code is source of truth)
    await prisma.scopeTemplate.upsert({
      where: { slug: tmpl.slug },
      update: {
        name: tmpl.name,
        description: tmpl.description,
        icon: tmpl.icon,
        category: tmpl.category,
        configSchema: tmpl.configSchema as any,
        requiredProfileFields: tmpl.requiredProfileFields,
        tools: tmpl.tools as any,
        instructions: tmpl.instructions,
        published: tmpl.published,
      },
      create: {
        id: tmpl.id,
        slug: tmpl.slug,
        name: tmpl.name,
        description: tmpl.description,
        icon: tmpl.icon,
        category: tmpl.category,
        configSchema: tmpl.configSchema as any,
        requiredProfileFields: tmpl.requiredProfileFields,
        tools: tmpl.tools as any,
        instructions: tmpl.instructions,
        published: tmpl.published,
      },
    });

    // Ensure platform-owned instance exists for this template
    const existing = await prisma.scopeInstance.findUnique({
      where: { scopeName: tmpl.slug },
    });
    if (!existing) {
      const dbTemplate = await prisma.scopeTemplate.findUnique({ where: { slug: tmpl.slug } });
      if (dbTemplate) {
        await prisma.scopeInstance.create({
          data: {
            templateId: dbTemplate.id,
            name: tmpl.name,
            scopeName: tmpl.slug,
            description: tmpl.description,
            ownerId: null, // platform-owned
            active: true,
          },
        });
        console.log(`[scope-registry] Created platform instance for "${tmpl.slug}"`);
      }
    }
  }

  console.log(`[scope-registry] Prebuilt plugin templates ensured (${SCOPE_TEMPLATES.length} templates)`);
}

// =============================================================================
// Load Scopes — built-in spaces + plugin scopes from DB
// =============================================================================

/**
 * Create the built-in spaces SDK, then load plugin scope instances from DB.
 * Sets state.spacesSDK and state.schedulerSDK for backward compatibility.
 *
 * Must be called AFTER state.config is set.
 */
export async function loadScopes(): Promise<void> {
  const config = state.config;
  if (!config) return;

  // Clear previous registrations
  for (const entry of scopeRegistry.values()) {
    try { entry.sdk.disconnect(); } catch { /* ignore */ }
  }
  scopeRegistry.clear();
  state.spacesSDK = null;
  state.schedulerSDK = null;

  // ── 1. Built-in: spaces scope (always created, not from DB) ────────────────
  await createBuiltInSpacesScope(config);

  // ── 2. Plugin scopes: loaded from ScopeInstance rows in DB ─────────────────
  await loadPluginScopesFromDB(config);

  console.log(`[scope-registry] Registry initialized: [${[...scopeRegistry.keys()].join(", ")}]`);
}

/**
 * Create the built-in spaces SDK — always exists, always connected.
 * Not driven by DB. Tools and instructions come from manifest.ts.
 */
async function createBuiltInSpacesScope(config: { coreUrl: string; apiKey: string }): Promise<void> {
  const spacesTools = TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));

  const sdk = new HsafaSDK({
    coreUrl: config.coreUrl,
    apiKey: config.apiKey,
    scope: SCOPE, // "spaces"
  });

  // Register tools
  try {
    await sdk.registerTools(spacesTools);
    console.log(`[scope-registry] Built-in "spaces" scope: registered ${spacesTools.length} tools`);
  } catch (err) {
    console.error(`[scope-registry] Failed to register built-in spaces tools:`, err);
  }

  // Wire tool handlers
  for (const tool of spacesTools) {
    sdk.onToolCall(tool.name, async (args, ctx) => {
      return executeAction(ctx.haseef.id, ctx.actionId, tool.name, args);
    });
  }

  const entry: RegisteredScope = {
    scopeName: SCOPE,
    templateSlug: null, // built-in, not from a template
    sdk,
    tools: spacesTools,
    instructions: SCOPE_INSTRUCTIONS,
    instanceIds: [],
    builtIn: true,
  };

  scopeRegistry.set(SCOPE, entry);
  state.spacesSDK = sdk;
}

/**
 * Load plugin scope instances from DB, create SDK instances, register tools.
 * Skips any instance with scopeName === "spaces" (handled as built-in above).
 */
async function loadPluginScopesFromDB(config: { coreUrl: string; apiKey: string }): Promise<void> {
  const instances = await prisma.scopeInstance.findMany({
    where: { active: true },
    include: {
      template: {
        select: {
          slug: true,
          tools: true,
          instructions: true,
        },
      },
    },
  });

  // Filter out any stale "spaces" instance from DB (no longer needed)
  const pluginInstances = instances.filter((i) => i.scopeName !== SCOPE);

  if (pluginInstances.length === 0) {
    console.log("[scope-registry] No active plugin scope instances found in DB");
    return;
  }

  // Group by scopeName (one SDK per unique scope name)
  const byScope = new Map<string, typeof pluginInstances>();
  for (const inst of pluginInstances) {
    const arr = byScope.get(inst.scopeName) ?? [];
    arr.push(inst);
    byScope.set(inst.scopeName, arr);
  }

  console.log(`[scope-registry] Found ${pluginInstances.length} plugin instance(s) across ${byScope.size} scope(s)`);

  for (const [scopeName, scopeInstances] of byScope) {
    const firstInst = scopeInstances[0];
    const templateSlug = firstInst.template.slug;
    const rawTools = firstInst.template.tools as Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
    const instructions = firstInst.template.instructions ?? null;

    const sdk = new HsafaSDK({
      coreUrl: config.coreUrl,
      apiKey: config.apiKey,
      scope: scopeName,
    });

    // Register tools
    try {
      await sdk.registerTools(
        rawTools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
      );
      console.log(`[scope-registry] Plugin "${scopeName}": registered ${rawTools.length} tools (template: ${templateSlug})`);
    } catch (err) {
      console.error(`[scope-registry] Failed to register tools for plugin "${scopeName}":`, err);
    }

    // Wire tool handlers
    for (const tool of rawTools) {
      sdk.onToolCall(tool.name, async (args, ctx) => {
        return executeAction(ctx.haseef.id, ctx.actionId, tool.name, args);
      });
    }

    const entry: RegisteredScope = {
      scopeName,
      templateSlug,
      sdk,
      tools: rawTools,
      instructions,
      instanceIds: scopeInstances.map((i) => i.id),
      builtIn: false,
    };

    scopeRegistry.set(scopeName, entry);

    // Backward-compatible alias
    if (scopeName === "scheduler") {
      state.schedulerSDK = sdk;
    }
  }
}

/**
 * Connect all registered scope SDKs (start SSE).
 * Must be called AFTER loadScopes() and lifecycle handler registration.
 */
export function connectAllScopes(): void {
  for (const [scopeName, entry] of scopeRegistry) {
    entry.sdk.connect();
    const label = entry.builtIn ? "built-in" : "plugin";
    console.log(`[scope-registry] Connected ${label} scope "${scopeName}"`);
  }
}

/**
 * Get tools for a specific scope by name.
 */
export function getToolsForScope(scopeName: string): Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> {
  return scopeRegistry.get(scopeName)?.tools ?? [];
}

/**
 * Get instructions for a specific scope by name.
 */
export function getInstructionsForScope(scopeName: string): string | null {
  return scopeRegistry.get(scopeName)?.instructions ?? null;
}

/**
 * Get the SDK instance for a specific scope.
 */
export function getSDKForScope(scopeName: string): HsafaSDK | null {
  return scopeRegistry.get(scopeName)?.sdk ?? null;
}
