// =============================================================================
// @hsafa/node — Types
//
// Shared types for the Hsafa Core SDK.
// Covers both extension-mode (extension key) and admin-mode (secret key).
// =============================================================================

// =============================================================================
// Client Options
// =============================================================================

export interface HsafaOptions {
  /** Core API base URL (e.g. http://localhost:3001) */
  coreUrl: string;
  /** Extension key — authenticates as an extension (ek_...) */
  extensionKey?: string;
  /** Secret key — authenticates as admin */
  secretKey?: string;
}

// =============================================================================
// Core Resources
// =============================================================================

export interface Haseef {
  id: string;
  name: string;
  description?: string | null;
  extensions?: Array<{
    extensionId: string;
    extensionName: string;
    enabled: boolean;
    config?: Record<string, unknown> | null;
  }>;
  createdAt: string;
}

export interface Extension {
  id: string;
  name: string;
  description?: string | null;
  url?: string | null;
  instructions?: string | null;
  manifest?: ExtensionManifest | null;
  extensionKey?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExtensionConnection {
  connectionId: string;
  haseefId: string;
  haseefName: string;
  config: Record<string, unknown> | null;
  connectedAt?: string;
}

export interface ExtensionInfo {
  id: string;
  name: string;
  description?: string | null;
  url?: string | null;
  instructions?: string | null;
  manifest?: ExtensionManifest | null;
  connections: ExtensionConnection[];
}

export interface ExtensionManifest {
  name: string;
  description?: string;
  version?: string;
  tools: ToolDefinition[];
  instructions?: string;
  configSchema?: Record<string, unknown>;
  events?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface Run {
  id: string;
  haseefId: string;
  status: 'running' | 'completed' | 'failed';
  cycleNumber?: number;
  inboxEventCount?: number;
  stepCount?: number;
  promptTokens?: number;
  completionTokens?: number;
  durationMs?: number;
  triggerType?: string | null;
  triggerSpaceId?: string | null;
  triggerEntityId?: string | null;
  triggerPayload?: unknown;
  errorMessage?: string | null;
  startedAt?: string;
  createdAt: string;
  completedAt?: string | null;
}

export interface ConsciousnessSnapshot {
  id: string;
  cycleCount: number;
  tokenEstimate: number;
  reason: string | null;
  createdAt: string;
}

// =============================================================================
// Sense Events (Extension → Core)
// =============================================================================

export interface SenseEvent {
  eventId: string;
  channel: string;
  source: string;
  type: string;
  timestamp: string;
  data: Record<string, unknown>;
}

// =============================================================================
// Stream Events (Core → Extension via SSE)
// =============================================================================

export interface StreamEvent {
  type: string;
  runId?: string;
  haseefId?: string;
  triggerType?: string;
  triggerSource?: string;
  streamId?: string;
  toolName?: string;
  delta?: string;
  args?: unknown;
  result?: unknown;
  error?: string;
  [key: string]: unknown;
}

// =============================================================================
// Webhook Events (Core → Extension via HTTP)
// =============================================================================

export interface WebhookEvent {
  type: string;
  [key: string]: unknown;
}

export interface ToolCallWebhook extends WebhookEvent {
  type: 'tool_call';
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  haseefId: string;
  haseefName: string;
  runId: string;
}

export interface LifecycleWebhook extends WebhookEvent {
  type: 'haseef.connected' | 'haseef.disconnected' | 'haseef.config_updated' | 'extension.installed';
  haseefId?: string;
  haseefName?: string;
  config?: Record<string, unknown>;
  extensionId?: string;
  extensionKey?: string;
}

// =============================================================================
// Extension Server Types
// =============================================================================

/** Handler for a tool call. Receives args and context, returns result. */
export type ToolHandler = (
  args: Record<string, unknown>,
  context: ToolCallContext,
) => Promise<unknown>;

export interface ToolCallContext {
  toolCallId: string;
  haseefId: string;
  haseefName: string;
  runId: string;
}

/** Handler for lifecycle events */
export type LifecycleHandler = (event: LifecycleWebhook) => void | Promise<void>;

// =============================================================================
// Status / Observability
// =============================================================================

export interface SystemStatus {
  uptime: number;
  processCount: number;
  haseefs: HaseefStatus[];
}

export interface HaseefStatus {
  haseefId: string;
  name: string;
  status: string;
  cycleCount: number;
  tokenEstimate: number;
  lastCycleAt: string | null;
  lastRunDurationMs: number | null;
  lastRunTokens: { prompt: number; completion: number } | null;
  failedRuns24h: number;
  inboxDepth: number;
  extensions: string[];
}

// =============================================================================
// API Error
// =============================================================================

export class HsafaApiError extends Error {
  constructor(
    public status: number,
    public body: string,
    public url: string,
  ) {
    super(`Hsafa API error ${status} from ${url}: ${body}`);
    this.name = 'HsafaApiError';
  }
}
