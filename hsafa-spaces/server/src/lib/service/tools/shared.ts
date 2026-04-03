// =============================================================================
// Spaces Tools — Shared Helpers
//
// Common utilities used across all spaces tool handler categories.
// =============================================================================

import { prisma } from "../../db.js";
import type { ReplyToMetadata } from "../../message-types.js";
import { state, type ActiveConnection } from "../types.js";

// =============================================================================
// Active Space Resolution
// =============================================================================

/** Get the active spaceId for a connection, with clear error if none set. */
export function getActiveSpaceId(conn: ActiveConnection | undefined): { spaceId: string } | { error: string } {
  if (!conn) return { error: "Haseef not connected" };
  // Prefer explicitly entered space over auto-set trigger space
  const space = conn.enteredSpace ?? conn.activeSpace;
  if (space) return { spaceId: space.spaceId };

  // Fallback: use the trigger space from the current run (handles race conditions
  // where enter_space state was lost between tool calls, e.g. due to server restart)
  if (conn.currentRunId) {
    const triggerSpaceId = conn.runSpaces.get(conn.currentRunId);
    if (triggerSpaceId) {
      console.warn(`[spaces-service] [${conn.haseefName}] Using trigger space fallback for run ${conn.currentRunId.slice(0, 8)} (enteredSpace and activeSpace were null)`);
      return { spaceId: triggerSpaceId };
    }
  }

  return { error: "No active space. Call enter_space first to open a chat." };
}

/**
 * Get the resolved space name for a connection (for return values).
 */
export function resolvedSpaceName(conn: ActiveConnection): string {
  return (conn.enteredSpace ?? conn.activeSpace)?.spaceName ?? "unknown";
}

/**
 * Resolve the spaceId for the current connection — prefers enteredSpace, then activeSpace.
 * Used by stream-bridge and other modules needing the "current" space.
 */
export function resolvedSpaceId(conn: ActiveConnection): string | undefined {
  return (conn.enteredSpace ?? conn.activeSpace)?.spaceId;
}

// =============================================================================
// Reply-To Resolution
// =============================================================================

export async function resolveReplyTo(
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

const MESSAGE_TOOLS = new Set([
  "send_message", "send_confirmation", "send_choice", "send_vote", "send_form",
  "send_image", "send_voice", "send_file", "send_chart", "send_card",
]);
const VOICE_TOOLS = new Set(["send_voice"]);

export function isMessageTool(toolName?: string): boolean {
  if (!toolName) return false;
  if (MESSAGE_TOOLS.has(toolName)) return true;
  // Core prefixes tool names with scope: "spaces_send_message" → strip prefix and check
  const unprefixed = toolName.replace(/^spaces_/, '');
  return MESSAGE_TOOLS.has(unprefixed);
}

/** Get the activity type for a message tool: 'typing' or 'recording' */
export function getMessageToolActivity(toolName?: string): "typing" | "recording" {
  if (!toolName) return "typing";
  const unprefixed = toolName.replace(/^spaces_/, '');
  return VOICE_TOOLS.has(unprefixed) ? "recording" : "typing";
}

// =============================================================================
// Connection helper
// =============================================================================

export function getConnection(haseefId: string) {
  return state.connections.get(haseefId);
}
