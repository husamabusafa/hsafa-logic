// =============================================================================
// Inbox Handler
//
// Replaces SpacesListener. Instead of subscribing to SSE and forwarding,
// space-service.ts calls notifyNewMessage() directly after persisting.
// The extension bootstrap registers a handler that pushes sense events to Core.
//
// No circular dependency: space-service.ts imports this file,
// extension/index.ts sets the handler at bootstrap time.
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
}

type InboxHandler = (params: InboxMessageParams) => Promise<void>;

// Use globalThis to share handler across Next.js module scopes
// (instrumentation.ts and API routes may get different module instances in dev)
const g = globalThis as unknown as { __extInboxHandler: InboxHandler | null };

export function setInboxHandler(fn: InboxHandler): void {
  g.__extInboxHandler = fn;
}

export async function notifyNewMessage(
  params: InboxMessageParams,
): Promise<void> {
  const handler = g.__extInboxHandler;
  if (!handler) return;
  try {
    await handler(params);
  } catch (err) {
    console.error("[extension/inbox] Handler error:", err);
  }
}
