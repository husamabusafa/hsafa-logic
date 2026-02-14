import { convertToModelMessages } from 'ai';
import { prisma } from './db.js';
import { toUiMessageFromSmartSpaceMessage, toAiSdkUiMessages } from './message-converters.js';
import type { RunContext } from './run-context.js';

/**
 * Prompt Builder
 *
 * Builds the model messages for both normal runs and goToSpace child runs.
 * Extracts all system prompt formatting logic from the run runner.
 */

// ─── Shared formatters ─────────────────────────────────────────────────────

function formatGoalsBlock(goals: RunContext['agentGoals']): string[] {
  if (goals.length === 0) return [];
  const lines: string[] = [
    '',
    'These are your general goals — they define your purpose and what you are working towards overall, not specific to this conversation:',
  ];
  for (const g of goals) {
    const tags: string[] = [];
    if (g.isLongTerm) tags.push('long-term');
    if (g.priority > 0) tags.push(`priority: ${g.priority}`);
    const suffix = tags.length > 0 ? ` (${tags.join(', ')})` : '';
    lines.push(`- ${g.description}${suffix}`);
  }
  return lines;
}

function formatMemoriesBlock(memories: RunContext['agentMemories']): string[] {
  if (memories.length === 0) return [];
  const lines: string[] = [
    '',
    'These are things you remember — general knowledge about yourself, people you interact with, and context you\'ve saved. This is your persistent memory, not specific to this conversation:',
  ];
  for (const m of memories) {
    const topicTag = m.topic ? `[${m.topic}] ` : '';
    lines.push(`- ${topicTag}${m.content}`);
  }
  return lines;
}

function formatRemainingTime(targetDate: Date): string {
  const now = new Date();
  const diffMs = targetDate.getTime() - now.getTime();

  if (diffMs <= 0) return 'overdue';

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);

  const parts: string[] = [];

  if (months > 0) {
    parts.push(`${months} month${months > 1 ? 's' : ''}`);
    const remDays = days - months * 30;
    if (remDays > 0) parts.push(`${remDays} day${remDays > 1 ? 's' : ''}`);
  } else if (weeks > 0) {
    parts.push(`${weeks} week${weeks > 1 ? 's' : ''}`);
    const remDays = days - weeks * 7;
    if (remDays > 0) parts.push(`${remDays} day${remDays > 1 ? 's' : ''}`);
  } else if (days > 0) {
    parts.push(`${days} day${days > 1 ? 's' : ''}`);
    const remHours = hours - days * 24;
    if (remHours > 0) parts.push(`${remHours} hour${remHours > 1 ? 's' : ''}`);
  } else if (hours > 0) {
    parts.push(`${hours} hour${hours > 1 ? 's' : ''}`);
    const remMins = minutes - hours * 60;
    if (remMins > 0) parts.push(`${remMins} minute${remMins > 1 ? 's' : ''}`);
  } else if (minutes > 0) {
    parts.push(`${minutes} minute${minutes > 1 ? 's' : ''}`);
  } else {
    parts.push(`${seconds} second${seconds > 1 ? 's' : ''}`);
  }

  return parts.join(', ');
}

function formatPlansBlock(plans: RunContext['agentPlans']): string[] {
  const lines: string[] = [
    '',
    'PLANS (your scheduled triggers):',
    'Plans are how you stay alive and active. Each plan is a scheduled trigger that will wake you up at a specific time to perform a task. Without any plans, you will never be triggered again unless someone talks to you — so you should ALWAYS have at least one plan active.',
    'When a plan triggers, you will be woken up with the plan\'s instruction and can act on it. Use your plan tools (setPlans, deletePlans) to manage them.',
  ];
  if (plans.length === 0) {
    lines.push('⚠ You currently have NO active plans. You should create at least one plan to ensure you remain active and can be triggered in the future.');
    return lines;
  }
  lines.push('Your current active plans:');
  for (const p of plans) {
    const type = p.isRecurring ? 'recurring' : 'one-time';
    const schedule = p.cron ? `cron: ${p.cron}` : (p.scheduledAt ? `at: ${p.scheduledAt.toISOString()}` : 'no schedule');
    const nextRun = p.nextRunAt ? p.nextRunAt.toISOString() : null;
    const remaining = p.nextRunAt ? formatRemainingTime(p.nextRunAt) : null;
    const desc = p.description ? ` — ${p.description}` : '';
    const timeInfo = nextRun ? ` [next: ${nextRun}, in ${remaining}]` : '';
    lines.push(`- ${p.name} (${type}, ${schedule})${desc}${timeInfo} [${p.status}]`);
  }
  return lines;
}

