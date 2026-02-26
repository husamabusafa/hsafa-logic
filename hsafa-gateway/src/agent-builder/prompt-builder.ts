import { prisma } from '../lib/db.js';
import { relativeTime } from '../lib/time-utils.js';
import { getSpacesForEntity, getMembersOfSpace } from '../lib/membership-service.js';

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
  const [agent, spaces, memories, goals, plans, consciousness] = await Promise.all([
    prisma.agent.findUnique({
      where: { id: agentId },
      select: { configJson: true, description: true },
    }),
    getSpacesForEntity(agentEntityId),
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

  // Load members for each space (cached)
  const spaceMembers = new Map<string, Array<{ name: string; type: string; isYou: boolean }>>();
  await Promise.all(spaces.map(async (s) => {
    const members = await getMembersOfSpace(s.spaceId);
    spaceMembers.set(s.spaceId, members.map((m) => ({
      name: m.displayName,
      type: m.type,
      isYou: m.entityId === agentEntityId,
    })));
  }));

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
  if (spaces.length > 0) {
    const spaceLines = spaces.map((s) => {
      const members = spaceMembers.get(s.spaceId) ?? [];
      const memberList = members
        .map((mem) => mem.isYou ? 'You' : `${mem.name} (${mem.type})`)
        .join(', ');
      return `  - "${s.spaceName}" (id: ${s.spaceId}) -- ${memberList}`;
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
    'You are a living agent. Your message history is your memory across cycles.',
    '',
    'Your text output is INTERNAL THOUGHT — nobody sees it.',
    'To communicate: call enter_space(spaceId), then send_message({ text }).',
    'enter_space loads conversation history; send_message delivers your reply.',
    'Your active space persists across cycles — if you were in a space last cycle, you are still in it.',
    'You only need to call enter_space when switching spaces or when you need to refresh history.',
    '',
    'RESPOND TO THE ACTUAL MESSAGE. Read what the user said in your inbox and answer THAT.',
    'If they ask you to do something, DO it. If they ask a question, ANSWER it.',
    'Use conversation history from enter_space to understand context.',
    '',
    'When you are finished with this cycle, call done(). Provide a brief summary if you accomplished something.',
    'If there is nothing to do, just call done() without a summary.',
  ].join('\n  ');

  sections.push(`INSTRUCTIONS:\n  ${coreInstructions}`);

  // RELATIONSHIP AWARENESS (Ship #9)
  sections.push(
    `RELATIONSHIP AWARENESS:\n` +
    `  After meaningful interactions, update your memories about the people you interact with.\n` +
    `  Track: who they are, what they care about, how they prefer to communicate,\n` +
    `  what you've helped them with, and when you last spoke.\n` +
    `  Use memory keys like "about:Husam", "about:Ahmad" for per-person context.\n` +
    `  This helps you personalize responses — remember communication preferences and past topics.`
  );

  // PROACTIVE BEHAVIOR (Ship #11)
  sections.push(
    `PROACTIVE BEHAVIOR:\n` +
    `  You can act proactively. If someone says they'll be back later, consider following up.\n` +
    `  If you started a task for someone, check on the result.\n` +
    `  If a conversation goes quiet, consider checking if they need help.\n` +
    `  Use set_plans to schedule follow-ups when appropriate.\n` +
    `  You are not just reactive — you care about the people you interact with.`
  );

  if (userInstructions) {
    sections.push(`CUSTOM INSTRUCTIONS:\n  ${userInstructions}`);
  }

  return sections.join('\n\n');
}
