// =============================================================================
// Spaces Service Module (v7)
//
// The spaces-app connects to hsafa-core via @hsafa/sdk over SSE.
//
//   1. Bootstrap: create SDK instances, discover haseefs, resolve entities,
//      register tools globally, register lifecycle handlers, connect SSE
//   2. Tool execution: send_message, get_messages, send_confirmation, etc.
//   3. Action listener: SDK SSE receives tool calls, routes to executeAction
//   4. Stream bridge: SDK lifecycle events → space SSE channels
//   5. Sense events: pushes space messages to Core via v5 events API
//
// v7 protocol: registerTools (global) → onToolCall → connect (SSE) → execute
//
// Split into sub-modules for clarity:
//   types.ts           — shared state, types, connection helpers
//   config.ts          — env var loading (coreUrl, apiKey)
//   core-api.ts        — Core HTTP helpers (sync per-haseef instructions, sense events)
//   tool-handlers.ts   — tool execution (executeAction + all case handlers)
//   action-listener.ts — SDK onToolCall registration + connect()
//   stream-bridge.ts   — SDK lifecycle event handlers → space SSE
//   sense-events.ts    — inbox handler, seen watermark, interactive message events
// =============================================================================

import { prisma } from "../db.js";
import { getSpacesForEntity } from "../membership-service.js";
import { loadServiceConfig } from "./config.js";
import { SCOPE } from "./manifest.js";
import { setInboxHandler } from "./inbox.js";
import { state } from "./types.js";
import { coreHeaders, syncTools } from "./core-api.js";
import { invalidateEntitySpacesCache } from "../membership-service.js";
import { registerLifecycleHandlers } from "./stream-bridge.js";
import { handleInboxMessage } from "./sense-events.js";
import { startScheduler } from "./scheduler.js";
import { syncSchedulesToRedis } from "./schedule-service.js";
import { startPresenceCleanup, stopPresenceCleanup } from "../smartspace-events.js";
import { ensurePrebuiltScopes, loadScopesFromDB, connectAllScopes } from "./scope-registry.js";

// Re-export public API so existing imports from "./service/index.js" keep working
export { getConnectionsForSpace, getConnectionForHaseef } from "./types.js";
export { pushMessageResponseEvent, pushMessageResolvedEvent } from "./sense-events.js";

// =============================================================================
// Bootstrap
// =============================================================================

export async function bootstrapExtension(): Promise<void> {
  console.log(`[spaces-service] Bootstrapping... (${new Date().toISOString()})`);

  // Reset stale state from previous process (tsx watch restart)
  if (state.spacesSDK) { state.spacesSDK.disconnect(); state.spacesSDK = null; }
  if (state.schedulerSDK) { state.schedulerSDK.disconnect(); state.schedulerSDK = null; }
  state.connections.clear();

  const config = loadServiceConfig();
  if (!config) {
    console.warn("[spaces-service] Service disabled (missing config)");
    return;
  }
  state.config = config;

  // Register inbox handler
  setInboxHandler(handleInboxMessage);

  // ── Ensure prebuilt scope templates + instances exist in DB (from code) ────
  await ensurePrebuiltScopes();

  // ── Load scope instances from DB, create SDK instances, register tools ─────
  await loadScopesFromDB();

  // ── Register lifecycle event handlers (stream bridge) ─────────────────────
  registerLifecycleHandlers();

  // ── Auto-discover haseefs from Core ───────────────────────────────────────
  const haseefs = await discoverHaseefs();
  if (haseefs.length === 0) {
    console.warn("[spaces-service] No haseefs found in Core — nothing to connect to");
    return;
  }

  // For each discovered haseef: set up connection + sync per-haseef instructions
  for (const h of haseefs) {
    try {
      await setupHaseefConnection(h);
    } catch (err) {
      console.error(`[spaces-service] Failed to set up haseef ${h.id}:`, err);
    }
  }

  // ── Start SDK SSE connections for all registered scopes ────────────────────
  connectAllScopes();

  // Hydrate Redis sorted set from DB, then start the schedule poller
  await syncSchedulesToRedis();
  startScheduler();

  // Start presence cleanup job — removes stale online SET entries after crashes
  startPresenceCleanup(() => {
    const allSpaceIds = new Set<string>();
    for (const conn of state.connections.values()) {
      for (const sid of conn.spaceIds) allSpaceIds.add(sid);
    }
    return [...allSpaceIds];
  });

  // Re-sync all connected haseefs to ensure they have the latest instructions + prompt
  for (const conn of state.connections.values()) {
    syncTools(conn.haseefId).catch((err: unknown) => {
      console.error(`[spaces-service] Failed to re-sync tools at bootstrap for ${conn.haseefName}:`, err);
    });
  }

  console.log("[spaces-service] Bootstrap complete (v7 — SDK over SSE)");
}

