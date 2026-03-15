// =============================================================================
// Spaces Service — Sense Events
//
// Pushes V5 sense events to Core for connected haseefs:
//   - handleInboxMessage: new space messages → sense events
//   - markHaseefSeen: advance seen watermark after events consumed
//   - pushInteractiveMessageEvent: interactive message lifecycle
//   - pushMessageResponseEvent: someone responded to an interactive message
//   - pushMessageResolvedEvent: interactive message resolved/closed
//   - emitEntityChannelEvent: notify individual users via Redis pub/sub
// =============================================================================

import { prisma } from "../db.js";
import { broadcastSeen } from "../smartspace-events.js";
import { redis } from "../redis.js";
import { state, getConnectionsForSpace } from "./types.js";
import { pushSenseEvent } from "./core-api.js";
import { SCOPE } from "./manifest.js";
import type { InboxMessageParams } from "./inbox.js";

// =============================================================================
// Inbox Handler — V5 Sense Events
//
// Called by space-service.ts after persisting a message.
// Pushes V5 sense events to Core for connected haseefs.
// =============================================================================

export async function handleInboxMessage(params: InboxMessageParams): Promise<void> {
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
export async function markHaseefSeen(
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
// Interactive Message Sense Events
//
// Push sense events for interactive message lifecycle:
//   - interactive_message → all haseefs in space (message created)
//   - message_response → sending haseef only (someone responded)
//   - message_resolved → all haseefs in space (targeted auto-resolved or closed)
// =============================================================================

export async function pushInteractiveMessageEvent(
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
// Entity Channel Events — notify individual users via Redis pub/sub
// =============================================================================

export async function emitEntityChannelEvent(
  entityId: string,
  event: Record<string, unknown>,
): Promise<void> {
  const channel = `entity:${entityId}`;
  await redis.publish(channel, JSON.stringify(event));
}
