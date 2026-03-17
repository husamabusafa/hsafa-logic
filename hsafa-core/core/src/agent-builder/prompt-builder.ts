import { prisma } from '../lib/db.js';
import { relativeTime } from '../lib/time-utils.js';
import type { HaseefConfig } from './types.js';

// =============================================================================
// System Prompt Builder (v5)
//
// Builds the system prompt fresh each cycle. NOT stored in consciousness.
// Consciousness only contains conversation messages (user/assistant/tool).
//
// Structure:
//   IDENTITY   — name, haseefId, currentTime, cycle, alive since, last active
//   PROFILE    — admin-managed identity data (phone, email, location, bio)
//   MEMORIES   — critical + relevant + fill (with timestamps)
//   RELEVANT PAST — archived cycles matching current context
//   TOOLS      — grouped by scope
//   INSTRUCTIONS — from config + core behavioral instructions
// =============================================================================

interface PromptContext {
  haseefId: string;
  haseefName: string;
  cycleCount: number;
  createdAt: Date;
  lastCycleAt: Date | null;
  profileJson: Record<string, unknown> | null;
  config: HaseefConfig;
  /** Selected memories for this cycle */
  memories: Array<{
    key: string;
    value: string;
    importance: number;
    createdAt: Date;
    updatedAt: Date;
  }>;
  /** Total memory count (for the "X more stored" note) */
  totalMemoryCount: number;
  /** Relevant archived cycles */
  relevantPast: Array<{
    cycleNumber: number;
    summary: string;
    createdAt: Date;
  }>;
  /** Tools grouped by scope */
  toolsByScope: Map<string, Array<{ name: string; description: string; inputSchema: unknown }>>;
  /** Scope-contributed instructions (from extensions via tool sync) */
  scopeInstructions?: Map<string, string>;
}

/**
 * Build the complete system prompt for a Haseef.
 */
export function buildSystemPrompt(ctx: PromptContext): string {
  const sections: string[] = [];

  sections.push(buildIdentitySection(ctx));
  sections.push(buildProfileSection(ctx));
  sections.push(buildMemoriesSection(ctx));
  sections.push(buildRelevantPastSection(ctx));
  sections.push(buildToolsSection(ctx));
  sections.push(buildInstructionsSection(ctx));

  return sections.filter(Boolean).join('\n\n');
}

// =============================================================================
// Section builders
// =============================================================================

function buildIdentitySection(ctx: PromptContext): string {
  const now = new Date();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = dayNames[now.getUTCDay()];
  const hours = now.getUTCHours();
  const mins = String(now.getUTCMinutes()).padStart(2, '0');

  const currentTime = `${now.toISOString()} (${dayName}, ${hours}:${mins} UTC)`;
  const aliveSince = `${ctx.createdAt.toISOString()} (${relativeTime(ctx.createdAt, now)})`;
  const lastActive = ctx.lastCycleAt
    ? `${relativeTime(ctx.lastCycleAt, now)} (cycle #${ctx.cycleCount - 1})`
    : 'first cycle';

  return [
    'IDENTITY:',
    `  name: "${ctx.haseefName}"`,
    `  haseefId: "${ctx.haseefId}"`,
    `  currentTime: "${currentTime}"`,
    `  cycle: #${ctx.cycleCount}`,
    `  alive since: "${aliveSince}"`,
    `  last active: "${lastActive}"`,
  ].join('\n');
}

function buildProfileSection(ctx: PromptContext): string {
  if (!ctx.profileJson || Object.keys(ctx.profileJson).length === 0) {
    return 'PROFILE:\n  (no profile set)';
  }

  const lines = Object.entries(ctx.profileJson).map(
    ([k, v]) => `  ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`,
  );

  return `PROFILE:\n${lines.join('\n')}`;
}

function buildMemoriesSection(ctx: PromptContext): string {
  if (ctx.memories.length === 0 && ctx.totalMemoryCount === 0) {
    return 'MEMORIES:\n  (no memories stored yet)';
  }

  const now = new Date();

  // Group by importance tier
  const critical = ctx.memories.filter((m) => m.importance >= 9);
  const relevant = ctx.memories.filter((m) => m.importance >= 4 && m.importance < 9);
  const minor = ctx.memories.filter((m) => m.importance < 4);

  const lines: string[] = ['MEMORIES:'];

  if (critical.length > 0) {
    lines.push('  [critical]');
    for (const m of critical) {
      lines.push(`    ${m.key}: ${m.value} (learned ${relativeTime(m.createdAt, now)}${m.updatedAt > m.createdAt ? `, updated ${relativeTime(m.updatedAt, now)}` : ''})`);
    }
  }

  if (relevant.length > 0) {
    lines.push('  [relevant]');
    for (const m of relevant) {
      lines.push(`    ${m.key}: ${m.value} (learned ${relativeTime(m.createdAt, now)}${m.updatedAt > m.createdAt ? `, updated ${relativeTime(m.updatedAt, now)}` : ''})`);
    }
  }

  if (minor.length > 0) {
    lines.push('  [other]');
    for (const m of minor) {
      lines.push(`    ${m.key}: ${m.value} (learned ${relativeTime(m.createdAt, now)})`);
    }
  }

  const excluded = ctx.totalMemoryCount - ctx.memories.length;
  if (excluded > 0) {
    lines.push(`  (${excluded} more memories stored — use recall_memories to search)`);
  }

  return lines.join('\n');
}