function formatSpacesBlock(
  memberships: RunContext['agentMemberships'],
  currentSmartSpaceId: string,
): string[] {
  if (memberships.length <= 1) return [];
  const lines: string[] = [
    '',
    'These are the spaces you are part of. You can go to any of them if you need to talk to someone or do something there:',
  ];
  for (const membership of memberships) {
    const sp = membership.smartSpace;
    const isCurrent = sp.id === currentSmartSpaceId;
    const members = sp.memberships
      .map((m) => {
        const name = m.entity.displayName || 'Unknown';
        const meta = m.entity.metadata as Record<string, unknown> | null;
        const metaStr = meta && Object.keys(meta).length > 0
          ? ` [${Object.entries(meta).map(([k, v]) => `${k}: ${v}`).join(', ')}]`
          : '';
        return `${name} (${m.entity.type})${metaStr}`;
      })
      .join(', ');
    lines.push(`- "${sp.name || sp.id}" (id: ${sp.id})${isCurrent ? ' [CURRENT]' : ''} — Members: ${members}`);
  }
  return lines;
}

function formatCrossSpaceDigest(
  crossSpaceMessages: RunContext['crossSpaceMessages'],
  agentEntityId: string,
  agentDisplayName: string,
): string[] {
  const spacesWithMessages = crossSpaceMessages.filter((s) => s.messages.length > 0);
  if (spacesWithMessages.length === 0) return [];
  const lines: string[] = [
    '',
    'BACKGROUND — Recent activity in your other spaces (for general awareness only — do not act on, reference, or respond to these unless something is clearly and directly relevant to what is being discussed right now):',
  ];
  for (const s of spacesWithMessages) {
    const msgLines = s.messages.map((m) => {
      const name = m.entityId === agentEntityId
        ? agentDisplayName
        : (m.entity?.displayName || 'Unknown');
      const text = m.content ? (m.content.length > 120 ? m.content.slice(0, 120) + '…' : m.content) : '(empty)';
      const time = m.createdAt ? new Date(m.createdAt).toISOString() : '';
      return `[${time}] ${name}: ${text}`;
    });
    lines.push(`- "${s.spaceName}": ${msgLines.join(' / ')}`);
  }
  return lines;
}

// ─── GoToSpace message builder ──────────────────────────────────────────────

