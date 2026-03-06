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
import { loadExtensionConfig, type ExtensionConfig } from "./config";
import { CoreClient } from "./core-client";
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
  subscriber: InstanceType<typeof Redis> | null;
  /** runId → triggerSpaceId — routes tool streaming events to the correct space */
  runSpaces: Map<string, string>;
}

interface ExtensionState {
  config: ExtensionConfig | null;
  coreClient: CoreClient | null;
  connections: Map<string, ActiveConnection>;
}

const g = globalThis as unknown as { __extState: ExtensionState };
if (!g.__extState) {
  g.__extState = { config: null, coreClient: null, connections: new Map() };
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

// =============================================================================
// Bootstrap
// =============================================================================

export async function bootstrapExtension(): Promise<void> {
  state.config = loadExtensionConfig();
  if (!state.config) {
    console.warn("[extension] Extension features disabled (missing config)");
    return;
  }

  state.coreClient = new CoreClient(state.config);

  // Register inbox handler (replaces SpacesListener)
  setInboxHandler(handleInboxMessage);

  // Self-discover existing connections
  try {
    const me = await state.coreClient!.getMe();
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

    // Resolve agentEntityId
    let agentEntityId = webhookConfig.agentEntityId as string | undefined;
    if (!agentEntityId) {
      const entity = await prisma.entity.findFirst({
        where: { displayName: haseefName, type: "agent" },
        select: { id: true },
      });
      if (entity) {
        agentEntityId = entity.id;
        console.log(
          `[extension] Resolved ${haseefName} → entityId ${agentEntityId}`,
        );
      }
    }

    if (!agentEntityId) {
      console.warn(
        `[extension] Cannot resolve entityId for ${haseefName} — no bridge started`,
      );
      return;
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
      subscriber: null,
      runSpaces: new Map(),
    };
    state.connections.set(haseefId, newConn);

    // Start stream bridge: subscribe to Core's haseef run events and forward
    // all relevant events to the correct space SSE channel.
    //
    // run.start / run.finish  → agent.active / agent.inactive (all spaces)
    // tool.started            → tool.started  (trigger space only)
    // tool-input.delta        → tool.streaming (trigger space only, fire-and-forget)
    // tool.done               → tool.done      (trigger space only)
    // tool.error              → tool.error     (trigger space only)
    const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
    const runSubscriber = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
    await runSubscriber.subscribe(`haseef:${haseefId}:stream`);
    runSubscriber.on("message", async (_ch: string, message: string) => {
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
        const conn = state.connections.get(haseefId);
        if (!conn) return;

        const runId = event.runId;

        if (event.type === "run.start") {
          // Cache which space triggered this run so tool events go to the right space
          // triggerSource = spaceId when triggerType starts with "ext-spaces:"
          if (runId && event.triggerType?.startsWith("ext-spaces:") && event.triggerSource) {
            conn.runSpaces.set(runId, event.triggerSource);
          }
          for (const spaceId of conn.spaceIds) {
            await emitSmartSpaceEvent(spaceId, {
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
            // Fire-and-forget: real-time delta from AI, never await Redis publish
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
            await emitSmartSpaceEvent(spaceId, {
              type: "agent.inactive",
              agentEntityId: conn.agentEntityId,
              runId,
              data: { agentEntityId: conn.agentEntityId, runId },
            });
          }
          if (runId) conn.runSpaces.delete(runId);
        }
      } catch {}
    });
    newConn.subscriber = runSubscriber;

    console.log(
      `[extension] Connected ${haseefName} (${spaceIds.length} spaces)`,
    );
  } else if (type === "haseef.disconnected") {
    const existing = state.connections.get(haseefId);
    if (existing) {
      existing.subscriber?.quit().catch(() => {});
      state.connections.delete(haseefId);
      console.log(`[extension] Disconnected ${haseefName}`);
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
  if (!state.coreClient) return;

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

  // Only push non-assistant messages (avoid loops)
  if (role === "assistant") return;

  // Find connected haseefs for this space
  const conns = getConnectionsForSpace(spaceId);
  if (conns.length === 0) return;

  for (const conn of conns) {
    // Skip if the sender IS the agent (shouldn't happen for non-assistant, but safety)
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

    await state.coreClient.pushSenseEvent(conn.haseefId, senseEvent);
  }
}
