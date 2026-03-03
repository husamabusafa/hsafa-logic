import { createSmartSpaceMessage } from './smartspace-db.js';
import { emitSmartSpaceEvent } from './smartspace-events.js';

// =============================================================================
// Space Service
//
// Consolidates "post message → emit SSE" logic.
//
// v4: NO inbox fan-out. The Spaces App doesn't know about Core's inbox.
// ext-spaces (the extension) listens to the SSE stream and pushes
// SenseEvents to Core when appropriate.
// =============================================================================

export interface PostMessageParams {
  spaceId: string;
  entityId: string;
  role: 'user' | 'assistant';
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
export async function postSpaceMessage(params: PostMessageParams): Promise<PostMessageResult> {
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
    type: 'space.message',
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

  return {
    messageId: message.id,
    seq: message.seq.toString(),
    createdAt: message.createdAt.toISOString(),
  };
}
