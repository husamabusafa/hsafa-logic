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
// Run Action Log — tracks everything the agent does during a run
// =============================================================================

export interface RunActionEntry {
  /** Monotonic index within this run */
  step: number;
  /** ISO timestamp */
  timestamp: string;
  /** What the agent did */
  action: 'tool_call' | 'message_sent' | 'space_entered';
  /** Tool name (for tool_call) */
  toolName?: string;
  /** Summarized tool args (for tool_call) */
  toolArgs?: Record<string, unknown>;
  /** Tool result summary (for tool_call) */
  toolResult?: unknown;
  /** Space ID (for space_entered / message_sent) */
  spaceId?: string;
  /** Space name (for space_entered / message_sent) */
  spaceName?: string;
  /** Message content preview (for message_sent) */
  messagePreview?: string;
  /** Message ID (for message_sent) */
  messageId?: string;
}

export interface RunActionLog {
  /** All actions taken so far in this run */
  entries: RunActionEntry[];
  /** Append a new action */
  add(entry: Omit<RunActionEntry, 'step' | 'timestamp'>): void;
  /** Get a compact summary for embedding in message metadata */
  toSummary(): RunActionSummary;
}

export interface RunActionSummary {
  toolsCalled: { name: string; args?: Record<string, unknown> }[];
  messagesSent: { spaceId: string; spaceName?: string; preview: string }[];
  spacesEntered: { spaceId: string; spaceName?: string }[];
}

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
  /** In-memory action log — tracks tools called, messages sent, spaces entered */
  actionLog: RunActionLog;
  /** Trigger context for embedding in message metadata */
  triggerSummary: {
    type: string;
    senderName?: string;
    senderType?: string;
    messageContent?: string;
    spaceName?: string;
    spaceId?: string;
    serviceName?: string;
    planName?: string;
  };
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
