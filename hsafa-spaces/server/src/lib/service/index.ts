// =============================================================================
// Spaces Service Module (V5)
//
// The spaces-app acts as a V5 service. This module handles:
//   1. Bootstrap: register tools with Core, resolve entities, start listeners
//   2. Tool execution: send_message, get_messages, get_spaces, confirmAction,
//      displayChart — all direct Prisma/service calls (no HTTP round-trips)
//   3. Action listener: consumes Redis Streams for tool dispatch from Core
//   4. Stream bridge: forwards Core run events to space SSE channels
//   5. Sense events: pushes space messages to Core via V5 events API
//
// V5 protocol: register tools → listen for actions → execute → submit results
// =============================================================================

import Redis from "ioredis";
import { prisma } from "../db.js";
import { postSpaceMessage } from "../space-service.js";
import { getMembersOfSpace, getSpacesForEntity } from "../membership-service.js";
import {
  emitSmartSpaceEvent,
  setSpaceActiveRun,
  removeSpaceActiveRun,
} from "../smartspace-events.js";
import { loadServiceConfig, type ServiceConfig } from "./config.js";
import { SCOPE, SCOPE_INSTRUCTIONS, TOOLS } from "./manifest.js";
import { setInboxHandler, type InboxMessageParams } from "./inbox.js";

// =============================================================================
// Shared State (module-level singleton)
// =============================================================================

interface ActiveConnection {
  haseefId: string;
  haseefName: string;
  agentEntityId: string;
  spaceIds: string[];
  /** runId → triggerSpaceId — routes tool streaming events to the correct space */
  runSpaces: Map<string, string>;
}

interface ServiceState {
  config: ServiceConfig | null;
  connections: Map<string, ActiveConnection>;
  /** Single shared Redis subscriber for all haseef stream bridges */
  sharedSubscriber: InstanceType<typeof Redis> | null;
  /** Redis client for action stream consumption (XREADGROUP) */
  actionConsumer: InstanceType<typeof Redis> | null;
  /** Whether the action listener loop is running */
  actionListenerRunning: boolean;
}

const state: ServiceState = {
  config: null,
  connections: new Map(),
  sharedSubscriber: null,
  actionConsumer: null,
  actionListenerRunning: false,
};

/** Find all connections interested in a given space */
export function getConnectionsForSpace(
  spaceId: string,
): ActiveConnection[] {
  return [...state.connections.values()].filter((c) =>
    c.spaceIds.includes(spaceId),
  );
}

/** Get the live connection state for a specific haseef (used by context route) */
export function getConnectionForHaseef(haseefId: string): ActiveConnection | undefined {
  return state.connections.get(haseefId);
}

// =============================================================================
// V5 Core API Helpers
// =============================================================================

function coreHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-api-key": state.config!.apiKey,
  };
}

