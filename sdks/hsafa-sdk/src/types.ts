// =============================================================================
// @hsafa/sdk — Types
// =============================================================================

export interface SdkOptions {
  coreUrl: string;
  apiKey: string;
  skill: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  input?: Record<string, string>; // "string" | "number?" | "string[]" | "object" | "boolean?"
  inputSchema?: unknown; // raw JSON Schema — used when input shorthand isn't enough
}

export interface HaseefContext {
  id: string;
  name: string;
  profile: Record<string, unknown>;
}

export interface ToolCallContext {
  actionId: string;
  haseef: HaseefContext;
}

export type ToolHandler = (
  args: Record<string, unknown>,
  ctx: ToolCallContext,
) => Promise<unknown>;

export interface PushEventPayload {
  type: string;
  data: Record<string, unknown>;
  attachments?: Attachment[];
  haseefId?: string;
  target?: Record<string, string>;
}

export interface Attachment {
  type: 'image' | 'audio' | 'file';
  mimeType: string;
  url?: string;
  base64?: string;
  name?: string;
}

// ── Tool Lifecycle Events ────────────────────────────────────────────────────

export interface ToolInputStartEvent {
  actionId: string;
  toolName: string;
  haseef: HaseefContext;
}

export interface ToolInputDeltaEvent {
  actionId: string;
  toolName: string;
  delta: string;
  partialArgs: Record<string, unknown>;
  haseef: HaseefContext;
}

export interface ToolCallEvent {
  actionId: string;
  toolName: string;
  args: Record<string, unknown>;
  haseef: HaseefContext;
}

export interface ToolResultEvent {
  actionId: string;
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
  durationMs: number;
  haseef: HaseefContext;
}

export interface ToolErrorEvent {
  actionId: string;
  toolName: string;
  error: string;
  haseef: HaseefContext;
}

export interface RunStartedEvent {
  runId: string;
  haseef: { id: string; name: string };
  triggerSkill: string | null;
  triggerType: string | null;
}

export interface RunCompletedEvent {
  runId: string;
  haseef: { id: string; name: string };
  summary?: string;
  durationMs: number;
}

export type SdkEventType =
  | 'tool.input.start'
  | 'tool.input.delta'
  | 'tool.call'
  | 'tool.result'
  | 'tool.error'
  | 'run.started'
  | 'run.completed';

export interface SdkEventMap {
  'tool.input.start': ToolInputStartEvent;
  'tool.input.delta': ToolInputDeltaEvent;
  'tool.call': ToolCallEvent;
  'tool.result': ToolResultEvent;
  'tool.error': ToolErrorEvent;
  'run.started': RunStartedEvent;
  'run.completed': RunCompletedEvent;
}

// =============================================================================
// Haseef API
// =============================================================================

export interface Haseef {
  id: string;
  name: string;
  description?: string | null;
  profileJson?: Record<string, unknown> | null;
  configJson?: Record<string, unknown>;
  skills?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateHaseefInput {
  name: string;
  description?: string;
  configJson: Record<string, unknown>;
  profileJson?: Record<string, unknown>;
  skills?: string[];
}

export interface UpdateHaseefInput {
  name?: string;
  description?: string;
  configJson?: Record<string, unknown>;
  profileJson?: Record<string, unknown>;
  skills?: string[];
}

// =============================================================================
// Memory API
// =============================================================================

export interface SemanticMemoryInput {
  key: string;
  value: string;
  importance?: number;
}

export interface SemanticMemory {
  id: string;
  haseefId: string;
  key: string;
  value: string;
  importance: number;
  recalledAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EpisodicMemory {
  id: string;
  haseefId: string;
  runId?: string | null;
  summary: string;
  context?: Record<string, unknown> | null;
  createdAt: string;
}

export interface SocialMemory {
  id: string;
  haseefId: string;
  personKey: string;
  observations: unknown;
  updatedAt: string;
}

export interface ProceduralMemory {
  id: string;
  haseefId: string;
  pattern: string;
  confidence: number;
  updatedAt: string;
}

export interface MemoryStats {
  haseefId: string;
  counts: { semantic: number; episodic: number; social: number; procedural: number };
  total: number;
}

// =============================================================================
// Runs API
// =============================================================================

export interface Run {
  id: string;
  haseefId: string;
  status: string;
  triggerSkill?: string | null;
  triggerType?: string | null;
  startedAt: string;
  completedAt?: string | null;
  durationMs?: number | null;
  summary?: string | null;
  tokensUsed?: number | null;
  toolCallCount?: number | null;
}

export interface ListRunsOptions {
  haseefId?: string;
  status?: string;
  limit?: number;
}
