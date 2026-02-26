import { prisma } from './db.js';

// =============================================================================
// Consciousness System (v3)
//
// The agent's continuous memory — a ModelMessage[] array that persists across
// every think cycle. The LLM sees it as one long interaction it walked through.
// =============================================================================

/**
 * ModelMessage type — mirrors the Vercel AI SDK's internal message format.
 * This is what the LLM actually sees in the messages array.
 */
export type ModelMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | AssistantContentPart[] }
  | { role: 'tool'; content: ToolResultPart[] };

export interface AssistantContentPart {
  type: 'text' | 'tool-call';
  text?: string;
  toolCallId?: string;
  toolName?: string;
  args?: unknown;
}

export interface ToolResultPart {
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  result: unknown;
}

// =============================================================================
// Configuration defaults
// =============================================================================

const DEFAULT_MAX_TOKENS = 100_000;
const DEFAULT_MIN_RECENT_CYCLES = 10;

/** Rough estimate: ~4 chars per token for English text */
const CHARS_PER_TOKEN = 4;

// =============================================================================
// Token estimation
// =============================================================================

/**
 * Estimate the token count of a consciousness array.
 * Uses a simple character-based heuristic. Good enough for budget tracking —
 * the actual tokenizer count will vary by model.
 */
export function estimateTokens(messages: ModelMessage[]): number {
  let totalChars = 0;

  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      totalChars += msg.content.length;
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if ('text' in part && typeof part.text === 'string') {
          totalChars += part.text.length;
        }
        if ('args' in part) {
          totalChars += JSON.stringify(part.args).length;
        }
        if ('result' in part) {
          totalChars += JSON.stringify(part.result).length;
        }
      }
    }
    // Add overhead for role, structure, etc.
    totalChars += 20;
  }

  return Math.ceil(totalChars / CHARS_PER_TOKEN);
}

// =============================================================================
// Load / Save
// =============================================================================

/**
 * Load consciousness from DB.
 * Returns empty array if no consciousness record exists (first cycle).
 */
export async function loadConsciousness(agentEntityId: string): Promise<{
  messages: ModelMessage[];
  cycleCount: number;
}> {
  const record = await prisma.agentConsciousness.findUnique({
    where: { agentEntityId },
  });

  if (!record) {
    return { messages: [], cycleCount: 0 };
  }

  return {
    messages: record.messages as unknown as ModelMessage[],
    cycleCount: record.cycleCount,
  };
}

/**
 * Save consciousness to DB after a think cycle.
 * Uses upsert — creates on first save, updates thereafter.
 */
export async function saveConsciousness(
  agentEntityId: string,
  messages: ModelMessage[],
  cycleCount: number,
): Promise<void> {
  const tokenEstimate = estimateTokens(messages);

  await prisma.agentConsciousness.upsert({
    where: { agentEntityId },
    create: {
      agentEntityId,
      messages: messages as any,
      cycleCount,
      tokenEstimate,
    },
    update: {
      messages: messages as any,
      cycleCount,
      tokenEstimate,
      lastCycleAt: new Date(),
    },
  });
}

// =============================================================================
// Compaction — Self-Summary Strategy
// =============================================================================

/**
 * Identify cycle boundaries in consciousness.
 * A cycle starts with a 'user' message (inbox events) and includes all
 * subsequent assistant/tool messages until the next 'user' message.
 */
interface Cycle {
  /** Index in the messages array where this cycle starts */
  startIndex: number;
  /** Index in the messages array where this cycle ends (exclusive) */
  endIndex: number;
  /** The messages in this cycle */
  messages: ModelMessage[];
}

/**
 * Determine if a user message content represents the start of a real cycle.
 * Real cycles start with "INBOX (" (from formatInboxEvents).
 * System-injected markers like "[step 2 | ...]", "[Cycle N complete ...]",
 * "[N new inbox event(s) waiting]", and "[EARLIER CYCLES ...]" are NOT cycle starts.
 */
function isCycleStart(content: string): boolean {
  return content.startsWith('INBOX (');
}

function extractCycles(messages: ModelMessage[]): Cycle[] {
  const cycles: Cycle[] = [];
  let currentStart = -1;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    // Skip the system prompt (always index 0)
    if (i === 0 && msg.role === 'system') continue;

    // A user message marks the start of a new cycle — but only real inbox
    // messages, not system-injected markers (step context, cycle timelines).
    // Real inbox messages start with "INBOX (".
    if (msg.role === 'user' && typeof msg.content === 'string' && isCycleStart(msg.content)) {
      if (currentStart >= 0) {
        cycles.push({
          startIndex: currentStart,
          endIndex: i,
          messages: messages.slice(currentStart, i),
        });
      }
      currentStart = i;
    }
  }

  // Close the last cycle
  if (currentStart >= 0) {
    cycles.push({
      startIndex: currentStart,
      endIndex: messages.length,
      messages: messages.slice(currentStart),
    });
  }

  return cycles;
}