/** Discover all haseefs from Core via GET /api/haseefs */
async function discoverHaseefs(): Promise<
  Array<{ id: string; name: string; profileJson?: Record<string, unknown>; configJson?: Record<string, unknown> }>
> {
  try {
    const url = `${state.config!.coreUrl}/api/haseefs`;
    const res = await fetch(url, { headers: coreHeaders() });
    if (!res.ok) {
      console.error(`[spaces-service] Failed to list haseefs: ${res.status}`);
      return [];
    }
    const data = await res.json();
    const haseefs = data.haseefs ?? [];
    console.log(`[spaces-service] Discovered ${haseefs.length} haseef(s) from Core`);
    return haseefs;
  } catch (err) {
    console.error("[spaces-service] Failed to discover haseefs:", err);
    return [];
  }
}

/** Set up a single haseef connection: read entityId from profile, resolve spaces, sync tools */
async function setupHaseefConnection(haseef: {
  id: string;
  name: string;
  profileJson?: Record<string, unknown>;
  configJson?: Record<string, unknown>;
}): Promise<void> {
  const haseefId = haseef.id;
  const haseefName = haseef.name;

  // Read entityId from haseef profile — the canonical link between Core and Spaces
  let agentEntityId = haseef.profileJson?.entityId as string | undefined;

  if (!agentEntityId) {
    // Fallback: find or create entity by haseef name
    let entity = await prisma.entity.findFirst({
      where: { displayName: haseefName, type: "agent" },
      select: { id: true },
    });

    if (!entity) {
      const newId = crypto.randomUUID();
      entity = await prisma.entity.create({
        data: {
          id: newId,
          displayName: haseefName,
          type: "agent",
        },
        select: { id: true },
      });
      console.log(`[spaces-service] Created entity for ${haseefName} → ${entity.id}`);
    } else {
      console.log(`[spaces-service] Resolved ${haseefName} → entityId ${entity.id}`);
    }

    agentEntityId = entity.id;
    console.warn(
      `[spaces-service] Haseef "${haseefName}" has no entityId in profileJson — using fallback: ${agentEntityId}`,
    );
  } else {
    console.log(`[spaces-service] ${haseefName} → entityId ${agentEntityId} (from profile)`);
  }

  // Resolve spaces this entity is a member of
  const spaces = await getSpacesForEntity(agentEntityId);
  const spaceIds = [...new Set(spaces.map((s) => s.spaceId))];
  console.log(`[spaces-service] ${haseefName} has ${spaceIds.length} space(s)`);

  // Extract voice config from haseef configJson
  const voiceConfig = haseef.configJson?.voice as { gender?: string; voiceId?: string } | undefined;
  const voiceGender = (voiceConfig?.gender === "female" ? "female" : voiceConfig?.gender === "male" ? "male" : undefined) as "male" | "female" | undefined;
  const voiceId = voiceConfig?.voiceId || undefined;

  // Store connection
  state.connections.set(haseefId, {
    haseefId,
    haseefName,
    agentEntityId,
    spaceIds,
    runSpaces: new Map(),
    activeSpace: null,
    enteredSpace: null,
    currentRunId: null,
    typingActivity: "typing",
    pendingSeenMessages: [],
    voiceGender,
    voiceId,
  });

  // Sync tools to Core
  await syncTools(haseefId);
  console.log(`[spaces-service] Tools synced for ${haseefName} (scope: ${SCOPE})`);

  // NOTE: Haseefs are NOT marked online at bootstrap.
  // They go online only when a run starts (agent.active) and offline when it finishes.
  console.log(`[spaces-service] ${haseefName} connected (will go online when running cycles)`);
}

