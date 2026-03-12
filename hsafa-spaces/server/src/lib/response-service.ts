// =============================================================================
// Response Service — shared logic for responding to and closing interactive messages
//
// Used by both:
//   - responses.ts (API route, called by frontend)
//   - service/index.ts (tool handler, called by haseefs via Core)
//
// Ensures consistent transactional logic, validation, and event emission.
// =============================================================================

import { prisma } from "./db.js";
import { emitSmartSpaceEvent } from "./smartspace-events.js";
import type {
  ResponseSchema,
  ResponseSummary,
  Resolution,
} from "./message-types.js";
import {
  pushMessageResponseEvent,
  pushMessageResolvedEvent,
} from "./service/index.js";

// =============================================================================
// Types
// =============================================================================

export interface RespondToMessageParams {
  spaceId: string;
  messageId: string;
  entityId: string;
  value: unknown;
}

export interface RespondToMessageResult {
  success: true;
  isUpdate: boolean;
  resolved: boolean;
  resolution?: Resolution;
  responseSummary: ResponseSummary;
}

export interface CloseMessageParams {
  spaceId: string;
  messageId: string;
  entityId: string;
  /** If true, skip admin check — caller is the sender */
  isSender?: boolean;
  /** If true, skip all permission checks (e.g. secret key auth) */
  skipPermissionCheck?: boolean;
}

export interface CloseMessageResult {
  success: true;
  resolution: Resolution;
}

/** Structured error thrown by service functions */
export class ServiceError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// =============================================================================
// respondToMessage — full transactional flow per §7.6
// =============================================================================

export async function respondToMessage(
  params: RespondToMessageParams,
): Promise<RespondToMessageResult> {
  const { spaceId, messageId, entityId, value } = params;

  // --- TRANSACTION ---
  const result = await prisma.$transaction(async (tx: any) => {
    // 1. Load message
    const message = await tx.smartSpaceMessage.findUnique({
      where: { id: messageId },
    });
    if (!message || message.smartSpaceId !== spaceId) {
      throw new ServiceError(404, "Message not found");
    }

    const meta = (message.metadata ?? {}) as Record<string, unknown>;
    const audience = meta.audience as string | undefined;
    const status = meta.status as string | undefined;
    const targetEntityIds = meta.targetEntityIds as string[] | undefined;
    const responseSchema = meta.responseSchema as ResponseSchema | undefined;

    // 2. Check status
    if (audience === "targeted" && status === "resolved") {
      throw new ServiceError(409, "Message already resolved");
    }
    if (status === "closed") {
      throw new ServiceError(409, "Message is closed");
    }

    // 3. Check audience targeting
    if (audience === "targeted" && targetEntityIds) {
      if (!targetEntityIds.includes(entityId)) {
        throw new ServiceError(403, "You are not a target of this message");
      }
    }

    // 4. Validate response against schema
    if (responseSchema) {
      const validationError = validateResponse(value, responseSchema);
      if (validationError) {
        throw new ServiceError(400, validationError);
      }
    }

    // 5. Get entity info for denormalization
    const entity = await tx.entity.findUnique({
      where: { id: entityId },
      select: { displayName: true, type: true },
    });

    // 6. Upsert MessageResponse
    const existingResponse = await tx.messageResponse.findUnique({
      where: { messageId_entityId: { messageId, entityId } },
    });
    const isUpdate = !!existingResponse;

    await tx.messageResponse.upsert({
      where: { messageId_entityId: { messageId, entityId } },
      create: {
        messageId,
        smartSpaceId: spaceId,
        entityId,
        entityName: entity?.displayName ?? "Unknown",
        entityType: entity?.type ?? "human",
        value: value as any,
      },
      update: {
        value: value as any,
        entityName: entity?.displayName ?? "Unknown",
      },
    });

    // 7. Recompute responseSummary from ALL rows (not increment)
    const allResponses = await tx.messageResponse.findMany({
      where: { messageId },
      orderBy: { createdAt: "asc" },
    });

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

    // Compute counts for enum-type schemas
    if (responseSchema?.type === "enum") {
      const counts: Record<string, number> = {};
      for (const v of responseSchema.values) counts[v] = 0;
      for (const r of allResponses) {
        const rv = r.value as string;
        if (rv in counts) counts[rv]++;
      }
      responseSummary.counts = counts;
    }

    // Track responded entity IDs for targeted messages
    if (audience === "targeted") {
      responseSummary.respondedEntityIds = allResponses.map((r: any) => r.entityId);
    }

    // 8. Check auto-resolve (targeted only)
    let resolved = false;
    let resolution: Resolution | undefined;

    if (audience === "targeted" && targetEntityIds) {
      const respondedSet = new Set(allResponses.map((r: any) => r.entityId));
      const allResponded = targetEntityIds.every((id: string) => respondedSet.has(id));
      if (allResponded) {
        resolved = true;
        const outcome =
          targetEntityIds.length === 1
            ? String(value)
            : "all_responded";
        resolution = {
          outcome,
          resolvedAt: new Date().toISOString(),
          resolvedBy: "auto",
        };
      }
    }

    // 9. Update message metadata
    const updatedMeta: Record<string, unknown> = {
      ...meta,
      responseSummary,
      ...(resolved ? { status: "resolved", resolution } : {}),
    };

    await tx.smartSpaceMessage.update({
      where: { id: messageId },
      data: { metadata: updatedMeta as any },
    });

    return {
      isUpdate,
      resolved,
      resolution,
      responseSummary,
      senderEntityId: message.entityId,
      entityName: entity?.displayName ?? "Unknown",
      entityType: entity?.type ?? "human",
      messageMetadata: updatedMeta,
    };
  });

  // --- POST-TRANSACTION: Emit SSE events ---

  // message.response or message.response_updated
  await emitSmartSpaceEvent(spaceId, {
    type: result.isUpdate ? "message.response_updated" : "message.response",
    messageId,
    entityId,
    entityName: result.entityName,
    entityType: result.entityType,
    value,
    responseSummary: result.responseSummary,
  });

  // Push sense event: message_response → sending haseef only
  pushMessageResponseEvent(
    spaceId,
    messageId,
    result.senderEntityId,
    result.entityName,
    result.entityType,
    value,
    result.responseSummary as unknown as Record<string, unknown>,
  ).catch(() => {});

  // message.resolved (targeted only)
  if (result.resolved) {
    await emitSmartSpaceEvent(spaceId, {
      type: "message.resolved",
      messageId,
      resolution: result.resolution,
      responseSummary: result.responseSummary,
    });

    const meta = result.messageMetadata as Record<string, unknown>;
    const payload = meta.payload as Record<string, unknown> | undefined;
    pushMessageResolvedEvent(
      spaceId,
      messageId,
      (meta.type as string) || "unknown",
      (payload?.title as string) || (payload?.text as string) || "",
      "resolved",
      result.resolution as unknown as Record<string, unknown>,
      result.responseSummary as unknown as Record<string, unknown>,
    ).catch(() => {});
  }

  return {
    success: true,
    isUpdate: result.isUpdate,
    resolved: result.resolved,
    resolution: result.resolution,
    responseSummary: result.responseSummary,
  };
}

