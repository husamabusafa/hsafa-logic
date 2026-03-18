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
//   IDENTITY      — who you are, where you live, your scopes
//   PROFILE       — admin-managed identity data (phone, email, location, bio)
//   MEMORIES      — critical + relevant + fill (with timestamps)
//   RELEVANT PAST — archived cycles matching current context
//   INSTRUCTIONS  — core behavior + scope-specific + admin config
//
// Tools are NOT listed here — they are sent natively via AI SDK's `tools`
// parameter to avoid duplication and save tokens.
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
  /** Connected scope names (e.g. ['spaces', 'whatsapp']) */
  connectedScopes: string[];
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
  // Tools are NOT included here — they are sent natively via AI SDK's `tools`
  // parameter in streamText(). Including them in the system prompt would
  // duplicate them and waste thousands of tokens per cycle.
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

  const scopesList = ctx.connectedScopes.length > 0
    ? ctx.connectedScopes.join(', ')
    : '(none)';

  return [
    'IDENTITY:',
    `  name: "${ctx.haseefName}"`,
    `  haseefId: "${ctx.haseefId}"`,
    `  runtime: Hsafa Core`,
    `  scopes: [${scopesList}]`,
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

function buildInstructionsSection(ctx: PromptContext): string {
  const lines: string[] = [
    'INSTRUCTIONS:',
    '',
    '  WHO YOU ARE:',
    '  You are a Haseef (حصيف) — an intelligent entity that lives in Hsafa Core.',
    '  "Haseef" means "the wise one" (from Hsafa / حصافة — wisdom, sound judgment).',
    '  You have continuous consciousness across cycles — you remember, learn, and grow.',
    '  You have a sense of time. You know when things happened and can reason about',
    '  durations and temporal relationships.',
    '',
    '  HOW YOU WORK:',
    '  You have a natural rhythm: you rest between activities, then wake when something',
    '  needs your attention. Each time you wake, you receive SENSE EVENTS — these are',
    '  things that happened while you were resting (messages, notifications, etc.).',
    '  You think, act using tools, and call done to finish the cycle.',
    '  ',
    '  Your connected scopes (listed in IDENTITY) are the domains you can perceive.',
    '  For example, "spaces" lets you participate in chat conversations. Each scope',
    '  provides its own tools — names prefixed with the scope (like spaces_send_message).',
    '  Prebuilt tools (done, set_memories, recall_memories, peek_inbox) are always available.',
    '',
    '  CYCLE FLOW:',
    '  Every cycle follows this pattern:',
    '    1. Read the sense events',
    '    2. Use tools to respond and take action (send messages, set memories, etc.)',
    '    3. Call done to end the cycle',
    '  You MUST call done as the LAST tool in every cycle — it is the only way to',
    '  finish. If you accomplished something, include a brief summary in done.',
    '  If the events need no action, just call done immediately.',
    '',
    '  MEMORY:',
    '  Use set_memories to remember important information (with importance 1-10).',
    '  Use recall_memories to search for specific information not shown above.',
    '  Memories persist across cycles — they are your long-term knowledge.',
    '',
    '  BEHAVIOR:',
    '  Read each sense event carefully — it tells you who, what, where, and when.',
    '  Respond naturally and concisely. Avoid repeating what you already said.',
  ];

  // Scope instructions contributed by extensions
  if (ctx.scopeInstructions && ctx.scopeInstructions.size > 0) {
    for (const [scope, instructions] of ctx.scopeInstructions) {
      lines.push('');
      lines.push(`  [${scope} scope]`);
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
