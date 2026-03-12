import { Router } from "express";
import type { Request, Response } from "express";
import { prisma } from "../lib/db.js";
import {
  requireAuthWithMembership,
  isAuthError,
} from "../lib/spaces-auth.js";
import { requireRole } from "../lib/role-auth.js";
import { emitSmartSpaceEvent } from "../lib/smartspace-events.js";
import type {
  ResponseSchema,
  ResponseSummary,
} from "../lib/message-types.js";
import {
  respondToMessage,
  closeInteractiveMessage,
  ServiceError,
} from "../lib/response-service.js";

const router = Router();

// =============================================================================
// POST /api/smart-spaces/:smartSpaceId/messages/:msgId/respond
//
// Delegates to shared respondToMessage() service function (§7.6).
// =============================================================================
router.post(
  "/:smartSpaceId/messages/:msgId/respond",
  async (req: Request, res: Response) => {
    const smartSpaceId = req.params.smartSpaceId as string;
    const msgId = req.params.msgId as string;
    const auth = await requireAuthWithMembership(req, smartSpaceId);
    if (isAuthError(auth)) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    try {
      const entityId = auth.entityId;
      if (!entityId) {
        res.status(400).json({ error: "No entity resolved" });
        return;
      }

      const { value } = req.body;
      if (value === undefined || value === null) {
        res.status(400).json({ error: "value is required" });
        return;
      }

      const result = await respondToMessage({
        spaceId: smartSpaceId,
        messageId: msgId,
        entityId,
        value,
      });

      res.json({
        success: true,
        isUpdate: result.isUpdate,
        resolved: result.resolved,
        responseSummary: result.responseSummary,
      });
    } catch (error: any) {
      if (error instanceof ServiceError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      console.error("Respond error:", error);
      res.status(500).json({ error: "Failed to respond" });
    }
  }
);

// =============================================================================
// GET /api/smart-spaces/:smartSpaceId/messages/:msgId/responses — List responses
// =============================================================================
router.get(
  "/:smartSpaceId/messages/:msgId/responses",
  async (req: Request, res: Response) => {
    const smartSpaceId = req.params.smartSpaceId as string;
    const msgId = req.params.msgId as string;
    const auth = await requireAuthWithMembership(req, smartSpaceId);
    if (isAuthError(auth)) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    try {
      const responses = await prisma.messageResponse.findMany({
        where: { messageId: msgId, smartSpaceId },
        orderBy: { createdAt: "asc" },
      });

      res.json({ responses });
    } catch (error) {
      console.error("List responses error:", error);
      res.status(500).json({ error: "Failed to list responses" });
    }
  }
);

// =============================================================================
// DELETE /api/smart-spaces/:smartSpaceId/messages/:msgId/responses/mine
//   Retract response — broadcast only, not resolved targeted
// =============================================================================
router.delete(
  "/:smartSpaceId/messages/:msgId/responses/mine",
  async (req: Request, res: Response) => {
    const smartSpaceId = req.params.smartSpaceId as string;
    const msgId = req.params.msgId as string;
    const auth = await requireAuthWithMembership(req, smartSpaceId);
    if (isAuthError(auth)) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    try {
      const entityId = auth.entityId;
      if (!entityId) {
        res.status(400).json({ error: "No entity resolved" });
        return;
      }

      // Load message to check audience/status
      const message = await prisma.smartSpaceMessage.findUnique({
        where: { id: msgId },
      });
      if (!message || message.smartSpaceId !== smartSpaceId) {
        res.status(404).json({ error: "Message not found" });
        return;
      }

      const meta = (message.metadata ?? {}) as Record<string, unknown>;
      if (meta.audience === "targeted" && meta.status === "resolved") {
        res.status(409).json({ error: "Cannot retract response on a resolved targeted message" });
        return;
      }

      // Delete the response
      const deleted = await prisma.messageResponse.deleteMany({
        where: { messageId: msgId, entityId },
      });
      if (deleted.count === 0) {
        res.status(404).json({ error: "No response found to retract" });
        return;
      }

      // Recompute summary
      const allResponses = await prisma.messageResponse.findMany({
        where: { messageId: msgId },
        orderBy: { createdAt: "asc" },
      });

      const responseSchema = meta.responseSchema as ResponseSchema | undefined;
      const responseSummary: ResponseSummary = {
        totalResponses: allResponses.length,
        responses: allResponses.map((r: any) => ({
          entityId: r.entityId,
          entityName: r.entityName,
          entityType: r.entityType,
          value: r.value,
          respondedAt: r.updatedAt.toISOString(),
        })),
      };

      if (responseSchema?.type === "enum") {
        const counts: Record<string, number> = {};
        for (const v of responseSchema.values) counts[v] = 0;
        for (const r of allResponses) {
          const rv = r.value as string;
          if (rv in counts) counts[rv]++;
        }
        responseSummary.counts = counts;
      }

      if (meta.audience === "targeted") {
        responseSummary.respondedEntityIds = allResponses.map((r: any) => r.entityId);
      }

      await prisma.smartSpaceMessage.update({
        where: { id: msgId },
        data: {
          metadata: { ...meta, responseSummary } as any,
        },
      });

      await emitSmartSpaceEvent(smartSpaceId, {
        type: "message.response_updated",
        messageId: msgId,
        entityId,
        retracted: true,
        responseSummary,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Retract response error:", error);
      res.status(500).json({ error: "Failed to retract response" });
    }
  }
);

// =============================================================================
// POST /api/smart-spaces/:smartSpaceId/messages/:msgId/close
//   Sender or admin closes message, snapshots outcome
//   Delegates to shared closeInteractiveMessage() service function.
// =============================================================================
router.post(
  "/:smartSpaceId/messages/:msgId/close",
  async (req: Request, res: Response) => {
    const smartSpaceId = req.params.smartSpaceId as string;
    const msgId = req.params.msgId as string;
    const auth = await requireAuthWithMembership(req, smartSpaceId);
    if (isAuthError(auth)) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    try {
      const entityId = auth.entityId;
      if (!entityId) {
        res.status(400).json({ error: "No entity resolved" });
        return;
      }

      // Pre-check: admin role (the shared function handles sender check internally)
      let isAdmin = auth.method === "secret_key";
      if (!isAdmin) {
        try {
          await requireRole(smartSpaceId, entityId, "admin");
          isAdmin = true;
        } catch {
          // Not admin — that's fine, the service will check if they're the sender
        }
      }

      const result = await closeInteractiveMessage({
        spaceId: smartSpaceId,
        messageId: msgId,
        entityId,
        isSender: isAdmin, // if admin, skip sender check inside service
        skipPermissionCheck: isAdmin,
      });

      res.json(result);
    } catch (error: any) {
      if (error instanceof ServiceError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      console.error("Close message error:", error);
      res.status(500).json({ error: "Failed to close message" });
    }
  }
);

export default router;
