// =============================================================================
// Smart Spaces — Message Routes
//
// POST /:smartSpaceId/messages — Send message
// GET  /:smartSpaceId/messages — List messages
// GET  /:smartSpaceId/messages/:msgId/thread — Get message thread
// POST /:smartSpaceId/typing — Typing indicator
// POST /:smartSpaceId/seen — Mark messages as seen (watermark)
// PATCH /:smartSpaceId/read — Mark messages as read (legacy)
// =============================================================================

import { Router } from "express";
import type { Request, Response } from "express";
import { prisma } from "../lib/db.js";
import {
  requireAuthWithMembership,
  isAuthError,
} from "../lib/spaces-auth.js";
import { postSpaceMessage } from "../lib/space-service.js";
import {
  broadcastTyping,
  broadcastSeen,
} from "../lib/smartspace-events.js";
import { generateSnippet, type MessageMetadata, type MessageType } from "../lib/message-types.js";

const router = Router();

// BigInt JSON serializer
function serializeBigInt(obj: unknown): unknown {
  return JSON.parse(
    JSON.stringify(obj, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value
    )
  );
}

// =============================================================================
// POST /api/smart-spaces/:smartSpaceId/messages — Send message
// =============================================================================
router.post("/:smartSpaceId/messages", async (req: Request, res: Response) => {
  const smartSpaceId = req.params.smartSpaceId as string;
  const auth = await requireAuthWithMembership(req, smartSpaceId);
  if (isAuthError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    let { entityId, role, content, metadata, streamId, type: messageType, replyTo } = req.body;

    // Anti-impersonation: force entityId from JWT for public key auth
    if (auth.method === "public_key_jwt") {
      entityId = auth.entityId;
    }

    // Allow empty content if there are file attachments or voice payload in metadata
    const hasAttachments = metadata?.files && Array.isArray(metadata.files) && metadata.files.length > 0;
    const isVoiceMessage = messageType === "voice" || metadata?.type === "voice";
    if (!entityId || (!content && !hasAttachments && !isVoiceMessage)) {
      res.status(400).json({ error: "entityId and content (or attachments) are required" });
      return;
    }
    // Normalize content to empty string if attachments-only
    if (!content) content = "";

    // Resolve replyTo: if messageId provided, populate snippet/senderName/messageType
    let resolvedReplyTo = undefined;
    if (replyTo?.messageId) {
      const original = await prisma.smartSpaceMessage.findUnique({
        where: { id: replyTo.messageId },
        include: { entity: { select: { displayName: true } } },
      });
      if (original) {
        const origMeta = original.metadata as MessageMetadata | null;
        resolvedReplyTo = {
          messageId: original.id,
          snippet: generateSnippet(original.content, origMeta),
          senderName: original.entity?.displayName ?? "Unknown",
          messageType: origMeta?.type ?? "text",
        };
      }
    }

    const result = await postSpaceMessage({
      spaceId: smartSpaceId,
      entityId,
      role: role || "user",
      content,
      metadata,
      streamId,
      messageType: messageType as MessageType | undefined,
      replyTo: resolvedReplyTo,
    });

    res.status(201).json(result);
  } catch (error) {
    console.error("Send message error:", error);
    res.status(500).json({ error: "Failed to send message" });
  }
});

// =============================================================================
// GET /api/smart-spaces/:smartSpaceId/messages — List messages
// =============================================================================
router.get("/:smartSpaceId/messages", async (req: Request, res: Response) => {
  const smartSpaceId = req.params.smartSpaceId as string;
  const auth = await requireAuthWithMembership(req, smartSpaceId);
  if (isAuthError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const afterSeq = req.query.afterSeq ? BigInt(req.query.afterSeq as string) : undefined;
    const beforeSeq = req.query.beforeSeq ? BigInt(req.query.beforeSeq as string) : undefined;

    const where: any = { smartSpaceId };
    if (afterSeq !== undefined) where.seq = { ...where.seq, gt: afterSeq };
    if (beforeSeq !== undefined) where.seq = { ...where.seq, lt: beforeSeq };

    const messages = await prisma.smartSpaceMessage.findMany({
      where,
      orderBy: { seq: "desc" },
      take: limit,
      include: {
        entity: {
          select: { id: true, displayName: true, type: true },
        },
      },
    });

    res.json({ messages: serializeBigInt(messages.reverse()) });
  } catch (error) {
    console.error("List messages error:", error);
    res.status(500).json({ error: "Failed to list messages" });
  }
});

// =============================================================================
// GET /api/smart-spaces/:smartSpaceId/messages/:msgId/thread — Get message thread
// =============================================================================
router.get(
  "/:smartSpaceId/messages/:msgId/thread",
  async (req: Request, res: Response) => {
    const smartSpaceId = req.params.smartSpaceId as string;
    const msgId = req.params.msgId as string;
    const auth = await requireAuthWithMembership(req, smartSpaceId);
    if (isAuthError(auth)) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    try {
      // Get the original message
      const original = await prisma.smartSpaceMessage.findUnique({
        where: { id: msgId },
        include: {
          entity: { select: { id: true, displayName: true, type: true } },
        },
      });
      if (!original || original.smartSpaceId !== smartSpaceId) {
        res.status(404).json({ error: "Message not found" });
        return;
      }

      // Find all replies to this message using JSON path filter (§8.3)
      const replies = await prisma.smartSpaceMessage.findMany({
        where: {
          smartSpaceId,
          metadata: {
            path: ["replyTo", "messageId"],
            equals: msgId,
          },
        },
        orderBy: { seq: "asc" },
        include: {
          entity: { select: { id: true, displayName: true, type: true } },
        },
      });

      res.json({
        original: serializeBigInt(original),
        replies: serializeBigInt(replies),
      });
    } catch (error) {
      console.error("Get thread error:", error);
      res.status(500).json({ error: "Failed to get thread" });
    }
  }
);

