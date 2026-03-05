import { createSmartSpaceMessage } from "./smartspace-db";
import { emitSmartSpaceEvent } from "./smartspace-events";
import { notifyNewMessage } from "./extension/inbox";
import { prisma } from "./db";

// =============================================================================
// Space Service
//
// Consolidates "post message → emit SSE → notify extension" logic.
// The extension inbox handler pushes sense events to Core directly —
// no more SpacesListener SSE subscription needed.
// =============================================================================

export interface PostMessageParams {
  spaceId: string;
  entityId: string;
  role: "user" | "assistant";
  content: string;
  metadata?: Record<string, unknown>;
  /** Optional streamId for streaming → persist handoff */
  streamId?: string;
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
  const { spaceId, entityId, role, content, metadata, streamId } = params;

  // 1. Persist the message
  const message = await createSmartSpaceMessage({
    smartSpaceId: spaceId,
    entityId,
    role,
    content,
    metadata,
  });

  // 2. Emit to space SSE channel
  await emitSmartSpaceEvent(spaceId, {
    type: "space.message",
    ...(streamId ? { streamId } : {}),
    message: {
      id: message.id,
      smartSpaceId: spaceId,
      entityId,
      role,
      content,
      metadata: metadata ?? null,
      seq: message.seq.toString(),
      createdAt: message.createdAt.toISOString(),
    },
  });

  // 3. Notify extension inbox (replaces SpacesListener)
  // Non-blocking — errors are caught internally
  if (role !== "assistant") {
    const [entity, space] = await Promise.all([
      prisma.entity
        .findUnique({
          where: { id: entityId },
          select: { displayName: true, type: true },
        })
        .catch(() => null),
      prisma.smartSpace
        .findUnique({
          where: { id: spaceId },
          select: { name: true },
        })
        .catch(() => null),
    ]);

    notifyNewMessage({
      spaceId,
      spaceName: space?.name ?? spaceId,
      entityId,
      senderName: entity?.displayName ?? "Unknown",
      senderType: entity?.type ?? "human",
      messageId: message.id,
      content: content ?? "",
      role,
    }).catch(() => {});
  }

  return {
    messageId: message.id,
    seq: message.seq.toString(),
    createdAt: message.createdAt.toISOString(),
  };
}
