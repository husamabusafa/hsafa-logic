// =============================================================================
// Agent Builder — Types (v3)
// =============================================================================
// Zod schemas + TS types for agent configJson and the runtime context passed
// to every prebuilt tool execute function.

import { z } from 'zod';

// =============================================================================
// Agent Config JSON Schema
// =============================================================================

/** LLM provider + model config. Lives in Agent.configJson.model */
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

/** One custom tool definition in the agent's configJson. */
export const ToolConfigSchema = z.object({
  name: z.string(),
  description: z.string(),
  /** JSON Schema object for the tool's input parameters */
  inputSchema: z.record(z.string(), z.unknown()),
  /**
   * Who executes this tool:
   * - gateway  — HTTP request / compute, executed server-side immediately (inline)
   * - external — Forwarded to an external webhook. Inline if execution.url exists, otherwise async (result via inbox)
   * - space    — Rendered in the active space; user provides result. Always async (result via inbox)
   * - internal — No execution; result is static or provided inline
   */
  executionType: z.enum(['gateway', 'external', 'space', 'internal']),
  /**
   * Whether input + result are posted to the active space as a message.
   * Default: true for gateway/external/space, false for internal.
   */
  visible: z.boolean().optional(),
  /** Type-specific execution config (URL, method, headers, etc.) */
  execution: z.record(z.string(), z.unknown()).optional(),
  /** Display config for space-rendered tools */
  display: z
    .object({
      customUI: z.string().optional(),
    })
    .optional(),
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

/** Full agent configJson shape (v3) */
export const AgentConfigSchema = z.object({
  /** Config version */
  version: z.string().optional(),
  /** LLM model config */
  model: ModelConfigSchema,
  /** Agent's system instructions (freeform text, injected after context blocks) */
  instructions: z.string().optional(),
  /** Custom tool definitions */
  tools: z.array(ToolConfigSchema).optional(),
  /** MCP server connections */
  mcp: z
    .object({
      servers: z.array(McpServerSchema).optional(),
    })
    .optional(),
  /** v3: Consciousness settings */
  consciousness: ConsciousnessConfigSchema.optional(),
  /** v3: Think cycle loop settings */
  loop: LoopConfigSchema.optional(),
  /** v3: Middleware stack names */
  middleware: z.array(z.string()).optional(),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

// =============================================================================
// Inbox Event Types (v3)
// =============================================================================

export interface InboxEvent {
  eventId: string;
  type: 'space_message' | 'plan' | 'service' | 'tool_result';
  timestamp: string;
  data: SpaceMessageEventData | PlanEventData | ServiceEventData | ToolResultEventData;
}

export interface SpaceMessageEventData {
  spaceId: string;
  spaceName: string;
  messageId: string;
  senderEntityId: string;
  senderName: string;
  senderType: 'human' | 'agent';
  content: string;
}

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

// =============================================================================
// Agent Process Context (v3) — replaces RunContext
// =============================================================================

export interface AgentProcessContext {
  agentEntityId: string;
  agentName: string;
  /** Agent's DB id (for memory/goal/plan queries) */
  agentId: string;
  /** Current cycle number (monotonically increasing) */
  cycleCount: number;
  /** The run ID for the current think cycle (audit record) */
  currentRunId: string | null;
  /**
   * Returns the current activeSpaceId. Mutable — changes when enter_space is
   * called. In-memory only (not persisted to DB in v3).
   */
  getActiveSpaceId: () => string | null;
  /**
   * Called by enter_space to update the active space within the process.
   * In-memory only — no DB write.
   */
  setActiveSpaceId: (spaceId: string) => void;
}

// =============================================================================
// Build result returned from builder.ts
// =============================================================================

export interface BuiltAgent {
  /** AI SDK–compatible tools object (prebuilt + custom) */
  tools: Record<string, unknown>;
  /** Names of tools whose input/result should be posted to the active space */
  visibleToolNames: Set<string>;
  /** Names of async tools (space/external-no-url) — execute returns pending, real result via inbox */
  asyncToolNames: Set<string>;
  /** The resolved LLM model instance */
  model: unknown;
}
