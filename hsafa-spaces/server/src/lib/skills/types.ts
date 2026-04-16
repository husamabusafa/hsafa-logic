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
  /** Optional: push sense events periodically or on triggers. */
  startSenseLoop?: (pushEvent: SenseEventPusher) => void;
  stopSenseLoop?: () => void;
}

export interface ToolCallContext {
  haseefId: string;
  haseefName: string;
  actionId: string;
  instanceName: string;
}

export type SenseEventPusher = (
  haseefId: string,
  event: {
    eventId: string;
    skill: string;
    type: string;
    data: Record<string, unknown>;
  },
) => Promise<void>;
