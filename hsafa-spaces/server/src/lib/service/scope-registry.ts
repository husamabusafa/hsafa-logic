// =============================================================================
// Scope Registry — Unified plugin lifecycle manager
//
// Architecture:
//   Every scope (spaces, scheduler, postgres, future custom) implements
//   ScopePlugin. This registry runs one uniform loop:
//
//     for each plugin:
//       1. shouldLoad?() — skip if not needed
//       2. create HsafaSDK
//       3. sdk.registerTools(plugin.tools)
//       4. sdk.onToolCall → plugin.handleToolCall
//       5. plugin.init(sdk, config) — scope-specific setup
//       6. sdk.connect() — start SSE
//
//   No more SELF_MANAGED_SCOPES. No 3-way fork. One path for all.
// =============================================================================

import { HsafaSDK } from "@hsafa/sdk";
import { prisma } from "../db.js";
import { state } from "./types.js";
import { SCOPE_TEMPLATES } from "../scope-templates/index.js";
import type { ScopePlugin } from "./scope-plugin.js";
import { ALL_PLUGINS } from "./plugins/index.js";

// =============================================================================
// Registered Scope Entry — what the registry stores per loaded plugin
// =============================================================================

export interface RegisteredScope {
  scopeName: string;
  plugin: ScopePlugin;
  sdk: HsafaSDK;
}

/** Map of scopeName → RegisteredScope */
export const scopeRegistry = new Map<string, RegisteredScope>();

/** Get the loaded plugin array (for instruction assembly, etc.) */
export function getLoadedPlugins(): ScopePlugin[] {
  return [...scopeRegistry.values()].map((e) => e.plugin);
}

// =============================================================================
// Ensure Prebuilt Templates — sync installable plugin templates to DB
// =============================================================================

export async function ensurePrebuiltScopes(): Promise<void> {
  for (const tmpl of SCOPE_TEMPLATES) {
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
  }

  console.log(`[scope-registry] Prebuilt templates ensured (${SCOPE_TEMPLATES.length})`);
}

// =============================================================================
// Load & Init — unified plugin lifecycle
// =============================================================================

/**
 * Load all scope plugins: check shouldLoad → create SDK → register tools →
 * wire handlers → init → connect.
 *
 * Must be called AFTER state.config is set.
 */
export async function loadScopes(): Promise<void> {
  const config = state.config;
  if (!config) return;

  // Tear down previous registrations
  await stopAllScopes();

  for (const plugin of ALL_PLUGINS) {
    // 1. Check if this plugin should load
    if (plugin.shouldLoad) {
      const shouldLoad = await plugin.shouldLoad(config);
      if (!shouldLoad) {
        console.log(`[scope-registry] "${plugin.name}" — skipped (shouldLoad=false)`);
        continue;
      }
    }

    // 2. Request a scope key from Core for this plugin
    let scopeKey: string;
    try {
      scopeKey = await requestScopeKey(config, plugin.name);
    } catch (err) {
      console.error(`[scope-registry] "${plugin.name}" — failed to obtain scope key:`, err);
      continue;
    }

    // 3. Create SDK with per-scope key
    const sdk = new HsafaSDK({
      coreUrl: config.coreUrl,
      apiKey: scopeKey,
      scope: plugin.name,
    });

    // 4. Register tools
    try {
      const toolDefs = plugin.tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      }));
      await sdk.registerTools(toolDefs);
      console.log(`[scope-registry] "${plugin.name}" — registered ${toolDefs.length} tools`);
    } catch (err) {
      console.error(`[scope-registry] "${plugin.name}" — tool registration failed:`, err);
    }

    // 5. Wire tool handlers
    for (const tool of plugin.tools) {
      sdk.onToolCall(tool.name, async (args, ctx) => {
        return plugin.handleToolCall(tool.name, args, {
          haseef: ctx.haseef,
          actionId: ctx.actionId,
        });
      });
    }

    // 6. Init (scope-specific setup: pollers, pools, listeners, etc.)
    try {
      await plugin.init(sdk, config);
    } catch (err) {
      console.error(`[scope-registry] "${plugin.name}" — init failed:`, err);
    }

    // 7. Connect SSE
    sdk.connect();
    console.log(`[scope-registry] "${plugin.name}" — connected`);

    // Store in registry
    scopeRegistry.set(plugin.name, { scopeName: plugin.name, plugin, sdk });

    // Special: spaces SDK is stored in global state for stream-bridge access
    if (plugin.name === "spaces") {
      state.spacesSDK = sdk;
    }
  }

  console.log(`[scope-registry] Loaded: [${[...scopeRegistry.keys()].join(", ")}]`);
}

