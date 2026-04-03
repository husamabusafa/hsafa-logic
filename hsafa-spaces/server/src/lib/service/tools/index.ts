// =============================================================================
// Spaces Tools — Registry & Dispatcher
//
// Maps tool names to handler functions. executeAction is a thin dispatcher.
// =============================================================================

import { handleEnterSpace, handleGetMessages, handleGetSpaceMembers } from "./navigation.js";
import { handleSendMessage, handleSendImage, handleSendVoice, handleSendFile, handleSendChart, handleSendCard } from "./messaging.js";
import { handleSendConfirmation, handleSendChoice, handleSendVote, handleSendForm, handleRespondToMessage, handleCloseInteractiveMessage } from "./interactive.js";
import { handleInviteToSpace, handleCreateSpace } from "./management.js";

// Re-export shared helpers used by stream-bridge and other modules
export { isMessageTool, getMessageToolActivity, resolvedSpaceId } from "./shared.js";

type ToolHandler = (
  args: Record<string, unknown>,
  haseefId: string,
  actionId: string,
  toolName: string,
) => Promise<unknown>;

/**
 * Tool handler registry — maps unprefixed tool name to handler function.
 * To add a new tool: add the handler in its category file, then add it here.
 */
const TOOL_HANDLERS: Record<string, ToolHandler> = {
  // Navigation
  enter_space: (args, hId) => handleEnterSpace(args, hId),
  get_messages: (args, hId) => handleGetMessages(args, hId),
  get_space_members: (args, hId) => handleGetSpaceMembers(args, hId),

  // Messaging
  send_message: handleSendMessage,
  send_image: handleSendImage,
  send_voice: handleSendVoice,
  send_file: handleSendFile,
  send_chart: handleSendChart,
  send_card: handleSendCard,

  // Interactive
  send_confirmation: handleSendConfirmation,
  send_choice: handleSendChoice,
  send_vote: handleSendVote,
  send_form: handleSendForm,
  respond_to_message: (args, hId) => handleRespondToMessage(args, hId),
  close_interactive_message: (args, hId) => handleCloseInteractiveMessage(args, hId),

  // Management
  invite_to_space: (args, hId) => handleInviteToSpace(args, hId),
  create_space: (args, hId) => handleCreateSpace(args, hId),
};

/**
 * Execute a spaces tool action. Thin dispatcher — routes to the correct handler.
 */
export async function executeSpacesAction(
  haseefId: string,
  actionId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  console.log(`[spaces] [${haseefId.slice(0, 8)}] ${toolName} (${actionId.slice(0, 8)})`);

  // Strip scope prefix: "spaces_send_message" → "send_message"
  const unprefixed = toolName.replace(/^spaces_/, '');

  const handler = TOOL_HANDLERS[unprefixed];
  if (!handler) return { error: `Unknown tool: ${unprefixed}` };

  try {
    return await handler(args, haseefId, actionId, toolName);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[spaces] Tool error (${unprefixed}):`, errMsg);
    return { error: errMsg };
  }
}
