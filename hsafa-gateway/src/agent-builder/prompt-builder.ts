// =============================================================================
// Prompt Builder
// =============================================================================
// Builds the structured system prompt from DB context.
// Sections: Identity → Trigger → Active Space → Spaces → Agent Context → Instructions

import { prisma } from '../lib/db.js';

// Number of recent messages to include in the trigger-space history block
const HISTORY_LIMIT = 50;

// =============================================================================
// Types
// =============================================================================

export interface BuildPromptOptions {
  runId: string;
  agentEntityId: string;
  agentName: string;
  agentId: string;
}

export interface BuiltPrompt {
  systemPrompt: string;
}

// =============================================================================
// buildPrompt
// =============================================================================

export async function buildPrompt(options: BuildPromptOptions): Promise<BuiltPrompt> {
  const { runId, agentEntityId, agentName, agentId } = options;

  // Load run + agent instructions
  const run = await prisma.run.findUniqueOrThrow({
    where: { id: runId },
    include: {
      agent: { select: { configJson: true } },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agentConfig = run.agent.configJson as any;
  const agentInstructions: string | null = agentConfig?.instructions ?? null;

  const parts: string[] = [];
  const now = new Date().toISOString();

  // ── 1. Identity ────────────────────────────────────────────────────────────
  parts.push('IDENTITY:');
  parts.push(`  name: "${agentName}"`);
  parts.push(`  entityId: "${agentEntityId}"`);
  parts.push(`  currentTime: "${now}"`);
  parts.push('');

  // ── 2. Trigger ─────────────────────────────────────────────────────────────
  parts.push('TRIGGER:');
  parts.push(`  type: ${run.triggerType ?? 'unknown'}`);

  if (run.triggerType === 'space_message') {
    if (run.triggerSpaceId) {
      const triggerSpace = await prisma.smartSpace.findUnique({
        where: { id: run.triggerSpaceId },
        select: { id: true, name: true },
      });
      parts.push(
        `  space: "${triggerSpace?.name ?? run.triggerSpaceId}" (id: ${run.triggerSpaceId})`,
      );
    }
    if (run.triggerSenderName) {
      parts.push(
        `  sender: ${run.triggerSenderName} (${run.triggerSenderType ?? 'unknown'}, id: ${run.triggerSenderEntityId ?? 'unknown'})`,
      );
    }
    if (run.triggerMessageContent) {
      parts.push(`  message: "${run.triggerMessageContent}"`);
    }
    if (run.triggerMessageId) {
      parts.push(`  messageId: ${run.triggerMessageId}`);
    }
    parts.push(`  timestamp: "${run.createdAt.toISOString()}"`);
  } else if (run.triggerType === 'plan') {
    if (run.triggerPlanName) {
      parts.push(`  plan: "${run.triggerPlanName}" (id: ${run.triggerPlanId ?? 'unknown'})`);
    }
    if (run.triggerPlanInstruction) {
      parts.push(`  instruction: "${run.triggerPlanInstruction}"`);
    }
    parts.push(`  scheduledAt: "${run.createdAt.toISOString()}"`);
  } else if (run.triggerType === 'service') {
    if (run.triggerServiceName) {
      parts.push(`  service: "${run.triggerServiceName}"`);
    }
    if (run.triggerPayload) {
      parts.push(`  payload: ${JSON.stringify(run.triggerPayload)}`);
    }
  }
  parts.push('');

  // ── 3. Active Space (auto-set for space_message triggers) ──────────────────
  parts.push('ACTIVE SPACE:');
  if (run.activeSpaceId) {
    const activeSpace = await prisma.smartSpace.findUnique({
      where: { id: run.activeSpaceId },
      select: { id: true, name: true },
    });
    const autoSetNote = run.triggerType === 'space_message' ? ' [auto-set from trigger]' : '';
    parts.push(
      `  "${activeSpace?.name ?? run.activeSpaceId}" (id: ${run.activeSpaceId})${autoSetNote}`,
    );
  } else {
    parts.push('  none (call enter_space to enter a space first)');
  }
  parts.push('');

  // ── 4. Space History (trigger space only, for space_message triggers) ──────
  if (run.triggerSpaceId && run.triggerType === 'space_message') {
    const spaceForHistory = await prisma.smartSpace.findUnique({
      where: { id: run.triggerSpaceId },
      select: { id: true, name: true },
    });

    // Get agent's lastProcessedMessageId for this space
    const membership = await prisma.smartSpaceMembership.findUnique({
      where: {
        smartSpaceId_entityId: {
          smartSpaceId: run.triggerSpaceId,
          entityId: agentEntityId,
        },
      },
      select: { lastProcessedMessageId: true },
    });

    let lastProcessedSeq = BigInt(0);
    if (membership?.lastProcessedMessageId) {
      const lastMsg = await prisma.smartSpaceMessage.findUnique({
        where: { id: membership.lastProcessedMessageId },
        select: { seq: true },
      });
      lastProcessedSeq = lastMsg?.seq ?? BigInt(0);
    }

    const messages = await prisma.smartSpaceMessage.findMany({
      where: { smartSpaceId: run.triggerSpaceId },
      orderBy: { seq: 'desc' },
      take: HISTORY_LIMIT,
      include: {
        entity: { select: { id: true, displayName: true, type: true } },
      },
    });
    messages.reverse(); // oldest-first

    parts.push(`SPACE HISTORY ("${spaceForHistory?.name ?? run.triggerSpaceId}"):`);
    for (const msg of messages) {
      const marker = msg.seq <= lastProcessedSeq ? '[SEEN]' : '[NEW]';
      const senderName = msg.entity.displayName ?? 'Unknown';
      const senderType = msg.entity.type as string;
      const isTrigger = msg.id === run.triggerMessageId ? ' ← TRIGGER' : '';
      const shortId = `msg:${msg.id.slice(0, 8)}`;
      const ts = msg.createdAt.toISOString();
      const content = msg.content ?? '';

      parts.push(
        `  [${shortId}] [${ts}] ${senderName} (${senderType}, id:${msg.entity.id}): "${content}"  ${marker}${isTrigger}`,
      );
    }
    parts.push('');
  }

  // ── 5. Spaces the agent belongs to ────────────────────────────────────────
  const memberships = await prisma.smartSpaceMembership.findMany({
    where: { entityId: agentEntityId },
    include: {
      smartSpace: {
        select: {
          id: true,
          name: true,
          memberships: {
            include: { entity: { select: { id: true, displayName: true, type: true } } },
          },
        },
      },
    },
  });

  parts.push('YOUR SPACES:');
  for (const m of memberships) {
    const space = m.smartSpace;
    const isActive = space.id === run.activeSpaceId ? ' [ACTIVE]' : '';
    const memberNames = space.memberships
      .map((sm) => {
        const isYou = sm.entityId === agentEntityId;
        return isYou ? 'You' : `${sm.entity.displayName ?? 'Unknown'} (${sm.entity.type})`;
      })
      .join(', ');
    parts.push(`  - "${space.name ?? space.id}" (id: ${space.id})${isActive} — ${memberNames}`);
  }
  parts.push('');

  // ── 6. Agent Context: Memories, Goals, Plans, Active Runs ─────────────────

  // Memories
  const memories = await prisma.memory.findMany({
    where: { entityId: agentEntityId },
    orderBy: { updatedAt: 'desc' },
    select: { key: true, value: true },
  });
  if (memories.length > 0) {
    parts.push('MEMORIES:');
    for (const mem of memories) {
      parts.push(`  - [${mem.key}] ${mem.value}`);
    }
    parts.push('');
  }

  // Goals (active only)
  const goals = await prisma.goal.findMany({
    where: { entityId: agentEntityId, status: 'active' },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, description: true, priority: true },
  });
  if (goals.length > 0) {
    parts.push('GOALS:');
    for (const goal of goals) {
      parts.push(`  - ${goal.description} (id: ${goal.id}, priority: ${goal.priority})`);
    }
    parts.push('');
  }

  // Plans (active/pending)
  const plans = await prisma.plan.findMany({
    where: { entityId: agentEntityId, status: { in: ['pending', 'running'] } },
    orderBy: { nextRunAt: 'asc' },
    select: { id: true, name: true, isRecurring: true, cron: true, nextRunAt: true, instruction: true },
  });
  if (plans.length > 0) {
    parts.push('PLANS:');
    for (const plan of plans) {
      const schedInfo = plan.isRecurring
        ? `recurring, cron: ${plan.cron}, next: ${plan.nextRunAt?.toISOString() ?? 'soon'}`
        : `one-time, scheduledAt: ${plan.nextRunAt?.toISOString() ?? 'soon'}`;
      parts.push(`  - "${plan.name}" (${schedInfo})`);
      if (plan.instruction) {
        parts.push(`    instruction: "${plan.instruction}"`);
      }
    }
    parts.push('');
  }

  // Active runs (other than current)
  const activeRuns = await prisma.run.findMany({
    where: {
      agentEntityId,
      id: { not: runId },
      status: { in: ['running', 'queued', 'waiting_tool'] },
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      status: true,
      triggerType: true,
      triggerSpaceId: true,
      triggerSenderName: true,
      triggerMessageContent: true,
      activeSpaceId: true,
      startedAt: true,
    },
  });
  if (activeRuns.length > 0) {
    parts.push('ACTIVE RUNS:');
    parts.push(`  - Run ${runId} (this run) — triggered by ${run.triggerSenderName ?? 'system'}`);
    for (const r of activeRuns) {
      const trigger = r.triggerSenderName
        ? `${r.triggerSenderName}: "${r.triggerMessageContent ?? ''}"`
        : r.triggerType ?? 'unknown';
      parts.push(
        `  - Run ${r.id} (${r.status}) — triggered by ${trigger}${r.activeSpaceId ? ` in space ${r.activeSpaceId}` : ''}`,
      );
    }
    parts.push('');
  }

  // ── 7. Instructions ────────────────────────────────────────────────────────
  parts.push('INSTRUCTIONS:');
  parts.push('  - Your text output is internal reasoning — never shown to anyone. Keep it brief.');
  parts.push(
    '  - Use send_message to communicate. The trigger space is already active — call enter_space only to switch to a different space.',
  );
  parts.push('  - Use read_messages to load conversation history from any space you belong to.');
  parts.push(
    '  - If you have nothing to contribute, end this run without calling send_message.',
  );
  parts.push(
    '  - Runs are stateless. Use set_memories and set_goals to persist important state across runs.',
  );
  parts.push(
    '  - send_message returns {success:true} when delivered — do NOT retry on success.',
  );

  // Inject custom agent instructions from config (after system instructions)
  if (agentInstructions) {
    parts.push('');
    parts.push('AGENT INSTRUCTIONS:');
    parts.push(`  ${agentInstructions.replace(/\n/g, '\n  ')}`);
  }

  return { systemPrompt: parts.join('\n') };
}
