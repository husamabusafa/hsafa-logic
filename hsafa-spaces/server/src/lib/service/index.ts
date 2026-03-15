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
// =============================================================================

import Redis from "ioredis";
import { prisma } from "../db.js";
import { postSpaceMessage } from "../space-service.js";
import { getMembersOfSpace, getSpacesForEntity } from "../membership-service.js";
import {
  emitSmartSpaceEvent,
  setSpaceActiveRun,
  removeSpaceActiveRun,
  listSpaceActiveRuns,
  broadcastSeen,
  markOnline,
  markOffline,
  broadcastTyping,
} from "../smartspace-events.js";
import { redis } from "../redis.js";
import type { ReplyToMetadata } from "../message-types.js";
import { loadServiceConfig, type ServiceConfig } from "./config.js";
import { SCOPE, SCOPE_INSTRUCTIONS, TOOLS } from "./manifest.js";
import { setInboxHandler, type InboxMessageParams } from "./inbox.js";
import {
  respondToMessage,
  closeInteractiveMessage,
  ServiceError,
} from "../response-service.js";

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
  /** runId → typing heartbeat interval — re-broadcasts typing every 3s to keep client indicator alive */
  typingHeartbeats: Map<string, ReturnType<typeof setInterval>>;
  /** Pending seen messages — flushed when run.started confirms events were consumed from inbox */
  pendingSeenMessages: Array<{ spaceId: string; messageId: string }>;
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
  /** Heartbeat interval for keeping haseef entities online */
  presenceInterval: ReturnType<typeof setInterval> | null;
}

