// =============================================================================
// Spaces Service — Tool Handlers
//
// Executes tool actions dispatched by Core: enter_space, send_message,
// get_messages, send_confirmation, send_choice, send_vote,
// send_form, respond_to_message, close_interactive_message, invite_to_space,
// get_space_members.
//
// The haseef has an "active space" — set by enter_space or auto-set on
// run.started. All message tools operate on the active space.
// =============================================================================

import { prisma } from "../db.js";
import { postSpaceMessage } from "../space-service.js";
import type { ReplyToMetadata } from "../message-types.js";
import {
  respondToMessage,
  closeInteractiveMessage,
} from "../response-service.js";
import { markOnline } from "../smartspace-events.js";
import { state, type ActiveConnection } from "./types.js";
import { pushInteractiveMessageEvent, emitEntityChannelEvent } from "./sense-events.js";
import { textToSpeech } from "../cartesia.js";

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
  "send_image", "send_voice", "send_file", "send_chart", "send_card",
]);
export function isMessageTool(toolName?: string): boolean {
  if (!toolName) return false;
  if (MESSAGE_TOOLS.has(toolName)) return true;
  // Core prefixes tool names with scope: "spaces_send_message" → strip prefix and check
  const unprefixed = toolName.replace(/^spaces_/, '');
  return MESSAGE_TOOLS.has(unprefixed);
}

// =============================================================================
// Active Space Helper
// =============================================================================