/**
 * Extract the agent's self-summary from a cycle.
 * The agent's final text output (assistant message with string content)
 * serves as a natural summary of what it did.
 * Also extracts the cycle timestamp from the inbox header for temporal context.
 */
function extractCycleSummary(cycle: Cycle): string | null {
  // Walk backwards to find the last assistant text message
  let summary: string | null = null;
  for (let i = cycle.messages.length - 1; i >= 0; i--) {
    const msg = cycle.messages[i];
    if (msg.role === 'assistant' && typeof msg.content === 'string' && msg.content.trim()) {
      summary = msg.content.trim();
      break;
    }
  }
  if (!summary) return null;

  // Try to extract timestamp from the cycle's inbox header or timeline marker
  const cycleTimestamp = extractCycleTimestamp(cycle);
  if (cycleTimestamp) {
    return `[${cycleTimestamp}] ${summary}`;
  }
  return summary;
}

/**
 * Extract a timestamp string from a cycle's messages.
 * Looks for the INBOX header ("now=...") or cycle timeline marker.
 */
function extractCycleTimestamp(cycle: Cycle): string | null {
  for (const msg of cycle.messages) {
    if (msg.role === 'user' && typeof msg.content === 'string') {
      // Match "now=2026-02-26T13:42:00.000Z" from INBOX header
      const inboxMatch = msg.content.match(/now=([\d\-T:.Z]+)/);
      if (inboxMatch) return inboxMatch[1];
      // Match "Cycle N complete" timeline markers
      const cycleMatch = msg.content.match(/Cycle \d+ complete/);
      if (cycleMatch) return cycleMatch[0];
    }
  }
  return null;
}

/**
 * Compact consciousness when it exceeds the token budget.
 *
 * Strategy (self-summary):
 * 1. Keep the system prompt (always first message)
 * 2. Keep the last N cycles in full detail
 * 3. For older cycles, extract only the agent's self-summary text
 * 4. Collapse old summaries into a single user message
 *
 * This is zero-cost — no extra LLM call needed. The summaries are
 * high-quality because the agent wrote them itself with full context.
 */
export function compactConsciousness(
  messages: ModelMessage[],
  maxTokens: number = DEFAULT_MAX_TOKENS,
  minRecentCycles: number = DEFAULT_MIN_RECENT_CYCLES,
): ModelMessage[] {
  const tokenCount = estimateTokens(messages);

  // No compaction needed
  if (tokenCount <= maxTokens) {
    return messages;
  }

  // Extract system prompt
  const systemPrompt = messages[0]?.role === 'system' ? messages[0] : null;
  const withoutSystem = systemPrompt ? messages.slice(1) : messages;

  // Extract cycles
  const cycles = extractCycles(systemPrompt ? messages : withoutSystem);

  if (cycles.length <= minRecentCycles) {
    // Not enough cycles to compact — return as-is
    return messages;
  }

  // Split into old and recent
  const splitPoint = cycles.length - minRecentCycles;
  const oldCycles = cycles.slice(0, splitPoint);
  const recentCycles = cycles.slice(splitPoint);

  // Extract self-summaries from old cycles
  const summaries: string[] = [];
  for (const cycle of oldCycles) {
    const summary = extractCycleSummary(cycle);
    if (summary) {
      summaries.push(summary);
    }
  }

  // Build compacted consciousness
  const compacted: ModelMessage[] = [];

  // 1. System prompt
  if (systemPrompt) {
    compacted.push(systemPrompt);
  }

  // 2. Old cycle summaries (if any)
  if (summaries.length > 0) {
    compacted.push({
      role: 'user',
      content: `[EARLIER CYCLES — self-summaries]\n${summaries.join('\n')}`,
    });
  }

  // 3. Recent cycles in full
  for (const cycle of recentCycles) {
    compacted.push(...cycle.messages);
  }

  return compacted;
}

// =============================================================================
// System Prompt Refresh
// =============================================================================

/**
 * Refresh the system prompt at the start of each cycle.
 * Replaces the first message (if system) or prepends a new one.
 * Dynamic fields (time, spaces, goals, memories, plans) are updated.
 */
export function refreshSystemPrompt(
  consciousness: ModelMessage[],
  newSystemPrompt: string,
): ModelMessage[] {
  const systemMsg: ModelMessage = { role: 'system', content: newSystemPrompt };

  if (consciousness.length === 0) {
    return [systemMsg];
  }

  if (consciousness[0].role === 'system') {
    return [systemMsg, ...consciousness.slice(1)];
  }

  return [systemMsg, ...consciousness];
}
