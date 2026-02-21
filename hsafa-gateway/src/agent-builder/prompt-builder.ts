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
    parts.push(
      `  ✅ You ARE in space "${activeSpace?.name ?? run.activeSpaceId}" (id: ${run.activeSpaceId})`,
    );
    parts.push(
      '  You can call send_message immediately — no need to call enter_space.',
    );
  } else {
    parts.push('  ⚠️ You are NOT in any space.');
    parts.push(
      '  You MUST call enter_space with a spaceId from YOUR SPACES below before you can send_message.',
    );
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

  parts.push('YOUR SPACES (send_message only reaches members of the ACTIVE space):');
  for (const m of memberships) {
    const space = m.smartSpace;
    const isActive = space.id === run.activeSpaceId ? ' [ACTIVE]' : '';
    const otherMembers = space.memberships
      .filter((sm) => sm.entityId !== agentEntityId)
      .map((sm) => `${sm.entity.displayName ?? 'Unknown'} (${sm.entity.type})`)
      .join(', ');
    parts.push(`  - "${space.name ?? space.id}" (id: ${space.id})${isActive} — members: You, ${otherMembers || 'none'}`);
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

  // ── 7. Client Tool Results (from previous waiting_tool cycle) ───────────────
  const runMetadata = run.metadata as Record<string, unknown> | null;
  const clientToolResults = runMetadata?.clientToolResults as Record<string, unknown> | undefined;
  if (clientToolResults && Object.keys(clientToolResults).length > 0) {
    parts.push('PREVIOUS TOOL RESULTS (from user interaction):');
    // Also load the tool call records so we can show tool name + args alongside results
    const toolCallRecords = await prisma.toolCall.findMany({
      where: { runId },
      orderBy: { seq: 'asc' },
    });
    for (const tc of toolCallRecords) {
      const result = clientToolResults[tc.callId];
      parts.push(`  - ${tc.toolName}(${JSON.stringify(tc.args)})`);
      parts.push(`    result: ${JSON.stringify(result)}`);
    }
    parts.push('  Continue based on the user\'s responses above. Do NOT call the same tools again.');
    parts.push('');
  }

  // ── 8. Instructions ────────────────────────────────────────────────────────
  parts.push('INSTRUCTIONS:');
  parts.push('  - Your text output is internal reasoning — never shown to anyone. Keep it brief.');

  // Space-specific instructions based on whether active space is set
  if (run.activeSpaceId) {
    parts.push(
      '  - You are ALREADY in a space. You can call send_message directly to reply to the ACTIVE space.',
    );
  } else {
    parts.push(
      '  - You are NOT in any space. You MUST call enter_space(spaceId) before send_message.',
    );
  }

  // Critical routing instruction
  parts.push(
    '  - ROUTING: send_message ONLY delivers to members of your ACTIVE space. Look at YOUR SPACES to see who is in each space.',
  );
  parts.push(
    '  - To message someone in a DIFFERENT space: call enter_space(theirSpaceId) first, then send_message. For example, if Ahmad asks you to "tell Husam something", find the space where Husam is a member, enter_space to that space, then send_message there.',
  );
  parts.push(
    '  - After delivering a message to another space, you may want to enter_space back to the original space to confirm delivery to the requester.',
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
  parts.push(
    '  - If any tool returns {success:false}, read the error message and take corrective action.',
  );

  // Inject custom agent instructions from config (after system instructions)
  if (agentInstructions) {
    parts.push('');
    parts.push('AGENT INSTRUCTIONS:');
    parts.push(`  ${agentInstructions.replace(/\n/g, '\n  ')}`);
  }

  return { systemPrompt: parts.join('\n') };
}
