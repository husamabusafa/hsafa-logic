import { Prisma } from '@prisma/client';
import { prisma } from './db.js';
import { executeRun } from './run-runner.js';

// ─── Trigger context type (stored on the Run row) ───────────────────────────

export interface TriggerContext {
  triggerType: 'space_message' | 'plan' | 'service';
  triggerSpaceId?: string;
  triggerMessageContent?: string;
  triggerSenderEntityId?: string;
  triggerSenderName?: string;
  triggerSenderType?: 'human' | 'agent';
  triggerMentionReason?: string;
  triggerServiceName?: string;
  triggerPayload?: unknown;
  triggerPlanId?: string;
  triggerPlanName?: string;
}

// ─── Helper: create run + emit event + execute ──────────────────────────────

async function createAndExecuteRun(options: {
  agentEntityId: string;
  agentId: string;
  trigger: TriggerContext;
  triggeredById?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ runId: string; agentEntityId: string }> {
  const run = await prisma.run.create({
    data: {
      agentEntityId: options.agentEntityId,
      agentId: options.agentId,
      triggeredById: options.triggeredById ?? null,
      status: 'queued',
      metadata: (options.metadata ?? null) as unknown as Prisma.InputJsonValue,
      triggerType: options.trigger.triggerType,
      triggerSpaceId: options.trigger.triggerSpaceId ?? null,
      triggerMessageContent: options.trigger.triggerMessageContent ?? null,
      triggerSenderEntityId: options.trigger.triggerSenderEntityId ?? null,
      triggerSenderName: options.trigger.triggerSenderName ?? null,
      triggerSenderType: options.trigger.triggerSenderType ?? null,
      triggerMentionReason: options.trigger.triggerMentionReason ?? null,
      triggerServiceName: options.trigger.triggerServiceName ?? null,
      triggerPayload: options.trigger.triggerPayload != null
        ? (options.trigger.triggerPayload as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      triggerPlanId: options.trigger.triggerPlanId ?? null,
      triggerPlanName: options.trigger.triggerPlanName ?? null,
    },
    select: { id: true, agentEntityId: true, agentId: true },
  });

  // Run executes in background — no events emitted to spaces here.
  // Spaces are only affected when the agent calls sendSpaceMessage.
  executeRun(run.id).catch((err) => {
    console.error(`[agent-trigger] Run ${run.id} failed:`, err);
  });

  return { runId: run.id, agentEntityId: run.agentEntityId };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Triggers the admin agent (or the only agent) for a human message in a space.
 * Human messages ALWAYS go to the admin agent.
 */
export async function triggerAdminAgent(options: {
  smartSpaceId: string;
  senderEntityId: string;
  senderName: string;
  messageContent: string;
}): Promise<{ runId: string; agentEntityId: string } | null> {
  const { smartSpaceId, senderEntityId, senderName, messageContent } = options;

  // Load space to find admin agent
  const space = await prisma.smartSpace.findUnique({
    where: { id: smartSpaceId },
    select: { adminAgentEntityId: true, name: true },
  });

  let targetAgent: { id: string; agentId: string } | null = null;

  if (space?.adminAgentEntityId) {
    // Space has an explicit admin agent
    const entity = await prisma.entity.findUnique({
      where: { id: space.adminAgentEntityId },
      select: { id: true, agentId: true, type: true },
    });
    if (entity?.type === 'agent' && entity.agentId) {
      targetAgent = { id: entity.id, agentId: entity.agentId };
    }
  }

  if (!targetAgent) {
    // Fallback: pick the first (or only) agent member
    const agentMembers = await prisma.smartSpaceMembership.findMany({
      where: { smartSpaceId, entity: { type: 'agent' } },
      include: { entity: { select: { id: true, agentId: true } } },
      take: 1,
    });
    if (agentMembers.length > 0 && agentMembers[0].entity.agentId) {
      targetAgent = { id: agentMembers[0].entity.id, agentId: agentMembers[0].entity.agentId };
    }
  }

  if (!targetAgent) {
    console.log(`[agent-trigger] No agents to trigger in space ${smartSpaceId}`);
    return null;
  }

  console.log(`[agent-trigger] Human message → admin agent ${targetAgent.id} in space ${smartSpaceId}`);

  return createAndExecuteRun({
    agentEntityId: targetAgent.id,
    agentId: targetAgent.agentId,
    triggeredById: senderEntityId,
    trigger: {
      triggerType: 'space_message',
      triggerSpaceId: smartSpaceId,
      triggerMessageContent: messageContent,
      triggerSenderEntityId: senderEntityId,
      triggerSenderName: senderName,
      triggerSenderType: 'human',
    },
  });
}

/**
 * Triggers a specific agent via mention (from sendSpaceMessage with `mention`).
 */
export async function triggerMentionedAgent(options: {
  spaceId: string;
  callerEntityId: string;
  callerName: string;
  targetAgentEntityId: string;
  messageContent: string;
  mentionReason?: string;
}): Promise<{ runId: string; agentEntityId: string } | null> {
  const { spaceId, callerEntityId, callerName, targetAgentEntityId, messageContent, mentionReason } = options;

  // No self-mention
  if (callerEntityId === targetAgentEntityId) {
    console.log(`[agent-trigger] Self-mention blocked`);
    return null;
  }

  // Verify target is an agent member of the space
  const membership = await prisma.smartSpaceMembership.findUnique({
    where: { smartSpaceId_entityId: { smartSpaceId: spaceId, entityId: targetAgentEntityId } },
    include: { entity: { select: { type: true, agentId: true } } },
  });

  if (!membership || membership.entity.type !== 'agent' || !membership.entity.agentId) {
    console.log(`[agent-trigger] Target ${targetAgentEntityId} is not an agent member of space ${spaceId}`);
    return null;
  }

  console.log(`[agent-trigger] Mention: ${callerEntityId} → ${targetAgentEntityId} in space ${spaceId}`);

  return createAndExecuteRun({
    agentEntityId: targetAgentEntityId,
    agentId: membership.entity.agentId,
    triggeredById: callerEntityId,
    trigger: {
      triggerType: 'space_message',
      triggerSpaceId: spaceId,
      triggerMessageContent: messageContent,
      triggerSenderEntityId: callerEntityId,
      triggerSenderName: callerName,
      triggerSenderType: 'agent',
      triggerMentionReason: mentionReason,
    },
  });
}

/**
 * Triggers an agent directly from an external service (no space, no entity).
 * Service trigger API: POST /api/agents/{agentId}/trigger
 */
export async function triggerFromService(options: {
  agentEntityId: string;
  agentId: string;
  serviceName: string;
  payload: unknown;
}): Promise<{ runId: string; agentEntityId: string }> {
  const { agentEntityId, agentId, serviceName, payload } = options;

  console.log(`[agent-trigger] Service trigger: ${serviceName} → agent ${agentEntityId}`);

  return createAndExecuteRun({
    agentEntityId,
    agentId,
    trigger: {
      triggerType: 'service',
      triggerServiceName: serviceName,
      triggerPayload: payload,
    },
  });
}

/**
 * Triggers an agent from a scheduled plan.
 */
export async function triggerFromPlan(options: {
  agentEntityId: string;
  agentId: string;
  planId: string;
  planName: string;
}): Promise<{ runId: string; agentEntityId: string }> {
  const { agentEntityId, agentId, planId, planName } = options;

  console.log(`[agent-trigger] Plan trigger: "${planName}" → agent ${agentEntityId}`);

  return createAndExecuteRun({
    agentEntityId,
    agentId,
    trigger: {
      triggerType: 'plan',
      triggerPlanId: planId,
      triggerPlanName: planName,
    },
  });
}

/**
 * Delegates from admin to target agent with the ORIGINAL human trigger context.
 * Used by delegateToAgent prebuilt tool.
 */
export async function delegateToAgent(options: {
  originalTrigger: TriggerContext;
  targetAgentEntityId: string;
  targetAgentId: string;
  originalTriggeredById?: string;
}): Promise<{ runId: string; agentEntityId: string }> {
  console.log(`[agent-trigger] Delegate → ${options.targetAgentEntityId}`);

  return createAndExecuteRun({
    agentEntityId: options.targetAgentEntityId,
    agentId: options.targetAgentId,
    triggeredById: options.originalTriggeredById,
    trigger: options.originalTrigger,
  });
}
