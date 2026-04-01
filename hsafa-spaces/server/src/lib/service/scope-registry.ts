// =============================================================================
// Scope Registry — Dynamic scope instance loading from DB
//
// At bootstrap, loads all active ScopeInstance rows from the DB, groups them
// by scopeName, creates an HsafaSDK instance per unique scope, registers
// tools from the template, and wires onToolCall to executeAction.
//
// Provides backward-compatible aliases: state.spacesSDK / state.schedulerSDK
// are set to the SDK instances matching the "spaces" / "scheduler" scopeNames.
// =============================================================================

import { HsafaSDK } from "@hsafa/sdk";
import { prisma } from "../db.js";
import { state } from "./types.js";
import { executeAction } from "./tool-handlers.js";
import { SCOPE_TEMPLATES } from "../scope-templates.js";

/**
 * Ensure prebuilt scope templates and their platform-owned instances exist in DB.
 * Upserts from the code-defined SCOPE_TEMPLATES — no seed script needed.
 * Must be called before loadScopesFromDB().
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
      // Need the DB template ID (may differ from code ID if it was created before)
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

  console.log(`[scope-registry] Prebuilt scopes ensured (${SCOPE_TEMPLATES.length} templates)`);
}

export interface RegisteredScope {
  scopeName: string;
  templateSlug: string;
  sdk: HsafaSDK;
  tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
  instructions: string | null;
  instanceIds: string[];
}

/** Map of scopeName → RegisteredScope */
export const scopeRegistry = new Map<string, RegisteredScope>();

/**
 * Load active scope instances from DB, create SDK instances, register tools.
 * Sets state.spacesSDK and state.schedulerSDK for backward compatibility.
 *
 * Must be called AFTER state.config is set.
 */
export async function loadScopesFromDB(): Promise<void> {
  const config = state.config;
  if (!config) return;

  // Clear previous registrations
  for (const entry of scopeRegistry.values()) {
    try { entry.sdk.disconnect(); } catch { /* ignore */ }
  }
  scopeRegistry.clear();
  state.spacesSDK = null;
  state.schedulerSDK = null;

  // Load all active scope instances with their templates
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

  if (instances.length === 0) {
    console.warn("[scope-registry] No active scope instances found in DB");
    return;
  }

  // Group by scopeName (one SDK per unique scope name)
  const byScope = new Map<string, typeof instances>();
  for (const inst of instances) {
    const arr = byScope.get(inst.scopeName) ?? [];
    arr.push(inst);
    byScope.set(inst.scopeName, arr);
  }

  console.log(`[scope-registry] Found ${instances.length} active instance(s) across ${byScope.size} scope(s)`);

  for (const [scopeName, scopeInstances] of byScope) {
    // Use the first instance's template for tools/instructions
    // (all instances of the same scopeName should share the same template)
    const firstInst = scopeInstances[0];
    const templateSlug = firstInst.template.slug;
    const rawTools = firstInst.template.tools as Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
    const instructions = firstInst.template.instructions ?? null;

    // Create SDK instance for this scope
    const sdk = new HsafaSDK({
      coreUrl: config.coreUrl,
      apiKey: config.apiKey,
      scope: scopeName,
    });

    // Register tools globally on the SDK
    try {
      await sdk.registerTools(
        rawTools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
      );
      console.log(`[scope-registry] Registered ${rawTools.length} tools for scope "${scopeName}" (template: ${templateSlug})`);
    } catch (err) {
      console.error(`[scope-registry] Failed to register tools for scope "${scopeName}":`, err);
    }

    // Register onToolCall handlers — route to executeAction
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
    };

    scopeRegistry.set(scopeName, entry);

    // Backward-compatible aliases
    if (scopeName === "spaces") {
      state.spacesSDK = sdk;
    } else if (scopeName === "scheduler") {
      state.schedulerSDK = sdk;
    }
  }

  console.log(`[scope-registry] Scope registry initialized: [${[...scopeRegistry.keys()].join(", ")}]`);
}

/**
 * Connect all registered scope SDKs (start SSE).
 * Must be called AFTER loadScopesFromDB() and lifecycle handler registration.
 */
export function connectAllScopes(): void {
  for (const [scopeName, entry] of scopeRegistry) {
    entry.sdk.connect();
    console.log(`[scope-registry] Connected SDK for scope "${scopeName}"`);
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
