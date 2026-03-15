// =============================================================================
// Spaces Service — Tool Handlers
//
// Executes tool actions dispatched by Core: send_message, get_messages,
// get_spaces, send_confirmation, send_choice, send_vote, send_form,
// respond_to_message, close_interactive_message, invite_to_space, get_space_members.
// =============================================================================

import { prisma } from "../db.js";
import { postSpaceMessage } from "../space-service.js";
import { getSpacesForEntity } from "../membership-service.js";
import type { ReplyToMetadata } from "../message-types.js";
import {
  respondToMessage,
  closeInteractiveMessage,
  ServiceError,
} from "../response-service.js";
import { state } from "./types.js";
import { pushInteractiveMessageEvent, emitEntityChannelEvent } from "./sense-events.js";

// =============================================================================
// Reply-To Resolution — resolves a message ID into ReplyToMetadata
// =============================================================================

async function resolveReplyTo(
  messageId: string | undefined,
): Promise<ReplyToMetadata | undefined> {
  if (!messageId) return undefined;
  const msg = await prisma.smartSpaceMessage.findUnique({
    where: { id: messageId },
    include: { entity: { select: { displayName: true } } },
  });
  if (!msg) return undefined;
  const meta = (msg.metadata ?? {}) as Record<string, unknown>;
  return {
    messageId: msg.id,
    snippet: (msg.content ?? "").slice(0, 100),
    senderName: (msg as any).entity?.displayName ?? "Unknown",
    messageType: (meta.type as string) || "text",
  };
}

// =============================================================================
// Message Tool Detection
// =============================================================================

/** Tools that produce messages — typing indicator should show while these execute.
 *  Checks both unprefixed ('send_message') and prefixed ('spaces_send_message') names
 *  since Core emits prefixed tool names in stream events. */
const MESSAGE_TOOLS = new Set([
  "send_message", "send_confirmation", "send_choice", "send_vote", "send_form",
]);
export function isMessageTool(toolName?: string): boolean {
  if (!toolName) return false;
  if (MESSAGE_TOOLS.has(toolName)) return true;
  // Core prefixes tool names with scope: "spaces_send_message" → strip prefix and check
  const unprefixed = toolName.replace(/^spaces_/, '');
  return MESSAGE_TOOLS.has(unprefixed);
}

// =============================================================================
// Action Execution — routes to the correct tool handler
// =============================================================================