// =============================================================================
// closeInteractiveMessage — close a vote/form/choice, snapshot outcome
// =============================================================================

export async function closeInteractiveMessage(
  params: CloseMessageParams,
): Promise<CloseMessageResult> {
  const { spaceId, messageId, entityId, isSender, skipPermissionCheck } = params;

  const message = await prisma.smartSpaceMessage.findUnique({
    where: { id: messageId },
  });
  if (!message || message.smartSpaceId !== spaceId) {
    throw new ServiceError(404, "Message not found");
  }

  const meta = (message.metadata ?? {}) as Record<string, unknown>;
  if (meta.status === "resolved" || meta.status === "closed") {
    throw new ServiceError(409, `Message is already ${meta.status}`);
  }

  // Permission check: must be sender or admin+
  if (!skipPermissionCheck) {
    const senderMatch = message.entityId === entityId;
    if (!senderMatch && !isSender) {
      // Caller must be admin+ — this is checked by the route before calling.
      // For tool handler, only the sender can close (no admin concept for agents).
      throw new ServiceError(403, "Only the sender or a space admin can close");
    }
  }

  // Snapshot outcome
  const responseSummary = meta.responseSummary as ResponseSummary | undefined;
  let outcome = "closed";
  if (responseSummary?.counts) {
    const sorted = Object.entries(responseSummary.counts).sort(
      ([, a], [, b]) => b - a,
    );
    if (sorted.length > 0 && sorted[0][1] > 0) {
      outcome = sorted[0][0];
    }
  }

  const resolution: Resolution = {
    outcome,
    resolvedAt: new Date().toISOString(),
    resolvedBy: "sender",
  };

  const updatedMeta = {
    ...meta,
    status: "closed",
    resolution,
  };

  await prisma.smartSpaceMessage.update({
    where: { id: messageId },
    data: { metadata: updatedMeta as any },
  });

  // Emit SSE
  await emitSmartSpaceEvent(spaceId, {
    type: "message.closed",
    messageId,
    resolution,
    responseSummary: responseSummary ?? null,
  });

  // Push sense event: message_resolved → all haseefs
  const payload = meta.payload as Record<string, unknown> | undefined;
  pushMessageResolvedEvent(
    spaceId,
    messageId,
    (meta.type as string) || "unknown",
    (payload?.title as string) || (payload?.text as string) || "",
    "closed",
    resolution as unknown as Record<string, unknown>,
    (responseSummary ?? {}) as unknown as Record<string, unknown>,
  ).catch(() => {});

  return { success: true, resolution };
}

// =============================================================================
// Validation helper — validates response value against responseSchema
// =============================================================================

export function validateResponse(
  value: unknown,
  schema: ResponseSchema,
): string | null {
  switch (schema.type) {
    case "enum": {
      if (schema.multiple) {
        if (!Array.isArray(value)) return "Expected an array for multiple choice";
        for (const v of value) {
          if (!schema.values.includes(String(v))) {
            return `Invalid option: ${v}. Valid: ${schema.values.join(", ")}`;
          }
        }
      } else {
        if (!schema.values.includes(String(value))) {
          return `Invalid option: ${value}. Valid: ${schema.values.join(", ")}`;
        }
      }
      return null;
    }

    case "text": {
      if (typeof value !== "string" || value.trim().length === 0) {
        return "Expected a non-empty string";
      }
      return null;
    }

    case "rating": {
      const num = Number(value);
      if (isNaN(num) || num < schema.min || num > schema.max) {
        return `Expected a number between ${schema.min} and ${schema.max}`;
      }
      return null;
    }

    case "json": {
      // Basic type check — full ajv validation deferred to Phase 6
      if (typeof value !== "object" || value === null) {
        return "Expected a JSON object";
      }
      return null;
    }

    default:
      return null;
  }
}
