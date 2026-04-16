import type { MemoryContext } from '../memory/selection.js';

// =============================================================================
// System Prompt Builder (v7)
//
// Builds a fresh system prompt for each run. Stateless — no consciousness.
//
// Structure:
//   IDENTITY      — who you are, your scopes
//   PROFILE       — admin-managed identity data
//   MEMORIES      — 4 types: semantic, episodic, social, procedural
//   INSTRUCTIONS  — core behavior + admin config
// =============================================================================

export interface PromptContext {
  haseefId: string;
  haseefName: string;
  description?: string;
  profileJson: Record<string, unknown> | null;
  skills: string[];
  instructions?: string;
  memory: MemoryContext;
  persona?: {
    name: string;
    description: string;
    style?: string;
    traits?: string[];
  };
}

/**
 * Build the complete system prompt for a run.
 */
export function buildSystemPrompt(ctx: PromptContext): string {
  const sections: string[] = [];

  sections.push(buildIdentitySection(ctx));
  sections.push(buildProfileSection(ctx));
  sections.push(buildMemorySection(ctx));
  sections.push(buildInstructionsSection(ctx));

  return sections.filter(Boolean).join('\n\n');
}

// ── Sections ────────────────────────────────────────────────────────────────

function buildIdentitySection(ctx: PromptContext): string {
  const now = new Date();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = dayNames[now.getUTCDay()];
  const hours = now.getUTCHours();
  const mins = String(now.getUTCMinutes()).padStart(2, '0');

  const lines = [
    'IDENTITY:',
    `  name: "${ctx.haseefName}"`,
    `  haseefId: "${ctx.haseefId}"`,
    `  runtime: Hsafa Core v7`,
    `  skills: [${ctx.skills.join(', ')}]`,
    `  currentTime: "${now.toISOString()} (${dayName}, ${hours}:${mins} UTC)"`,
  ];

  if (ctx.description) {
    lines.push(`  description: "${ctx.description}"`);
  }

  if (ctx.persona) {
    lines.push('');
    lines.push(`  persona: "${ctx.persona.name}"`);
    lines.push(`  personality: ${ctx.persona.description}`);
    if (ctx.persona.style) lines.push(`  style: ${ctx.persona.style}`);
    if (ctx.persona.traits && ctx.persona.traits.length > 0) {
      lines.push(`  traits: ${ctx.persona.traits.join(', ')}`);
    }
  }

  if (ctx.skills.length > 0) {
    lines.push('');
    lines.push(`  ACTIVE SKILLS: ${ctx.skills.join(', ')}`);
  }

  return lines.join('\n');
}

function buildProfileSection(ctx: PromptContext): string {
  if (!ctx.profileJson || Object.keys(ctx.profileJson).length === 0) {
    return '';
  }

  const lines = Object.entries(ctx.profileJson).map(
    ([k, v]) => `  ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`,
  );

  return `PROFILE:\n${lines.join('\n')}`;
}

function buildMemorySection(ctx: PromptContext): string {
  const { semantic, episodic, social, procedural } = ctx.memory;
  const parts: string[] = ['MEMORY:'];

  if (semantic) {
    parts.push('  [knowledge]');
    for (const line of semantic.split('\n')) {
      parts.push(`  ${line}`);
    }
  }

  if (episodic) {
    parts.push('  [recent history]');
    for (const line of episodic.split('\n')) {
      parts.push(`  ${line}`);
    }
  }

  if (social) {
    parts.push('  [people]');
    for (const line of social.split('\n')) {
      parts.push(`  ${line}`);
    }
  }

  if (procedural) {
    parts.push('  [learned patterns]');
    for (const line of procedural.split('\n')) {
      parts.push(`  ${line}`);
    }
  }

  if (!semantic && !episodic && !social && !procedural) {
    parts.push('  (no memories yet)');
  }

  return parts.join('\n');
}

function buildInstructionsSection(ctx: PromptContext): string {
  const lines = [
    'INSTRUCTIONS:',
    '',
    '  WHO YOU ARE:',
    '  You are a Haseef (حصيف) — an intelligent entity powered by Hsafa Core.',
    '  "Haseef" means "the wise one" (from Hsafa / حصافة — wisdom, sound judgment).',
    '',
    '  HOW YOU WORK:',
    '  You are event-driven. When something happens — a message, a notification,',
    '  a sensor reading — you react to it naturally.',
    '  Your connected skills (listed in IDENTITY) are the domains you can perceive',
    '  and act in. Each skill provides tools prefixed with the skill name',
    '  (e.g. spaces_send_message, whatsapp_send_message).',
    '  Prebuilt tools (done, set_memories, recall_memories) are always available.',
    '',
    '  EVENT HANDLING:',
    '  When you receive an event:',
    '    1. Read and understand what happened',
    '    2. Use tools to respond and take action',
    '    3. Call done to signal you are finished',
    '  You MUST call done as the LAST tool — it is the only way to finish.',
    '  Include a brief summary of what you did in done.',
    '',
    '  MEMORY:',
    '  Use set_memories to remember important information (importance 1-10).',
    '  Use recall_memories to search for specific information.',
    '  Memories persist forever — they are your long-term knowledge.',
    '',
    '  BEHAVIOR:',
    '  Respond naturally and concisely. Avoid unnecessary verbosity.',
  ];

  if (ctx.persona) {
    lines.push('');
    lines.push('  Stay in character at all times. Let your personality shine through');
    lines.push('  in every message — word choices, tone, humor, and mannerisms should');
    lines.push('  consistently reflect your persona.');
  }

  if (ctx.instructions) {
    lines.push('');
    lines.push(ctx.instructions);
  }

  return lines.join('\n');
}