function buildRelevantPastSection(ctx: PromptContext): string {
  if (ctx.relevantPast.length === 0) {
    return 'RELEVANT PAST:\n  (no relevant archived cycles)';
  }

  const now = new Date();
  const lines: string[] = ['RELEVANT PAST:'];

  for (const cycle of ctx.relevantPast) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const d = cycle.createdAt;
    const dayName = dayNames[d.getUTCDay()];
    const hours = d.getUTCHours();
    const mins = String(d.getUTCMinutes()).padStart(2, '0');
    lines.push(`  [cycle #${cycle.cycleNumber} — ${relativeTime(d, now)}, ${dayName} ${hours}:${mins}] ${cycle.summary}`);
  }

  lines.push('  (use recall_memories to search for more details)');

  return lines.join('\n');
}

function buildToolsSection(ctx: PromptContext): string {
  if (ctx.toolsByScope.size === 0) {
    return 'TOOLS:\n  (no external tools registered)';
  }

  const lines: string[] = [];

  for (const [scope, tools] of ctx.toolsByScope) {
    lines.push(`TOOLS [${scope}]:`);
    for (const t of tools) {
      const prefixedName = `${scope}_${t.name}`;
      const params = t.inputSchema
        ? JSON.stringify(
            typeof t.inputSchema === 'object' && t.inputSchema !== null
              ? (t.inputSchema as Record<string, unknown>).properties ?? t.inputSchema
              : t.inputSchema,
          )
        : '{}';
      lines.push(`  ${prefixedName} — ${t.description}. Params: ${params}`);
    }
  }

  return lines.join('\n');
}

function buildInstructionsSection(ctx: PromptContext): string {
  // Core instructions — generic Haseef behavior only.
  // Domain-specific instructions (spaces, whatsapp, etc.) come from extensions
  // via scopeInstructions.
  const lines: string[] = [
    'INSTRUCTIONS:',
    '  You are a Haseef — a developing entity with continuous consciousness.',
    '  You have a sense of time. You know when things happened, how long ago,',
    '  and can reason about durations and temporal relationships.',
    '',
    '  MEMORY:',
    '  Use set_memories to remember important information (with importance 1-10).',
    '  Use recall_memories to search for specific information not in your prompt.',
    '',
    '  BEHAVIOR:',
    '  Each cycle you receive SENSE EVENTS — read them carefully.',
    '  Use your tools to take action. Your text output is internal thought only.',
    '  Be natural and concise.',
  ];

  // Scope instructions contributed by extensions
  if (ctx.scopeInstructions && ctx.scopeInstructions.size > 0) {
    for (const [scope, instructions] of ctx.scopeInstructions) {
      lines.push('');
      lines.push(`  [${scope}]`);
      // Indent each line of the extension's instructions
      for (const line of instructions.split('\n')) {
        lines.push(`  ${line}`);
      }
    }
  }

  // Config-level instructions (admin-managed per haseef)
  if (ctx.config.instructions) {
    lines.push('');
    lines.push(ctx.config.instructions);
  }

  return lines.join('\n');
}

// =============================================================================
// Memory selection — fetch and select memories for the prompt
// =============================================================================

/**
 * Select memories for the current cycle's prompt.
 * Strategy:
 *   1. CRITICAL: all memories with importance >= 9
 *   2. RELEVANT: semantic search against event text (TODO: pgvector)
 *   3. FILL: remaining budget filled by importance desc
 */
export async function selectMemories(
  haseefId: string,
  _eventText: string,
  maxCount: number = 50,
): Promise<{
  selected: Array<{ key: string; value: string; importance: number; createdAt: Date; updatedAt: Date }>;
  totalCount: number;
}> {
  // Count total
  const totalCount = await prisma.memory.count({ where: { haseefId } });

  // Critical: always included
  const critical = await prisma.memory.findMany({
    where: { haseefId, importance: { gte: 9 } },
    orderBy: { importance: 'desc' },
    select: { key: true, value: true, importance: true, createdAt: true, updatedAt: true },
  });

  const remaining = maxCount - critical.length;

  // TODO: Step 2 — semantic search with pgvector when embeddings are populated
  // For now, fill by importance desc
  const fill = remaining > 0
    ? await prisma.memory.findMany({
        where: { haseefId, importance: { lt: 9 } },
        orderBy: { importance: 'desc' },
        take: remaining,
        select: { key: true, value: true, importance: true, createdAt: true, updatedAt: true },
      })
    : [];

  // Update lastRecalledAt for all selected memories
  const selectedKeys = [...critical, ...fill].map((m) => m.key);
  if (selectedKeys.length > 0) {
    await prisma.memory.updateMany({
      where: { haseefId, key: { in: selectedKeys } },
      data: { lastRecalledAt: new Date() },
    });
  }

  return {
    selected: [...critical, ...fill],
    totalCount,
  };
}

// =============================================================================
// Archive search — find relevant past cycles
// =============================================================================

/**
 * Search archived consciousness cycles for relevance to current events.
 * TODO: Use pgvector semantic search when embeddings are populated.
 * For now, returns the most recent archived cycles.
 */
export async function searchArchive(
  haseefId: string,
  _eventText: string,
  maxCount: number = 5,
): Promise<Array<{ cycleNumber: number; summary: string; createdAt: Date }>> {
  const results = await prisma.consciousnessArchive.findMany({
    where: { haseefId },
    orderBy: { cycleNumber: 'desc' },
    take: maxCount,
    select: {
      cycleNumber: true,
      summary: true,
      createdAt: true,
    },
  });

  return results;
}