export async function executeAction(
  haseefId: string,
  actionId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const conn = state.connections.get(haseefId);
  const agentEntityId = conn?.agentEntityId;

  console.log(`[spaces-service] [${haseefId.slice(0, 8)}] ${toolName} (${actionId.slice(0, 8)})`);

  try {
    switch (toolName) {
      case "send_message": {
        const spaceId = args.spaceId as string;
        const text = args.text as string;
        if (!spaceId || !text)
          return { error: "spaceId and text are required" };
        if (!agentEntityId)
          return { error: "agentEntityId not resolved — is this haseef connected?" };

        const replyTo = await resolveReplyTo(args.replyTo as string | undefined);

        // Direct persist + emit (no HTTP call)
        const result = await postSpaceMessage({
          spaceId,
          entityId: agentEntityId,
          role: "assistant",
          content: text,
          messageType: "text",
          replyTo,
          metadata: {
            toolName,
            actionId,
          },
        });

        return { success: true, messageId: result.messageId };
      }

      case "get_messages": {
        const spaceId = args.spaceId as string;
        const limit = (args.limit as number) || 20;
        if (!spaceId) return { error: "spaceId is required" };

        const messages = await prisma.smartSpaceMessage.findMany({
          where: { smartSpaceId: spaceId },
          orderBy: { seq: "desc" },
          take: Math.min(limit, 100),
          include: {
            entity: {
              select: { id: true, displayName: true, type: true },
            },
          },
        });

        // Label the haseef's own messages as "You" so the LLM
        // clearly sees what it already said vs what others said
        return {
          messages: messages.reverse().map((m: any) => {
            const meta = m.metadata as Record<string, unknown> | null;
            const msgType = (meta?.type as string) || "text";
            const result: Record<string, unknown> = {
              id: m.id,
              sender: m.entityId === agentEntityId ? "You" : (m.entity?.displayName ?? "Unknown"),
              senderType: m.entity?.type ?? "unknown",
              content: m.content,
              type: msgType,
              createdAt: m.createdAt.toISOString(),
            };
            // Include interactive message fields if present
            if (meta?.audience) result.audience = meta.audience;
            if (meta?.status) result.status = meta.status;
            if (meta?.responseSummary) result.responseSummary = meta.responseSummary;
            if (meta?.replyTo) result.replyTo = meta.replyTo;
            if (meta?.payload) result.payload = meta.payload;
            return result;
          }),
        };
      }

      case "get_spaces": {
        if (!agentEntityId)
          return { error: "agentEntityId not resolved — is this haseef connected?" };

        const memberships = await getSpacesForEntity(agentEntityId);
        const spaceIds = memberships.map((m) => m.spaceId);

        if (spaceIds.length === 0) return { spaces: [] };

        const spaces = await prisma.smartSpace.findMany({
          where: { id: { in: spaceIds } },
          select: {
            id: true,
            name: true,
            description: true,
            _count: { select: { memberships: true } },
          },
        });

        return {
          spaces: spaces.map((s: any) => ({
            id: s.id,
            name: s.name,
            description: s.description,
            memberCount: s._count.memberships,
          })),
        };
      }

      case "send_confirmation": {
        const spaceId = args.spaceId as string;
        const title = args.title as string;
        const message = args.message as string;
        const targetEntityId = args.targetEntityId as string;
        if (!spaceId || !title || !message || !targetEntityId)
          return { error: "spaceId, title, message, and targetEntityId are required" };
        if (!agentEntityId)
          return { error: "agentEntityId not resolved" };

        const confirmLabel = (args.confirmLabel as string) || "Confirm";
        const rejectLabel = (args.rejectLabel as string) || "Cancel";
        const replyTo = await resolveReplyTo(args.replyTo as string | undefined);

        const result = await postSpaceMessage({
          spaceId,
          entityId: agentEntityId,
          role: "assistant",
          content: `${title}: ${message}`,
          messageType: "confirmation",
          replyTo,
          metadata: {
            toolName,
            actionId,
            audience: "targeted",
            targetEntityIds: [targetEntityId],
            status: "open",
            responseSchema: { type: "enum", values: ["confirmed", "rejected"] },
            payload: { title, message, confirmLabel, rejectLabel },
            responseSummary: { totalResponses: 0, responses: [], respondedEntityIds: [] },
          },
        });

        // Push interactive_message sense event to all haseefs in space
        await pushInteractiveMessageEvent(spaceId, result.messageId, "confirmation", title);

        return {
          success: true,
          messageId: result.messageId,
          status: "pending",
          message: `Confirmation sent to target. You'll receive a message_resolved event when they respond.`,
        };
      }

      case "send_choice": {
        const spaceId = args.spaceId as string;
        const text = args.text as string;
        const options = args.options as Array<{ label: string; value: string }>;
        if (!spaceId || !text || !Array.isArray(options) || options.length === 0)
          return { error: "spaceId, text, and options are required" };
        if (!agentEntityId)
          return { error: "agentEntityId not resolved" };

        const targetEntityId = args.targetEntityId as string | undefined;
        const isTargeted = !!targetEntityId;
        const values = options.map((o) => o.value);
        const replyTo = await resolveReplyTo(args.replyTo as string | undefined);

        const result = await postSpaceMessage({
          spaceId,
          entityId: agentEntityId,
          role: "assistant",
          content: text,
          messageType: "choice",
          replyTo,
          metadata: {
            toolName,
            actionId,
            audience: isTargeted ? "targeted" : "broadcast",
            ...(isTargeted ? { targetEntityIds: [targetEntityId] } : {}),
            status: "open",
            responseSchema: { type: "enum", values },
            payload: { text, options },
            responseSummary: { totalResponses: 0, responses: [], ...(isTargeted ? { respondedEntityIds: [] } : {}) },
          },
        });

        await pushInteractiveMessageEvent(spaceId, result.messageId, "choice", text);

        return {
          success: true,
          messageId: result.messageId,
          status: "pending",
          message: isTargeted
            ? `Choice sent to target. You'll receive a message_resolved event when they respond.`
            : `Choice broadcast to all members. You'll receive message_response events as people respond.`,
        };
      }

      case "send_vote": {
        const spaceId = args.spaceId as string;
        const title = args.title as string;
        const options = args.options as string[];
        if (!spaceId || !title || !Array.isArray(options) || options.length < 2)
          return { error: "spaceId, title, and at least 2 options are required" };
        if (!agentEntityId)
          return { error: "agentEntityId not resolved" };

        const allowMultiple = !!args.allowMultiple;
        const replyTo = await resolveReplyTo(args.replyTo as string | undefined);

        // Initialize counts with 0 for each option
        const counts: Record<string, number> = {};
        for (const opt of options) counts[opt] = 0;

        const result = await postSpaceMessage({
          spaceId,
          entityId: agentEntityId,
          role: "assistant",
          content: `📊 ${title}`,
          messageType: "vote",
          replyTo,
          metadata: {
            toolName,
            actionId,
            audience: "broadcast",
            status: "open",
            responseSchema: { type: "enum", values: options, multiple: allowMultiple },
            payload: { title, options, allowMultiple },
            responseSummary: { totalResponses: 0, counts, responses: [] },
          },
        });

        await pushInteractiveMessageEvent(spaceId, result.messageId, "vote", title);

        return {
          success: true,
          messageId: result.messageId,
          status: "open",
          message: `Vote created. You'll receive message_response events as people vote.`,
        };
      }

      case "send_form": {
        const spaceId = args.spaceId as string;
        const title = args.title as string;
        const fields = args.fields as Array<Record<string, unknown>>;
        if (!spaceId || !title || !Array.isArray(fields) || fields.length === 0)
          return { error: "spaceId, title, and at least 1 field are required" };
        if (!agentEntityId)
          return { error: "agentEntityId not resolved" };

        const description = args.description as string | undefined;
        const targetEntityIds = args.targetEntityIds as string[] | undefined;
        const isTargeted = Array.isArray(targetEntityIds) && targetEntityIds.length > 0;

        // Build a basic JSON schema from fields for validation
        const jsonSchema: Record<string, unknown> = {
          type: "object",
          properties: {} as Record<string, unknown>,
          required: [] as string[],
        };
        for (const field of fields) {
          const name = field.name as string;
          const fieldType = field.type as string;
          const prop: Record<string, unknown> = {};
          if (fieldType === "number") prop.type = "number";
          else if (fieldType === "select" && Array.isArray(field.options)) {
            prop.type = "string";
            prop.enum = field.options;
          } else prop.type = "string";
          (jsonSchema.properties as Record<string, unknown>)[name] = prop;
          if (field.required) (jsonSchema.required as string[]).push(name);
        }

        const replyTo = await resolveReplyTo(args.replyTo as string | undefined);

        const result = await postSpaceMessage({
          spaceId,
          entityId: agentEntityId,
          role: "assistant",
          content: `📝 ${title}`,
          messageType: "form",
          replyTo,
          metadata: {
            toolName,
            actionId,
            audience: isTargeted ? "targeted" : "broadcast",
            ...(isTargeted ? { targetEntityIds } : {}),
            status: "open",
            responseSchema: { type: "json", schema: jsonSchema },
            payload: { title, description, fields },
            responseSummary: { totalResponses: 0, responses: [], ...(isTargeted ? { respondedEntityIds: [] } : {}) },
          },
        });

        await pushInteractiveMessageEvent(spaceId, result.messageId, "form", title);

        return {
          success: true,
          messageId: result.messageId,
          status: "open",
          message: isTargeted
            ? `Form sent to target. You'll receive a message_resolved event when they submit.`
            : `Form broadcast to all members. You'll receive message_response events as people submit.`,
        };
      }

      case "respond_to_message": {
        const spaceId = args.spaceId as string;
        const messageId = args.messageId as string;
        const value = args.value;
        if (!spaceId || !messageId || value === undefined)
          return { error: "spaceId, messageId, and value are required" };
        if (!agentEntityId)
          return { error: "agentEntityId not resolved" };

        const result = await respondToMessage({
          spaceId,
          messageId,
          entityId: agentEntityId,
          value,
        });

        return {
          success: true,
          resolved: result.resolved,
          responseSummary: result.responseSummary,
        };
      }

      case "close_interactive_message": {
        const spaceId = args.spaceId as string;
        const messageId = args.messageId as string;
        if (!spaceId || !messageId)
          return { error: "spaceId and messageId are required" };
        if (!agentEntityId)
          return { error: "agentEntityId not resolved" };

        return await closeInteractiveMessage({
          spaceId,
          messageId,
          entityId: agentEntityId,
        });
      }

      case "invite_to_space": {
        const spaceId = args.spaceId as string;
        const email = args.email as string;
        if (!spaceId || !email)
          return { error: "spaceId and email are required" };
        if (!agentEntityId)
          return { error: "agentEntityId not resolved" };

        // Check admin+ role
        const inviterMembership = await prisma.smartSpaceMembership.findFirst({
          where: { smartSpaceId: spaceId, entityId: agentEntityId },
        });
        if (!inviterMembership)
          return { error: "You are not a member of this space" };
        if (!["owner", "admin"].includes(inviterMembership.role))
          return { error: "You need admin or owner role to invite" };

        const invRole = (args.role as string) || "member";
        const invMessage = args.message as string | undefined;

        // Check if invitee is already a member (by email → entity lookup)
        const existingEntity = await prisma.entity.findUnique({
          where: { externalId: email },
          select: { id: true },
        });
        if (existingEntity) {
          const existingMembership = await prisma.smartSpaceMembership.findUnique({
            where: {
              smartSpaceId_entityId: {
                smartSpaceId: spaceId,
                entityId: existingEntity.id,
              },
            },
          });
          if (existingMembership)
            return { error: "This person is already a member of the space" };
        }

        // Upsert: if declined/expired/revoked, update back to pending (§17.9)
        const existing = await prisma.invitation.findUnique({
          where: { smartSpaceId_inviteeEmail: { smartSpaceId: spaceId, inviteeEmail: email } },
        });

        let invitation;
        if (existing) {
          if (existing.status === "pending")
            return { error: "There is already a pending invitation for this email" };
          if (existing.status === "accepted")
            return { error: "Invitation already accepted" };
          // Re-invite: update declined/expired/revoked → pending
          invitation = await prisma.invitation.update({
            where: { id: existing.id },
            data: {
              status: "pending",
              role: invRole,
              inviterId: agentEntityId,
              message: invMessage || null,
            },
          });
        } else {
          invitation = await prisma.invitation.create({
            data: {
              smartSpaceId: spaceId,
              inviterId: agentEntityId,
              inviteeEmail: email,
              inviteeId: existingEntity?.id || null,
              role: invRole,
              message: invMessage || null,
              status: "pending",
            },
          });
        }

        // Notify invitee via entity channel (if they have an account)
        if (existingEntity) {
          const [space, inviter] = await Promise.all([
            prisma.smartSpace.findUnique({ where: { id: spaceId }, select: { name: true } }),
            prisma.entity.findUnique({ where: { id: agentEntityId }, select: { displayName: true } }),
          ]);
          emitEntityChannelEvent(existingEntity.id, {
            type: "invitation.created",
            invitationId: invitation.id,
            smartSpaceId: spaceId,
            spaceName: space?.name,
            inviterName: inviter?.displayName,
            role: invRole,
            message: invMessage || null,
          }).catch(() => {});
        }

        return {
          success: true,
          invitationId: invitation.id,
          message: `Invitation sent to ${email}`,
        };
      }

      case "get_space_members": {
        const spaceId = args.spaceId as string;
        if (!spaceId) return { error: "spaceId is required" };

        const memberships = await prisma.smartSpaceMembership.findMany({
          where: { smartSpaceId: spaceId },
          include: {
            entity: { select: { id: true, displayName: true, type: true } },
          },
        });

        return {
          members: memberships.map((m: any) => ({
            entityId: m.entityId,
            name: m.entity?.displayName ?? "Unknown",
            type: m.entity?.type ?? "unknown",
            role: m.role,
            isYou: m.entityId === agentEntityId,
          })),
        };
      }

      default:
        return { error: `Unknown tool: ${toolName}` };
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[spaces-service] Tool execution error (${toolName}):`, errMsg);
    return { error: errMsg };
  }
}