// =============================================================================
// Dynamic Haseef Connection — called when a new haseef is created via the API
// =============================================================================

export async function connectNewHaseef(haseef: {
  id: string;
  name: string;
  profileJson?: Record<string, unknown>;
  configJson?: Record<string, unknown>;
}): Promise<void> {
  if (!state.config) {
    console.warn("[spaces-service] Cannot connect haseef — service not bootstrapped");
    return;
  }

  // Skip if already connected
  if (state.connections.has(haseef.id)) {
    console.log(`[spaces-service] Haseef ${haseef.name} already connected`);
    return;
  }

  await setupHaseefConnection(haseef);

  // v7: No per-haseef stream setup needed — SDK SSE is scope-level.
  // The SDK connection already receives actions for all haseefs in the scope.

  console.log(`[spaces-service] Dynamically connected haseef: ${haseef.name}`);
}

// =============================================================================
// Space Auto-Discovery — membership.changed
//
// When an entity is added to or removed from a space, update the connection's
// spaceIds so the haseef automatically sees new spaces without reconnecting.
// Also re-sync ALL haseefs in that space so their member lists stay fresh.
// =============================================================================

export function handleMembershipChanged(
  entityId: string,
  spaceId: string,
  action: "added" | "removed",
): void {
  // 1. Update the affected entity's connection (if it's a haseef)
  for (const conn of state.connections.values()) {
    if (conn.agentEntityId !== entityId) continue;

    if (action === "added" && !conn.spaceIds.includes(spaceId)) {
      conn.spaceIds.push(spaceId);
      console.log(
        `[spaces-service] ${conn.haseefName} auto-discovered space ${spaceId}`,
      );
    } else if (action === "removed") {
      conn.spaceIds = conn.spaceIds.filter((id) => id !== spaceId);
      console.log(
        `[spaces-service] ${conn.haseefName} removed from space ${spaceId}`,
      );
    }

    // Invalidate cache + re-sync tools so the prompt includes the updated spaces list
    invalidateEntitySpacesCache(entityId);
    syncTools(conn.haseefId).catch((err) => {
      console.error(`[spaces-service] Failed to re-sync tools after membership change:`, err);
    });
  }

  // 2. Re-sync ALL other haseefs in this space so their member lists stay fresh
  reSyncHaseefsInSpace(spaceId, entityId);
}

/**
 * Re-sync tools for all haseefs in a space (excluding the trigger entity).
 * Called when any membership changes so all haseefs see fresh member lists.
 */
function reSyncHaseefsInSpace(spaceId: string, excludeEntityId: string): void {
  for (const conn of state.connections.values()) {
    // Skip if not in this space or is the entity that triggered the change
    if (!conn.spaceIds.includes(spaceId)) continue;
    if (conn.agentEntityId === excludeEntityId) continue;

    console.log(`[spaces-service] Re-syncing ${conn.haseefName} for updated member list in ${spaceId.slice(0, 8)}`);
    syncTools(conn.haseefId).catch((err) => {
      console.error(`[spaces-service] Failed to re-sync tools for space member update:`, err);
    });
  }
}

// =============================================================================
// Re-sync all haseefs in a space (for space metadata changes)
// =============================================================================

export function reSyncAllHaseefsInSpace(spaceId: string): void {
  for (const conn of state.connections.values()) {
    if (!conn.spaceIds.includes(spaceId)) continue;

    console.log(`[spaces-service] Re-syncing ${conn.haseefName} for space metadata update in ${spaceId.slice(0, 8)}`);
    syncTools(conn.haseefId).catch((err) => {
      console.error(`[spaces-service] Failed to re-sync tools for space update:`, err);
    });
  }
}

// Export syncTools for external use
export { syncTools } from "./core-api.js";
