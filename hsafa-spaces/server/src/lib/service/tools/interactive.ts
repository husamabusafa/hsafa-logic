// =============================================================================
// Spaces Tools — Interactive Messages (send_confirmation, send_choice,
//   send_vote, send_form, respond_to_message, close_interactive_message)
// =============================================================================

import { postSpaceMessage } from "../../space-service.js";
import { respondToMessage, closeInteractiveMessage } from "../../response-service.js";
import { state } from "../types.js";
import { pushInteractiveMessageEvent } from "../sense-events.js";
import { getActiveSpaceId, resolveReplyTo } from "./shared.js";

export async function handleSendConfirmation(
  args: Record<string, unknown>,
  haseefId: string,
  actionId: string,
  toolName: string,
): Promise<unknown> {
  const conn = state.connections.get(haseefId);
  const agentEntityId = conn?.agentEntityId;

  const active = getActiveSpaceId(conn);
  if ('error' in active) return active;
  const spaceId = active.spaceId;

  const title = args.title as string;
  const message = args.message as string;
  if (!title || !message) return { error: "title and message are required" };
  if (!agentEntityId) return { error: "agentEntityId not resolved" };

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
      toolName, actionId,
      audience: "broadcast",
      status: "open",
      responseSchema: { type: "enum", values: ["confirmed", "rejected"] },
      payload: { title, message, confirmLabel, rejectLabel, allowUpdate },
      responseSummary: { totalResponses: 0, responses: [] },
    },
  });

  await pushInteractiveMessageEvent(spaceId, result.messageId, "confirmation", title);

  return {
    success: true,
    messageId: result.messageId,
    status: "open",
    message: `Confirmation broadcast to all members. You'll receive message_response events as people respond.`,
  };
}

export async function handleSendChoice(
  args: Record<string, unknown>,
  haseefId: string,
  actionId: string,
  toolName: string,
): Promise<unknown> {
  const conn = state.connections.get(haseefId);
  const agentEntityId = conn?.agentEntityId;

  const active = getActiveSpaceId(conn);
  if ('error' in active) return active;
  const spaceId = active.spaceId;

  const text = args.text as string;
  const options = args.options as Array<{ label: string; value: string }>;
  if (!text || !Array.isArray(options) || options.length === 0)
    return { error: "text and options are required" };
  if (!agentEntityId) return { error: "agentEntityId not resolved" };

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
      toolName, actionId,
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

export async function handleSendVote(
  args: Record<string, unknown>,
  haseefId: string,
  actionId: string,
  toolName: string,
): Promise<unknown> {
  const conn = state.connections.get(haseefId);
  const agentEntityId = conn?.agentEntityId;

  const active = getActiveSpaceId(conn);
  if ('error' in active) return active;
  const spaceId = active.spaceId;

  const title = args.title as string;
  const options = args.options as string[];
  if (!title || !Array.isArray(options) || options.length < 2)
    return { error: "title and at least 2 options are required" };
  if (!agentEntityId) return { error: "agentEntityId not resolved" };

  const replyTo = await resolveReplyTo(args.replyTo as string | undefined);

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
      toolName, actionId,
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

export async function handleSendForm(
  args: Record<string, unknown>,
  haseefId: string,
  actionId: string,
  toolName: string,
): Promise<unknown> {
  const conn = state.connections.get(haseefId);
  const agentEntityId = conn?.agentEntityId;

  const active = getActiveSpaceId(conn);
  if ('error' in active) return active;
  const spaceId = active.spaceId;

  const title = args.title as string;
  const fields = args.fields as Array<Record<string, unknown>>;
  if (!title || !Array.isArray(fields) || fields.length === 0)
    return { error: "title and at least 1 field are required" };
  if (!agentEntityId) return { error: "agentEntityId not resolved" };

  const description = args.description as string | undefined;
  const allowUpdate = args.allowUpdate !== false;

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
      toolName, actionId,
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

export async function handleRespondToMessage(
  args: Record<string, unknown>,
  haseefId: string,
): Promise<unknown> {
  const conn = state.connections.get(haseefId);
  const agentEntityId = conn?.agentEntityId;

  const active = getActiveSpaceId(conn);
  if ('error' in active) return active;
  const spaceId = active.spaceId;

  const messageId = args.messageId as string;
  const value = args.value;
  if (!messageId || value === undefined)
    return { error: "messageId and value are required" };
  if (!agentEntityId) return { error: "agentEntityId not resolved" };

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

export async function handleCloseInteractiveMessage(
  args: Record<string, unknown>,
  haseefId: string,
): Promise<unknown> {
  const conn = state.connections.get(haseefId);
  const agentEntityId = conn?.agentEntityId;

  const active = getActiveSpaceId(conn);
  if ('error' in active) return active;
  const spaceId = active.spaceId;

  const messageId = args.messageId as string;
  if (!messageId) return { error: "messageId is required" };
  if (!agentEntityId) return { error: "agentEntityId not resolved" };

  return await closeInteractiveMessage({
    spaceId,
    messageId,
    entityId: agentEntityId,
  });
}
