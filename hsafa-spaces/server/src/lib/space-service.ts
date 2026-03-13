import { createSmartSpaceMessage } from "./smartspace-db.js";
import { emitSmartSpaceEvent } from "./smartspace-events.js";
import { notifyNewMessage } from "./service/inbox.js";
import { getEntityInfo, getSpaceName } from "./membership-service.js";
import type { MessageType, ReplyToMetadata } from "./message-types.js";

// =============================================================================
// Space Service — post message → emit SSE → notify extension
// =============================================================================

export interface PostMessageParams {
  spaceId: string;
  entityId: string;
  role: "user" | "assistant";
  content: string;
  metadata?: Record<string, unknown>;
  streamId?: string;
  messageType?: MessageType;
  replyTo?: ReplyToMetadata;
}

export interface PostMessageResult {
  messageId: string;
  seq: string;
  createdAt: string;
}

/**
 * Post a message to a space: persist + emit SSE.
 * This is the canonical path for all space messages.
 */
export async function postSpaceMessage(
  params: PostMessageParams
): Promise<PostMessageResult> {
  const { spaceId, entityId, role, content, metadata, streamId, messageType, replyTo } = params;

  // Build merged metadata: type defaults to "text" for backward compat
  const mergedMetadata: Record<string, unknown> = {
    ...metadata,
    type: messageType || metadata?.type || "text",
  };
  if (replyTo) {
    mergedMetadata.replyTo = replyTo;
  }

  // 1. Persist the message
  const message = await createSmartSpaceMessage({
    smartSpaceId: spaceId,
    entityId,
    role,
    content,
    metadata: mergedMetadata,
  });

  // 3. Resolve entity info (needed for both SSE and inbox)
  const [entityInfo, spaceName] = await Promise.all([
    getEntityInfo(entityId).catch(() => ({ displayName: "Unknown", type: "human" })),
    getSpaceName(spaceId).catch(() => spaceId),
  ]);

  // 2. Emit to space SSE channel (include entity for self-contained rendering)
  await emitSmartSpaceEvent(spaceId, {
    type: "space.message",
    ...(streamId ? { streamId } : {}),
    message: {
      id: message.id,
      smartSpaceId: spaceId,
      entityId,
      role,
      content,
      metadata: mergedMetadata ?? null,
      seq: message.seq.toString(),
      createdAt: message.createdAt.toISOString(),
      entity: {
        id: entityId,
        displayName: entityInfo.displayName,
        type: entityInfo.type,
      },
    },
  });

  notifyNewMessage({
    spaceId,
    spaceName,
    entityId,
    senderName: entityInfo.displayName,
    senderType: entityInfo.type,
    messageId: message.id,
    content: content ?? "",
    role,
    messageType: (mergedMetadata.type as string) || "text",
    metadata: mergedMetadata,
  }).catch(() => {});

  return {
    messageId: message.id,
    seq: message.seq.toString(),
    createdAt: message.createdAt.toISOString(),
  };
}