/** PUT /api/haseefs/:id/scopes/:scope/tools — Sync all tools + scope instructions */
async function syncTools(haseefId: string): Promise<void> {
  const url = `${state.config!.coreUrl}/api/haseefs/${haseefId}/scopes/${SCOPE}/tools`;
  const res = await fetch(url, {
    method: "PUT",
    headers: coreHeaders(),
    body: JSON.stringify({ tools: TOOLS, instructions: SCOPE_INSTRUCTIONS }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`syncTools failed for ${haseefId}: ${res.status} ${text}`);
  }
}

/** POST /api/haseefs/:id/events — Push V5 sense events */
async function pushSenseEvent(
  haseefId: string,
  event: {
    eventId: string;
    scope: string;
    type: string;
    data: Record<string, unknown>;
    timestamp?: string;
  },
): Promise<void> {
  const url = `${state.config!.coreUrl}/api/haseefs/${haseefId}/events`;
  const res = await fetch(url, {
    method: "POST",
    headers: coreHeaders(),
    body: JSON.stringify({
      eventId: event.eventId,
      scope: event.scope,
      type: event.type,
      data: event.data,
      timestamp: event.timestamp ?? new Date().toISOString(),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`pushSenseEvent failed: ${res.status} ${text}`);
  }
}

/** POST /api/haseefs/:id/actions/:actionId/result — Submit action result */
async function submitActionResult(
  haseefId: string,
  actionId: string,
  result: unknown,
): Promise<void> {
  const url = `${state.config!.coreUrl}/api/haseefs/${haseefId}/actions/${actionId}/result`;
  const res = await fetch(url, {
    method: "POST",
    headers: coreHeaders(),
    body: JSON.stringify(result),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`[spaces-service] submitActionResult failed: ${res.status} ${text}`);
  }
}

// =============================================================================
// Bootstrap
// =============================================================================

export async function bootstrapExtension(): Promise<void> {
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

  // Auto-discover haseefs from Core
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

  // Start the action listener (Redis Streams)
  if (process.env.REDIS_URL) {
    startActionListener().catch((err: unknown) => {
      console.error("[spaces-service] Action listener failed:", err);
    });
  } else {
    console.warn("[spaces-service] No REDIS_URL — action listener disabled (use Redis for V5 action dispatch)");
  }

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
  const spaceIds = spaces.map((s) => s.spaceId);
  console.log(`[spaces-service] ${haseefName} has ${spaceIds.length} space(s)`);

  // Store connection
  const conn: ActiveConnection = {
    haseefId,
    haseefName,
    agentEntityId,
    spaceIds,
    runSpaces: new Map(),
  };
  state.connections.set(haseefId, conn);

  // Sync tools to Core
  await syncTools(haseefId);
  console.log(`[spaces-service] Tools synced for ${haseefName} (scope: ${SCOPE})`);
}

// =============================================================================
// Action Listener — Redis Streams (XREADGROUP)
//
// Listens for tool-call actions dispatched by Core for the "spaces" scope.
// Each action contains: actionId, name (tool name), args, mode.
// After execution, submits result back to Core.
// =============================================================================

async function startActionListener(): Promise<void> {
  if (state.actionListenerRunning) return;
  state.actionListenerRunning = true;

  const redisUrl = process.env.REDIS_URL || "redis://localhost:6380";
  const consumer = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  state.actionConsumer = consumer;

  const consumerGroup = `${SCOPE}-consumer`;
  const consumerName = `spaces-service-${Date.now()}`;

  // Create consumer groups for all connected haseef action streams
  for (const haseefId of state.connections.keys()) {
    const streamKey = `actions:${haseefId}:${SCOPE}`;
    try {
      await consumer.xgroup("CREATE", streamKey, consumerGroup, "0", "MKSTREAM");
    } catch (err: any) {
      if (!err.message?.includes("BUSYGROUP")) {
        console.error(`[spaces-service] Failed to create consumer group for ${streamKey}:`, err.message);
      }
    }
  }

  console.log(`[spaces-service] Action listener started (consumer: ${consumerName})`);

  // Poll loop
  const poll = async () => {
    while (state.actionListenerRunning) {
      try {
        const streamKeys = [...state.connections.keys()].map(
          (id) => `actions:${id}:${SCOPE}`,
        );

        const results = await (consumer as any).xreadgroup(
          "GROUP", consumerGroup, consumerName,
          "BLOCK", 5000,
          "STREAMS",
          ...streamKeys,
          ...Array(streamKeys.length).fill(">"),
        );

        if (!results) continue;

        for (const [streamKey, messages] of results) {
          // Extract haseefId from stream key: actions:{haseefId}:spaces
          const haseefId = (streamKey as string).split(":")[1];

          for (const [messageId, fields] of messages) {
            const data: Record<string, string> = {};
            for (let i = 0; i < fields.length; i += 2) {
              data[fields[i]] = fields[i + 1];
            }

            const actionId = data.actionId;
            const toolName = data.name;
            const args = data.args ? JSON.parse(data.args) : {};

            // Execute the tool
            const result = await executeAction(haseefId, actionId, toolName, args);

            // Submit result back to Core
            await submitActionResult(haseefId, actionId, result);

            // ACK the message
            await (consumer as any).xack(streamKey, consumerGroup, messageId);
          }
        }
      } catch (err: any) {
        if (state.actionListenerRunning) {
          console.error("[spaces-service] Action stream error:", err.message);
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    }
  };

  poll().catch((err) => {
    console.error("[spaces-service] Action poll loop crashed:", err);
    state.actionListenerRunning = false;
  });
}

// =============================================================================
// Action Execution — routes to the correct tool handler
// =============================================================================

async function executeAction(
  haseefId: string,
  actionId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const conn = state.connections.get(haseefId);
  const agentEntityId = conn?.agentEntityId;

  console.log(`[spaces-service] [${haseefId.slice(0, 8)}] ${toolName} (${actionId.slice(0, 8)})`);

  try {
    switch (toolName) {
      case "send_message": {
        const spaceId = args.spaceId as string;
        const text = args.text as string;
        if (!spaceId || !text)
          return { error: "spaceId and text are required" };
        if (!agentEntityId)
          return { error: "agentEntityId not resolved — is this haseef connected?" };

        // Direct persist + emit (no HTTP call)
        const result = await postSpaceMessage({
          spaceId,
          entityId: agentEntityId,
          role: "assistant",
          content: text,
          metadata: {
            type: "message_tool",
            toolName,
            actionId,
          },
        });

        return { success: true, messageId: result.messageId };
      }

      case "get_messages": {
        const spaceId = args.spaceId as string;
        const limit = (args.limit as number) || 20;
        if (!spaceId) return { error: "spaceId is required" };

        const messages = await prisma.smartSpaceMessage.findMany({
          where: { smartSpaceId: spaceId },
          orderBy: { seq: "desc" },
          take: Math.min(limit, 100),
          include: {
            entity: {
              select: { id: true, displayName: true, type: true },
            },
          },
        });

        // Label the haseef's own messages as "You" so the LLM
        // clearly sees what it already said vs what others said
        return {
          messages: messages.reverse().map((m: any) => ({
            id: m.id,
            sender: m.entityId === agentEntityId ? "You" : (m.entity?.displayName ?? "Unknown"),
            senderType: m.entity?.type ?? "unknown",
            content: m.content,
            createdAt: m.createdAt.toISOString(),
          })),
        };
      }

      case "get_spaces": {
        if (!agentEntityId)
          return { error: "agentEntityId not resolved — is this haseef connected?" };

        const memberships = await getSpacesForEntity(agentEntityId);
        const spaceIds = memberships.map((m) => m.spaceId);

        if (spaceIds.length === 0) return { spaces: [] };

        const spaces = await prisma.smartSpace.findMany({
          where: { id: { in: spaceIds } },
          select: {
            id: true,
            name: true,
            description: true,
            _count: { select: { memberships: true } },
          },
        });

        return {
          spaces: spaces.map((s: any) => ({
            id: s.id,
            name: s.name,
            description: s.description,
            memberCount: s._count.memberships,
          })),
        };
      }

      case "confirmAction": {
        const spaceId = args.spaceId as string;
        if (!spaceId) return { error: "spaceId is required" };
        if (!args.title || !args.message)
          return { error: "title and message are required" };
        return {
          status: "pending",
          waitingForUser: true,
          message: "Waiting for user to confirm or reject",
        };
      }

      case "displayChart": {
        const spaceId = args.spaceId as string;
        if (!spaceId) return { error: "spaceId is required" };
        if (!args.type || !args.title || !Array.isArray(args.data))
          return { error: "type, title, and data are required" };
        return { success: true };
      }

      default:
        return { error: `Unknown tool: ${toolName}` };
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[spaces-service] Tool execution error (${toolName}):`, errMsg);
    return { error: errMsg };
  }
}

// =============================================================================
// Shared Redis Subscriber — forwards Core run events to space SSE channels
//
// Uses psubscribe('haseef:*:stream') to receive events for ALL connected
// haseefs through one Redis connection.
// =============================================================================

async function startSharedSubscriber(): Promise<void> {
  if (state.sharedSubscriber) return;

  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
  const sub = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy(times: number) {
      const delay = Math.min(times * 500, 30_000);
      console.log(`[spaces-service] Redis stream subscriber reconnecting in ${delay}ms (attempt ${times})`);
      return delay;
    },
  });

  sub.on("error", (err: Error) => {
    console.error(`[spaces-service] Redis stream subscriber error:`, err.message);
  });

  sub.on("connect", () => {
    console.log(`[spaces-service] Redis stream subscriber connected`);
  });

  await sub.psubscribe("haseef:*:stream");
  state.sharedSubscriber = sub;

  // Route events by extracting haseefId from channel name
  // Channel format: haseef:{haseefId}:stream
  sub.on("pmessage", (_pattern: string, channel: string, message: string) => {
    const haseefId = channel.split(":")[1];
    const conn = state.connections.get(haseefId);
    if (!conn) return;
    bridgeStreamEvent(conn, message);
  });
}

// =============================================================================
// Stream Bridge — forwards Core run events to space SSE channels
//
// run.start / run.finish  → agent.active / agent.inactive (all spaces)
// tool.started            → tool.started  (trigger space only)
// tool-input.delta        → tool.streaming (trigger space only)
// tool.done               → tool.done      (trigger space only)
// tool.error              → tool.error     (trigger space only)
// =============================================================================

function bridgeStreamEvent(conn: ActiveConnection, message: string): void {
  try {
    const event = JSON.parse(message) as {
      type: string;
      runId?: string;
      triggerType?: string;
      triggerSource?: string;
      triggerScope?: string;
      streamId?: string;
      toolName?: string;
      delta?: string;
      args?: unknown;
      result?: unknown;
      error?: string;
    };

    const runId = event.runId;

    if (event.type === "run.started") {
      // V5: triggerScope === "spaces" and triggerSource === spaceId
      const isSpacesTrigger =
        (event.triggerScope === SCOPE) ||
        event.triggerType?.startsWith("ext-spaces:") ||
        event.triggerType?.startsWith("spaces:");
      if (runId && isSpacesTrigger && event.triggerSource) {
        conn.runSpaces.set(runId, event.triggerSource);
      }
      for (const spaceId of conn.spaceIds) {
        if (runId) {
          void setSpaceActiveRun(spaceId, runId, conn.agentEntityId, conn.haseefName);
        }
        void emitSmartSpaceEvent(spaceId, {
          type: "agent.active",
          agentEntityId: conn.agentEntityId,
          runId,
          data: { agentEntityId: conn.agentEntityId, agentName: conn.haseefName, runId },
        });
      }
    } else if (event.type === "tool.started") {
      const spaceId = runId ? conn.runSpaces.get(runId) : undefined;
      if (spaceId) {
        void emitSmartSpaceEvent(spaceId, {
          type: "tool.started",
          streamId: event.streamId,
          toolName: event.toolName,
          agentEntityId: conn.agentEntityId,
          runId,
        });
      }
    } else if (event.type === "tool-input.delta") {
      const spaceId = runId ? conn.runSpaces.get(runId) : undefined;
      if (spaceId) {
        void emitSmartSpaceEvent(spaceId, {
          type: "tool.streaming",
          streamId: event.streamId,
          toolName: event.toolName,
          delta: event.delta,
          agentEntityId: conn.agentEntityId,
          runId,
        });
      }
    } else if (event.type === "tool.done") {
      const spaceId = runId ? conn.runSpaces.get(runId) : undefined;
      if (spaceId) {
        void emitSmartSpaceEvent(spaceId, {
          type: "tool.done",
          streamId: event.streamId,
          toolName: event.toolName,
          result: event.result,
          agentEntityId: conn.agentEntityId,
          runId,
        });
      }
    } else if (event.type === "tool.error") {
      const spaceId = runId ? conn.runSpaces.get(runId) : undefined;
      if (spaceId) {
        void emitSmartSpaceEvent(spaceId, {
          type: "tool.error",
          streamId: event.streamId,
          toolName: event.toolName,
          error: event.error,
          agentEntityId: conn.agentEntityId,
          runId,
        });
      }
    } else if (event.type === "run.finished") {
      for (const spaceId of conn.spaceIds) {
        if (runId) {
          void removeSpaceActiveRun(spaceId, runId);
        }
        void emitSmartSpaceEvent(spaceId, {
          type: "agent.inactive",
          agentEntityId: conn.agentEntityId,
          runId,
          data: { agentEntityId: conn.agentEntityId, runId },
        });
      }
      if (runId) conn.runSpaces.delete(runId);
    }
  } catch {}
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

// =============================================================================
// Inbox Handler — V5 Sense Events
//
// Called by space-service.ts after persisting a message.
// Pushes V5 sense events to Core for connected haseefs.
// =============================================================================

async function handleInboxMessage(params: InboxMessageParams): Promise<void> {
  if (!state.config) return;

  const {
    spaceId,
    entityId,
    messageId,
    content,
    spaceName,
    senderName,
    senderType,
  } = params;

  // Find connected haseefs for this space
  const conns = getConnectionsForSpace(spaceId);
  if (conns.length === 0) return;

  // Fetch recent messages once (shared across connections, labeled per-haseef below)
  let recentRaw: Array<{
    entityId: string;
    displayName: string;
    type: string;
    content: string;
    createdAt: Date;
  }> = [];
  try {
    const recent = await prisma.smartSpaceMessage.findMany({
      where: {
        smartSpaceId: spaceId,
        id: { not: messageId }, // exclude the new message itself
      },
      orderBy: { seq: "desc" },
      take: 10,
      include: {
        entity: { select: { id: true, displayName: true, type: true } },
      },
    });
    recentRaw = recent.reverse().map((m: any) => ({
      entityId: m.entityId,
      displayName: m.entity?.displayName ?? "Unknown",
      type: m.entity?.type ?? "unknown",
      content: m.content ?? "",
      createdAt: m.createdAt,
    }));
  } catch (err) {
    // Non-fatal — send event without context
    console.warn("[spaces-service] Failed to fetch conversation context:", err);
  }

  // Skip messages from THIS haseef's own entity (avoid loops)
  for (const conn of conns) {
    if (entityId === conn.agentEntityId) continue;

    console.log(
      `[spaces-service] → sense: ${senderName} in "${spaceName}": "${content.slice(0, 50)}"`,
    );

    // Label per-haseef: "You" for this haseef's own messages, display name for everyone else
    const recentMessages = recentRaw.map((m) => ({
      sender: m.entityId === conn.agentEntityId ? "You" : m.displayName,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    }));

    await pushSenseEvent(conn.haseefId, {
      eventId: messageId,
      scope: SCOPE,
      type: "message",
      data: {
        messageId,
        spaceId,
        spaceName,
        senderId: entityId,
        senderName,
        senderType,
        content,
        // Conversation context: the last 10 messages in this space
        // so the haseef knows what it already said and what the person is replying to
        recentMessages,
      },
    });
  }
}
