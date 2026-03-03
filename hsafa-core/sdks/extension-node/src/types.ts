// =============================================================================
// @hsafa/extension — Type Definitions
// =============================================================================

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface HsafaExtensionConfig {
  /** Core API base URL (e.g. http://localhost:3100) */
  coreUrl: string;
  /** Extension key for runtime operations (ek_...) */
  extensionKey: string;
  /** Secret key for bootstrap operations (sk_...) */
  secretKey: string;
  /** Redis URL for real-time tool call listening. If omitted, falls back to HTTP polling. */
  redisUrl?: string;
  /** Polling interval in ms when using HTTP polling fallback (default: 2000) */
  pollIntervalMs?: number;
  /** Log prefix for console output (default: extension name) */
  logPrefix?: string;
}

// ---------------------------------------------------------------------------
// Tool Definition
// ---------------------------------------------------------------------------

export interface ToolDefinition {
  /** Tool name (must be unique within the extension) */
  name: string;
  /** Human-readable description shown to the Haseef */
  description: string;
  /** JSON Schema for the tool's input parameters */
  inputSchema: Record<string, unknown>;
  /** Handler function called when the Haseef invokes this tool */
  execute: (args: Record<string, unknown>, context: ToolCallContext) => Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Tool Call Context (passed to tool handlers)
// ---------------------------------------------------------------------------

export interface ToolCallContext {
  /** The Haseef ID that triggered this tool call */
  haseefId: string;
  /** The Haseef's entity ID */
  haseefEntityId: string;
  /** The run ID this tool call belongs to */
  runId: string;
  /** The unique tool call ID */
  toolCallId: string;
  /** Push a sense event to this Haseef */
  pushSenseEvent: (event: SenseEventInput) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Sense Events
// ---------------------------------------------------------------------------

export interface SenseEventInput {
  /** Unique event ID (use crypto.randomUUID() or similar) */
  eventId: string;
  /** Channel identifier (e.g. 'my-extension') */
  channel: string;
  /** Source identifier (e.g. a room ID, webhook ID) */
  source?: string;
  /** Event type (e.g. 'message', 'alert', 'update') */
  type: string;
  /** Event payload */
  data?: Record<string, unknown>;
  /** ISO timestamp (defaults to now) */
  timestamp?: string;
}

// ---------------------------------------------------------------------------
// Core API Response Types
// ---------------------------------------------------------------------------

export interface HaseefConnectionInfo {
  haseefId: string;
  haseefName: string;
  haseefEntityId: string;
  config: Record<string, unknown> | null;
}

export interface ExtensionSelfInfo {
  id: string;
  name: string;
  connections: Array<{
    connectionId: string;
    haseefId: string;
    haseefName: string;
    haseefEntityId: string;
    haseefDisplayName: string;
    config: Record<string, unknown> | null;
  }>;
}

// ---------------------------------------------------------------------------
// Internal: Tool Call Event (from Redis / polling)
// ---------------------------------------------------------------------------

export interface ToolCallEvent {
  type: 'tool.call';
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  runId: string;
  haseefEntityId: string;
  extensionId: string;
  ts: string;
}