/**
 * Stop all scopes: call plugin.stop() then sdk.disconnect().
 */
export async function stopAllScopes(): Promise<void> {
  for (const [, entry] of scopeRegistry) {
    try { await entry.plugin.stop(); } catch { /* ignore */ }
    try { entry.sdk.disconnect(); } catch { /* ignore */ }
  }
  scopeRegistry.clear();
  state.spacesSDK = null;
}

// =============================================================================
// Dynamic Registration — for future CLI-added scopes
// =============================================================================

/**
 * Register and start a single plugin at runtime (e.g. user-added via CLI).
 * Skips if already loaded or if shouldLoad returns false.
 */
export async function registerPlugin(plugin: ScopePlugin): Promise<boolean> {
  const config = state.config;
  if (!config) return false;
  if (scopeRegistry.has(plugin.name)) return false;

  if (plugin.shouldLoad) {
    const shouldLoad = await plugin.shouldLoad(config);
    if (!shouldLoad) return false;
  }

  let scopeKey: string;
  try {
    scopeKey = await requestScopeKey(config, plugin.name);
  } catch (err) {
    console.error(`[scope-registry] "${plugin.name}" — failed to obtain scope key:`, err);
    return false;
  }

  const sdk = new HsafaSDK({
    coreUrl: config.coreUrl,
    apiKey: scopeKey,
    scope: plugin.name,
  });

  await sdk.registerTools(plugin.tools.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })));
  for (const tool of plugin.tools) {
    sdk.onToolCall(tool.name, async (args, ctx) => plugin.handleToolCall(tool.name, args, { haseef: ctx.haseef, actionId: ctx.actionId }));
  }
  await plugin.init(sdk, config);
  sdk.connect();

  scopeRegistry.set(plugin.name, { scopeName: plugin.name, plugin, sdk });
  console.log(`[scope-registry] Dynamically registered "${plugin.name}"`);
  return true;
}

// =============================================================================
// Accessors
// =============================================================================

export function getSDKForScope(scopeName: string): HsafaSDK | null {
  return scopeRegistry.get(scopeName)?.sdk ?? null;
}

export function getPluginForScope(scopeName: string): ScopePlugin | undefined {
  return scopeRegistry.get(scopeName)?.plugin;
}

// =============================================================================
// Scope Key Provisioning — request per-scope keys from Core
// =============================================================================

/**
 * Request a scope key from Core via the service key.
 * Revokes any existing scope keys for this scope, then creates a fresh one.
 */
async function requestScopeKey(config: import("./config.js").ServiceConfig, scopeName: string): Promise<string> {
  const authHeaders = { "Content-Type": "application/json", "x-api-key": config.serviceKey };

  // Revoke existing scope keys for this scope (cleanup from previous boots)
  try {
    const listRes = await fetch(`${config.coreUrl}/api/keys?type=scope&resourceId=${encodeURIComponent(scopeName)}`, {
      headers: authHeaders,
    });
    if (listRes.ok) {
      const { keys } = await listRes.json();
      for (const k of keys ?? []) {
        await fetch(`${config.coreUrl}/api/keys/${k.id}/revoke`, { method: "POST", headers: authHeaders });
      }
    }
  } catch { /* best-effort cleanup */ }

  // Create fresh scope key
  const res = await fetch(`${config.coreUrl}/api/keys`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      type: "scope",
      resourceId: scopeName,
      description: `Scope key for "${scopeName}" (auto-provisioned by Spaces)`,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to create scope key (${res.status}): ${text}`);
  }

  const { key } = await res.json();
  return key;
}
