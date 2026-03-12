// =============================================================================
// Inbox Handler
//
// Replaces SpacesListener. Instead of subscribing to SSE and forwarding,
// space-service.ts calls notifyNewMessage() directly after persisting.
// The extension bootstrap registers a handler that pushes sense events to Core.
// =============================================================================

export interface InboxMessageParams {
  spaceId: string;
  spaceName: string;
  entityId: string;
  senderName: string;
  senderType: string;
  messageId: string;
  content: string;
  role: string;
  /** Message type (text, vote, confirmation, etc.) — added per §17.8 */
  messageType?: string;
  /** Full message metadata for interactive messages — added per §17.8 */
  metadata?: Record<string, unknown>;
}

type InboxHandler = (params: InboxMessageParams) => Promise<void>;

let inboxHandler: InboxHandler | null = null;

export function setInboxHandler(fn: InboxHandler): void {
  inboxHandler = fn;
}

export async function notifyNewMessage(
  params: InboxMessageParams,
): Promise<void> {
  if (!inboxHandler) return;
  try {
    await inboxHandler(params);
  } catch (err) {
    console.error("[service/inbox] Handler error:", err);
  }
}
