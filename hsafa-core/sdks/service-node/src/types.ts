// =============================================================================
// @hsafa/service — Type Definitions
// =============================================================================

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface HsafaServiceConfig {
  /** Core API base URL (e.g. http://localhost:3100) */
  coreUrl: string;
  /** API key for authentication */
  apiKey: string;
  /** Redis URL for real-time action listening via Streams. If omitted, uses SSE. */
  redisUrl?: string;
  /** Log prefix for console output (default: scope name) */
  logPrefix?: string;
}

// ---------------------------------------------------------------------------
// Tool Definition
// ---------------------------------------------------------------------------

export interface ToolDefinition {
  /** Tool name (must be unique within the scope) */
  name: string;
  /** Human-readable description shown to the Haseef */
  description: string;
  /** JSON Schema for the tool's input parameters */
  inputSchema: Record<string, unknown>;
  /** Execution mode: sync (waits for result), fire_and_forget (returns immediately), async (result as future event) */
  mode?: 'sync' | 'fire_and_forget' | 'async';
  /** Timeout in milliseconds for sync mode (default: 60000) */
  timeout?: number;
  /** Handler function called when the Haseef invokes this tool */
  execute: (args: Record<string, unknown>, context: ToolCallContext) => Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Tool Call Context (passed to tool handlers)
// ---------------------------------------------------------------------------

export interface ToolCallContext {
  /** The Haseef ID that triggered this tool call */
  haseefId: string;
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
  /** Scope identifier (e.g. 'spaces', 'whatsapp') */
  scope: string;
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

export interface ActionEvent {
  type: 'action';
  actionId: string;
  toolName: string;
  args: Record<string, unknown>;
  haseefId: string;
  ts: string;
}