/** Get the active spaceId for a connection, with clear error if none set. */
function getActiveSpaceId(conn: ActiveConnection | undefined): { spaceId: string } | { error: string } {
  if (!conn) return { error: "Haseef not connected" };
  // Prefer explicitly entered space over auto-set trigger space
  const space = conn.enteredSpace ?? conn.activeSpace;
  if (!space) return { error: "No active space. Call enter_space first to open a chat." };
  return { spaceId: space.spaceId };
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

  console.log(`[spaces-service] [${haseefId.slice(0, 8)}] ${toolName} (${actionId.slice(0, 8)}) [activeSpace: ${conn?.activeSpace?.spaceName ?? 'none'}]`);

  // Core prefixes tool names with scope: "spaces_send_message" → strip to "send_message"
  const unprefixedToolName = toolName.replace(/^spaces_/, '');

  try {
    switch (unprefixedToolName) {
      case "enter_space": {
        const spaceId = args.spaceId as string;
        if (!spaceId) return { error: "spaceId is required" };
        if (!conn) return { error: "Haseef not connected" };
        if (!agentEntityId) return { error: "agentEntityId not resolved" };

        // Verify membership
        const membership = await prisma.smartSpaceMembership.findUnique({
          where: { smartSpaceId_entityId: { smartSpaceId: spaceId, entityId: agentEntityId } },
        });
        if (!membership) return { error: `You are not a member of space ${spaceId}` };

        // Load space info + members
        const [space, memberships] = await Promise.all([
          prisma.smartSpace.findUnique({ where: { id: spaceId }, select: { id: true, name: true, description: true } }),
          prisma.smartSpaceMembership.findMany({
            where: { smartSpaceId: spaceId },
            include: { entity: { select: { id: true, displayName: true, type: true } } },
          }),
        ]);

        if (!space) return { error: "Space not found" };

        // Set active space (both auto and explicit — explicit persists across cycles)
        conn.activeSpace = { spaceId: space.id, spaceName: space.name ?? spaceId };
        conn.enteredSpace = { spaceId: space.id, spaceName: space.name ?? spaceId };

        // Mark online in this space
        void markOnline(spaceId, agentEntityId);

        const members = memberships.map((m: any) => ({
          name: m.entityId === agentEntityId ? "You" : (m.entity?.displayName ?? "Unknown"),
          type: m.entity?.type ?? "unknown",
          role: m.role,
          entityId: m.entityId,
          isYou: m.entityId === agentEntityId,
        }));

        return {
          success: true,
          currentSpace: {
            id: space.id,
            name: space.name,
            description: space.description,
          },
          members,
          message: `You are now in "${space.name}". All messages you send will go here.`,
        };
      }

      case "send_message": {
        const active = getActiveSpaceId(conn);
        if ('error' in active) return active;
        const spaceId = active.spaceId;

        const text = args.text as string;
        if (!text) return { error: "text is required" };
        if (!agentEntityId)
          return { error: "agentEntityId not resolved — is this haseef connected?" };

        const replyTo = await resolveReplyTo(args.replyTo as string | undefined);

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

        const resolvedSpace = conn!.enteredSpace ?? conn!.activeSpace;
        return { success: true, messageId: result.messageId, sentTo: resolvedSpace!.spaceName };
      }

      case "get_messages": {
        // Optional spaceId override; defaults to active space
        let spaceId = args.spaceId as string | undefined;
        if (!spaceId) {
          const active = getActiveSpaceId(conn);
          if ('error' in active) return active;
          spaceId = active.spaceId;
        }
        const limit = (args.limit as number) || 20;

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

      case "send_confirmation": {
        const active = getActiveSpaceId(conn);
        if ('error' in active) return active;
        const spaceId = active.spaceId;

        const title = args.title as string;
        const message = args.message as string;
        if (!title || !message)
          return { error: "title and message are required" };
        if (!agentEntityId)
          return { error: "agentEntityId not resolved" };

        const confirmLabel = (args.confirmLabel as string) || "Confirm";
        const rejectLabel = (args.rejectLabel as string) || "Cancel";
        const allowUpdate = args.allowUpdate !== false;
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
            audience: "broadcast",
            status: "open",
            responseSchema: { type: "enum", values: ["confirmed", "rejected"] },
            payload: { title, message, confirmLabel, rejectLabel, allowUpdate },
            responseSummary: { totalResponses: 0, responses: [] },
          },
        });

        // Push interactive_message sense event to all haseefs in space
        await pushInteractiveMessageEvent(spaceId, result.messageId, "confirmation", title);

        return {
          success: true,
          messageId: result.messageId,
          status: "open",
          message: `Confirmation broadcast to all members. You'll receive message_response events as people respond.`,
        };
      }

      case "send_choice": {
        const active = getActiveSpaceId(conn);
        if ('error' in active) return active;
        const spaceId = active.spaceId;

        const text = args.text as string;
        const options = args.options as Array<{ label: string; value: string }>;
        if (!text || !Array.isArray(options) || options.length === 0)
          return { error: "text and options are required" };
        if (!agentEntityId)
          return { error: "agentEntityId not resolved" };

        const values = options.map((o) => o.value);
        const allowUpdate = args.allowUpdate !== false;
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
            audience: "broadcast",
            status: "open",
            responseSchema: { type: "enum", values },
            payload: { text, options, allowUpdate },
            responseSummary: { totalResponses: 0, responses: [] },
          },
        });

        await pushInteractiveMessageEvent(spaceId, result.messageId, "choice", text);

        return {
          success: true,
          messageId: result.messageId,
          status: "open",
          message: `Choice broadcast to all members. You'll receive message_response events as people respond.`,
        };
      }

      case "send_vote": {
        const active = getActiveSpaceId(conn);
        if ('error' in active) return active;
        const spaceId = active.spaceId;

        const title = args.title as string;
        const options = args.options as string[];
        if (!title || !Array.isArray(options) || options.length < 2)
          return { error: "title and at least 2 options are required" };
        if (!agentEntityId)
          return { error: "agentEntityId not resolved" };

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
            responseSchema: { type: "enum", values: options },
            payload: { title, options },
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
        const active = getActiveSpaceId(conn);
        if ('error' in active) return active;
        const spaceId = active.spaceId;

        const title = args.title as string;
        const fields = args.fields as Array<Record<string, unknown>>;
        if (!title || !Array.isArray(fields) || fields.length === 0)
          return { error: "title and at least 1 field are required" };
        if (!agentEntityId)
          return { error: "agentEntityId not resolved" };

        const description = args.description as string | undefined;
        const allowUpdate = args.allowUpdate !== false;

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
            audience: "broadcast",
            status: "open",
            responseSchema: { type: "json", schema: jsonSchema },
            payload: { title, description, fields, allowUpdate },
            responseSummary: { totalResponses: 0, responses: [] },
          },
        });

        await pushInteractiveMessageEvent(spaceId, result.messageId, "form", title);

        return {
          success: true,
          messageId: result.messageId,
          status: "open",
          message: `Form broadcast to all members. You'll receive message_response events as people submit.`,
        };
      }

      case "respond_to_message": {
        const active = getActiveSpaceId(conn);
        if ('error' in active) return active;
        const spaceId = active.spaceId;

        const messageId = args.messageId as string;
        const value = args.value;
        if (!messageId || value === undefined)
          return { error: "messageId and value are required" };
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
        const active = getActiveSpaceId(conn);
        if ('error' in active) return active;
        const spaceId = active.spaceId;

        const messageId = args.messageId as string;
        if (!messageId)
          return { error: "messageId is required" };
        if (!agentEntityId)
          return { error: "agentEntityId not resolved" };

        return await closeInteractiveMessage({
          spaceId,
          messageId,
          entityId: agentEntityId,
        });
      }

      case "invite_to_space": {
        const active = getActiveSpaceId(conn);
        if ('error' in active) return active;
        const spaceId = active.spaceId;

        const email = args.email as string;
        if (!email)
          return { error: "email is required" };
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
        // Optional spaceId override; defaults to active space
        let spaceId = args.spaceId as string | undefined;
        if (!spaceId) {
          const active = getActiveSpaceId(conn);
          if ('error' in active) return active;
          spaceId = active.spaceId;
        }

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

      case "send_image": {
        const active = getActiveSpaceId(conn);
        if ('error' in active) return active;
        const spaceId = active.spaceId;

        const imageUrl = args.imageUrl as string;
        if (!imageUrl) return { error: "imageUrl is required" };
        if (!agentEntityId) return { error: "agentEntityId not resolved" };

        const caption = (args.caption as string) || undefined;
        const replyTo = await resolveReplyTo(args.replyTo as string | undefined);

        const result = await postSpaceMessage({
          spaceId,
          entityId: agentEntityId,
          role: "assistant",
          content: caption || "",
          messageType: "image",
          replyTo,
          metadata: {
            toolName,
            actionId,
            payload: { imageUrl, caption },
          },
        });

        return { success: true, messageId: result.messageId, sentTo: conn!.activeSpace!.spaceName };
      }

      case "send_voice": {
        const active = getActiveSpaceId(conn);
        if ('error' in active) return active;
        const spaceId = active.spaceId;

        const text = args.text as string;
        if (!text) return { error: "text is required" };
        if (!agentEntityId) return { error: "agentEntityId not resolved" };

        const replyTo = await resolveReplyTo(args.replyTo as string | undefined);

        // Generate TTS audio via Cartesia
        let audioUrl: string;
        let audioDuration: number;
        try {
          const protocol = "http";
          const baseUrl = `${protocol}://localhost:${process.env.PORT || 3005}`;
          const ttsResult = await textToSpeech(text, baseUrl);
          audioUrl = ttsResult.audioUrl;
          audioDuration = ttsResult.audioDuration;
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          return { error: `TTS failed: ${errMsg}` };
        }

        const result = await postSpaceMessage({
          spaceId,
          entityId: agentEntityId,
          role: "assistant",
          content: "",
          messageType: "voice",
          replyTo,
          metadata: {
            toolName,
            actionId,
            payload: { audioUrl, audioDuration, transcription: text },
          },
        });

        return { success: true, messageId: result.messageId, audioUrl, sentTo: conn!.activeSpace!.spaceName };
      }

      case "send_file": {
        const active = getActiveSpaceId(conn);
        if ('error' in active) return active;
        const spaceId = active.spaceId;

        const fileUrl = args.fileUrl as string;
        const fileName = args.fileName as string;
        if (!fileUrl || !fileName) return { error: "fileUrl and fileName are required" };
        if (!agentEntityId) return { error: "agentEntityId not resolved" };

        const fileMimeType = (args.fileMimeType as string) || "application/octet-stream";
        const fileSize = (args.fileSize as number) || 0;
        const replyTo = await resolveReplyTo(args.replyTo as string | undefined);

        const result = await postSpaceMessage({
          spaceId,
          entityId: agentEntityId,
          role: "assistant",
          content: "",
          messageType: "file",
          replyTo,
          metadata: {
            toolName,
            actionId,
            payload: { fileUrl, fileName, fileMimeType, fileSize },
          },
        });

        return { success: true, messageId: result.messageId, sentTo: conn!.activeSpace!.spaceName };
      }

      case "send_chart": {
        const active = getActiveSpaceId(conn);
        if ('error' in active) return active;
        const spaceId = active.spaceId;

        const title = args.title as string;
        const chartData = args.data as Array<{ label: string; value: number; color?: string }>;
        if (!title || !chartData) return { error: "title and data are required" };
        if (!agentEntityId) return { error: "agentEntityId not resolved" };

        const chartType = (args.chartType as string) || "bar";
        const replyTo = await resolveReplyTo(args.replyTo as string | undefined);

        const result = await postSpaceMessage({
          spaceId,
          entityId: agentEntityId,
          role: "assistant",
          content: title,
          messageType: "chart",
          replyTo,
          metadata: {
            toolName,
            actionId,
            payload: { title, chartType, data: chartData },
          },
        });

        return { success: true, messageId: result.messageId, sentTo: conn!.activeSpace!.spaceName };
      }

      case "send_card": {
        const active = getActiveSpaceId(conn);
        if ('error' in active) return active;
        const spaceId = active.spaceId;

        const title = args.title as string;
        const body = args.body as string;
        if (!title || !body) return { error: "title and body are required" };
        if (!agentEntityId) return { error: "agentEntityId not resolved" };

        const imageUrl = args.imageUrl as string | undefined;
        const actions = args.actions as Array<{ label: string; value: string; style?: string }> | undefined;
        const hasActions = Array.isArray(actions) && actions.length > 0;
        const replyTo = await resolveReplyTo(args.replyTo as string | undefined);

        const metadata: Record<string, unknown> = {
          toolName,
          actionId,
          payload: { title, body, imageUrl, actions },
        };

        // If card has action buttons, make it an interactive broadcast message
        if (hasActions) {
          const values = actions!.map((a) => a.value);
          metadata.audience = "broadcast";
          metadata.status = "open";
          metadata.responseSchema = { type: "enum", values };
          metadata.responseSummary = { totalResponses: 0, responses: [] };
        }

        const result = await postSpaceMessage({
          spaceId,
          entityId: agentEntityId,
          role: "assistant",
          content: `${title}: ${body}`,
          messageType: "card",
          replyTo,
          metadata,
        });

        if (hasActions) {
          await pushInteractiveMessageEvent(spaceId, result.messageId, "card", title);
        }

        return { success: true, messageId: result.messageId, sentTo: conn!.activeSpace!.spaceName };
      }

      default:
        return { error: `Unknown tool: ${unprefixedToolName}` };
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[spaces-service] Tool execution error (${unprefixedToolName}):`, errMsg);
    return { error: errMsg };
  }
}
