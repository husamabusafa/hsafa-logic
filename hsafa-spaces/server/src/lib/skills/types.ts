// =============================================================================
// Skill System — Types
//
// Defines the interface that every skill template handler must implement.
// =============================================================================

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  mode?: "sync" | "async";
}

/**
 * A prebuilt skill template definition.
 * Each template provides metadata, config schema, tool definitions,
 * LLM instructions, and a handler factory.
 */
export interface SkillTemplateDefinition {
  /** Unique template name, e.g. "database" */
  name: string;
  /** Display name, e.g. "Database" */
  displayName: string;
  /** Description shown to users */
  description: string;
  /** Category for grouping, e.g. "data", "automation" */
  category: string;
  /** JSON Schema for validating instance config */
  configSchema: Record<string, unknown>;
  /** Tool definitions (without instance prefix) */
  tools: ToolDefinition[];
  /** LLM instructions injected into the Haseef prompt */
  instructions: string;
  /** Optional icon URL */
  iconUrl?: string;
  /**
   * Create a handler for a specific instance.
   * Called once when the instance SDK connects.
   * Returns a function that handles tool calls.
   */
  createHandler: (instanceConfig: Record<string, unknown>) => SkillHandler;
}

/**
 * A skill handler created for a specific instance with its config.
 * Handles tool calls and optionally manages lifecycle.
 */
export interface SkillHandler {
  /** Execute a tool call. toolName is the unprefixed name (e.g. "query", not "production_db_query"). */
  execute: (toolName: string, args: Record<string, unknown>, context: ToolCallContext) => Promise<unknown>;
  /** Called when the handler is being shut down (e.g. instance deleted or config changed). */
  destroy?: () => Promise<void>;
  /**
   * Optional: start a background sense loop (pollers, IMAP IDLE listeners, etc.)
   * that pushes sense events to Core via the provided context.
   * Called once after the SDK connects.
   */
  startSenseLoop?: (ctx: SenseLoopContext) => void | Promise<void>;
  /** Called before disconnect to stop any running sense loops. */
  stopSenseLoop?: () => void | Promise<void>;
}

export interface ToolCallContext {
  haseefId: string;
  haseefName: string;
  actionId: string;
  instanceName: string;
  /**
   * The haseef's profileJson at the moment the action was dispatched.
   * Skills that expect per-haseef credentials (email, external APIs, etc.)
   * should read them from here instead of from the instance config.
   * Forwarded from the SDK's `ctx.haseef.profile`.
   */
  haseefProfile: Record<string, unknown>;
}

/**
 * Attachment carried by a sense event (image/file/audio pointed at a URL or base64).
 */
export interface SenseEventAttachment {
  type: "image" | "audio" | "file";
  mimeType: string;
  url?: string;
  base64?: string;
  name?: string;
}

/**
 * Sense event payload (type + data + optional attachments).
 * The skill name is injected automatically by the SDK — handlers must not set it.
 */
export interface SenseEventPayload {
  type: string;
  data: Record<string, unknown>;
  attachments?: SenseEventAttachment[];
}

/** Push a sense event to a specific haseef attached to this instance. */
export type SenseEventPusher = (haseefId: string, event: SenseEventPayload) => Promise<void>;

/**
 * Context passed to `startSenseLoop`. Gives handlers everything they need to
 * push events to one or all attached haseefs without knowing about the SDK.
 */
export interface SenseLoopContext {
  /** Skill instance name (same as the SDK scope). */
  instanceName: string;
  /** Push a sense event to one haseef (must be attached to this instance). */
  pushEvent: SenseEventPusher;
  /** Push the same event to every haseef currently attached to this instance. */
  broadcast: (event: SenseEventPayload) => Promise<void>;
  /** Resolve the list of haseef IDs currently attached to this instance. */
  getAttachedHaseefs: () => Promise<string[]>;
  /**
   * Fetch a haseef's live profileJson from Core. Returns {} if the haseef has
   * no profile set. Useful inside sense loops (no ToolCallContext available).
   */
  getHaseefProfile: (haseefId: string) => Promise<Record<string, unknown>>;
}
