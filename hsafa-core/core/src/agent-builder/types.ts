// =============================================================================
// Haseef Builder — Types (v5)
// =============================================================================
// Zod schemas + TS types for Haseef configJson and the runtime context passed
// to every prebuilt tool execute function.

import { z } from 'zod';
import type { LanguageModel, ToolSet } from 'ai';

// =============================================================================
// Config JSON Schema
// =============================================================================

/** LLM provider + model config. Lives in Haseef.configJson.model */
export const ModelConfigSchema = z.object({
  /** Provider identifier: 'openai' | 'anthropic' | 'google' | 'openrouter' | 'xai' */
  provider: z.string(),
  /** Model name as the provider expects it (e.g. 'claude-sonnet-4-20250514') */
  model: z.string(),
  temperature: z.number().optional(),
  maxTokens: z.number().optional(),
  /** Optional per-user API key override (injected by spaces server, never exposed to clients) */
  apiKey: z.string().optional(),
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

/** Embedding model config for memories + archive semantic search */
export const EmbeddingModelConfigSchema = z.object({
  provider: z.string(),
  model: z.string(),
});

export type EmbeddingModelConfig = z.infer<typeof EmbeddingModelConfigSchema>;

/** MCP server connection config */
export const MCPServerConfigSchema = z.object({
  /** Display name for logging */
  name: z.string().optional(),
  /** Transport type: 'http' (recommended), 'sse', or 'stdio' */
  transport: z.enum(['http', 'sse', 'stdio']),
  /** Server URL (required for http/sse) */
  url: z.string().optional(),
  /** Additional HTTP headers (optional, for http/sse) */
  headers: z.record(z.string(), z.string()).optional(),
  /** Command to run (required for stdio) */
  command: z.string().optional(),
  /** Arguments for stdio command */
  args: z.array(z.string()).optional(),
});

export type MCPServerConfig = z.infer<typeof MCPServerConfigSchema>;

/** Consciousness settings */
export const ConsciousnessConfigSchema = z.object({
  /** Maximum tokens in consciousness before archival triggers */
  maxTokens: z.number().optional(),
});

export type ConsciousnessConfig = z.infer<typeof ConsciousnessConfigSchema>;

/** Persona config — defines how the Haseef communicates */
export const PersonaConfigSchema = z.object({
  /** Prebuilt persona ID (e.g. "the-professor", "the-comedian") or "custom" */
  id: z.string(),
  /** Display name of the persona */
  name: z.string(),
  /** Personality description injected into the system prompt */
  description: z.string(),
  /** Communication style guidelines */
  style: z.string().optional(),
  /** Example phrases or mannerisms */
  traits: z.array(z.string()).optional(),
});

export type PersonaConfig = z.infer<typeof PersonaConfigSchema>;

/** Full Haseef configJson shape */
export const HaseefConfigSchema = z.object({
  /** LLM model config */
  model: ModelConfigSchema,
  /** Embedding model for memories + archive */
  embeddingModel: EmbeddingModelConfigSchema.optional(),
  /** Haseef's system instructions (freeform text, injected after context blocks) */
  instructions: z.string().optional(),
  /** Persona — defines tone, style, and personality */
  persona: PersonaConfigSchema.optional(),
  /** Consciousness settings */
  consciousness: ConsciousnessConfigSchema.optional(),
  /** Default timeout for sync action dispatch (ms) */
  actionTimeout: z.number().optional(),
  /** MCP servers to connect to each cycle */
  mcpServers: z.array(MCPServerConfigSchema).optional(),
});

export type HaseefConfig = z.infer<typeof HaseefConfigSchema>;

// =============================================================================
// SenseEvent (v5)
//
// All input to the core comes through one uniform type: SenseEvent.
// Services push events; the core doesn't interpret scope or type —
// it passes them to the LLM as context.
// =============================================================================

/** Binary attachment on a sense event (images, audio, files) */
export interface Attachment {
  type: 'image' | 'audio' | 'file';
  mimeType: string;
  url?: string;
  base64?: string;
  name?: string;
}

/**
 * The universal input type for the Haseef's inbox.
 * Every external event — message, sensor reading, reminder, tool result —
 * arrives as a SenseEvent.
 */
export interface SenseEvent {
  /** Dedup key — prevents the same event from being processed twice */
  eventId: string;
  /** Which service sent this: "spaces", "whatsapp", "core", etc. */
  scope: string;
  /** Event type: "message", "sensor_update", "reminder", etc. */
  type: string;
  /** The actual payload — varies per service/event type */
  data: Record<string, unknown>;
  /** Multimodal attachments — images, audio, files */
  attachments?: Attachment[];
  /** ISO timestamp */
  timestamp?: string;
}

// =============================================================================
// Haseef Process Context (v5)
// =============================================================================

export interface HaseefProcessContext {
  haseefId: string;
  haseefName: string;
  /** Current cycle number (monotonically increasing) */
  cycleCount: number;
  /** The run ID for the current think cycle (audit record) */
  currentRunId: string | null;
}

// =============================================================================
// Build result returned from builder.ts
// =============================================================================

export interface BuiltHaseef {
  /** AI SDK–compatible tools object (prebuilt + scoped + MCP) */
  tools: ToolSet;
  /** The resolved LLM model instance */
  model: LanguageModel;
  /** Active MCP clients to close after cycle completes */
  mcpClients: Array<{ close(): Promise<void> }>;
}
