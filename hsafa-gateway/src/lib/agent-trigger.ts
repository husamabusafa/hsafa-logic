import { Prisma } from '@prisma/client';
import { prisma } from './db.js';
import { emitSmartSpaceEvent } from './smartspace-events.js';
import { executeRun } from './run-runner.js';

// ─── Chain metadata types ───────────────────────────────────────────────────

export interface ChainMeta {
  chainId: string;
  chainDepth: number;
  replyStack: Array<{ entityId: string; reason: string | null }>;
  mentionedPairs: string[]; // "entityA->entityB" to prevent circular mentions
}

const MAX_CHAIN_DEPTH = 10;
const MAX_REPLY_STACK = 5;

// ─── Helpers ────────────────────────────────────────────────────────────────

function newChainId(): string {
  return `chain-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function createAndExecuteRun(options: {
  smartSpaceId: string;
  agentEntityId: string;
  agentId: string;
  triggeredById: string;
  metadata: Record<string, unknown>;
}): Promise<{ runId: string; agentEntityId: string }> {
  const run = await prisma.run.create({
    data: {
      smartSpaceId: options.smartSpaceId,
      agentEntityId: options.agentEntityId,
      agentId: options.agentId,
      triggeredById: options.triggeredById,
      status: 'queued',
      metadata: options.metadata as unknown as Prisma.InputJsonValue,
    },
    select: { id: true, agentEntityId: true, agentId: true },
  });

  await emitSmartSpaceEvent(
    options.smartSpaceId,
    'run.created',
    {
      runId: run.id,
      agentEntityId: run.agentEntityId,
      agentId: run.agentId,
      status: 'queued',
    },
    { runId: run.id, entityId: run.agentEntityId, entityType: 'agent', agentEntityId: run.agentEntityId }
  );

  executeRun(run.id).catch((err) => {
    console.error(`[agent-trigger] Run ${run.id} failed:`, err);
  });

  return { runId: run.id, agentEntityId: run.agentEntityId };
}

// ─── Pick one agent (round-robin via space metadata) ────────────────────────

async function pickOneAgent(
  smartSpaceId: string,
  excludeEntityId: string,
): Promise<{ id: string; agentId: string } | null> {
  const members = await prisma.smartSpaceMembership.findMany({
    where: { smartSpaceId },
    include: { entity: true },
  });

  const agents = members
    .map((m) => m.entity)
    .filter((e) => e.type === 'agent' && e.agentId && e.id !== excludeEntityId);

  if (agents.length === 0) return null;
  if (agents.length === 1) return { id: agents[0].id, agentId: agents[0].agentId! };

  // Round-robin: read lastPickedIndex from space metadata, advance it
  const space = await prisma.smartSpace.findUnique({
    where: { id: smartSpaceId },
    select: { metadata: true },
  });

  const meta = (space?.metadata as Record<string, unknown>) ?? {};
  const lastIndex = typeof meta.lastPickedAgentIndex === 'number' ? meta.lastPickedAgentIndex : -1;
  const nextIndex = (lastIndex + 1) % agents.length;

  // Update the round-robin index
  await prisma.smartSpace.update({
    where: { id: smartSpaceId },
    data: { metadata: { ...meta, lastPickedAgentIndex: nextIndex } as unknown as Prisma.InputJsonValue },
  });

  const picked = agents[nextIndex];
  return { id: picked.id, agentId: picked.agentId! };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Triggers ONE agent in a SmartSpace (round-robin) when a non-agent sends a message.
 * Starts a new mention chain.
 */
export async function triggerOneAgent(options: {
  smartSpaceId: string;
  senderEntityId: string;
}): Promise<Array<{ runId: string; agentEntityId: string }>> {
  const { smartSpaceId, senderEntityId } = options;

  const picked = await pickOneAgent(smartSpaceId, senderEntityId);
  if (!picked) {
    console.log(`[agent-trigger] No agents to trigger in space ${smartSpaceId}`);
    return [];
  }

  const chain: ChainMeta = {
    chainId: newChainId(),
    chainDepth: 0,
    replyStack: [],
    mentionedPairs: [],
  };

  console.log(`[agent-trigger] Triggering one agent (round-robin) in space ${smartSpaceId}`);

  const result = await createAndExecuteRun({
    smartSpaceId,
    agentEntityId: picked.id,
    agentId: picked.agentId,
    triggeredById: senderEntityId,
    metadata: { chain },
  });

  return [result];
}

/**
 * Triggers a specific agent via mention (from another agent's response).
 * Optionally pushes the caller onto the reply stack if expectReply is true.
 */
export async function triggerMentionedAgent(options: {
  smartSpaceId: string;
  callerEntityId: string;
  targetAgentEntityId: string;
  reason: string | null;
  expectReply: boolean;
  chain: ChainMeta;
}): Promise<{ runId: string; agentEntityId: string } | null> {
  const { smartSpaceId, callerEntityId, targetAgentEntityId, reason, expectReply, chain } = options;

  // Loop protection: max chain depth
  if (chain.chainDepth >= MAX_CHAIN_DEPTH) {
    console.log(`[agent-trigger] Max chain depth (${MAX_CHAIN_DEPTH}) reached, stopping`);
    return null;
  }

  // Prevent circular mentions (A->B->A)
  const pair = `${callerEntityId}->${targetAgentEntityId}`;
  if (chain.mentionedPairs.includes(pair)) {
    console.log(`[agent-trigger] Circular mention detected (${pair}), stopping`);
    return null;
  }

  // No self-mention
  if (callerEntityId === targetAgentEntityId) {
    console.log(`[agent-trigger] Self-mention blocked`);
    return null;
  }

  // Verify target is an agent in this space
  const membership = await prisma.smartSpaceMembership.findUnique({
    where: { smartSpaceId_entityId: { smartSpaceId, entityId: targetAgentEntityId } },
    include: { entity: { select: { type: true, agentId: true } } },
  });

  if (!membership || membership.entity.type !== 'agent' || !membership.entity.agentId) {
    console.log(`[agent-trigger] Target ${targetAgentEntityId} is not an agent member of space ${smartSpaceId}`);
    return null;
  }

  // Build updated chain
  const updatedChain: ChainMeta = {
    chainId: chain.chainId,
    chainDepth: chain.chainDepth + 1,
    replyStack: [...chain.replyStack],
    mentionedPairs: [...chain.mentionedPairs, pair],
  };

  // Push caller onto reply stack if they expect a reply
  if (expectReply && updatedChain.replyStack.length < MAX_REPLY_STACK) {
    updatedChain.replyStack.push({ entityId: callerEntityId, reason });
  }

  console.log(`[agent-trigger] Mention chain: ${callerEntityId} -> ${targetAgentEntityId} (expectReply=${expectReply}, depth=${updatedChain.chainDepth})`);

  return createAndExecuteRun({
    smartSpaceId,
    agentEntityId: targetAgentEntityId,
    agentId: membership.entity.agentId,
    triggeredById: callerEntityId,
    metadata: {
      chain: updatedChain,
      mentionedBy: callerEntityId,
      mentionReason: reason,
    },
  });
}

/**
 * Pops the reply stack and re-triggers the waiting agent.
 * Called when an agent finishes without mentioning anyone.
 */
export async function popReplyStack(options: {
  smartSpaceId: string;
  currentEntityId: string;
  chain: ChainMeta;
}): Promise<{ runId: string; agentEntityId: string } | null> {
  const { smartSpaceId, currentEntityId, chain } = options;

  if (chain.replyStack.length === 0) {
    return null;
  }

  if (chain.chainDepth >= MAX_CHAIN_DEPTH) {
    console.log(`[agent-trigger] Max chain depth (${MAX_CHAIN_DEPTH}) reached during reply stack pop`);
    return null;
  }

  const waitingAgent = chain.replyStack[chain.replyStack.length - 1];

  // Verify the waiting agent is still a member
  const membership = await prisma.smartSpaceMembership.findUnique({
    where: { smartSpaceId_entityId: { smartSpaceId, entityId: waitingAgent.entityId } },
    include: { entity: { select: { type: true, agentId: true } } },
  });

  if (!membership || membership.entity.type !== 'agent' || !membership.entity.agentId) {
    console.log(`[agent-trigger] Reply stack agent ${waitingAgent.entityId} no longer valid, skipping`);
    return null;
  }

  const updatedChain: ChainMeta = {
    chainId: chain.chainId,
    chainDepth: chain.chainDepth + 1,
    replyStack: chain.replyStack.slice(0, -1), // pop
    mentionedPairs: chain.mentionedPairs, // keep as-is (reply stack pops are system-initiated)
  };

  console.log(`[agent-trigger] Reply stack pop: re-triggering ${waitingAgent.entityId} (depth=${updatedChain.chainDepth}, remaining stack=${updatedChain.replyStack.length})`);

  return createAndExecuteRun({
    smartSpaceId,
    agentEntityId: waitingAgent.entityId,
    agentId: membership.entity.agentId,
    triggeredById: currentEntityId,
    metadata: {
      chain: updatedChain,
      replyStackResume: true,
      resumeReason: waitingAgent.reason,
    },
  });
}