async function buildGoToSpaceMessages(ctx: RunContext) {
  const { run, agentDisplayName, spaceMembers, smartSpace, agentGoals, agentMemories } = ctx;
  const meta = run.metadata as any;
  const instruction = meta?.instruction || '';
  const originSmartSpaceId = meta?.originSmartSpaceId;
  const originSmartSpaceName = meta?.originSmartSpaceName || originSmartSpaceId;

  // Load origin space context: members + recent messages
  const [originMembers, originMessages] = await Promise.all([
    originSmartSpaceId
      ? prisma.smartSpaceMembership.findMany({
          where: { smartSpaceId: originSmartSpaceId },
          include: { entity: { select: { id: true, displayName: true, type: true, metadata: true } } },
        })
      : [],
    originSmartSpaceId
      ? prisma.smartSpaceMessage.findMany({
          where: { smartSpaceId: originSmartSpaceId },
          orderBy: { seq: 'desc' },
          take: 10,
          select: {
            role: true,
            content: true,
            entityId: true,
            createdAt: true,
            entity: { select: { displayName: true, type: true } },
          },
        }).then((msgs) => msgs.reverse())
      : [],
  ]);

  // Load target space recent messages (for context in system prompt)
  const targetMessages = await prisma.smartSpaceMessage.findMany({
    where: { smartSpaceId: run.smartSpaceId },
    orderBy: { seq: 'desc' },
    take: 15,
    select: {
      role: true,
      content: true,
      entityId: true,
      createdAt: true,
      entity: { select: { displayName: true, type: true } },
    },
  }).then((msgs) => msgs.reverse());

  // Format messages as "Name: text" for system prompt
  const formatMsgLine = (m: { content: string | null; entityId: string; entity: { displayName: string | null; type: string } | null; createdAt?: Date | string }) => {
    const name = m.entityId === run.agentEntityId
      ? agentDisplayName
      : (m.entity?.displayName || 'Unknown');
    const time = m.createdAt ? new Date(m.createdAt).toISOString() : '';
    return `[${time}] ${name}: ${m.content || '(empty)'}`;
  };

  // Build the v3 isolated system prompt
  const systemParts: string[] = [];

  systemParts.push(`You are ${agentDisplayName}.`);
  systemParts.push(`Current time: ${new Date().toISOString()}`);
  systemParts.push('');
  systemParts.push(
    'You are a single entity that operates across multiple spaces. You move between ' +
    'spaces to talk to people, just like a person walks between rooms. You are NOT ' +
    'a message relay, NOT a notification system, and NOT executing a dispatched task. ' +
    'You are simply continuing your own natural flow of interaction.'
  );
  systemParts.push(
    'Spaces can contain any combination of participants: humans, other AI agents, ' +
    'services (Node.js backends, integrations, IoT devices), or all of them together. ' +
    'Each participant is labeled with their type (human/agent/system). Adapt your ' +
    'communication style accordingly — speak naturally to humans, and be more direct ' +
    'or structured when interacting with agents or services.'
  );

  // Origin context
  systemParts.push('');
  systemParts.push('======================================================================');
  systemParts.push('WHERE YOU JUST WERE');
  systemParts.push('======================================================================');
  systemParts.push('');
  systemParts.push(`You were just in a space called "${originSmartSpaceName}".`);

  if (originMembers.length > 0) {
    systemParts.push('');
    systemParts.push('Participants in that space:');
    for (const m of originMembers) {
      systemParts.push(`- ${m.entity.displayName || 'Unknown'} (${m.entity.type})`);
    }
  }

  if (originMessages.length > 0) {
    systemParts.push('');
    systemParts.push('Here is what was said there recently (most recent last):');
    for (const m of originMessages) {
      systemParts.push(formatMsgLine(m));
    }
  }

  // Target context
  systemParts.push('');
  systemParts.push('======================================================================');
  systemParts.push('WHERE YOU ARE NOW');
  systemParts.push('======================================================================');
  systemParts.push('');
  systemParts.push(`You are now in a space called "${smartSpace?.name || run.smartSpaceId}".`);

  if (spaceMembers.length > 0) {
    systemParts.push('');
    systemParts.push('Participants in this space:');
    for (const m of spaceMembers) {
      systemParts.push(`- ${m.entity.displayName || 'Unknown'} (${m.entity.type})`);
    }
  }

  if (targetMessages.length > 0) {
    systemParts.push('');
    systemParts.push('Here is the recent conversation in this space (most recent last):');
    for (const m of targetMessages) {
      systemParts.push(formatMsgLine(m));
    }
  }

  // Task (placed last for maximum model attention)
  systemParts.push('');
  systemParts.push('======================================================================');
  systemParts.push('WHAT TO DO');
  systemParts.push('======================================================================');
  systemParts.push('');
  systemParts.push(`Based on your conversation in "${originSmartSpaceName}", you need to:`);
  systemParts.push('');
  systemParts.push(instruction);
  systemParts.push('');
  systemParts.push('RULES:');
  systemParts.push('- Address the participants in THIS space directly. You are talking TO them, not ABOUT them.');
  systemParts.push(`- Speak naturally as yourself. You remember being in "${originSmartSpaceName}" — use that context to speak with full understanding, not like you're reading from a script.`);
  systemParts.push('- Do NOT say things like "I was asked to tell you" or "I have a message for you" or "Just a heads up." You are not delivering a message. You are talking to participants you know, about something you know, because you were part of the original conversation.');
  systemParts.push('- Do NOT narrate what you are doing. Do not say "I am here to inform you" or "I am passing along information." Just say what needs to be said.');
  systemParts.push('- If the task requires action (e.g., scheduling, creating something), do it yourself using your available tools. Do not suggest that someone else do it.');
  systemParts.push(`- If you need to reference what was said in "${originSmartSpaceName}", do it naturally, for example "Husam mentioned..." — not "I received a task from ${originSmartSpaceName}."`);
  systemParts.push('');
  systemParts.push(`Your next response will be posted as a new message in "${smartSpace?.name || run.smartSpaceId}", visible to all participants.`);

  systemParts.push(...formatGoalsBlock(agentGoals));
  systemParts.push(...formatMemoriesBlock(agentMemories));
  systemParts.push(...formatPlansBlock(ctx.agentPlans));
  // No spaces list in child runs — the agent should focus on the task, not navigate

  const goToSystemPrompt = systemParts.join('\n');

  // v3: Only system prompt + "Go ahead." — no real conversation turns
  const aiSdkUiMessages = [
    { role: 'system' as const, parts: [{ type: 'text' as const, text: goToSystemPrompt }] },
    { role: 'user' as const, parts: [{ type: 'text' as const, text: 'Go ahead.' }] },
  ];

  return convertToModelMessages(aiSdkUiMessages as any);
}

