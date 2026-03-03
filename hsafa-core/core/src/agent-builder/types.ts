// =============================================================================
// Haseef Builder — Types (v4)
// =============================================================================
// Zod schemas + TS types for Haseef configJson and the runtime context passed
// to every prebuilt tool execute function.

import { z } from 'zod';

// =============================================================================
// Agent Config JSON Schema
// =============================================================================

/** LLM provider + model config. Lives in Haseef.configJson.model */
export const ModelConfigSchema = z.object({
  /** Provider identifier: 'openai' | 'anthropic' | 'google' | 'openrouter' | 'xai' */
  provider: z.string(),
  /** Model name as the provider expects it (e.g. 'gpt-4o', 'claude-3-5-sonnet-20241022') */
  model: z.string(),
  temperature: z.number().optional(),
  maxTokens: z.number().optional(),
  /** Enable reasoning/thinking for supported models */
  reasoning: z
    .object({
      enabled: z.boolean().optional(),
      effort: z.enum(['low', 'medium', 'high']).optional(),
      summary: z.enum(['auto', 'always', 'never']).optional(),
    })
    .optional(),
});

export type ModelConfig = z.infer<typeof ModelConfigSchema>;

/** One custom tool definition in the Haseef's configJson. */
export const ToolConfigSchema = z.object({
  name: z.string(),
  description: z.string(),
  /** JSON Schema object for the tool's input parameters */
  inputSchema: z.record(z.string(), z.unknown()),
  /**
   * Who executes this tool:
   * - gateway  — HTTP call to a URL. Always inline.
   * - external — SDK / external server handles execution. Result submitted via API.
   * - internal — No execution; returns input args as result immediately.
   */
  executionType: z.enum(['gateway', 'external', 'internal']),
  /**
   * Whether the tool call is visible to connected extensions.
   * Default: true for gateway/external, false for internal.
   */
  visible: z.boolean().optional(),
  /**
   * If true, the tool returns { status: 'pending' } immediately and the real
   * result arrives via inbox in a later cycle. If false (default), the tool
   * blocks until the result is available (up to `timeout` ms).
   */
  isAsync: z.boolean().optional(),
  /**
   * Max milliseconds to wait for the tool result when isAsync is false.
   * Only relevant for tools without a URL (external).
   * After timeout, the tool returns an error — the Haseef never waits forever.
   * Default: 30000 (30s).
   */
  timeout: z.number().optional(),
  /** Type-specific execution config (URL, method, headers, etc.) */
  execution: z.record(z.string(), z.unknown()).optional(),
});

export type ToolConfig = z.infer<typeof ToolConfigSchema>;

/** MCP server configuration */
export const McpServerSchema = z.object({
  name: z.string(),
  url: z.string(),
  transport: z.enum(['http', 'sse', 'stdio']).optional(),
  allowedTools: z.array(z.string()).optional(),
});

/** v3 consciousness configuration */
export const ConsciousnessConfigSchema = z.object({
  /** Maximum tokens in consciousness before compaction triggers */
  maxTokens: z.number().optional(),
  /** Always keep at least the last N cycles in full detail */
  minRecentCycles: z.number().optional(),
  /** Compaction strategy: 'summarize' (self-summary) | 'semantic' | 'layered' */
  compactionStrategy: z.enum(['summarize', 'semantic', 'layered']).optional(),
});

export type ConsciousnessConfig = z.infer<typeof ConsciousnessConfigSchema>;

/** v3 loop configuration */
export const LoopConfigSchema = z.object({
  maxSteps: z.number().optional(),
  maxTokensPerCycle: z.number().optional(),
  toolChoice: z.string().optional(),
});

export type LoopConfig = z.infer<typeof LoopConfigSchema>;

/** Full Haseef configJson shape */
export const HaseefConfigSchema = z.object({
  /** Config version */
  version: z.string().optional(),
  /** LLM model config */
  model: ModelConfigSchema,
  /** Haseef's system instructions (freeform text, injected after context blocks) */
  instructions: z.string().optional(),
  /** Custom tool definitions */
  tools: z.array(ToolConfigSchema).optional(),
  /** MCP server connections */
  mcp: z
    .object({
      servers: z.array(McpServerSchema).optional(),
    })
    .optional(),
  /** Consciousness settings */
  consciousness: ConsciousnessConfigSchema.optional(),
  /** Think cycle loop settings */
  loop: LoopConfigSchema.optional(),
  /** Middleware stack names */
  middleware: z.array(z.string()).optional(),
});

export type HaseefConfig = z.infer<typeof HaseefConfigSchema>;

// =============================================================================
// SenseEvent & Inbox Event Types (v4)
//
// All input to the core comes through one uniform type: SenseEvent.
// Extensions push sense events; the core doesn't interpret channel or type —
// it passes them to the LLM as context.
// =============================================================================

/**
 * The universal input type for the Haseef's inbox.
 * Every external event — message, email, sensor reading, plan trigger,
 * tool result — arrives as a SenseEvent.
 */
export interface SenseEvent {
  /** Which extension/source sent this: e.g. "ext-spaces", "ext-email", "core" */
  channel: string;
  /** Specific source within the extension: e.g. a room ID, mailbox, planId */
  source: string;
  /** Event type: "message", "plan", "tool_result", "alert", "reading", etc. */
  type: string;
  /** The actual payload — varies per extension/event type */
  data: Record<string, unknown>;
  /** ISO timestamp */
  timestamp: string;
}

/**
 * InboxEvent wraps a SenseEvent with a dedup key for the inbox system.
 * This is what gets pushed to Redis and stored in Postgres.
 */
export interface InboxEvent extends SenseEvent {
  /** Dedup key — prevents the same event from being processed twice */
  eventId: string;
}

// --- Well-known data shapes for core-internal events -------------------------

export interface PlanEventData {
  planId: string;
  planName: string;
  instruction: string;
}

export interface ServiceEventData {
  serviceName: string;
  payload: Record<string, unknown>;
}

export interface ToolResultEventData {
  toolCallId: string;
  toolName: string;
  /** The cycle (run) that originally called this tool */
  originRunId: string;
  /** The actual result from the external source / user */
  result: unknown;
}

// --- Well-known channels & types (core-internal only) ------------------------

export const CHANNEL = {
  CORE: 'core',
} as const;

export const SENSE_TYPE = {
  MESSAGE: 'message',
  PLAN: 'plan',
  SERVICE: 'service',
  TOOL_RESULT: 'tool_result',
} as const;

// =============================================================================
// Haseef Process Context (v4)
// =============================================================================

export interface HaseefProcessContext {
  haseefEntityId: string;
  haseefName: string;
  /** Haseef's DB id (for memory/goal/plan queries) */
  haseefId: string;
  /** Current cycle number (monotonically increasing) */
  cycleCount: number;
  /** The run ID for the current think cycle (audit record) */
  currentRunId: string | null;
}

/**
 * Extract HaseefProcessContext from a tool's experimental_context.
 * Tools read context from execute's second arg instead of closure.
 */
export function getCtx(options: { experimental_context?: unknown }): HaseefProcessContext {
  return options.experimental_context as HaseefProcessContext;
}

// =============================================================================
// Build result returned from builder.ts
// =============================================================================

export interface BuiltHaseef {
  /** AI SDK–compatible tools object (prebuilt + custom + extension) */
  tools: Record<string, unknown>;
  /** The resolved LLM model instance */
  model: unknown;
  /** Active MCP clients — must be closed on Haseef shutdown */
  mcpClients: Array<{ name: string; close: () => Promise<void> }>;
  /** v4: Prompt instructions from connected extensions */
  extensionInstructions: string[];
}
