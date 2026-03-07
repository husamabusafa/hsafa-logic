// =============================================================================
// Extension Module — Bootstrap + Lifecycle + Tool Handlers
//
// The spaces-app IS the extension. This module handles:
//   1. Bootstrap: self-register with Core, discover existing connections
//   2. Lifecycle: haseef.connected/disconnected → start/stop stream bridges
//   3. Tool calls: enter_space, send_space_message, read_space_messages
//      — all direct Prisma/service calls (no HTTP round-trips)
//   4. Connection registry: tracks which haseefs are in which spaces
//      — used by inbox handler to push sense events
//
// Replaces ext-spaces entirely. No SpacesClient, no SpacesListener.
// =============================================================================

import Redis from "ioredis";
import { prisma } from "../db";
import { postSpaceMessage } from "../space-service";
import { getMembersOfSpace, getSpacesForEntity } from "../membership-service";
import { emitSmartSpaceEvent } from "../smartspace-events";
import { Hsafa } from "@hsafa/node";
import { loadExtensionConfig, type ExtensionConfig } from "./config";
import { MANIFEST } from "./manifest";
import { setInboxHandler, type InboxMessageParams } from "./inbox";

// =============================================================================
// Shared State (via globalThis for Next.js dev mode compatibility)
//
// In dev mode, instrumentation.ts and API routes may get different module
// instances. Using globalThis ensures they share the same state.
// =============================================================================

interface ActiveConnection {
  haseefId: string;
  haseefName: string;
  agentEntityId: string;
  spaceIds: string[];
  /** runId → triggerSpaceId — routes tool streaming events to the correct space */
  runSpaces: Map<string, string>;
}

interface ExtensionState {
  config: ExtensionConfig | null;
  hsafa: Hsafa | null;
  connections: Map<string, ActiveConnection>;
  /** Single shared Redis subscriber for all haseef stream bridges */
  sharedSubscriber: InstanceType<typeof Redis> | null;
}

const g = globalThis as unknown as { __extState: ExtensionState };
if (!g.__extState) {
  g.__extState = { config: null, hsafa: null, connections: new Map(), sharedSubscriber: null };
}
const state = g.__extState;

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
// Bootstrap
// =============================================================================

export async function bootstrapExtension(): Promise<void> {
  state.config = loadExtensionConfig();
  if (!state.config) {
    console.warn("[extension] Extension features disabled (missing config)");
    return;
  }

  state.hsafa = new Hsafa({
    coreUrl: state.config.coreUrl,
    extensionKey: state.config.extensionKey,
  });

  // Register inbox handler (replaces SpacesListener)
  setInboxHandler(handleInboxMessage);

  // Start the single shared Redis subscriber for all stream bridges (§3.4)
  await startSharedSubscriber();

  // Self-discover existing connections
  try {
    const me = await state.hsafa.me();
    console.log(`[extension] Extension: ${me.name} (${me.id})`);
    console.log(`[extension] ${me.connections.length} existing connection(s)`);

    for (const conn of me.connections) {
      await handleLifecycle({
        type: "haseef.connected",
        haseefId: conn.haseefId,
        haseefName: conn.haseefName,
        config: conn.config,
      });
    }
  } catch (err) {
    console.warn(
      "[extension] Bootstrap self-discovery failed (will rely on webhooks):",
      err,
    );
  }

  console.log("[extension] Bootstrap complete");
}

// =============================================================================
// Lifecycle Handler
// =============================================================================

export async function handleLifecycle(
  body: Record<string, unknown>,
): Promise<void> {
  const type = body.type as string;
  const haseefId = body.haseefId as string;
  const haseefName = (body.haseefName as string) ?? haseefId;
  const webhookConfig = (body.config ?? {}) as Record<string, unknown>;

  if (type === "haseef.connected" || type === "haseef.config_updated") {
    // Stop existing connection if any
    const existing = state.connections.get(haseefId);
    if (existing) {
      state.connections.delete(haseefId);
    }

    // §3.2: Deterministic entity resolution — find or create by haseefId
    let agentEntityId = webhookConfig.agentEntityId as string | undefined;
    if (!agentEntityId) {
      // Try to find existing entity by name first
      let entity = await prisma.entity.findFirst({
        where: { displayName: haseefName, type: "agent" },
        select: { id: true },
      });

      // If no entity exists, auto-create one
      if (!entity) {
        entity = await prisma.entity.create({
          data: {
            id: crypto.randomUUID(),
            displayName: haseefName,
            type: "agent",
          },
          select: { id: true },
        });
        console.log(
          `[extension] Created entity for ${haseefName} → ${entity.id}`,
        );
      } else {
        console.log(
          `[extension] Resolved ${haseefName} → entityId ${entity.id}`,
        );
      }

      agentEntityId = entity.id;
    }

    // Resolve spaceIds
    let spaceIds = (webhookConfig.connectedSpaceIds as string[]) ?? [];
    if (spaceIds.length === 0) {
      const spaces = await getSpacesForEntity(agentEntityId);
      spaceIds = spaces.map((s) => s.spaceId);
      console.log(
        `[extension] Resolved ${haseefName} spaces: ${spaceIds.length} space(s)`,
      );
    }

    const newConn: ActiveConnection = {
      haseefId,
      haseefName,
      agentEntityId,
      spaceIds,
      runSpaces: new Map(),
    };
    state.connections.set(haseefId, newConn);

    console.log(
      `[extension] Connected ${haseefName} (${spaceIds.length} spaces)`,
    );
  } else if (type === "haseef.disconnected") {
    const existing = state.connections.get(haseefId);
    if (existing) {
      state.connections.delete(haseefId);
      console.log(`[extension] Disconnected ${haseefName}`);
    }
  }
}

