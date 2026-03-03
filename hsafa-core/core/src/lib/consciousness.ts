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

const DEFAULT_MAX_TOKENS = 200_000;

/** Fraction of maxTokens reserved for recent full-detail cycles */
const RECENT_BUDGET_RATIO = 0.7;

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
export interface ConsciousnessMetadata {
  // v4: metadata is reserved for future runtime state.
  [key: string]: unknown;
}

export async function loadConsciousness(haseefEntityId: string): Promise<{
  messages: ModelMessage[];
  cycleCount: number;
  metadata: ConsciousnessMetadata;
}> {
  const record = await prisma.haseefConsciousness.findUnique({
    where: { haseefEntityId },
  });

  if (!record) {
    return { messages: [], cycleCount: 0, metadata: {} };
  }

  return {
    messages: record.messages as unknown as ModelMessage[],
    cycleCount: record.cycleCount,
    metadata: (record.metadata as ConsciousnessMetadata) ?? {},
  };
}

/**
 * Save consciousness to DB after a think cycle.
 * Uses upsert — creates on first save, updates thereafter.
 */
export async function saveConsciousness(
  haseefEntityId: string,
  messages: ModelMessage[],
  cycleCount: number,
  metadata?: ConsciousnessMetadata,
): Promise<void> {
  const tokenEstimate = estimateTokens(messages);

  await prisma.haseefConsciousness.upsert({
    where: { haseefEntityId },
    create: {
      haseefEntityId,
      messages: messages as any,
      cycleCount,
      tokenEstimate,
      metadata: metadata ? (metadata as any) : undefined,
    },
    update: {
      messages: messages as any,
      cycleCount,
      tokenEstimate,
      metadata: metadata ? (metadata as any) : undefined,
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

// =============================================================================
// Identity-critical detection (v4 — Phase 5)
//
// The compaction system preserves three categories of critical content:
//
//   1. SELF-DEVELOPMENT — cycles where the Haseef discovered/updated
//      something about itself (self:*, identity, values, capabilities)
//
//   2. RELATIONSHIP MILESTONES — cycles where the Haseef deepened its
//      understanding of a person (person-model:*, first interactions,
//      emotional moments, trust-building exchanges)
//
//   3. WILL DEVELOPMENT — cycles where the Haseef set goals, made
//      autonomous decisions, or acted proactively from its own values
//
// These are ALWAYS preserved during compaction. A Haseef that forgets
// how it came to know itself or others loses the foundation of identity.
// =============================================================================

// Self-development patterns
const SELF_PATTERNS = [
  /self[:\-_]model/i,
  /self:(identity|values|capabilities|personality|limitations|purpose|growth)/i,
  /who I am/i,
  /my identity/i,
  /my values/i,
  /my purpose/i,
  /learned about (myself|me)/i,
  /discovered.*about myself/i,
  /realized.*about (me|myself)/i,
  /I (am|feel|believe|care about|value)/i,
  /set_memories.*self:/i,
];

// Relationship milestone patterns
const RELATIONSHIP_PATTERNS = [
  /person[:\-_]model/i,
  /about:/i,
  /updated.*person.*model/i,
  /built.*model.*of/i,
  /first (time|interaction|conversation) with/i,
  /learned about \w+/i,
  /noticed.*about \w+/i,
  /\w+ (trusts|confided|opened up|shared)/i,
  /relationship with/i,
  /set_memories.*person-model:/i,
];

// Will development patterns
const WILL_PATTERNS = [
  /set_goals/i,
  /set a goal/i,
  /my goal/i,
  /decided to/i,
  /I want to/i,
  /I chose to/i,
  /proactively/i,
  /on my own initiative/i,
  /followed up/i,
  /anticipated/i,
  /scheduled.*plan/i,
  /set_plans/i,
];

export type IdentityTag = 'self' | 'relationship' | 'will';

/**
 * Check if a summary contains identity-critical content.
 * Returns the matching tags (may match multiple categories).
 */
export function classifyIdentityCritical(summary: string): IdentityTag[] {
  const tags: IdentityTag[] = [];
  if (SELF_PATTERNS.some((p) => p.test(summary))) tags.push('self');
  if (RELATIONSHIP_PATTERNS.some((p) => p.test(summary))) tags.push('relationship');
  if (WILL_PATTERNS.some((p) => p.test(summary))) tags.push('will');
  return tags;
}

function isIdentityCritical(summary: string): boolean {
  return classifyIdentityCritical(summary).length > 0;
}

/**
 * Compact consciousness when it exceeds the token budget.
 *
 * Strategy (token-budget-based with identity preservation):
 * 1. Keep the system prompt (always first message)
 * 2. Walk backwards through cycles — keep as many as fit in RECENT_BUDGET_RATIO
 *    of the token budget in full detail
 * 3. For older cycles, extract only the agent's self-summary text
 * 4. Identity-critical summaries (self-model, person-model updates) are ALWAYS
 *    preserved. Other summaries may be trimmed if the summary block is too large.
 * 5. Collapse old summaries into a single user message
 *
 * This naturally adapts: short cycles → more kept in full, long cycles → fewer.
 * Identity development is never lost through compaction.
 */
export function compactConsciousness(
  messages: ModelMessage[],
  maxTokens: number = DEFAULT_MAX_TOKENS,
): ModelMessage[] {
  const tokenCount = estimateTokens(messages);

  // No compaction needed
  if (tokenCount <= maxTokens) {
    return messages;
  }

  // Extract system prompt
  const systemPrompt = messages[0]?.role === 'system' ? messages[0] : null;

  // Extract cycles
  const cycles = extractCycles(messages);

  if (cycles.length <= 1) {
    // Not enough cycles to compact — return as-is
    return messages;
  }

  // Token-budget-based split: walk backwards, keep as many cycles as fit
  const recentBudget = maxTokens * RECENT_BUDGET_RATIO;
  let recentTokens = 0;
  let splitIndex = cycles.length;

  for (let i = cycles.length - 1; i >= 0; i--) {
    const cycleTokens = estimateTokens(cycles[i].messages);
    if (recentTokens + cycleTokens > recentBudget) break;
    recentTokens += cycleTokens;
    splitIndex = i;
  }

  // If everything fits, no compaction needed
  if (splitIndex === 0) return messages;

  const oldCycles = cycles.slice(0, splitIndex);
  const recentCycles = cycles.slice(splitIndex);

  // Extract self-summaries from old cycles, tagged by identity category
  const selfDevelopment: string[] = [];
  const relationshipMilestones: string[] = [];
  const willDevelopment: string[] = [];
  const regularSummaries: string[] = [];

  for (const cycle of oldCycles) {
    const summary = extractCycleSummary(cycle);
    if (!summary) continue;

    const tags = classifyIdentityCritical(summary);
    if (tags.length === 0) {
      regularSummaries.push(summary);
    } else {
      // A summary can belong to multiple categories — add to each
      if (tags.includes('self')) selfDevelopment.push(summary);
      if (tags.includes('relationship')) relationshipMilestones.push(summary);
      if (tags.includes('will')) willDevelopment.push(summary);
    }
  }

  // Budget for summaries: remaining tokens after system prompt + recent cycles
  const summaryBudget = maxTokens - recentTokens - (systemPrompt ? estimateTokens([systemPrompt]) : 0);

  // Build identity blocks (always preserved)
  const identityBlocks: string[] = [];
  if (selfDevelopment.length > 0) {
    identityBlocks.push(`Self-development:\n${selfDevelopment.join('\n')}`);
  }
  if (relationshipMilestones.length > 0) {
    identityBlocks.push(`Relationship milestones:\n${relationshipMilestones.join('\n')}`);
  }
  if (willDevelopment.length > 0) {
    identityBlocks.push(`Will development:\n${willDevelopment.join('\n')}`);
  }

  const identityBlock = identityBlocks.join('\n\n');
  const identityTokens = Math.ceil(identityBlock.length / CHARS_PER_TOKEN);
  const regularBudget = Math.max(0, summaryBudget - identityTokens - 100);

  // Trim regular summaries from oldest if they exceed budget
  let trimmedRegular = [...regularSummaries];
  let regularBlock = trimmedRegular.join('\n');
  while (trimmedRegular.length > 0 && Math.ceil(regularBlock.length / CHARS_PER_TOKEN) > regularBudget) {
    trimmedRegular.shift(); // drop oldest regular summary
    regularBlock = trimmedRegular.join('\n');
  }

  // Build compacted consciousness
  const compacted: ModelMessage[] = [];

  // 1. System prompt
  if (systemPrompt) {
    compacted.push(systemPrompt);
  }

  // 2. Identity-critical summaries — structured by category (always preserved)
  if (identityBlocks.length > 0) {
    compacted.push({
      role: 'user',
      content: `[IDENTITY DEVELOPMENT — always preserved through compaction]\n${identityBlock}`,
    });
  }

  // 3. Regular old cycle summaries
  if (trimmedRegular.length > 0) {
    compacted.push({
      role: 'user',
      content: `[EARLIER CYCLES — self-summaries]\n${trimmedRegular.join('\n')}`,
    });
  }

  // 4. Recent cycles in full
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
 * Dynamic fields (time, goals, memories, plans) are updated.
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
