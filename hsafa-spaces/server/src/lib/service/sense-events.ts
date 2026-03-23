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

  // Fetch space metadata for isDirect info
  let spaceMeta: Record<string, unknown> = {};
  try {
    const spaceRow = await prisma.smartSpace.findUnique({
      where: { id: spaceId },
      select: { metadata: true },
    });
    spaceMeta = (spaceRow?.metadata ?? {}) as Record<string, unknown>;
  } catch {
    // Non-fatal
  }
  const isDirect = !!spaceMeta.isDirect;
  const directType = (spaceMeta.directType as string) ?? null;

  // Fetch space members once (shared across connections)
  let memberRows: Array<{ entityId: string; displayName: string; type: string; role: string }> = [];
  try {
    const memberships = await prisma.smartSpaceMembership.findMany({
      where: { smartSpaceId: spaceId },
      include: { entity: { select: { id: true, displayName: true, type: true } } },
    });
    memberRows = memberships
      .map((m: any) => ({
        entityId: m.entityId,
        displayName: m.entity?.displayName ?? "Unknown",
        type: m.entity?.type ?? "unknown",
        role: m.role ?? "member",
      }));
  } catch {
    // Non-fatal — proceed without member data
  }

  const isGroupSpace = memberRows.length > 2;

  console.log(
    `[spaces-service] handleInboxMessage: sender="${senderName}" (${entityId.slice(0, 8)}) in "${spaceName}" (${spaceId.slice(0, 8)}), ` +
    `connectedHaseefs=${conns.length} [${conns.map(c => `${c.haseefName}(${c.agentEntityId.slice(0,8)})`).join(', ')}]`,
  );

  // Skip messages from THIS haseef's own entity (avoid loops)
  for (const conn of conns) {
    if (entityId === conn.agentEntityId) {
      console.log(`[spaces-service]   SKIP ${conn.haseefName} — sender is self`);
      continue;
    }

    // Loop prevention: in group spaces, only trigger haseefs when the sender
    // is human OR when the agent message mentions this haseef by name.
    // This prevents exponential cascades with 3+ agents.
    if (isGroupSpace && senderType === "agent") {
      const lowerContent = (content ?? "").toLowerCase();
      const lowerName = conn.haseefName.toLowerCase();
      if (!lowerContent.includes(lowerName)) {
        console.log(`[spaces-service]   SKIP ${conn.haseefName} — agent sender in group, not mentioned`);
        continue;
      }
    }

    console.log(`[spaces-service]   TRIGGER ${conn.haseefName} — pushing sense event`);

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

    // Build content with text fallback for media messages
    // Non-multimodal LLMs can't process images/audio/video — provide text descriptions
    let eventContent = content;
    if (messageType && messageType !== "text") {
      const payload = metadata?.payload as Record<string, unknown> | undefined;
      const files = metadata?.files as Array<Record<string, unknown>> | undefined;
      eventContent = buildMediaFallbackContent(messageType, content, payload, files);
    }

    // For direct spaces, compute who this haseef is direct with
    let directWith: { entityId: string; name: string; type: string } | undefined;
    if (isDirect) {
      const otherMember = memberRows.find((m) => m.entityId !== conn.agentEntityId);
      if (otherMember) {
        directWith = { entityId: otherMember.entityId, name: otherMember.displayName, type: otherMember.type };
      }
    }

    // Build formattedContext — the human-readable representation core injects
    // into consciousness. Core is generic and does not interpret our fields.
    const formattedContext = buildFormattedContext({
      yourName: conn.haseefName,
      spaceId,
      spaceName: spaceName ?? spaceId,
      spaceMembers,
      isGroupSpace,
      isDirect,
      directWith,
      recentMessages,
      senderName,
      senderType: senderType ?? "unknown",
      content: eventContent ?? "",
      messageId,
      replyTo: replyTo as { messageId?: string; senderName?: string; snippet?: string } | undefined,
    });

    const eventData: Record<string, unknown> = {
      formattedContext,
      // Structured fields for programmatic use (SDKs, stream bridge, etc.)
      yourEntityId: conn.agentEntityId,
      yourName: conn.haseefName,
      messageId,
      spaceId,
      spaceName,
      senderId: entityId,
      senderName,
      senderType,
      content: eventContent,
      isGroupSpace,
      isDirect,
      ...(directType ? { directType } : {}),
      ...(directWith ? { directWith } : {}),
    };
    if (messageType && messageType !== "text") {
      eventData.messageType = messageType;
    }
    if (metadata?.payload) {
      eventData.payload = metadata.payload;
    }
    if (metadata?.files && Array.isArray(metadata.files)) {
      eventData.files = metadata.files;
    }
    if (replyTo) {
      eventData.replyTo = replyTo;
    }

    // Extract image attachments for multimodal LLM support
    const imageAttachments: Array<{ type: "image" | "audio" | "file"; mimeType: string; url?: string; name?: string }> = [];
    if (metadata?.files && Array.isArray(metadata.files)) {
      for (const f of metadata.files as Array<Record<string, unknown>>) {
        if (f.type === "image" && f.url) {
          imageAttachments.push({
            type: "image",
            mimeType: (f.fileMimeType as string) || "image/png",
            url: f.url as string,
            name: f.fileName as string | undefined,
          });
        }
      }
    }
    // Also handle single image from payload (agent-sent images)
    if (!imageAttachments.length && messageType === "image" && metadata?.payload) {
      const p = metadata.payload as Record<string, unknown>;
      const imgUrl = (p.imageUrl ?? p.url) as string | undefined;
      if (imgUrl) {
        imageAttachments.push({
          type: "image",
          mimeType: "image/png",
          url: imgUrl,
        });
      }
    }

    await pushSenseEvent(conn.haseefId, {
      eventId: messageId,
      scope: SCOPE,
      type: "message",
      data: eventData,
      ...(imageAttachments.length > 0 ? { attachments: imageAttachments } : {}),
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

// =============================================================================
// Media Fallback Content — text descriptions for non-multimodal LLMs
//
// When a human sends an image, voice, or file message, the haseef receives a
// text description so it can still understand and respond to the message even
// if its underlying LLM cannot process binary media.
// =============================================================================

function buildMediaFallbackContent(
  messageType: string,
  originalContent: string | null,
  payload?: Record<string, unknown>,
  files?: Array<Record<string, unknown>>,
): string {
  // If there are multiple file attachments, describe them
  if (files && files.length > 0) {
    const descriptions = files.map((f) => {
      const name = f.fileName as string || "unknown";
      const type = f.type as string || "file";
      const size = f.fileSize as number | undefined;
      const sizeStr = size ? ` (${formatBytes(size)})` : "";
      return `[${type}: ${name}${sizeStr}]`;
    });
    const attachmentText = descriptions.join(", ");
    if (originalContent && originalContent.trim()) {
      return `${originalContent}\n\nAttachments: ${attachmentText}`;
    }
    return `Attachments: ${attachmentText}`;
  }

  // If there's already meaningful text content, use it
  if (originalContent && originalContent.trim()) return originalContent;

  switch (messageType) {
    case "image": {
      const caption = payload?.caption as string | undefined;
      return caption
        ? `[Image message] ${caption}`
        : "[Image message — no caption provided]";
    }
    case "voice": {
      const transcription = payload?.transcription as string | undefined;
      const duration = payload?.audioDuration as number | undefined;
      if (transcription) {
        return `[Voice message${duration ? ` (${duration}s)` : ""}] Transcription: "${transcription}"`;
      }
      return `[Voice message${duration ? ` (${duration}s)` : ""} — no transcription available]`;
    }
    case "file": {
      const fileName = payload?.fileName as string | undefined;
      const fileMimeType = payload?.fileMimeType as string | undefined;
      const fileSize = payload?.fileSize as number | undefined;
      const parts = ["[File message]"];
      if (fileName) parts.push(fileName);
      if (fileMimeType) parts.push(`(${fileMimeType})`);
      if (fileSize) parts.push(`${formatBytes(fileSize)}`);
      return parts.join(" ");
    }
    case "video": {
      const duration = payload?.videoDuration as number | undefined;
      return `[Video message${duration ? ` (${duration}s)` : ""}]`;
    }
    case "confirmation":
    case "vote":
    case "choice":
    case "form":
    case "card":
    case "chart": {
      // Interactive/structured messages — the original content usually has a summary
      const title = (payload?.title as string) || (payload?.text as string) || "";
      return title ? `[${messageType} message] ${title}` : `[${messageType} message]`;
    }
    default:
      return originalContent || `[${messageType} message]`;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// =============================================================================
// Formatted Context Builder
//
// Produces a human-readable string for core to inject into consciousness.
// Core is generic — it just uses data.formattedContext if present.
// All spaces-specific formatting lives here.
// =============================================================================

interface FormattedContextParams {
  yourName: string;
  spaceId: string;
  spaceName: string;
  spaceMembers: Array<{ name: string; type: string; role: string; isYou: boolean }>;
  isGroupSpace: boolean;
  isDirect: boolean;
  directWith?: { entityId: string; name: string; type: string };
  recentMessages: Array<{
    messageId: string;
    sender: string;
    content: string;
    createdAt: string;
    replyTo?: { messageId: string; senderName: string; snippet: string };
  }>;
  senderName: string;
  senderType: string;
  content: string;
  messageId: string;
  replyTo?: { messageId?: string; senderName?: string; snippet?: string };
}

function buildFormattedContext(p: FormattedContextParams): string {
  const lines: string[] = [];

  // Space header
  const spaceType = p.isGroupSpace ? "GROUP" : "1-on-1";
  const spaceLabel = `"${p.spaceName}"`;

  lines.push(`[YOU ARE: ${p.yourName}]`);

  if (p.isDirect && p.directWith) {
    lines.push(`[DIRECT SPACE with ${p.directWith.name} (${p.directWith.type})]`);
  }

  if (p.spaceMembers.length > 0) {
    const memberList = p.spaceMembers
      .map((m) => `${m.name}${m.isYou ? " (You)" : ""} [${m.type}]`)
      .join(", ");
    lines.push(`[space: ${spaceLabel}, ${spaceType}, members: ${memberList}]`);
  } else {
    lines.push(`[space: ${spaceLabel}, ${spaceType}]`);
  }

  // Recent conversation context
  if (p.recentMessages.length > 0) {
    lines.push(`[recent conversation in ${spaceLabel}]:`);
    for (const m of p.recentMessages) {
      const idTag = m.messageId ? ` [messageId:${m.messageId}]` : "";
      const replyTag = m.replyTo?.messageId
        ? ` (replying to ${m.replyTo.senderName}: "${(m.replyTo.snippet ?? "").slice(0, 40)}")`
        : "";
      lines.push(`  ${m.sender}${idTag}${replyTag}: "${m.content}"`);
    }
  }

  // The new message
  const msgIdTag = p.messageId ? ` [messageId:${p.messageId}]` : "";
  const replyTag = p.replyTo?.messageId
    ? ` (replying to ${p.replyTo.senderName ?? "someone"}: "${(p.replyTo.snippet ?? "").slice(0, 60)}")`
    : "";
  const senderLabel = `${p.senderName} (${p.senderType})`;

  lines.push(`>>> NEW MESSAGE from ${senderLabel} in ${spaceLabel} (spaceId:${p.spaceId})${msgIdTag}${replyTag}: "${p.content}"`);

  return lines.join("\n");
}
