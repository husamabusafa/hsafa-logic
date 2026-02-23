// =============================================================================
// Prompt Builder
// =============================================================================
// Builds the structured system prompt from DB context.
// Sections: Identity → Trigger → Active Space → Spaces → Agent Context → Instructions

import { prisma } from '../lib/db.js';

// Number of recent messages to include in the trigger-space history block
const HISTORY_LIMIT = 50;

// =============================================================================
// Helpers — Run context annotation for agent messages
// =============================================================================

/**
 * Format a compact run-context annotation for an agent's own message.
 * This tells the agent WHY it sent this message in a previous run.
 */
function formatRunContextAnnotation(metadata: Record<string, unknown> | null, agentEntityId: string, msgEntityId: string): string | null {
  if (!metadata || msgEntityId !== agentEntityId) return null;
  const rc = metadata.runContext as Record<string, unknown> | undefined;
  if (!rc) return null;

  const parts: string[] = [];

  // Trigger info
  const trigger = rc.trigger as Record<string, unknown> | undefined;
  if (trigger) {
    if (trigger.type === 'space_message' && trigger.senderName) {
      const preview = trigger.messageContent
        ? `"${String(trigger.messageContent).slice(0, 80)}${String(trigger.messageContent).length > 80 ? '...' : ''}"`
        : '';
      const spacePart = trigger.spaceName ? ` in "${trigger.spaceName}"` : '';
      parts.push(`triggered by ${trigger.senderName}${spacePart}${preview ? ': ' + preview : ''}`);
    } else if (trigger.type === 'service' && trigger.serviceName) {
      parts.push(`triggered by service "${trigger.serviceName}"`);
    } else if (trigger.type === 'plan' && trigger.planName) {
      parts.push(`triggered by plan "${trigger.planName}"`);
    }
  }

  // Cross-space indicator
  if (rc.isCrossSpace) {
    parts.push('cross-space message');
  }

  // Actions before this message
  const actions = rc.actionsBefore as Record<string, unknown[]> | undefined;
  if (actions) {
    const tools = actions.toolsCalled as { name: string }[] | undefined;
    if (tools && tools.length > 0) {
      parts.push(`used: ${tools.map(t => t.name).join(', ')}`);
    }
    const msgs = actions.messagesSent as { spaceName?: string; preview: string }[] | undefined;
    if (msgs && msgs.length > 0) {
      parts.push(`sent ${msgs.length} message(s) before this`);
    }
    const spaces = actions.spacesEntered as { spaceName?: string }[] | undefined;
    if (spaces && spaces.length > 0) {
      const names = spaces.map(s => s.spaceName ?? 'unknown').join(', ');
      parts.push(`entered: ${names}`);
    }
  }

  if (parts.length === 0) return null;
  return parts.join(' | ');
}

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

  // ── 3. Active Space ─────────────────────────────────────────────────────────
  parts.push('ACTIVE SPACE: NONE');
  parts.push('  You MUST call enter_space(spaceId) before you can send_message.');
  parts.push('  Look at YOUR SPACES below to decide which space to enter based on who you need to reach.');
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
      const isYou = msg.entity.id === agentEntityId;
      const senderLabel = isYou ? 'You (agent)' : `${msg.entity.displayName ?? 'Unknown'} (${msg.entity.type as string}, id:${msg.entity.id})`;
      const isTrigger = msg.id === run.triggerMessageId ? ' \u2190 TRIGGER' : '';
      const shortId = `msg:${msg.id.slice(0, 8)}`;
      const ts = msg.createdAt.toISOString();

      // Tool call messages have content set to readable summary (e.g. "[Tool: x] Input: ... Result: ...")
      // Regular messages have plain text content. Both are handled uniformly.
      const content = msg.content ?? '';

      // For tool call messages, also show structured info from metadata
      const meta = msg.metadata as Record<string, unknown> | null;
      const toolParts = (meta?.uiMessage as any)?.parts as Array<Record<string, unknown>> | undefined;
      const isToolCall = Array.isArray(toolParts) && toolParts.some((p) => p.type === 'tool_call');

      if (isToolCall) {
        // Show tool call with structured data for clarity
        for (const p of toolParts!) {
          if (p.type !== 'tool_call') continue;
          const toolName = (p.toolName as string) || 'unknown';
          const status = (p.status as string) || 'unknown';
          const argsStr = p.args ? JSON.stringify(p.args).slice(0, 200) : '';
          const resultStr = p.result ? JSON.stringify(p.result).slice(0, 200) : '';
          parts.push(
            `  [${shortId}] [${ts}] ${senderLabel}: [Tool: ${toolName}] args=${argsStr} result=${resultStr} (${status})  ${marker}${isTrigger}`,
          );
        }
      } else {
        parts.push(
          `  [${shortId}] [${ts}] ${senderLabel}: "${content}"  ${marker}${isTrigger}`,
        );
      }

      // For the agent's own messages: show WHY it sent this message
      if (isYou && !isToolCall) {
        const annotation = formatRunContextAnnotation(
          meta,
          agentEntityId,
          msg.entity.id,
        );
        if (annotation) {
          parts.push(`              [context: ${annotation}]`);
        }
      }
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

  // Active runs (other than current) — with full action details
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
      triggerSenderType: true,
      triggerMessageContent: true,
      triggerServiceName: true,
      triggerPlanName: true,
      activeSpaceId: true,
      startedAt: true,
    },
  });

  // Always show ACTIVE RUNS (at minimum the current run)
  parts.push('ACTIVE RUNS:');

  // Current run
  const currentTrigger = run.triggerSenderName
    ? `${run.triggerSenderName}: "${run.triggerMessageContent ?? ''}"`
    : run.triggerType ?? 'unknown';
  parts.push(`  ▸ Run ${runId} (this run) — ${currentTrigger}`);

  // Other active runs with full details
  for (const r of activeRuns) {
    const trigger = r.triggerSenderName
      ? `${r.triggerSenderName} (${r.triggerSenderType ?? 'unknown'}): "${r.triggerMessageContent ?? ''}"`
      : r.triggerType === 'service'
        ? `service "${r.triggerServiceName ?? 'unknown'}"`
        : r.triggerType === 'plan'
          ? `plan "${r.triggerPlanName ?? 'unknown'}"`
          : r.triggerType ?? 'unknown';

    parts.push(`  ▸ Run ${r.id} (${r.status}) — triggered by ${trigger}`);

    // Load what this run has done: messages sent + tools called
    const [runMessages, runToolCalls] = await Promise.all([
      prisma.smartSpaceMessage.findMany({
        where: { runId: r.id, entityId: agentEntityId },
        orderBy: { seq: 'asc' },
        select: {
          content: true,
          smartSpaceId: true,
          smartSpace: { select: { name: true } },
          createdAt: true,
        },
        take: 10,
      }),
      prisma.toolCall.findMany({
        where: { runId: r.id },
        orderBy: { seq: 'asc' },
        select: { toolName: true, status: true },
        take: 10,
      }),
    ]);

    if (runToolCalls.length > 0) {
      const toolSummary = runToolCalls
        .map((tc) => `${tc.toolName}(${tc.status})`)
        .join(', ');
      parts.push(`    tools: ${toolSummary}`);
    }

    if (runMessages.length > 0) {
      for (const rm of runMessages) {
        const preview = (rm.content ?? '').slice(0, 60);
        const spaceName = rm.smartSpace?.name ?? rm.smartSpaceId;
        parts.push(`    sent to "${spaceName}": "${preview}${(rm.content ?? '').length > 60 ? '...' : ''}"`);
      }
    }

    if (r.activeSpaceId) {
      const activeSpace = await prisma.smartSpace.findUnique({
        where: { id: r.activeSpaceId },
        select: { name: true },
      });
      parts.push(`    currently in: "${activeSpace?.name ?? r.activeSpaceId}"`);
    }
  }
  parts.push('');

  // ── 7. Client Tool Results (from previous waiting_tool cycle) ───────────────
  // Read completed tool calls from ToolCall records (single source of truth).
  const completedToolCallRecords = await prisma.toolCall.findMany({
    where: { runId, status: 'completed' },
    orderBy: { seq: 'asc' },
  });
  if (completedToolCallRecords.length > 0) {
    parts.push('COMPLETED TOOL RESULTS (the user already responded — these tools are DONE):');
    for (const tc of completedToolCallRecords) {
      parts.push(`  - ${tc.toolName}(${JSON.stringify(tc.args)})`);
      parts.push(`    user response: ${JSON.stringify(tc.output)}`);
    }
    parts.push('  CRITICAL: You already called these tools and received results. Do NOT call them again.');
    parts.push('  Acknowledge the user\'s response and continue with your next action (e.g. send_message).');
    parts.push('');
  }

  // ── 8. Multi-agent detection ──────────────────────────────────────────────
  // Count how many agent members are in the trigger space to tailor instructions
  let isMultiAgentSpace = false;
  if (run.triggerSpaceId) {
    const agentMemberCount = await prisma.smartSpaceMembership.count({
      where: {
        smartSpaceId: run.triggerSpaceId,
        entity: { type: 'agent' },
      },
    });
    isMultiAgentSpace = agentMemberCount > 1;
  }

  // ── 9. Instructions ────────────────────────────────────────────────────────
  parts.push('INSTRUCTIONS:');
  parts.push('');

  // --- Identity & Continuity ---
  parts.push('  IDENTITY & CONTINUITY:');
  parts.push('  - You are one continuous entity across all runs. Messages marked "You (agent)" are yours from previous runs.');
  parts.push('  - The [context: ...] annotations on your past messages explain WHY you sent them — use this to avoid repeating yourself.');
  parts.push('  - Check SPACE HISTORY and ACTIVE RUNS before doing anything. Never duplicate work you already did.');
  parts.push('  - Use set_memories to persist important facts, preferences, or context across runs.');
  parts.push('');

  // --- Internal Reasoning ---
  parts.push('  REASONING (your text output is PRIVATE — never shown to anyone):');
  parts.push('  - Think step by step: (1) What triggered this run? (2) Is this already handled? (3) Who needs a response? (4) Should I respond at all?');
  parts.push('  - Keep reasoning brief — just enough to decide your action.');
  parts.push('');

  // --- When NOT to respond ---
  parts.push('  WHEN TO STAY SILENT (critical):');
  parts.push('  - You do NOT have to respond to every message. If you have nothing useful to add, end the run silently (stop generating without calling send_message).');
  parts.push('  - Do NOT respond if the message is not directed at you and another agent is better suited.');
  parts.push('  - Do NOT respond just to acknowledge, agree, or say "okay" — only respond when you add real value.');
  parts.push('  - Do NOT respond to your own messages or to messages that are clearly a reply to someone else.');
  if (isMultiAgentSpace) {
    parts.push('  - This is a MULTI-AGENT space. Be especially selective. If another agent already handled it, stay silent.');
    parts.push('  - After completing a task with send_message, END your run immediately. Do NOT send follow-ups like "let me know if you need anything."');
  }
  parts.push('');

  // --- Infinite Loop Prevention ---
  parts.push('  LOOP PREVENTION (mandatory):');
  parts.push('  - NEVER reply to another agent\'s message just because it exists. Agent-to-agent ping-pong creates infinite loops.');
  parts.push('  - If your trigger message is FROM another agent: only respond if the message explicitly asks YOU a question or requests YOUR action. Otherwise, end silently.');
  parts.push('  - ONE message per task. Send your response and stop. Do not send a message, then send another follow-up in the same run.');
  parts.push('  - If you see your own recent message in SPACE HISTORY that already answers the trigger, end silently — you already handled it.');
  parts.push('  - If you notice a back-and-forth pattern between agents in the history, STOP. End silently and let a human break the cycle.');
  parts.push('');

  // --- Concurrent Runs & absorb_run ---
  parts.push('  CONCURRENT RUNS:');
  parts.push('  - Check ACTIVE RUNS above. If you see another active run with a RELATED trigger (same topic, same person, same space), absorb it:');
  parts.push('    → Call absorb_run(runId) to cancel the older run and inherit its context.');
  parts.push('    → Then handle BOTH triggers in this single run.');
  parts.push('  - If the other run is handling a DIFFERENT topic, leave it alone.');
  parts.push('  - If two runs are nearly identical (same sender, same question), absorb the older one to avoid duplicate responses.');
  parts.push('  - Use stop_run(runId) when an active run is completely stale or irrelevant (not worth absorbing).');
  parts.push('');

  // --- Routing ---
  parts.push('  ROUTING:');
  parts.push('  - You start each run with no active space. Call enter_space(spaceId) before send_message.');
  parts.push('  - send_message reaches only members of your ACTIVE space. Verify the recipient is there.');
  parts.push('  - To reach a specific person, find their space in YOUR SPACES, enter it, then send.');
  parts.push('');

  // --- Tools ---
  parts.push('  TOOLS:');
  parts.push('  - read_messages loads history from any space you belong to.');
  parts.push('  - send_message returns {success: true} on delivery — do NOT retry after success.');
  parts.push('  - On tool failure, read the error message and correct your input.');
  parts.push('');

  // --- Behavior ---
  parts.push('  BEHAVIOR:');
  parts.push('  - Focus on [NEW] messages. [SEEN] messages were already processed in prior runs.');
  parts.push('  - Be concise and direct. Respond naturally.');
  parts.push('  - When in doubt, do less. Silence is better than noise.');

  // Inject custom agent instructions from config (after system instructions)
  if (agentInstructions) {
    parts.push('');
    parts.push('AGENT INSTRUCTIONS:');
    parts.push(`  ${agentInstructions.replace(/\n/g, '\n  ')}`);
  }

  return { systemPrompt: parts.join('\n') };
}