// =============================================================================
// Shared Redis Subscriber (§3.4 — single connection for all haseef streams)
//
// Uses psubscribe('haseef:*:stream') to receive events for ALL connected
// haseefs through one Redis connection, instead of one per haseef.
// Includes reconnection handling (§3.5).
// =============================================================================

async function startSharedSubscriber(): Promise<void> {
  if (state.sharedSubscriber) return; // Already running

  const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
  const sub = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    retryStrategy(times) {
      const delay = Math.min(times * 500, 30_000);
      console.log(`[extension] Redis stream subscriber reconnecting in ${delay}ms (attempt ${times})`);
      return delay;
    },
  });

  sub.on("error", (err) => {
    console.error(`[extension] Redis stream subscriber error:`, err.message);
  });

  sub.on("connect", () => {
    console.log(`[extension] Redis stream subscriber connected`);
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
// tool-input.delta        → tool.streaming (trigger space only, fire-and-forget)
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
      streamId?: string;
      toolName?: string;
      delta?: string;
      args?: unknown;
      result?: unknown;
      error?: string;
    };

    const runId = event.runId;

    if (event.type === "run.start") {
      if (runId && event.triggerType?.startsWith("ext-spaces:") && event.triggerSource) {
        conn.runSpaces.set(runId, event.triggerSource);
      }
      for (const spaceId of conn.spaceIds) {
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
    } else if (event.type === "run.finish") {
      for (const spaceId of conn.spaceIds) {
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
// §3.3: Space Auto-Discovery — membership.changed
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
        `[extension] ${conn.haseefName} auto-discovered space ${spaceId}`,
      );
    } else if (action === "removed") {
      conn.spaceIds = conn.spaceIds.filter((id) => id !== spaceId);
      console.log(
        `[extension] ${conn.haseefName} removed from space ${spaceId}`,
      );
    }
  }
}

// =============================================================================
// Tool Call Handler — Direct DB calls (no HTTP round-trips)
// =============================================================================

export async function handleToolCall(
  body: Record<string, unknown>,
): Promise<unknown> {
  const toolName = body.toolName as string;
  const args = body.args as Record<string, unknown>;
  const haseefId = body.haseefId as string;
  const toolCallId = body.toolCallId as string | undefined;

  // Resolve agentEntityId from connection state
  const conn = state.connections.get(haseefId);
  const agentEntityId = conn?.agentEntityId;

  switch (toolName) {
    case "enter_space": {
      const spaceId = args.spaceId as string;
      if (!spaceId) return { error: "spaceId is required" };

      const [space, members, messages] = await Promise.all([
        prisma.smartSpace
          .findUnique({ where: { id: spaceId } })
          .catch(() => ({ id: spaceId, name: null })),
        getMembersOfSpace(spaceId).catch(() => []),
        prisma.smartSpaceMessage
          .findMany({
            where: { smartSpaceId: spaceId },
            orderBy: { seq: "desc" },
            take: 20,
            include: {
              entity: {
                select: { id: true, displayName: true, type: true },
              },
            },
          })
          .then((msgs) => msgs.reverse())
          .catch(() => []),
      ]);

      return { space, members, messages };
    }

    case "send_space_message": {
      const spaceId = args.spaceId as string;
      const text = args.text as string;
      if (!spaceId || !text)
        return { error: "spaceId and text are required" };
      if (!agentEntityId)
        return {
          error:
            "agentEntityId not resolved — is this haseef connected?",
        };

      // Direct persist + emit (no HTTP call)
      const result = await postSpaceMessage({
        spaceId,
        entityId: agentEntityId,
        role: "assistant",
        content: text,
        metadata: {
          type: "message_tool",
          toolName,
          ...(toolCallId ? { toolCallId } : {}),
        },
      });

      return { success: true, messageId: result.messageId };
    }

    case "read_space_messages": {
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

      return { messages: messages.reverse() };
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

// =============================================================================
// Inbox Handler (replaces SpacesListener)
//
// Called by space-service.ts after persisting a message.
// Pushes sense events to Core for connected haseefs.
// =============================================================================

async function handleInboxMessage(params: InboxMessageParams): Promise<void> {
  if (!state.hsafa) return;

  const {
    spaceId,
    entityId,
    messageId,
    content,
    role,
    spaceName,
    senderName,
    senderType,
  } = params;

  // Find connected haseefs for this space
  const conns = getConnectionsForSpace(spaceId);
  if (conns.length === 0) return;

  // Skip messages from THIS haseef's own entity (avoid loops)
  // Do NOT filter by role — other haseefs' messages should be forwarded
  for (const conn of conns) {
    if (entityId === conn.agentEntityId) continue;

    const senseEvent = {
      eventId: messageId,
      channel: "ext-spaces",
      source: spaceId,
      type: "message",
      timestamp: new Date().toISOString(),
      data: {
        messageId,
        spaceId,
        spaceName,
        senderId: entityId,
        senderName,
        senderType,
        content,
      },
    };

    console.log(
      `[extension] → sense: ${senderName} in "${spaceName}": "${content.slice(0, 50)}"`,
    );

    await state.hsafa!.pushSense(conn.haseefId, senseEvent);
  }
}
