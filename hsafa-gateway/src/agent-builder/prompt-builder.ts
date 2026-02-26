import { prisma } from '../lib/db.js';
import { relativeTime } from '../lib/time-utils.js';

// =============================================================================
// Prompt Builder (v3)
//
// Builds the system prompt for an agent. Much simpler than v2:
// - No [SEEN]/[NEW] markers
// - No ACTIVE RUNS / ACTIVE SPACE / trigger blocks
// - No origin annotations (consciousness has the full chain)
//
// Structure: IDENTITY -> YOUR SPACES -> GOALS -> MEMORIES -> PLANS -> INSTRUCTIONS
// =============================================================================

/**
 * Build the system prompt for an agent.
 * Called at the start of each think cycle to refresh dynamic fields.
 */
export async function buildSystemPrompt(
  agentId: string,
  agentEntityId: string,
  agentName: string,
): Promise<string> {
  const [agent, memberships, memories, goals, plans, consciousness] = await Promise.all([
    prisma.agent.findUnique({
      where: { id: agentId },
      select: { configJson: true, description: true },
    }),
    prisma.smartSpaceMembership.findMany({
      where: { entityId: agentEntityId },
      include: {
        smartSpace: { select: { id: true, name: true } },
      },
    }),
    prisma.memory.findMany({
      where: { entityId: agentEntityId },
      select: { key: true, value: true },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.goal.findMany({
      where: { entityId: agentEntityId },
      select: { description: true, status: true, priority: true },
      orderBy: { priority: 'desc' },
    }),
    prisma.plan.findMany({
      where: { entityId: agentEntityId, status: 'pending' },
      select: { name: true, instruction: true, cron: true, nextRunAt: true, scheduledAt: true },
      orderBy: { nextRunAt: 'asc' },
    }),
    prisma.agentConsciousness.findUnique({
      where: { agentEntityId },
      select: { lastCycleAt: true, cycleCount: true },
    }),
  ]);

  const config = agent?.configJson as any;
  const userInstructions = config?.instructions ?? '';

  // Load all space members for context
  const spaceIds = memberships.map((m) => m.smartSpaceId);
  const allMemberships = spaceIds.length > 0
    ? await prisma.smartSpaceMembership.findMany({
        where: { smartSpaceId: { in: spaceIds } },
        include: {
          entity: { select: { id: true, displayName: true, type: true } },
        },
      })
    : [];

  // Group members by space
  const spaceMembers = new Map<string, Array<{ name: string; type: string; isYou: boolean }>>();
  for (const m of allMemberships) {
    if (!spaceMembers.has(m.smartSpaceId)) spaceMembers.set(m.smartSpaceId, []);
    spaceMembers.get(m.smartSpaceId)!.push({
      name: m.entity.displayName ?? m.entity.id,
      type: m.entity.type,
      isYou: m.entity.id === agentEntityId,
    });
  }

  // ---- Build sections ----

  const sections: string[] = [];

  // IDENTITY
  const now = new Date();
  const descLine = agent?.description ? `\n  description: "${agent.description}"` : '';
  let lastCycleLine = '';
  if (consciousness?.lastCycleAt) {
    lastCycleLine = `\n  lastCycle: "${consciousness.lastCycleAt.toISOString()}" (${relativeTime(consciousness.lastCycleAt, now)}, cycle #${consciousness.cycleCount})`;
  }
  sections.push(
    `IDENTITY:\n  name: "${agentName}"\n  entityId: "${agentEntityId}"${descLine}\n  currentTime: "${now.toISOString()}"${lastCycleLine}`
  );

  // YOUR SPACES
  if (memberships.length > 0) {
    const spaceLines = memberships.map((m) => {
      const members = spaceMembers.get(m.smartSpaceId) ?? [];
      const memberList = members
        .map((mem) => mem.isYou ? 'You' : `${mem.name} (${mem.type})`)
        .join(', ');
      return `  - "${m.smartSpace.name ?? 'Unnamed'}" (id: ${m.smartSpaceId}) -- ${memberList}`;
    });
    sections.push(`YOUR SPACES:\n${spaceLines.join('\n')}`);
  }

  // GOALS
  if (goals.length > 0) {
    const goalLines = goals.map((g) => `  - ${g.description} (${g.status})`);
    sections.push(`GOALS:\n${goalLines.join('\n')}`);
  }

  // MEMORIES
  if (memories.length > 0) {
    const memLines = memories.map((m) => `  - ${m.key}: ${m.value}`);
    sections.push(`MEMORIES:\n${memLines.join('\n')}`);
  }

  // PLANS
  if (plans.length > 0) {
    const planLines = plans.map((p) => {
      const schedule = p.cron
        ? `cron: ${p.cron}, next: ${p.nextRunAt?.toISOString() ?? 'unknown'}`
        : p.scheduledAt
          ? `at: ${p.scheduledAt.toISOString()}`
          : 'unscheduled';
      return `  - "${p.name}" (${schedule})${p.instruction ? ` -- ${p.instruction}` : ''}`;
    });
    sections.push(`PLANS:\n${planLines.join('\n')}`);
  }

  // INSTRUCTIONS
  const coreInstructions = [
    'You are a living agent with continuous consciousness.',
    'Your message history IS your memory — you remember everything from previous cycles.',
    '',
    'HOW TO COMMUNICATE:',
    'Your text output is private internal thought — nobody sees it.',
    'The ONLY way to speak to someone is:',
    '  1. enter_space(spaceId) — sets the active space and shows conversation history.',
    '  2. send_message({ text }) — delivers your message to that space.',
    'You MUST call send_message to communicate. No other way exists.',
    '',
    'IMPORTANT:',
    'Read the conversation history from enter_space before replying.',
    'If someone references earlier discussion, refer back to it.',
    'Handle each request, then stop. If nothing needs action, call skip().',
    '',
    'End every cycle with a very short summary of what you did (max 8 words).',
  ].join('\n  ');

  sections.push(`INSTRUCTIONS:\n  ${coreInstructions}`);

  if (userInstructions) {
    sections.push(`CUSTOM INSTRUCTIONS:\n  ${userInstructions}`);
  }

  return sections.join('\n\n');
}