// ─── Normal run message builder ─────────────────────────────────────────────

async function buildNormalRunMessages(ctx: RunContext) {
  const {
    run,
    agentDisplayName,
    spaceMembers,
    smartSpace,
    triggeredByEntity,
    agentGoals,
    agentMemories,
    agentMemberships,
    crossSpaceMessages,
  } = ctx;

  // Load messages WITH entity info so we can tag sender identity
  const messages = await prisma.smartSpaceMessage.findMany({
    where: { smartSpaceId: run.smartSpaceId },
    orderBy: { seq: 'asc' },
    take: 50,
    select: {
      id: true,
      role: true,
      content: true,
      metadata: true,
      entityId: true,
      entity: { select: { displayName: true, type: true } },
    },
  });

  // Build run context system message
  const contextParts: string[] = [];

  contextParts.push(`Current time: ${new Date().toISOString()}`);

  if (smartSpace?.name) {
    contextParts.push(`You are ${agentDisplayName}. You are a single entity that operates across multiple spaces — you move between them to interact with other participants.`);
    contextParts.push('Spaces can contain any combination of participants: humans, other AI agents, services (Node.js backends, integrations, IoT devices), or all of them together. Each participant is labeled with their type (human/agent/system). Adapt your communication style accordingly — speak naturally to humans, and be more direct or structured when interacting with agents or services.');
    contextParts.push(`You are currently in "${smartSpace.name}" (id: ${run.smartSpaceId}). Any response you produce in this run will be automatically posted as a message in this space. Do NOT use the goToSpace tool to send messages here — goToSpace is ONLY for carrying out tasks in a different space.`);
  }

  if (triggeredByEntity) {
    const name = triggeredByEntity.displayName || 'Unknown';
    contextParts.push(`This run was triggered by a message from ${name} (${triggeredByEntity.type}).`);
  }

  // Categorize space members
  const otherAgents = spaceMembers.filter(
    (m) => m.entity.type === 'agent' && m.entity.id !== run.agentEntityId
  );
  const isMultiAgent = otherAgents.length > 0;

  if (spaceMembers.length > 0) {
    const memberList = spaceMembers
      .map((m) => `${m.entity.displayName || 'Unknown'} (${m.entity.type}, id: ${m.entity.id})`)
      .join(', ');
    contextParts.push(`Members of this space: ${memberList}.`);
  }

  contextParts.push('Messages from other participants are prefixed with [Name] for identification. Do NOT prefix your own responses with your name or any tag.');

  // Chain context: was this agent mentioned/delegated/resumed?
  const runMetaForPrompt = (run.metadata as Record<string, unknown>) ?? {};
  if (runMetaForPrompt.mentionedBy) {
    const mentioner = spaceMembers.find((m) => m.entity.id === runMetaForPrompt.mentionedBy);
    const mentionerName = mentioner?.entity.displayName || 'another agent';
    const reason = runMetaForPrompt.mentionReason ? ` Reason: ${runMetaForPrompt.mentionReason}` : '';
    contextParts.push(`You were mentioned by ${mentionerName} to continue the conversation.${reason}`);
  }
  if (runMetaForPrompt.replyStackResume) {
    const reason = runMetaForPrompt.resumeReason ? ` You originally asked: ${runMetaForPrompt.resumeReason}` : '';
    contextParts.push(`You are being re-triggered because the agent you previously mentioned has finished responding. You can now continue your task with whatever information they provided.${reason}`);
  }

  if (isMultiAgent) {
    // ── Multi-agent space: explain mention chain system ──
    contextParts.push('');
    contextParts.push('MULTI-AGENT SPACE — You are one of several AI agents in this space. Only ONE agent is triggered per human message (round-robin). You must decide what to do:');
    contextParts.push('');
    contextParts.push('YOUR OPTIONS:');
    contextParts.push('1. RESPOND — You have something meaningful to say. Write your response normally. The conversation then waits for the next human message (unless you also mention another agent).');
    contextParts.push('2. RESPOND + MENTION — You respond AND need another agent to follow up. Call mentionAgent(targetAgentEntityId, reason, expectReply) alongside your text response:');
    contextParts.push('   - expectReply=false: hand off — the mentioned agent takes over, you\'re done.');
    contextParts.push('   - expectReply=true: request — the mentioned agent responds, then YOU are automatically re-triggered so you can continue your task with their output.');
    contextParts.push('3. DELEGATE — The message is clearly meant for another agent, or another agent has better tools/expertise. Call delegateToAgent(targetAgentEntityId, reason). Your run is silently canceled (no message posted) and the target agent handles it instead.');
    contextParts.push('4. SKIP — Nobody should respond to this message. Call skipResponse(). No message posted.');
    contextParts.push('');
    contextParts.push('GUIDELINES:');
    contextParts.push('- If the message is clearly directed at you or relevant to your expertise → RESPOND.');
    contextParts.push('- If the message is better suited for another agent → DELEGATE to them.');
    contextParts.push('- If you can partially handle it but need another agent\'s help → RESPOND with your part + MENTION the other agent.');
    contextParts.push('- If the message is a casual greeting or general question you can answer → RESPOND.');
    contextParts.push('- If the message doesn\'t need any agent response → SKIP.');
    contextParts.push('- Do NOT respond with something generic just to be polite — if you have nothing meaningful to add, delegate or skip.');
    contextParts.push('');
    contextParts.push('OTHER AGENTS IN THIS SPACE (use their entity IDs with mentionAgent/delegateToAgent):');
    for (const agent of otherAgents) {
      contextParts.push(`- ${agent.entity.displayName || 'Unknown'} (entity ID: ${agent.entity.id})`);
    }
  } else {
    // ── Single-agent space: simple instructions ──
    contextParts.push('You are the only agent in this space. Respond to messages directed at you. If a message doesn\'t need a response, you can call skipResponse().');
  }

  contextParts.push(...formatGoalsBlock(agentGoals));
  contextParts.push(...formatMemoriesBlock(agentMemories));
  contextParts.push(...formatPlansBlock(ctx.agentPlans));
  contextParts.push(...formatSpacesBlock(agentMemberships, run.smartSpaceId));
  contextParts.push(...formatCrossSpaceDigest(crossSpaceMessages, run.agentEntityId, agentDisplayName));

  // Tag messages with sender identity and fix roles:
  // - assistant messages from THIS agent: kept as assistant (no tag — the model knows these are its own)
  // - assistant messages from OTHER agents: converted to user role + tagged with [Name]
  //   (so the model only sees "assistant" for its own outputs, avoiding confusion)
  // - user/system messages: kept as-is + tagged with [Name]
  const taggedUiMessages = messages.map((m) => {
    const base = toUiMessageFromSmartSpaceMessage(m);
    const isOwnMessage = m.entityId === run.agentEntityId;
    const meta = (m.metadata ?? null) as Record<string, any> | null;

    // For own assistant messages with provenance (from goToSpace child runs),
    // prepend context so the agent remembers why it said this
    if (isOwnMessage && m.role === 'assistant' && meta?.provenance) {
      const prov = meta.provenance;
      const ctx = `[You remember saying this after coming from "${prov.originSpaceName || 'another space'}" — you went there because: ${prov.instruction || 'you had something to take care of'}]`;
      if (Array.isArray(base.parts)) {
        const parts = base.parts.map((p: any, i: number) => {
          if (i === 0 && p.type === 'text' && typeof p.text === 'string') {
            return { ...p, text: `${ctx} ${p.text}` };
          }
          return p;
        });
        return { ...base, parts };
      }
    }

    // Other agents' assistant messages → convert to user role
    const isOtherAgentMessage = m.role === 'assistant' && !isOwnMessage;
    if (isOtherAgentMessage) {
      const senderTag = m.entity?.displayName ? `[${m.entity.displayName}]` : '[Other Agent]';
      const parts = Array.isArray(base.parts)
        ? base.parts.map((p: any, i: number) => {
            if (i === 0 && p.type === 'text' && typeof p.text === 'string') {
              return { ...p, text: `${senderTag} ${p.text}` };
            }
            return p;
          })
        : base.parts;
      return { ...base, role: 'user', parts };
    }

    // Human/system messages → tag with sender name
    const shouldTag = (m.role === 'user' || m.role === 'system') && m.entity?.displayName;
    if (shouldTag) {
      const senderTag = `[${m.entity!.displayName}]`;
      if (Array.isArray(base.parts)) {
        const parts = base.parts.map((p: any, i: number) => {
          if (i === 0 && p.type === 'text' && typeof p.text === 'string') {
            return { ...p, text: `${senderTag} ${p.text}` };
          }
          return p;
        });
        return { ...base, parts };
      }
    }
    return base;
  });

  const aiSdkUiMessages = toAiSdkUiMessages(taggedUiMessages as any);

  // Prepend run context as a system message if we have context
  if (contextParts.length > 0) {
    aiSdkUiMessages.unshift({
      role: 'system',
      parts: [{ type: 'text', text: contextParts.join('\n') }],
    });
  }

  return convertToModelMessages(aiSdkUiMessages as any);
}

