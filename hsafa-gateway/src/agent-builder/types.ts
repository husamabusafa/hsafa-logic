// =============================================================================
// Agent Builder — Types
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
      /** 'auto' = provider decides whether to summarize reasoning */
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
   * - gateway  — HTTP request / compute, executed server-side immediately
   * - external — Forwarded to an external webhook; run pauses (waiting_tool)
   * - space    — Rendered in the active space; user provides result (waiting_tool)
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

/** Full agent configJson shape */
export const AgentConfigSchema = z.object({
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
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

// =============================================================================
// Runtime context passed to every prebuilt tool execute function
// =============================================================================

export interface RunContext {
  runId: string;
  agentEntityId: string;
  agentName: string;
  /** Agent's DB id (for memory/goal/plan queries) */
  agentId: string;
  /** The space that triggered this run (for space_message triggers) */
  triggerSpaceId: string | null;
  /** Trigger type: 'space_message' | 'plan' | 'service' */
  triggerType: string;
  /**
   * Returns the current activeSpaceId. Mutable — changes when enter_space is
   * called. Closure so prebuilt tools always see the latest value.
   */
  getActiveSpaceId: () => string | null;
  /**
   * Called by enter_space to update the active space at the run level.
   * Updates both the in-memory value and the DB record.
   */
  setActiveSpaceId: (spaceId: string) => Promise<void>;
}

// =============================================================================
// Build result returned from builder.ts
// =============================================================================

export interface BuiltAgent {
  /** AI SDK–compatible tools object (prebuilt + custom) */
  tools: Record<string, unknown>;
  /** Names of tools whose input/result should be posted to the active space */
  visibleToolNames: Set<string>;
  /** Names of tools that lack an execute function (external/space) — trigger waiting_tool */
  clientToolNames: Set<string>;
  /** The resolved LLM model instance */
  model: unknown;
}
