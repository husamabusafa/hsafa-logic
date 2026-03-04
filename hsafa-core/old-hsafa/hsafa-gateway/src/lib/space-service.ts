import { createSmartSpaceMessage } from './smartspace-db.js';
import { emitSmartSpaceEvent } from './smartspace-events.js';
import { pushSpaceMessageEvent, fetchRecentSpaceContext } from './inbox.js';
import { getAgentMembersOfSpace, getSpaceName } from './membership-service.js';

// =============================================================================
// Space Service (Ship #11)
//
// Consolidates the shared "post message → emit SSE → fan-out to agent inboxes"
// logic used by both:
//   - POST /api/smart-spaces/:id/messages (human messages from API)
//   - send_message prebuilt tool (agent messages from think cycle)
//
// Single source of truth for space message delivery.
// =============================================================================

export interface PostMessageParams {
  spaceId: string;
  entityId: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: Record<string, unknown>;
  runId?: string;
  /** Display name of the sender (for inbox events) */
  senderName: string;
  /** Type of the sender (for inbox events) */
  senderType: 'human' | 'agent';
  /** Optional toolCallId used as streamId for streaming → persist handoff */
  streamId?: string;
}

export interface PostMessageResult {
  messageId: string;
  seq: string;
  createdAt: string;
}

/**
 * Post a message to a space: persist, emit SSE, fan-out to agent inboxes.
 *
 * This is the canonical path for all space messages. Both the HTTP route
 * and the send_message tool call this.
 */
export async function postSpaceMessage(params: PostMessageParams): Promise<PostMessageResult> {
  const {
    spaceId, entityId, role, content, metadata, runId,
    senderName, senderType, streamId,
  } = params;

  // 1. Persist the message
  const message = await createSmartSpaceMessage({
    smartSpaceId: spaceId,
    entityId,
    role,
    content,
    metadata,
    runId,
  });

  // 2. Emit to space SSE
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

  // 3. Fan-out to all OTHER agent members' inboxes
  const spaceName = await getSpaceName(spaceId);
  const agentMembers = await getAgentMembersOfSpace(spaceId, entityId);

  if (agentMembers.length > 0) {
    const recentContext = await fetchRecentSpaceContext(spaceId, message.id).catch(() => []);

    for (const member of agentMembers) {
      pushSpaceMessageEvent(member.entityId, {
        spaceId,
        spaceName,
        messageId: message.id,
        senderEntityId: entityId,
        senderName,
        senderType,
        content,
        recentContext: recentContext.length > 0 ? recentContext : undefined,
      }).catch((err) => {
        console.warn(`[space-service] Failed to push to inbox ${member.entityId}:`, err);
      });
    }
  }

  return {
    messageId: message.id,
    seq: message.seq.toString(),
    createdAt: message.createdAt.toISOString(),
  };
}