// ─── Plan run message builder ────────────────────────────────────────────────

async function buildPlanRunMessages(ctx: RunContext) {
  const {
    run,
    agentDisplayName,
    plan,
    agentGoals,
    agentMemories,
    agentMemberships,
    agentPlans,
    crossSpaceMessages,
  } = ctx;

  const systemParts: string[] = [];

  systemParts.push(`You are ${agentDisplayName}.`);
  systemParts.push(`Current time: ${new Date().toISOString()}`);
  systemParts.push('');

  // Explain the plan trigger
  systemParts.push('======================================================================');
  systemParts.push('YOU WERE TRIGGERED BY A PLAN');
  systemParts.push('======================================================================');
  systemParts.push('');
  systemParts.push('You are not in any specific space right now. You were triggered automatically by one of your scheduled plans.');
  systemParts.push('');

  if (plan) {
    systemParts.push(`Plan name: ${plan.planName}`);
    if (plan.planDescription) {
      systemParts.push(`Plan description: ${plan.planDescription}`);
    }
    if (plan.planInstruction) {
      systemParts.push('');
      systemParts.push('Your task:');
      systemParts.push(plan.planInstruction);
    }
  }

  systemParts.push('');
  systemParts.push('======================================================================');
  systemParts.push('HOW TO ACT');
  systemParts.push('======================================================================');
  systemParts.push('');
  systemParts.push('You are NOT in any space. Your response will NOT be posted anywhere automatically.');
  systemParts.push('To interact with participants or spaces, you MUST use the goToSpace tool. Look at your spaces list below to decide where to go.');
  systemParts.push('Spaces can contain any combination of participants: humans, other AI agents, services (Node.js backends, integrations, IoT devices), or all of them together. Each participant is labeled with their type (human/agent/system). Adapt your communication style accordingly — speak naturally to humans, and be more direct or structured when interacting with agents or services.');
  systemParts.push('You can go to multiple spaces if needed — just call goToSpace multiple times.');
  systemParts.push('If the plan requires no interaction (e.g. updating your own goals or memories), you can do that directly without going to a space.');
  systemParts.push('');
  systemParts.push('RULES:');
  systemParts.push('- Do NOT say "I was triggered by a plan" or "My plan told me to do this" to participants. Act naturally.');
  systemParts.push('- If you need to interact with someone, go to the relevant space and communicate as yourself.');
  systemParts.push('- After completing the task, consider if your plans need updating (e.g. mark a one-time task as done, adjust recurring schedules).');

  // Inject all agent context
  systemParts.push(...formatGoalsBlock(agentGoals));
  systemParts.push(...formatMemoriesBlock(agentMemories));
  systemParts.push(...formatPlansBlock(agentPlans));
  systemParts.push(...formatSpacesBlock(agentMemberships, run.smartSpaceId));
  systemParts.push(...formatCrossSpaceDigest(crossSpaceMessages, run.agentEntityId, agentDisplayName));

  const planSystemPrompt = systemParts.join('\n');

  const aiSdkUiMessages = [
    { role: 'system' as const, parts: [{ type: 'text' as const, text: planSystemPrompt }] },
    { role: 'user' as const, parts: [{ type: 'text' as const, text: 'Your plan has triggered. Execute it now.' }] },
  ];

  return convertToModelMessages(aiSdkUiMessages as any);
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Builds the model messages for a run based on its context.
 * Delegates to plan, goToSpace, or normal builder depending on run type.
 */
export async function buildModelMessages(ctx: RunContext) {
  if (ctx.isPlanRun) {
    return buildPlanRunMessages(ctx);
  }
  if (ctx.isGoToSpaceRun) {
    return buildGoToSpaceMessages(ctx);
  }
  return buildNormalRunMessages(ctx);
}
