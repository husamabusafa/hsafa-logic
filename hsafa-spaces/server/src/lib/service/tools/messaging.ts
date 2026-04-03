// =============================================================================
// Spaces Tools — Messaging (send_message, send_image, send_voice, send_file,
//                            send_chart, send_card)
// =============================================================================

import { prisma } from "../../db.js";
import { postSpaceMessage } from "../../space-service.js";
import { state } from "../types.js";
import { pushInteractiveMessageEvent } from "../sense-events.js";
import { textToSpeech } from "../../elevenlabs.js";
import { getActiveSpaceId, resolveReplyTo, resolvedSpaceName } from "./shared.js";

export async function handleSendMessage(
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

  const rawText = args.text as string;
  if (!rawText) return { error: "text is required" };
  if (!agentEntityId)
    return { error: "agentEntityId not resolved — is this haseef connected?" };

  // Strip common LLM formatting artifacts
  let text = rawText
    .replace(/^>{1,3}\s*/, "")
    .replace(/^:\s*/, "")
    .trim();
  if (conn?.haseefName) {
    const namePrefix = new RegExp(`^${conn.haseefName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*`, "i");
    text = text.replace(namePrefix, "").trim();
  }
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    text = text.slice(1, -1).trim();
  }
  if (!text) text = rawText.trim();

  const replyTo = await resolveReplyTo(args.replyTo as string | undefined);

  const result = await postSpaceMessage({
    spaceId,
    entityId: agentEntityId,
    role: "assistant",
    content: text,
    messageType: "text",
    replyTo,
    metadata: { toolName, actionId },
  });

  return { success: true, messageId: result.messageId, sentTo: resolvedSpaceName(conn!) };
}

export async function handleSendImage(
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
    metadata: { toolName, actionId, payload: { imageUrl, caption } },
  });

  return { success: true, messageId: result.messageId, sentTo: resolvedSpaceName(conn!) };
}

export async function handleSendVoice(
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
  if (!text) return { error: "text is required" };
  if (!agentEntityId) return { error: "agentEntityId not resolved" };

  const replyTo = await resolveReplyTo(args.replyTo as string | undefined);

  // Generate TTS audio via ElevenLabs
  let audioUrl: string;
  let audioDuration: number;
  try {
    const protocol = "http";
    const baseUrl = `${protocol}://localhost:${process.env.PORT || 3005}`;
    const ttsResult = await textToSpeech(text, baseUrl, conn?.voiceId, conn?.voiceGender);
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
    metadata: { toolName, actionId, payload: { audioUrl, audioDuration, transcription: text } },
  });

  return { success: true, messageId: result.messageId, audioUrl, sentTo: resolvedSpaceName(conn!) };
}

export async function handleSendFile(
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
    metadata: { toolName, actionId, payload: { fileUrl, fileName, fileMimeType, fileSize } },
  });

  return { success: true, messageId: result.messageId, sentTo: resolvedSpaceName(conn!) };
}

export async function handleSendChart(
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
    metadata: { toolName, actionId, payload: { title, chartType, data: chartData } },
  });

  return { success: true, messageId: result.messageId, sentTo: resolvedSpaceName(conn!) };
}

export async function handleSendCard(
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

  return { success: true, messageId: result.messageId, sentTo: resolvedSpaceName(conn!) };
}
