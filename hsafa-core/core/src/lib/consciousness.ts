import { prisma } from './db.js';

// =============================================================================
// Consciousness System (v5)
//
// Two layers:
//   Recent  — last N cycles of full conversation (always in prompt)
//   Archive — older cycles, embedded and searchable (pulled when relevant)
//
// When recent exceeds budget → oldest cycles move to ConsciousnessArchive:
//   a. Summarize the cycle (compact text + temporal markers)
//   b. Embed the summary (vector for search) — done externally
//   c. Store both summary + original messages in ConsciousnessArchive
//   d. Remove from active consciousness
//
// The Haseef never truly forgets. Old cycles are archived, not deleted.
// =============================================================================

/**
 * ModelMessage type — mirrors the Vercel AI SDK's internal message format.
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
const CHARS_PER_TOKEN = 4;

// =============================================================================
// Token estimation
// =============================================================================

/**
 * Estimate the token count of a consciousness array.
 * Uses a simple character-based heuristic.
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
    totalChars += 20; // overhead for role, structure
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
export async function loadConsciousness(haseefId: string): Promise<{
  messages: ModelMessage[];
  cycleCount: number;
}> {
  const record = await prisma.haseefConsciousness.findUnique({
    where: { haseefId },
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
  haseefId: string,
  messages: ModelMessage[],
  cycleCount: number,
): Promise<void> {
  const tokenEstimate = estimateTokens(messages);

  await prisma.haseefConsciousness.upsert({
    where: { haseefId },
    create: {
      haseefId,
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
// Cycle extraction
// =============================================================================

interface Cycle {
  startIndex: number;
  endIndex: number;
  messages: ModelMessage[];
}

/**
 * Determine if a user message represents the start of a real cycle.
 * Real cycles start with "SENSE EVENTS (" (from formatInboxEvents).
 */
function isCycleStart(content: string): boolean {
  return content.startsWith('SENSE EVENTS (');
}

function extractCycles(messages: ModelMessage[]): Cycle[] {
  const cycles: Cycle[] = [];
  let currentStart = -1;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (i === 0 && msg.role === 'system') continue;

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
 * Extract the done() tool's summary from a cycle, or fall back to last assistant text.
 */
function extractCycleSummary(cycle: Cycle): string {
  // Primary: look for done() tool call with a summary arg
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

  // Fallback: last assistant text
  for (let i = cycle.messages.length - 1; i >= 0; i--) {
    const msg = cycle.messages[i];
    if (msg.role === 'assistant' && typeof msg.content === 'string' && msg.content.trim()) {
      return msg.content.trim();
    }
  }

  return '(no summary available)';
}

// =============================================================================
// Archive — Move old cycles to ConsciousnessArchive
// =============================================================================

/**
 * Prune consciousness if it exceeds the token budget.
 * Oldest cycles are archived (summary + full messages stored in DB).
 * Embedding is NOT done here — a separate process can embed archived cycles.
 *
 * Returns the pruned messages array.
 */
export async function pruneConsciousness(
  haseefId: string,
  messages: ModelMessage[],
  cycleCount: number,
  maxTokens: number = DEFAULT_MAX_TOKENS,
): Promise<ModelMessage[]> {
  const tokenCount = estimateTokens(messages);
  if (tokenCount <= maxTokens) return messages;

  const cycles = extractCycles(messages);
  if (cycles.length <= 1) return messages;

  // Walk backwards to find how many recent cycles fit in the budget
  let recentTokens = 0;
  let splitIndex = cycles.length;

  for (let i = cycles.length - 1; i >= 0; i--) {
    const cycleTokens = estimateTokens(cycles[i].messages);
    if (recentTokens + cycleTokens > maxTokens) break;
    recentTokens += cycleTokens;
    splitIndex = i;
  }

  if (splitIndex === 0) return messages;

  const oldCycles = cycles.slice(0, splitIndex);
  const recentCycles = cycles.slice(splitIndex);

  // Archive old cycles to DB
  for (let i = 0; i < oldCycles.length; i++) {
    const cycle = oldCycles[i];
    const summary = extractCycleSummary(cycle);
    const cycleNumber = cycleCount - cycles.length + i;

    try {
      await prisma.consciousnessArchive.create({
        data: {
          haseefId,
          cycleNumber: Math.max(0, cycleNumber),
          summary,
          fullMessages: cycle.messages as any,
          // embedding is null — populated by a separate embedding job
        },
      });
    } catch (err) {
      console.warn(`[consciousness] Failed to archive cycle ${cycleNumber}:`, err);
    }
  }

  // Build pruned consciousness: just the recent cycles
  const pruned: ModelMessage[] = [];
  for (const cycle of recentCycles) {
    pruned.push(...cycle.messages);
  }

  return pruned;
}

// =============================================================================
// Snapshots
// =============================================================================

const AUTO_SNAPSHOT_INTERVAL = 50;

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

