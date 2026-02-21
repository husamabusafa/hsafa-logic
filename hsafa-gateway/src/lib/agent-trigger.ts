// =============================================================================
// Agent Trigger
// =============================================================================
// Creates runs and fires them for all agent members of a space (sender excluded).
// Called from send_message (agent→space) and the smart-spaces messages route (human→space).

import { prisma } from './db.js';

// =============================================================================
// Types
// =============================================================================

export interface TriggerAllAgentsOptions {
  spaceId: string;
  senderEntityId: string;
  senderName: string;
  senderType: 'human' | 'agent';
  messageContent: string;
  messageId: string;
}

export interface CreateAndExecuteRunOptions {
  agentEntityId: string;
  agentId: string;
  triggerType: 'space_message' | 'plan' | 'service';
  triggerSpaceId?: string;
  triggerMessageId?: string;
  triggerMessageContent?: string;
  triggerSenderEntityId?: string;
  triggerSenderName?: string;
  triggerSenderType?: string;
  triggerServiceName?: string;
  triggerPayload?: Record<string, unknown>;
  triggerPlanId?: string;
  triggerPlanName?: string;
  triggerPlanInstruction?: string;
  /** For space_message triggers: auto-enter the trigger space */
  activeSpaceId?: string;
}

// =============================================================================
// triggerAllAgents
// =============================================================================

/**
 * Trigger ALL other agent members of a space (sender excluded).
 * Called for any message — human or agent. Deduplicates by agentEntityId + messageId.
 * Fire-and-forget: does NOT await run completion.
 */
export async function triggerAllAgents(options: TriggerAllAgentsOptions): Promise<void> {
  const { spaceId, senderEntityId, senderName, senderType, messageContent, messageId } =
    options;

  // Find all agent members of the space, excluding the sender
  const agentMembers = await prisma.smartSpaceMembership.findMany({
    where: {
      smartSpaceId: spaceId,
      entityId: { not: senderEntityId },
      entity: { type: 'agent' },
    },
    include: {
      entity: {
        select: { id: true, agentId: true },
      },
    },
  });

  for (const member of agentMembers) {
    if (!member.entity.agentId) continue;

    // Dedup: skip if a run already exists for this agent + trigger message
    const existing = await prisma.run.findFirst({
      where: {
        agentEntityId: member.entityId,
        triggerMessageId: messageId,
        status: { not: 'canceled' },
      },
    });
    if (existing) continue;

    await createAndExecuteRun({
      agentEntityId: member.entityId,
      agentId: member.entity.agentId,
      triggerType: 'space_message',
      triggerSpaceId: spaceId,
      triggerMessageId: messageId,
      triggerMessageContent: messageContent,
      triggerSenderEntityId: senderEntityId,
      triggerSenderName: senderName,
      triggerSenderType: senderType,
      // Auto-enter the trigger space so the agent doesn't need to call enter_space
      activeSpaceId: spaceId,
    });
  }
}

// =============================================================================
// createAndExecuteRun
// =============================================================================

/**
 * Create a Run record and immediately execute it.
 * Fire-and-forget: the caller does NOT await the run completing.
 */
export async function createAndExecuteRun(
  options: CreateAndExecuteRunOptions,
): Promise<string> {
  // 1. Create the Run record
  const run = await prisma.run.create({
    data: {
      agentEntityId: options.agentEntityId,
      agentId: options.agentId,
      status: 'queued',
      triggerType: options.triggerType,
      triggerSpaceId: options.triggerSpaceId ?? null,
      triggerMessageId: options.triggerMessageId ?? null,
      triggerMessageContent: options.triggerMessageContent ?? null,
      triggerSenderEntityId: options.triggerSenderEntityId ?? null,
      triggerSenderName: options.triggerSenderName ?? null,
      triggerSenderType: options.triggerSenderType ?? null,
      triggerServiceName: options.triggerServiceName ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      triggerPayload: (options.triggerPayload ?? undefined) as any,
      triggerPlanId: options.triggerPlanId ?? null,
      triggerPlanName: options.triggerPlanName ?? null,
      triggerPlanInstruction: options.triggerPlanInstruction ?? null,
      activeSpaceId: options.activeSpaceId ?? null,
    },
  });

  // 2. Execute async — import run-runner lazily to avoid circular deps
  // We do NOT await this; the run executes in the background.
  (async () => {
    try {
      const { executeRun } = await import('./run-runner.js');
      await executeRun(run.id);
    } catch (err) {
      console.error(`[agent-trigger] Run ${run.id} failed:`, err);
    }
  })();

  return run.id;
}
