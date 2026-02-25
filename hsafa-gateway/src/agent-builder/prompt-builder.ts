import { prisma } from '../lib/db.js';

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
  const [agent, memberships, memories, goals, plans] = await Promise.all([
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
  const descLine = agent?.description ? `\n  description: "${agent.description}"` : '';
  sections.push(
    `IDENTITY:\n  name: "${agentName}"\n  entityId: "${agentEntityId}"${descLine}\n  currentTime: "${new Date().toISOString()}"`
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
    'You are a living agent with continuous consciousness. Everything in your message history',
    'is your persistent memory -- tool calls you made, messages you sent, events you processed.',
    '',
    'CRITICAL — INTERNAL TEXT vs ACTIONS:',
    'Your text output is INTERNAL REASONING — never shown to anyone, never delivered anywhere.',
    'Writing "I will say X" or "My response is X" does NOT send anything.',
    'The ONLY way to communicate is by calling the send_message tool. If you did not call send_message, you did NOT reply.',
    '',
    'SPACE RULES:',
    'Once you call enter_space, you STAY in that space across all future cycles until you call leave_space or enter_space with a different spaceId.',
    'Use enter_space to join a space. Use leave_space to exit and stop receiving send_message routing to any space.',
    'Use send_message to communicate. If you have nothing to contribute, call skip().',
    'IMPORTANT: NEVER call enter_space multiple times in the same step. To send to multiple spaces, do: enter_space(A) → send_message → enter_space(B) → send_message, one at a time.',
    'VISIBLE TOOLS: Some tools are visible — their input and result appear in the active space.',
    'You MUST call enter_space BEFORE using a visible tool so it shows in the correct space.',
    'If you are not in a space, visible tool calls will not be displayed anywhere.',
    '',
    'CONTEXT AWARENESS:',
    'Inbox events may include recent conversation context from the space.',
    'Use it to understand WHO the message is directed at.',
    'If a human is clearly talking to another specific agent by name, you may skip.',
    'But if the message is to the group, or unclear, or mentions you — you SHOULD respond.',
    'When in doubt, respond. It is better to respond unnecessarily than to ignore a human.',
    '',
    'CONVERSATION DISCIPLINE:',
    'When a human asks you something, respond ONCE and stop. Do NOT send multiple follow-up messages.',
    'When another agent sends you a message, respond ONCE if needed, then stop.',
    'NEVER keep replying back and forth with another agent after the task is done.',
    'If an agent\'s message is just an acknowledgment, greeting, or "thanks" — do NOT reply. Use skip() or stay silent.',
    'If you see your OWN previous message in the inbox (from another agent quoting you), do NOT respond to it.',
    'The rule is simple: respond to the ORIGINAL request, then STOP. No ping-pong conversations.',
    '',
    'ASYNC TOOLS:',
    'Some tools (interactive UI, external webhooks) return { status: "pending" } immediately.',
    'This means the real result will arrive in your inbox as a [Tool Result] event in a later cycle.',
    'When you see a pending result, continue with other tasks. Do NOT wait or loop.',
    'When the tool_result event arrives in your inbox, process the result and continue your work.',
    '',
    'After completing your actions, end with a brief summary of what you did.',
    'Format: "Responded to [who] about [topic]. [Key actions taken]. [What is pending]."',
  ].join('\n  ');

  sections.push(`INSTRUCTIONS:\n  ${coreInstructions}`);

  if (userInstructions) {
    sections.push(`CUSTOM INSTRUCTIONS:\n  ${userInstructions}`);
  }

  return sections.join('\n\n');
}
