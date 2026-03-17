// =============================================================================
// Spaces Service Module (V5)
//
// The spaces-app acts as a V5 service. This module handles:
//   1. Bootstrap: register tools with Core, resolve entities, start listeners
//   2. Tool execution: send_message, get_messages, get_spaces, send_confirmation,
//      send_choice, send_vote, send_form, respond_to_message, etc.
//   3. Action listener: consumes Redis Streams for tool dispatch from Core
//   4. Stream bridge: forwards Core run events to space SSE channels
//   5. Sense events: pushes space messages to Core via V5 events API
//
// V5 protocol: register tools → listen for actions → execute → submit results
//
// Split into sub-modules for clarity:
//   types.ts         — shared state, types, connection helpers
//   core-api.ts      — V5 Core HTTP helpers (sync tools, sense events, action results)
//   tool-handlers.ts — tool execution (executeAction + all case handlers)
//   action-listener.ts — Redis Streams XREADGROUP consumer
//   stream-bridge.ts — shared Redis psubscribe + run event bridging
//   sense-events.ts  — inbox handler, seen watermark, interactive message events
// =============================================================================

import { prisma } from "../db.js";
import { getSpacesForEntity } from "../membership-service.js";
import { loadServiceConfig } from "./config.js";
import { SCOPE } from "./manifest.js";
import { setInboxHandler } from "./inbox.js";
import { state } from "./types.js";
import { coreHeaders, syncTools } from "./core-api.js";
import { startSharedSubscriber } from "./stream-bridge.js";
import { startActionListener } from "./action-listener.js";
import { handleInboxMessage } from "./sense-events.js";

// Re-export public API so existing imports from "./service/index.js" keep working
export { getConnectionsForSpace, getConnectionForHaseef } from "./types.js";
export { pushMessageResponseEvent, pushMessageResolvedEvent } from "./sense-events.js";

// =============================================================================
// Bootstrap
// =============================================================================

export async function bootstrapExtension(): Promise<void> {
  console.log(`[spaces-service] Bootstrapping... (${new Date().toISOString()})`);

  // Reset stale state from previous process (tsx watch restart)
  state.actionListenerRunning = false;
  state.actionConsumer = null;
  state.sharedSubscriber = null;
  state.connections.clear();

  const config = loadServiceConfig();
  if (!config) {
    console.warn("[spaces-service] Service disabled (missing config)");
    return;
  }
  state.config = config;

  // Register inbox handler
  setInboxHandler(handleInboxMessage);

  // Start the shared Redis subscriber for stream bridges
  await startSharedSubscriber();

  // Auto-discover haseefs from Core (single attempt — no retries)
  const haseefs = await discoverHaseefs();
  if (haseefs.length === 0) {
    console.warn("[spaces-service] No haseefs found in Core — nothing to connect to");
    return;
  }

  // For each discovered haseef: set up connection + sync tools
  for (const h of haseefs) {
    try {
      await setupHaseefConnection(h);
    } catch (err) {
      console.error(`[spaces-service] Failed to set up haseef ${h.id}:`, err);
    }
  }

  // Start the action listener (Redis Streams) — uses Core's Redis
  startActionListener().catch((err: unknown) => {
    console.error("[spaces-service] Action listener failed:", err);
  });

  // NOTE: No presence heartbeat for haseefs — they only go online during active runs.

  console.log("[spaces-service] Bootstrap complete");
}

/** Discover all haseefs from Core via GET /api/haseefs */
async function discoverHaseefs(): Promise<
  Array<{ id: string; name: string; profileJson?: Record<string, unknown> }>
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

  // Store connection
  state.connections.set(haseefId, {
    haseefId,
    haseefName,
    agentEntityId,
    spaceIds,
    runSpaces: new Map(),
    activeSpace: null,
    enteredSpace: null,
    typingHeartbeat: null,
    pendingSeenMessages: [],
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

  // Ensure the action consumer group exists for the new haseef's stream
  if (state.actionConsumer) {
    const streamKey = `actions:${haseef.id}:${SCOPE}`;
    const consumerGroup = `${SCOPE}-consumer`;
    try {
      await state.actionConsumer.xgroup("CREATE", streamKey, consumerGroup, "0", "MKSTREAM");
    } catch (err: any) {
      if (!err.message?.includes("BUSYGROUP")) {
        console.error(`[spaces-service] Failed to create consumer group for ${streamKey}:`, err.message);
      }
    }
  }

  console.log(`[spaces-service] Dynamically connected haseef: ${haseef.name}`);
}

// =============================================================================
// Space Auto-Discovery — membership.changed
//
// When an entity is added to or removed from a space, update the connection's
// spaceIds so the haseef automatically sees new spaces without reconnecting.
// =============================================================================

export function handleMembershipChanged(
  entityId: string,
  spaceId: string,
  action: "added" | "removed",
): void {
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
  }
}
