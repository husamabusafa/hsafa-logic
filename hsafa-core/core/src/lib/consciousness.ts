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

export async function loadConsciousness(haseefId: string): Promise<{
  messages: ModelMessage[];
  cycleCount: number;
  metadata: ConsciousnessMetadata;
}> {
  const record = await prisma.haseefConsciousness.findUnique({
    where: { haseefId },
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
  haseefId: string,
  messages: ModelMessage[],
  cycleCount: number,
  metadata?: ConsciousnessMetadata,
): Promise<void> {
  const tokenEstimate = estimateTokens(messages);

  await prisma.haseefConsciousness.upsert({
    where: { haseefId },
    create: {
      haseefId,
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
 * Prefers the done() tool's summary arg (explicit, high-quality) over
 * the old backwards-scan for the last assistant text (implicit, lossy).
 * Also extracts the cycle timestamp from the inbox header for temporal context.
 */
function extractCycleSummary(cycle: Cycle): string | null {
  // Primary: look for done() tool call with a summary arg
  let summary = extractDoneSummary(cycle);

  // Fallback: walk backwards to find the last assistant text message
  if (!summary) {
    for (let i = cycle.messages.length - 1; i >= 0; i--) {
      const msg = cycle.messages[i];
      if (msg.role === 'assistant' && typeof msg.content === 'string' && msg.content.trim()) {
        summary = msg.content.trim();
        break;
      }
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
 * Extract the summary from a done() tool call in the cycle.
 * The done tool accepts { summary?: string } — when present, this is the
 * highest-quality summary because the agent explicitly wrote it.
 */
function extractDoneSummary(cycle: Cycle): string | null {
  for (const msg of cycle.messages) {
    if (msg.role !== 'assistant' || typeof msg.content === 'string') continue;
    for (const part of msg.content) {
      if (part.type === 'tool-call' && part.toolName === 'done' && part.args) {
        const summary = (part.args as Record<string, unknown>).summary;
        if (typeof summary === 'string' && summary.trim()) {
          return summary.trim();
        }
      }
    }
  }
  return null;
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
// Identity-critical detection (§6.7 — Deterministic, tool-call-based)
//
// The compaction system preserves three categories of critical content:
//
//   1. SELF-DEVELOPMENT — cycles where the Haseef called set_memories
//      with self:* keys (identity, values, capabilities, etc.)
//
//   2. RELATIONSHIP MILESTONES — cycles where the Haseef called
//      set_memories with person-model:* or about:* keys
//
//   3. WILL DEVELOPMENT — cycles where the Haseef called set_goals,
//      delete_goals, set_plans, or delete_plans
//
// Detection is 100% deterministic: scan the cycle's actual tool calls
// instead of guessing from summary text with regex. Identity development
// is too important to rely on pattern matching.
//
// These are ALWAYS preserved during compaction. A Haseef that forgets
// how it came to know itself or others loses the foundation of identity.
// =============================================================================

export type IdentityTag = 'self' | 'relationship' | 'will';

/** Tool names that indicate will development */
const WILL_TOOLS = new Set(['set_goals', 'delete_goals', 'set_plans', 'delete_plans']);

/**
 * Classify a cycle's identity significance by scanning its actual tool calls.
 * Deterministic: checks toolName and args, not summary text.
 */
export function classifyCycleIdentity(cycle: Cycle): IdentityTag[] {
  const tags = new Set<IdentityTag>();

  for (const msg of cycle.messages) {
    if (msg.role !== 'assistant' || typeof msg.content === 'string') continue;

    // Assistant message with tool-call parts
    for (const part of msg.content) {
      if (part.type !== 'tool-call' || !part.toolName) continue;

      // Will development: set_goals, set_plans, etc.
      if (WILL_TOOLS.has(part.toolName)) {
        tags.add('will');
        continue;
      }

      // Self / relationship: check set_memories args for key prefixes
      if (part.toolName === 'set_memories' && part.args) {
        const memories = extractMemoryKeys(part.args);
        for (const key of memories) {
          if (key.startsWith('self:')) tags.add('self');
          if (key.startsWith('person-model:') || key.startsWith('about:')) tags.add('relationship');
        }
      }
    }
  }

  return [...tags];
}

/**
 * Extract memory keys from set_memories tool args.
 * Args can be { memories: [{ key, value }] } or { memories: { key: value } }.
 */
function extractMemoryKeys(args: unknown): string[] {
  if (!args || typeof args !== 'object') return [];
  const a = args as Record<string, unknown>;

  const memories = a.memories;
  if (Array.isArray(memories)) {
    // [{ key: "self:identity", value: "..." }]
    return memories
      .filter((m: unknown) => m && typeof m === 'object' && 'key' in (m as Record<string, unknown>))
      .map((m: unknown) => String((m as Record<string, unknown>).key));
  }
  if (memories && typeof memories === 'object' && !Array.isArray(memories)) {
    // { "self:identity": "..." }
    return Object.keys(memories as Record<string, unknown>);
  }
  return [];
}

/** Backwards-compatible wrapper: classify by summary text as fallback */
export function classifyIdentityCritical(summary: string): IdentityTag[] {
  // Fallback for compacted summaries that no longer have tool call data.
  // Checks for tool-name mentions in the summary text.
  const tags: IdentityTag[] = [];
  if (/set_memories.*self:/i.test(summary) || /self:(identity|values|capabilities|personality|limitations|purpose|growth)/i.test(summary)) {
    tags.push('self');
  }
  if (/set_memories.*(person-model:|about:)/i.test(summary) || /person-model:/i.test(summary)) {
    tags.push('relationship');
  }
  if (/set_goals|set_plans|delete_goals|delete_plans/i.test(summary)) {
    tags.push('will');
  }
  return tags;
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

    // §6.7: Deterministic tagging from actual tool calls (primary),
    // with text-based fallback for already-compacted summaries
    const tags = classifyCycleIdentity(cycle);
    const effectiveTags = tags.length > 0 ? tags : classifyIdentityCritical(summary);

    if (effectiveTags.length === 0) {
      regularSummaries.push(summary);
    } else {
      if (effectiveTags.includes('self')) selfDevelopment.push(summary);
      if (effectiveTags.includes('relationship')) relationshipMilestones.push(summary);
      if (effectiveTags.includes('will')) willDevelopment.push(summary);
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
// Consciousness Snapshots (§6.3)
//
// Periodic backups of consciousness stored in Postgres.
// Supports manual snapshots via API and auto-snapshots before compaction.
// =============================================================================

const AUTO_SNAPSHOT_INTERVAL = 50; // Auto-snapshot every N cycles

/**
 * Create a consciousness snapshot.
 */
export async function createSnapshot(
  haseefId: string,
  reason: 'auto' | 'manual' | 'pre-compaction' = 'manual',
): Promise<{ id: string; cycleCount: number; tokenEstimate: number }> {
  const consciousness = await loadConsciousness(haseefId);

  if (consciousness.messages.length === 0) {
    throw new Error('No consciousness to snapshot');
  }

  const tokenEst = estimateTokens(consciousness.messages);

  const snapshot = await prisma.consciousnessSnapshot.create({
    data: {
      haseefId,
      cycleCount: consciousness.cycleCount,
      messages: consciousness.messages as any,
      tokenEstimate: tokenEst,
      reason,
    },
  });

  return {
    id: snapshot.id,
    cycleCount: snapshot.cycleCount,
    tokenEstimate: snapshot.tokenEstimate,
  };
}

/**
 * List snapshots for a Haseef (most recent first).
 */
export async function listSnapshots(
  haseefId: string,
  limit: number = 20,
): Promise<Array<{ id: string; cycleCount: number; tokenEstimate: number; reason: string | null; createdAt: Date }>> {
  return prisma.consciousnessSnapshot.findMany({
    where: { haseefId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      cycleCount: true,
      tokenEstimate: true,
      reason: true,
      createdAt: true,
    },
  });
}

/**
 * Restore consciousness from a snapshot.
 * Overwrites current consciousness with snapshot data.
 */
export async function restoreSnapshot(
  haseefId: string,
  snapshotId: string,
): Promise<{ cycleCount: number; tokenEstimate: number }> {
  const snapshot = await prisma.consciousnessSnapshot.findUnique({
    where: { id: snapshotId },
  });

  if (!snapshot || snapshot.haseefId !== haseefId) {
    throw new Error('Snapshot not found');
  }

  const messages = snapshot.messages as unknown as ModelMessage[];

  // Save a pre-restore snapshot of current state
  await createSnapshot(haseefId, 'pre-compaction').catch(() => {});

  await saveConsciousness(haseefId, messages, snapshot.cycleCount);

  return {
    cycleCount: snapshot.cycleCount,
    tokenEstimate: snapshot.tokenEstimate,
  };
}

/**
 * Check if an auto-snapshot is due and create one if so.
 * Called after saving consciousness each cycle.
 */
export async function maybeAutoSnapshot(
  haseefId: string,
  cycleCount: number,
): Promise<void> {
  if (cycleCount <= 0 || cycleCount % AUTO_SNAPSHOT_INTERVAL !== 0) return;

  try {
    await createSnapshot(haseefId, 'auto');
    console.log(`[consciousness] Auto-snapshot at cycle ${cycleCount} for ${haseefId}`);
  } catch (err) {
    console.warn(`[consciousness] Auto-snapshot failed:`, err);
  }
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