const state: ServiceState = {
  config: null,
  connections: new Map(),
  sharedSubscriber: null,
  actionConsumer: null,
  actionListenerRunning: false,
  presenceInterval: null,
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

  // Auto-discover haseefs from Core (retry up to 5 times if Core isn't ready yet)
  let haseefs: Awaited<ReturnType<typeof discoverHaseefs>> = [];
  for (let attempt = 1; attempt <= 5; attempt++) {
    haseefs = await discoverHaseefs();
    if (haseefs.length > 0) break;
    console.warn(`[spaces-service] No haseefs found (attempt ${attempt}/5) — retrying in ${attempt * 2}s...`);
    await new Promise((r) => setTimeout(r, attempt * 2000));
  }
  if (haseefs.length === 0) {
    console.warn("[spaces-service] No haseefs found in Core after retries — nothing to connect to");
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
  const conn: ActiveConnection = {
    haseefId,
    haseefName,
    agentEntityId,
    spaceIds,
    runSpaces: new Map(),
    typingHeartbeats: new Map(),
    pendingSeenMessages: [],
  };
  state.connections.set(haseefId, conn);

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
// Action Listener — Redis Streams (XREADGROUP)
//
// Listens for tool-call actions dispatched by Core for the "spaces" scope.
// Each action contains: actionId, name (tool name), args, mode.
// After execution, submits result back to Core.
// =============================================================================

async function startActionListener(): Promise<void> {
  if (state.actionListenerRunning) return;
  state.actionListenerRunning = true;

  // MUST use Core's Redis — actions are dispatched there by Core
  const redisUrl = state.config!.coreRedisUrl;
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
// Reply-To Resolution — resolves a message ID into ReplyToMetadata
// =============================================================================

async function resolveReplyTo(
  messageId: string | undefined,
): Promise<ReplyToMetadata | undefined> {
  if (!messageId) return undefined;
  const msg = await prisma.smartSpaceMessage.findUnique({
    where: { id: messageId },
    include: { entity: { select: { displayName: true } } },
  });
  if (!msg) return undefined;
  const meta = (msg.metadata ?? {}) as Record<string, unknown>;
  return {
    messageId: msg.id,
    snippet: (msg.content ?? "").slice(0, 100),
    senderName: (msg as any).entity?.displayName ?? "Unknown",
    messageType: (meta.type as string) || "text",
  };
}

// =============================================================================
// Action Execution — routes to the correct tool handler
// =============================================================================

/** Tools that produce messages — typing indicator should show while these execute.
 *  Checks both unprefixed ('send_message') and prefixed ('spaces_send_message') names
 *  since Core emits prefixed tool names in stream events. */
const MESSAGE_TOOLS = new Set([
  "send_message", "send_confirmation", "send_choice", "send_vote", "send_form",
]);
function isMessageTool(toolName?: string): boolean {
  if (!toolName) return false;
  if (MESSAGE_TOOLS.has(toolName)) return true;
  // Core prefixes tool names with scope: "spaces_send_message" → strip prefix and check
  const unprefixed = toolName.replace(/^spaces_/, '');
  return MESSAGE_TOOLS.has(unprefixed);
}

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

        const replyTo = await resolveReplyTo(args.replyTo as string | undefined);

        // Direct persist + emit (no HTTP call)
        const result = await postSpaceMessage({
          spaceId,
          entityId: agentEntityId,
          role: "assistant",
          content: text,
          messageType: "text",
          replyTo,
          metadata: {
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
          messages: messages.reverse().map((m: any) => {
            const meta = m.metadata as Record<string, unknown> | null;
            const msgType = (meta?.type as string) || "text";
            const result: Record<string, unknown> = {
              id: m.id,
              sender: m.entityId === agentEntityId ? "You" : (m.entity?.displayName ?? "Unknown"),
              senderType: m.entity?.type ?? "unknown",
              content: m.content,
              type: msgType,
              createdAt: m.createdAt.toISOString(),
            };
            // Include interactive message fields if present
            if (meta?.audience) result.audience = meta.audience;
            if (meta?.status) result.status = meta.status;
            if (meta?.responseSummary) result.responseSummary = meta.responseSummary;
            if (meta?.replyTo) result.replyTo = meta.replyTo;
            if (meta?.payload) result.payload = meta.payload;
            return result;
          }),
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

      case "send_confirmation": {
        const spaceId = args.spaceId as string;
        const title = args.title as string;
        const message = args.message as string;
        const targetEntityId = args.targetEntityId as string;
        if (!spaceId || !title || !message || !targetEntityId)
          return { error: "spaceId, title, message, and targetEntityId are required" };
        if (!agentEntityId)
          return { error: "agentEntityId not resolved" };

        const confirmLabel = (args.confirmLabel as string) || "Confirm";
        const rejectLabel = (args.rejectLabel as string) || "Cancel";
        const replyTo = await resolveReplyTo(args.replyTo as string | undefined);

        const result = await postSpaceMessage({
          spaceId,
          entityId: agentEntityId,
          role: "assistant",
          content: `${title}: ${message}`,
          messageType: "confirmation",
          replyTo,
          metadata: {
            toolName,
            actionId,
            audience: "targeted",
            targetEntityIds: [targetEntityId],
            status: "open",
            responseSchema: { type: "enum", values: ["confirmed", "rejected"] },
            payload: { title, message, confirmLabel, rejectLabel },
            responseSummary: { totalResponses: 0, responses: [], respondedEntityIds: [] },
          },
        });

        // Push interactive_message sense event to all haseefs in space
        await pushInteractiveMessageEvent(spaceId, result.messageId, "confirmation", title);

        return {
          success: true,
          messageId: result.messageId,
          status: "pending",
          message: `Confirmation sent to target. You'll receive a message_resolved event when they respond.`,
        };
      }

      case "send_choice": {
        const spaceId = args.spaceId as string;
        const text = args.text as string;
        const options = args.options as Array<{ label: string; value: string }>;
        if (!spaceId || !text || !Array.isArray(options) || options.length === 0)
          return { error: "spaceId, text, and options are required" };
        if (!agentEntityId)
          return { error: "agentEntityId not resolved" };

        const targetEntityId = args.targetEntityId as string | undefined;
        const isTargeted = !!targetEntityId;
        const values = options.map((o) => o.value);
        const replyTo = await resolveReplyTo(args.replyTo as string | undefined);

        const result = await postSpaceMessage({
          spaceId,
          entityId: agentEntityId,
          role: "assistant",
          content: text,
          messageType: "choice",
          replyTo,
          metadata: {
            toolName,
            actionId,
            audience: isTargeted ? "targeted" : "broadcast",
            ...(isTargeted ? { targetEntityIds: [targetEntityId] } : {}),
            status: "open",
            responseSchema: { type: "enum", values },
            payload: { text, options },
            responseSummary: { totalResponses: 0, responses: [], ...(isTargeted ? { respondedEntityIds: [] } : {}) },
          },
        });

        await pushInteractiveMessageEvent(spaceId, result.messageId, "choice", text);

        return {
          success: true,
          messageId: result.messageId,
          status: "pending",
          message: isTargeted
            ? `Choice sent to target. You'll receive a message_resolved event when they respond.`
            : `Choice broadcast to all members. You'll receive message_response events as people respond.`,
        };
      }

      case "send_vote": {
        const spaceId = args.spaceId as string;
        const title = args.title as string;
        const options = args.options as string[];
        if (!spaceId || !title || !Array.isArray(options) || options.length < 2)
          return { error: "spaceId, title, and at least 2 options are required" };
        if (!agentEntityId)
          return { error: "agentEntityId not resolved" };

        const allowMultiple = !!args.allowMultiple;
        const replyTo = await resolveReplyTo(args.replyTo as string | undefined);

        // Initialize counts with 0 for each option
        const counts: Record<string, number> = {};
        for (const opt of options) counts[opt] = 0;

        const result = await postSpaceMessage({
          spaceId,
          entityId: agentEntityId,
          role: "assistant",
          content: `📊 ${title}`,
          messageType: "vote",
          replyTo,
          metadata: {
            toolName,
            actionId,
            audience: "broadcast",
            status: "open",
            responseSchema: { type: "enum", values: options, multiple: allowMultiple },
            payload: { title, options, allowMultiple },
            responseSummary: { totalResponses: 0, counts, responses: [] },
          },
        });

        await pushInteractiveMessageEvent(spaceId, result.messageId, "vote", title);

        return {
          success: true,
          messageId: result.messageId,
          status: "open",
          message: `Vote created. You'll receive message_response events as people vote.`,
        };
      }

      case "send_form": {
        const spaceId = args.spaceId as string;
        const title = args.title as string;
        const fields = args.fields as Array<Record<string, unknown>>;
        if (!spaceId || !title || !Array.isArray(fields) || fields.length === 0)
          return { error: "spaceId, title, and at least 1 field are required" };
        if (!agentEntityId)
          return { error: "agentEntityId not resolved" };

        const description = args.description as string | undefined;
        const targetEntityIds = args.targetEntityIds as string[] | undefined;
        const isTargeted = Array.isArray(targetEntityIds) && targetEntityIds.length > 0;

        // Build a basic JSON schema from fields for validation
        const jsonSchema: Record<string, unknown> = {
          type: "object",
          properties: {} as Record<string, unknown>,
          required: [] as string[],
        };
        for (const field of fields) {
          const name = field.name as string;
          const fieldType = field.type as string;
          const prop: Record<string, unknown> = {};
          if (fieldType === "number") prop.type = "number";
          else if (fieldType === "select" && Array.isArray(field.options)) {
            prop.type = "string";
            prop.enum = field.options;
          } else prop.type = "string";
          (jsonSchema.properties as Record<string, unknown>)[name] = prop;
          if (field.required) (jsonSchema.required as string[]).push(name);
        }

        const replyTo = await resolveReplyTo(args.replyTo as string | undefined);

        const result = await postSpaceMessage({
          spaceId,
          entityId: agentEntityId,
          role: "assistant",
          content: `📝 ${title}`,
          messageType: "form",
          replyTo,
          metadata: {
            toolName,
            actionId,
            audience: isTargeted ? "targeted" : "broadcast",
            ...(isTargeted ? { targetEntityIds } : {}),
            status: "open",
            responseSchema: { type: "json", schema: jsonSchema },
            payload: { title, description, fields },
            responseSummary: { totalResponses: 0, responses: [], ...(isTargeted ? { respondedEntityIds: [] } : {}) },
          },
        });

        await pushInteractiveMessageEvent(spaceId, result.messageId, "form", title);

        return {
          success: true,
          messageId: result.messageId,
          status: "open",
          message: isTargeted
            ? `Form sent to target. You'll receive a message_resolved event when they submit.`
            : `Form broadcast to all members. You'll receive message_response events as people submit.`,
        };
      }

      case "respond_to_message": {
        const spaceId = args.spaceId as string;
        const messageId = args.messageId as string;
        const value = args.value;
        if (!spaceId || !messageId || value === undefined)
          return { error: "spaceId, messageId, and value are required" };
        if (!agentEntityId)
          return { error: "agentEntityId not resolved" };

        const result = await respondToMessage({
          spaceId,
          messageId,
          entityId: agentEntityId,
          value,
        });

        return {
          success: true,
          resolved: result.resolved,
          responseSummary: result.responseSummary,
        };
      }

      case "close_interactive_message": {
        const spaceId = args.spaceId as string;
        const messageId = args.messageId as string;
        if (!spaceId || !messageId)
          return { error: "spaceId and messageId are required" };
        if (!agentEntityId)
          return { error: "agentEntityId not resolved" };

        return await closeInteractiveMessage({
          spaceId,
          messageId,
          entityId: agentEntityId,
        });
      }

      case "invite_to_space": {
        const spaceId = args.spaceId as string;
        const email = args.email as string;
        if (!spaceId || !email)
          return { error: "spaceId and email are required" };
        if (!agentEntityId)
          return { error: "agentEntityId not resolved" };

        // Check admin+ role
        const inviterMembership = await prisma.smartSpaceMembership.findFirst({
          where: { smartSpaceId: spaceId, entityId: agentEntityId },
        });
        if (!inviterMembership)
          return { error: "You are not a member of this space" };
        if (!["owner", "admin"].includes(inviterMembership.role))
          return { error: "You need admin or owner role to invite" };

        const invRole = (args.role as string) || "member";
        const invMessage = args.message as string | undefined;

        // Check if invitee is already a member (by email → entity lookup)
        const existingEntity = await prisma.entity.findUnique({
          where: { externalId: email },
          select: { id: true },
        });
        if (existingEntity) {
          const existingMembership = await prisma.smartSpaceMembership.findUnique({
            where: {
              smartSpaceId_entityId: {
                smartSpaceId: spaceId,
                entityId: existingEntity.id,
              },
            },
          });
          if (existingMembership)
            return { error: "This person is already a member of the space" };
        }

        // Upsert: if declined/expired/revoked, update back to pending (§17.9)
        const existing = await prisma.invitation.findUnique({
          where: { smartSpaceId_inviteeEmail: { smartSpaceId: spaceId, inviteeEmail: email } },
        });

        let invitation;
        if (existing) {
          if (existing.status === "pending")
            return { error: "There is already a pending invitation for this email" };
          if (existing.status === "accepted")
            return { error: "Invitation already accepted" };
          // Re-invite: update declined/expired/revoked → pending
          invitation = await prisma.invitation.update({
            where: { id: existing.id },
            data: {
              status: "pending",
              role: invRole,
              inviterId: agentEntityId,
              message: invMessage || null,
            },
          });
        } else {
          invitation = await prisma.invitation.create({
            data: {
              smartSpaceId: spaceId,
              inviterId: agentEntityId,
              inviteeEmail: email,
              inviteeId: existingEntity?.id || null,
              role: invRole,
              message: invMessage || null,
              status: "pending",
            },
          });
        }

        // Notify invitee via entity channel (if they have an account)
        if (existingEntity) {
          const [space, inviter] = await Promise.all([
            prisma.smartSpace.findUnique({ where: { id: spaceId }, select: { name: true } }),
            prisma.entity.findUnique({ where: { id: agentEntityId }, select: { displayName: true } }),
          ]);
          emitEntityChannelEvent(existingEntity.id, {
            type: "invitation.created",
            invitationId: invitation.id,
            smartSpaceId: spaceId,
            spaceName: space?.name,
            inviterName: inviter?.displayName,
            role: invRole,
            message: invMessage || null,
          }).catch(() => {});
        }

        return {
          success: true,
          invitationId: invitation.id,
          message: `Invitation sent to ${email}`,
        };
      }

      case "get_space_members": {
        const spaceId = args.spaceId as string;
        if (!spaceId) return { error: "spaceId is required" };

        const memberships = await prisma.smartSpaceMembership.findMany({
          where: { smartSpaceId: spaceId },
          include: {
            entity: { select: { id: true, displayName: true, type: true } },
          },
        });

        return {
          members: memberships.map((m: any) => ({
            entityId: m.entityId,
            name: m.entity?.displayName ?? "Unknown",
            type: m.entity?.type ?? "unknown",
            role: m.role,
            isYou: m.entityId === agentEntityId,
          })),
        };
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

  // MUST use Core's Redis — stream events are published there by Core
  const redisUrl = state.config!.coreRedisUrl;
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
      // Only broadcast to the trigger space (the space that caused this run)
      const targetSpaceId = runId ? conn.runSpaces.get(runId) : undefined;
      const targetSpaces = targetSpaceId ? [targetSpaceId] : conn.spaceIds;
      for (const spaceId of targetSpaces) {
        if (runId) {
          void setSpaceActiveRun(spaceId, runId, conn.agentEntityId, conn.haseefName);
        }
        // Mark haseef online when cycle starts
        void markOnline(spaceId, conn.agentEntityId);
        void emitSmartSpaceEvent(spaceId, {
          type: "agent.active",
          agentEntityId: conn.agentEntityId,
          runId,
          data: { agentEntityId: conn.agentEntityId, agentName: conn.haseefName, runId },
        });
      }
      // Flush pending seen messages — run.started means events were consumed from inbox
      if (conn.pendingSeenMessages.length > 0) {
        const pending = conn.pendingSeenMessages.splice(0);
        // Group by spaceId and take the latest messageId per space
        const latestPerSpace = new Map<string, string>();
        for (const p of pending) {
          latestPerSpace.set(p.spaceId, p.messageId);
        }
        for (const [sid, mid] of latestPerSpace) {
          markHaseefSeen(sid, conn.agentEntityId, mid).catch(() => {});
        }
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
        // Show typing when agent starts composing a message
        if (isMessageTool(event.toolName)) {
          void broadcastTyping(spaceId, conn.agentEntityId, conn.haseefName, true);
          // Start typing heartbeat — re-broadcast every 3s so client's 5s auto-expire
          // doesn't kill the indicator during long message composition
          if (runId && !conn.typingHeartbeats.has(runId)) {
            const hb = setInterval(() => {
              void broadcastTyping(spaceId, conn.agentEntityId, conn.haseefName, true);
            }, 3000);
            conn.typingHeartbeats.set(runId, hb);
          }
        }
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
        // Stop typing when message tool finishes
        if (isMessageTool(event.toolName)) {
          void broadcastTyping(spaceId, conn.agentEntityId, conn.haseefName, false);
        }
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
      // Stop typing heartbeat FIRST
      if (runId) {
        const hb = conn.typingHeartbeats.get(runId);
        if (hb) {
          clearInterval(hb);
          conn.typingHeartbeats.delete(runId);
        }
      }
      // Only broadcast to the trigger space
      const targetSpaceId = runId ? conn.runSpaces.get(runId) : undefined;
      const targetSpaces = targetSpaceId ? [targetSpaceId] : conn.spaceIds;
      for (const spaceId of targetSpaces) {
        if (runId) {
          void removeSpaceActiveRun(spaceId, runId);
        }
        // Typing=false BEFORE agent.inactive so UI clears typing before removing active state
        void broadcastTyping(spaceId, conn.agentEntityId, conn.haseefName, false);
        void emitSmartSpaceEvent(spaceId, {
          type: "agent.inactive",
          agentEntityId: conn.agentEntityId,
          runId,
          data: { agentEntityId: conn.agentEntityId, runId },
        });
        // Mark haseef offline when cycle finishes (only if no other active runs in this space)
        listSpaceActiveRuns(spaceId).then((runs) => {
          const stillActive = runs.some((r) => r.entityId === conn.agentEntityId);
          if (!stillActive) {
            void markOffline(spaceId, conn.agentEntityId);
          }
        }).catch(() => {});
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
// Interactive Message Sense Events
//
// Push sense events for interactive message lifecycle:
//   - interactive_message → all haseefs in space (message created)
//   - message_response → sending haseef only (someone responded)
//   - message_resolved → all haseefs in space (targeted auto-resolved or closed)
// =============================================================================

async function pushInteractiveMessageEvent(
  spaceId: string,
  messageId: string,
  messageType: string,
  title: string,
): Promise<void> {
  if (!state.config) return;

  const conns = getConnectionsForSpace(spaceId);
  if (conns.length === 0) return;

  // Load full message + sender info for a complete sense event (§7.8)
  const [msg, space] = await Promise.all([
    prisma.smartSpaceMessage.findUnique({
      where: { id: messageId },
      include: { entity: { select: { id: true, displayName: true, type: true } } },
    }),
    prisma.smartSpace.findUnique({ where: { id: spaceId }, select: { name: true } }),
  ]);

  const spaceName = space?.name ?? spaceId;
  const meta = (msg?.metadata ?? {}) as Record<string, unknown>;
  const audience = (meta.audience as string) ?? "broadcast";
  const targetEntityIds = (meta.targetEntityIds as string[]) ?? [];
  const isTargeted = audience === "targeted";

  for (const conn of conns) {
    await pushSenseEvent(conn.haseefId, {
      eventId: `interactive-${messageId}`,
      scope: SCOPE,
      type: "interactive_message",
      data: {
        messageId,
        spaceId,
        spaceName,
        senderId: msg?.entityId,
        senderName: msg?.entity?.displayName ?? "Unknown",
        senderType: msg?.entity?.type ?? "unknown",
        messageType,
        audience,
        isTargeted,
        youAreTargeted: isTargeted && targetEntityIds.includes(conn.agentEntityId),
        title,
        payload: meta.payload ?? {},
        responseSchema: meta.responseSchema ?? null,
      },
    }).catch((err) => {
      console.warn(`[spaces-service] Failed to push interactive_message event:`, err);
    });
  }
}

export async function pushMessageResponseEvent(
  spaceId: string,
  messageId: string,
  senderEntityId: string,
  responderName: string,
  responderType: string,
  value: unknown,
  responseSummary: Record<string, unknown>,
): Promise<void> {
  if (!state.config) return;

  // Find the connection whose agentEntityId matches the message sender
  const conns = getConnectionsForSpace(spaceId);
  const senderConn = conns.find((c) => c.agentEntityId === senderEntityId);
  if (!senderConn) return;

  const spaceName = await prisma.smartSpace
    .findUnique({ where: { id: spaceId }, select: { name: true } })
    .then((s) => s?.name ?? spaceId)
    .catch(() => spaceId);

  await pushSenseEvent(senderConn.haseefId, {
    eventId: `response-${messageId}-${Date.now()}`,
    scope: SCOPE,
    type: "message_response",
    data: {
      messageId,
      spaceId,
      spaceName,
      responderName,
      responderType,
      value,
      responseSummary,
    },
  }).catch((err) => {
    console.warn(`[spaces-service] Failed to push message_response event:`, err);
  });
}

export async function pushMessageResolvedEvent(
  spaceId: string,
  messageId: string,
  messageType: string,
  title: string,
  status: string,
  resolution: Record<string, unknown>,
  finalSummary: Record<string, unknown>,
): Promise<void> {
  if (!state.config) return;

  const conns = getConnectionsForSpace(spaceId);
  if (conns.length === 0) return;

  const spaceName = await prisma.smartSpace
    .findUnique({ where: { id: spaceId }, select: { name: true } })
    .then((s) => s?.name ?? spaceId)
    .catch(() => spaceId);

  for (const conn of conns) {
    await pushSenseEvent(conn.haseefId, {
      eventId: `resolved-${messageId}`,
      scope: SCOPE,
      type: "message_resolved",
      data: {
        messageId,
        spaceId,
        spaceName,
        messageType,
        title,
        status,
        resolution,
        finalSummary,
      },
    }).catch((err) => {
      console.warn(`[spaces-service] Failed to push message_resolved event:`, err);
    });
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
    messageType,
    metadata,
  } = params;

  // Find connected haseefs for this space
  const conns = getConnectionsForSpace(spaceId);
  if (conns.length === 0) return;

  // Fetch recent messages once (shared across connections, labeled per-haseef below)
  let recentRaw: Array<{
    id: string;
    entityId: string;
    displayName: string;
    type: string;
    content: string;
    createdAt: Date;
    replyTo?: { messageId: string; senderName: string; snippet: string };
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
    recentRaw = recent.reverse().map((m: any) => {
      const meta = (m.metadata ?? {}) as Record<string, unknown>;
      const rt = meta.replyTo as { messageId?: string; senderName?: string; snippet?: string } | undefined;
      return {
        id: m.id,
        entityId: m.entityId,
        displayName: m.entity?.displayName ?? "Unknown",
        type: m.entity?.type ?? "unknown",
        content: m.content ?? "",
        createdAt: m.createdAt,
        ...(rt?.messageId ? { replyTo: { messageId: rt.messageId, senderName: rt.senderName ?? "Unknown", snippet: rt.snippet ?? "" } } : {}),
      };
    });
  } catch (err) {
    // Non-fatal — send event without context
    console.warn("[spaces-service] Failed to fetch conversation context:", err);
  }

  // Extract replyTo from metadata if present
  const replyTo = metadata?.replyTo as Record<string, unknown> | undefined;

  // Fetch space members once (shared across connections)
  let memberRows: Array<{ entityId: string; displayName: string; type: string; role: string }> = [];
  try {
    const memberships = await prisma.smartSpaceMembership.findMany({
      where: { smartSpaceId: spaceId },
      include: { entity: { select: { id: true, displayName: true, type: true } } },
    });
    memberRows = memberships.map((m: any) => ({
      entityId: m.entityId,
      displayName: m.entity?.displayName ?? "Unknown",
      type: m.entity?.type ?? "unknown",
      role: m.role ?? "member",
    }));
  } catch {
    // Non-fatal — proceed without member data
  }

  const isGroupSpace = memberRows.length > 2;

  // Skip messages from THIS haseef's own entity (avoid loops)
  for (const conn of conns) {
    if (entityId === conn.agentEntityId) continue;

    console.log(
      `[spaces-service] → sense: ${senderName} in "${spaceName}": "${content.slice(0, 50)}"`,
    );

    // Label per-haseef: "You" for this haseef's own messages, display name for everyone else
    const recentMessages = recentRaw.map((m) => ({
      messageId: m.id,
      sender: m.entityId === conn.agentEntityId ? "You" : m.displayName,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
      ...(m.replyTo ? { replyTo: m.replyTo } : {}),
    }));

    // Build labeled member list for this haseef
    const spaceMembers = memberRows.map((m) => ({
      name: m.entityId === conn.agentEntityId ? "You" : m.displayName,
      type: m.type,
      role: m.role,
      isYou: m.entityId === conn.agentEntityId,
    }));

    const eventData: Record<string, unknown> = {
      messageId,
      spaceId,
      spaceName,
      senderId: entityId,
      senderName,
      senderType,
      content,
      recentMessages,
      spaceMembers,
      isGroupSpace,
    };
    // Include message type info (§17.8)
    if (messageType && messageType !== "text") {
      eventData.messageType = messageType;
    }
    if (replyTo) {
      eventData.replyTo = replyTo;
    }

    console.log(`[spaces-service] Sense event data for ${conn.haseefName}:`, JSON.stringify({
      triggerMessageId: messageId,
      recentMessageIds: recentMessages.map((m: any) => `${m.messageId?.slice(0,8)}...(${m.sender})`),
      hasReplyTo: !!replyTo,
      isGroupSpace,
    }));

    await pushSenseEvent(conn.haseefId, {
      eventId: messageId,
      scope: SCOPE,
      type: "message",
      data: eventData,
    });

    // Track message as pending-seen — will be flushed when run.started confirms
    // the events were actually consumed from the inbox (not while haseef is mid-cycle)
    conn.pendingSeenMessages.push({ spaceId, messageId });
  }
}

/**
 * Advance a haseef's lastSeenMessageId watermark and broadcast the seen event.
 * Called after a sense event is successfully pushed for a message.
 */
async function markHaseefSeen(
  spaceId: string,
  agentEntityId: string,
  messageId: string,
): Promise<void> {
  try {
    await prisma.smartSpaceMembership.update({
      where: { smartSpaceId_entityId: { smartSpaceId: spaceId, entityId: agentEntityId } },
      data: { lastSeenMessageId: messageId },
    });
    const entity = await prisma.entity.findUnique({
      where: { id: agentEntityId },
      select: { displayName: true },
    });
    await broadcastSeen(spaceId, agentEntityId, entity?.displayName ?? "AI", messageId);
  } catch {
    // Non-fatal — seen status is best-effort for agents
  }
}

// =============================================================================
// Entity Channel Events — notify individual users via Redis pub/sub
// =============================================================================

async function emitEntityChannelEvent(
  entityId: string,
  event: Record<string, unknown>,
): Promise<void> {
  const channel = `entity:${entityId}`;
  await redis.publish(channel, JSON.stringify(event));
}
