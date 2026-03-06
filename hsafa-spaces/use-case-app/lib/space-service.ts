import { createSmartSpaceMessage } from "./smartspace-db";
import { emitSmartSpaceEvent } from "./smartspace-events";
import { notifyNewMessage } from "./extension/inbox";
import { getEntityInfo, getSpaceName } from "./membership-service";

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
  // Always notify — the extension filters by entityId to avoid self-loops.
  // This ensures Haseef-to-Haseef messages are forwarded correctly.
  // Uses cached lookups — no DB hit on repeat messages from same entity/space.
  const [entityInfo, spaceName] = await Promise.all([
    getEntityInfo(entityId).catch(() => ({ displayName: "Unknown", type: "human" })),
    getSpaceName(spaceId).catch(() => spaceId),
  ]);

  notifyNewMessage({
    spaceId,
    spaceName,
    entityId,
    senderName: entityInfo.displayName,
    senderType: entityInfo.type,
    messageId: message.id,
    content: content ?? "",
    role,
  }).catch(() => {});

  return {
    messageId: message.id,
    seq: message.seq.toString(),
    createdAt: message.createdAt.toISOString(),
  };
}
