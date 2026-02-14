import { convertToModelMessages } from 'ai';
import { prisma } from './db.js';
import { toUiMessageFromSmartSpaceMessage, toAiSdkUiMessages } from './message-converters.js';
import type { RunContext } from './run-context.js';

/**
 * Prompt Builder — Single-Run Architecture
 *
 * ONE unified builder for ALL agents (admin, non-admin, single-agent).
 * The agent's LLM text output is internal reasoning. All visible communication
 * happens through sendSpaceMessage.
 */

// ─── Shared formatters ─────────────────────────────────────────────────────

function formatGoalsBlock(goals: RunContext['agentGoals']): string[] {
  if (goals.length === 0) return [];
  const lines: string[] = [
    '',
    'GOALS:',
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
    'MEMORIES:',
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
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

function formatPlansBlock(plans: RunContext['agentPlans']): string[] {
  const lines: string[] = ['', 'PLANS:'];
  if (plans.length === 0) {
    lines.push('No active plans.');
    return lines;
  }
  for (const p of plans) {
    const type = p.isRecurring ? 'recurring' : 'one-time';
    const schedule = p.cron ? `cron: ${p.cron}` : (p.scheduledAt ? `at: ${p.scheduledAt.toISOString()}` : 'no schedule');
    const remaining = p.nextRunAt ? ` (in ${formatRemainingTime(p.nextRunAt)})` : '';
    const desc = p.description ? ` — ${p.description}` : '';
    lines.push(`- ${p.name} (${type}, ${schedule})${desc}${remaining}`);
  }
  return lines;
}

function formatSpacesBlock(
  memberships: RunContext['agentMemberships'],
  triggerSpaceId: string | null,
): string[] {
  if (memberships.length === 0) return [];
  const lines: string[] = ['', 'YOUR SPACES (you can sendSpaceMessage to any of these):'];
  for (const membership of memberships) {
    const sp = membership.smartSpace;
    const isTrigger = sp.id === triggerSpaceId;
    const members = sp.memberships
      .map((m) => {
        const name = m.entity.displayName || 'Unknown';
        return `${name} (${m.entity.type})`;
      })
      .join(', ');
    lines.push(`- "${sp.name || sp.id}" (id: ${sp.id})${isTrigger ? ' [TRIGGER SPACE]' : ''} — ${members}`);
  }
  return lines;
}

// ─── Trigger context formatter ──────────────────────────────────────────────

function formatTriggerContext(ctx: RunContext): string[] {
  const { run } = ctx;
  const lines: string[] = [];

  if (run.triggerType === 'space_message') {
    const spaceName = ctx.triggerSpace?.name || run.triggerSpaceId || 'unknown';
    const senderName = run.triggerSenderName || 'Unknown';
    const senderType = run.triggerSenderType || 'unknown';

    if (senderType === 'agent') {
      lines.push(`TRIGGER: Message from ${senderName} (agent) in "${spaceName}":`);
      lines.push(`"${run.triggerMessageContent || ''}"`);
      if (run.triggerMentionReason) {
        lines.push(`Mention reason: ${run.triggerMentionReason}`);
      }
    } else {
      lines.push(`TRIGGER: Message from ${senderName} in "${spaceName}":`);
      lines.push(`"${run.triggerMessageContent || ''}"`);
    }
  } else if (run.triggerType === 'plan') {
    lines.push(`TRIGGER: Scheduled plan "${run.triggerPlanName || 'unknown'}" triggered.`);
  } else if (run.triggerType === 'service') {
    lines.push(`TRIGGER: Service "${run.triggerServiceName || 'unknown'}" triggered you.`);
    if (run.triggerPayload) {
      try {
        lines.push(`Payload: ${JSON.stringify(run.triggerPayload)}`);
      } catch {
        lines.push(`Payload: (unparseable)`);
      }
    }
  }

  return lines;
}

// ─── Unified message builder ────────────────────────────────────────────────

/**
 * Builds the model messages for ANY run.
 * Single unified builder — same structure for admin, non-admin, single-agent, plan, service triggers.
 */
export async function buildModelMessages(ctx: RunContext) {
  const {
    run,
    agentDisplayName,
    isAdminAgent,
    isMultiAgentSpace,
    triggerSpaceMembers,
    triggerSpace,
    agentGoals,
    agentMemories,
    agentMemberships,
    agentPlans,
    otherActiveRunCount,
  } = ctx;

  const systemParts: string[] = [];

  // ── Identity ──
  systemParts.push(`You are ${agentDisplayName}.`);
  systemParts.push(`Current time: ${new Date().toISOString()}`);
  systemParts.push('');

  // ── Core instruction ──
  systemParts.push('Your text output is internal — never shown to anyone. Keep it short (1-2 sentences summarizing what you did).');
  systemParts.push('To communicate, use sendSpaceMessage(spaceId, text). Do NOT retry — it returns {success:true} on delivery.');
  systemParts.push('Use readSpaceMessages to read context from any space you belong to.');

  // ── Trigger context ──
  systemParts.push('');
  systemParts.push(...formatTriggerContext(ctx));

  // ── Space members (for space_message triggers) ──
  if (run.triggerType === 'space_message' && triggerSpaceMembers.length > 0) {
    systemParts.push('');
    systemParts.push(`SPACE: "${triggerSpace?.name || run.triggerSpaceId}"`);
    systemParts.push('MEMBERS:');
    for (const m of triggerSpaceMembers) {
      const isYou = m.entity.id === run.agentEntityId;
      const isAdmin = triggerSpace?.adminAgentEntityId === m.entity.id;
      const label = isYou
        ? `You${isAdmin ? ' (admin)' : ''} (entity: ${m.entity.id})`
        : `${m.entity.displayName || 'Unknown'} (${m.entity.type}${isAdmin ? ', admin' : ''}, entity: ${m.entity.id})`;
      lines_push(systemParts, `- ${label}`);
    }
  }

  // ── Admin agent instructions ──
  if (isAdminAgent && isMultiAgentSpace && run.triggerType === 'space_message' && run.triggerSenderType === 'human') {
    systemParts.push('');
    systemParts.push('You are the admin agent — human messages come to you first. You can:');
    systemParts.push('- Respond directly using sendSpaceMessage');
    systemParts.push('- Delegate to another agent using delegateToAgent(entityId) — your run is silently canceled and the target agent receives the original human message');
    systemParts.push('- Mention another agent using sendSpaceMessage with mention — your message appears in the space and the mentioned agent is triggered');
    systemParts.push('- Skip using skipResponse if no response is needed');
  } else if (isMultiAgentSpace && run.triggerType === 'space_message') {
    systemParts.push('');
    systemParts.push('Use sendSpaceMessage to respond. You can mention other agents to trigger them.');
  } else if (run.triggerType === 'plan' || run.triggerType === 'service') {
    systemParts.push('');
    systemParts.push('Use sendSpaceMessage to post to any space you belong to. Use readSpaceMessages for context.');
  }

  // ── Concurrent run awareness ──
  if (otherActiveRunCount > 0) {
    systemParts.push('');
    systemParts.push(`⚠ You have ${otherActiveRunCount} other active run${otherActiveRunCount > 1 ? 's' : ''}. Use getMyRuns for details. Avoid duplicating work.`);
  }

  // ── Agent context (goals, memories, plans, spaces) ──
  systemParts.push(...formatGoalsBlock(agentGoals));
  systemParts.push(...formatMemoriesBlock(agentMemories));
  systemParts.push(...formatPlansBlock(agentPlans));
  systemParts.push(...formatSpacesBlock(agentMemberships, run.triggerSpaceId));

  const systemPrompt = systemParts.join('\n');

  // For space_message triggers: load conversation history from the trigger space
  if (run.triggerType === 'space_message' && run.triggerSpaceId) {
    const messages = await prisma.smartSpaceMessage.findMany({
      where: { smartSpaceId: run.triggerSpaceId },
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

    const taggedUiMessages = messages.map((m) => {
      const base = toUiMessageFromSmartSpaceMessage(m);
      const isOwnMessage = m.entityId === run.agentEntityId;

      // Other agents' assistant messages → convert to user role + tag
      if (m.role === 'assistant' && !isOwnMessage) {
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

      // Human messages → tag with sender name
      if ((m.role === 'user' || m.role === 'system') && m.entity?.displayName) {
        const senderTag = `[${m.entity.displayName}]`;
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

    // Prepend system prompt
    aiSdkUiMessages.unshift({
      role: 'system',
      parts: [{ type: 'text', text: systemPrompt }],
    });

    return convertToModelMessages(aiSdkUiMessages as any);
  }

  // For plan/service triggers: no conversation history, just system + trigger prompt
  const triggerPrompt = run.triggerType === 'plan'
    ? 'Your plan has triggered. Execute it now.'
    : run.triggerType === 'service'
      ? 'A service has triggered you. Process the payload and act accordingly.'
      : 'Go ahead.';

  const aiSdkUiMessages = [
    { role: 'system' as const, parts: [{ type: 'text' as const, text: systemPrompt }] },
    { role: 'user' as const, parts: [{ type: 'text' as const, text: triggerPrompt }] },
  ];

  return convertToModelMessages(aiSdkUiMessages as any);
}

// Helper to avoid the verbose systemParts.push pattern
function lines_push(arr: string[], line: string) {
  arr.push(line);
}