// =============================================================================
// POST /api/smart-spaces/:smartSpaceId/typing — Typing indicator (ephemeral)
// =============================================================================
router.post("/:smartSpaceId/typing", async (req: Request, res: Response) => {
  const smartSpaceId = req.params.smartSpaceId as string;
  const auth = await requireAuthWithMembership(req, smartSpaceId);
  if (isAuthError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  if (!auth.entityId) {
    res.status(400).json({ error: "No entity resolved" });
    return;
  }

  const typing = req.body.typing !== false; // default true
  const activity = req.body.activity === "recording" ? "recording" : "typing";

  try {
    // Look up entity name for the broadcast
    const entity = await prisma.entity.findUnique({
      where: { id: auth.entityId },
      select: { displayName: true },
    });

    await broadcastTyping(
      smartSpaceId,
      auth.entityId,
      entity?.displayName ?? "Unknown",
      typing,
      activity,
    );
    res.json({ success: true });
  } catch (error) {
    console.error("Typing broadcast error:", error);
    res.status(500).json({ error: "Failed to broadcast typing" });
  }
});

// =============================================================================
// POST /api/smart-spaces/:smartSpaceId/seen — Mark messages as seen (watermark)
//
// Updates the caller's lastSeenMessageId on their membership and broadcasts
// a message.seen event so other clients can update read receipt indicators.
// =============================================================================
router.post("/:smartSpaceId/seen", async (req: Request, res: Response) => {
  const smartSpaceId = req.params.smartSpaceId as string;
  const auth = await requireAuthWithMembership(req, smartSpaceId);
  if (isAuthError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  if (!auth.entityId) {
    res.status(400).json({ error: "No entity resolved" });
    return;
  }

  const { messageId } = req.body;
  if (!messageId) {
    res.status(400).json({ error: "messageId is required" });
    return;
  }

  try {
    // Verify message exists in this space
    const msg = await prisma.smartSpaceMessage.findUnique({
      where: { id: messageId },
      select: { smartSpaceId: true, seq: true },
    });
    if (!msg || msg.smartSpaceId !== smartSpaceId) {
      res.status(404).json({ error: "Message not found in this space" });
      return;
    }

    // Only advance the watermark forward (never go backward)
    const membership = await prisma.smartSpaceMembership.findUnique({
      where: { smartSpaceId_entityId: { smartSpaceId, entityId: auth.entityId } },
      select: { lastSeenMessageId: true },
    });

    if (membership?.lastSeenMessageId) {
      const currentSeen = await prisma.smartSpaceMessage.findUnique({
        where: { id: membership.lastSeenMessageId },
        select: { seq: true },
      });
      // If current watermark is already ahead, skip
      if (currentSeen && currentSeen.seq >= msg.seq) {
        res.json({ success: true, lastSeenMessageId: membership.lastSeenMessageId });
        return;
      }
    }

    // Update the watermark (upsert in case membership doesn't exist yet)
    await prisma.smartSpaceMembership.upsert({
      where: { smartSpaceId_entityId: { smartSpaceId, entityId: auth.entityId } },
      update: { lastSeenMessageId: messageId },
      create: {
        smartSpaceId,
        entityId: auth.entityId,
        role: 'member',
        lastSeenMessageId: messageId,
      },
    });

    // Broadcast seen event
    const entity = await prisma.entity.findUnique({
      where: { id: auth.entityId },
      select: { displayName: true },
    });
    await broadcastSeen(
      smartSpaceId,
      auth.entityId,
      entity?.displayName ?? "Unknown",
      messageId,
    );

    res.json({ success: true, lastSeenMessageId: messageId });
  } catch (error) {
    console.error("Mark seen error:", error);
    res.status(500).json({ error: "Failed to mark as seen" });
  }
});

// =============================================================================
// PATCH /api/smart-spaces/:smartSpaceId/read — Mark messages as seen
// =============================================================================
router.patch("/:smartSpaceId/read", async (req: Request, res: Response) => {
  const smartSpaceId = req.params.smartSpaceId as string;
  const auth = await requireAuthWithMembership(req, smartSpaceId);
  if (isAuthError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    const { entityId, lastSeenMessageId } = req.body;
    const targetEntityId =
      auth.method === "public_key_jwt" ? auth.entityId : entityId;

    if (!targetEntityId || !lastSeenMessageId) {
      res.status(400).json({ error: "entityId and lastSeenMessageId are required" });
      return;
    }

    await prisma.smartSpaceMembership.update({
      where: {
        smartSpaceId_entityId: { smartSpaceId, entityId: targetEntityId },
      },
      data: { lastSeenMessageId },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Mark read error:", error);
    res.status(500).json({ error: "Failed to mark messages as read" });
  }
});

export default router;
