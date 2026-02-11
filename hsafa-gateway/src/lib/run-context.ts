import { prisma } from './db.js';

/**
 * All the context data needed to execute a run.
 * Loaded once at the start of executeRun() and passed to downstream modules.
 */
export interface RunContext {
  run: {
    id: string;
    smartSpaceId: string;
    agentEntityId: string;
    agentId: string;
    triggeredById: string | null;
    status: string;
    startedAt: Date | null;
    metadata: unknown;
  };
  agentDisplayName: string;
  isGoToSpaceRun: boolean;
  spaceMembers: SpaceMember[];
  smartSpace: { name: string | null } | null;
  triggeredByEntity: { displayName: string | null; type: string } | null;
  agentGoals: AgentGoal[];
  agentMemories: AgentMemory[];
  agentMemberships: AgentMembership[];
  crossSpaceMessages: CrossSpaceDigest[];
  agentPlans: AgentPlan[];
}

export interface SpaceMember {
  entity: {
    id: string;
    displayName: string | null;
    type: string;
    metadata: unknown;
  };
}

export interface AgentGoal {
  description: string;
  isLongTerm: boolean;
  priority: number;
  isCompleted: boolean;
}

export interface AgentMemory {
  content: string;
  topic: string | null;
  updatedAt: Date;
}

export interface AgentMembership {
  smartSpace: {
    id: string;
    name: string | null;
    memberships: Array<{
      entity: {
        displayName: string | null;
        type: string;
        metadata: unknown;
      };
    }>;
  };
}

export interface AgentPlan {
  id: string;
  name: string;
  description: string | null;
  instruction: string | null;
  isRecurring: boolean;
  cron: string | null;
  scheduledAt: Date | null;
  nextRunAt: Date | null;
  lastRunAt: Date | null;
  status: string;
  createdAt: Date;
}

export interface CrossSpaceDigest {
  spaceId: string;
  spaceName: string;
  messages: Array<{
    content: string | null;
    entityId: string;
    entity: { displayName: string | null; type: string } | null;
    createdAt: Date;
  }>;
}

/**
 * Loads all context needed for a run: space members, goals, memories,
 * memberships, and cross-space message digests.
 */
export async function loadRunContext(run: RunContext['run']): Promise<RunContext> {
  const isGoToSpaceRun = !!(run.metadata as any)?.originSmartSpaceId;

  // Load space members + triggering entity + agent display name for run context
  const [spaceMembers, smartSpace, triggeredByEntity, agentEntity, agentGoals, agentMemories, agentMemberships, agentPlans] = await Promise.all([
    prisma.smartSpaceMembership.findMany({
      where: { smartSpaceId: run.smartSpaceId },
      include: { entity: { select: { id: true, displayName: true, type: true, metadata: true } } },
    }),
    prisma.smartSpace.findUnique({
      where: { id: run.smartSpaceId },
      select: { name: true },
    }),
    run.triggeredById
      ? prisma.entity.findUnique({
          where: { id: run.triggeredById },
          select: { displayName: true, type: true },
        })
      : null,
    prisma.entity.findUnique({
      where: { id: run.agentEntityId },
      select: { displayName: true },
    }),
    prisma.goal.findMany({
      where: { entityId: run.agentEntityId, isCompleted: false },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    }),
    prisma.memory.findMany({
      where: { entityId: run.agentEntityId },
      orderBy: [{ updatedAt: 'desc' }],
      take: 50,
    }),
    prisma.smartSpaceMembership.findMany({
      where: { entityId: run.agentEntityId },
      include: {
        smartSpace: {
          select: {
            id: true,
            name: true,
            memberships: {
              include: { entity: { select: { displayName: true, type: true, metadata: true } } },
            },
          },
        },
      },
    }),
    (prisma.plan as any).findMany({
      where: { entityId: run.agentEntityId, status: { in: ['pending', 'running'] } },
      orderBy: [{ nextRunAt: 'asc' }],
    }) as Promise<AgentPlan[]>,
  ]);

  const agentDisplayName = agentEntity?.displayName || 'AI Assistant';

  // Load last 2 messages from each OTHER space for cross-space awareness
  console.log(`[run-runner] Agent "${agentDisplayName}" is in ${agentMemberships.length} spaces. Current: ${run.smartSpaceId}`);
  const otherSpaceIds = agentMemberships
    .map((m) => m.smartSpace.id)
    .filter((id) => id !== run.smartSpaceId);
  console.log(`[run-runner] Other space IDs for digest: ${otherSpaceIds.length > 0 ? otherSpaceIds.join(', ') : '(none)'}`);

  const crossSpaceMessages = otherSpaceIds.length > 0
    ? await Promise.all(
        otherSpaceIds.map(async (spaceId) => {
          const msgs = await prisma.smartSpaceMessage.findMany({
            where: { smartSpaceId: spaceId },
            orderBy: { seq: 'desc' },
            take: 2,
            select: {
              content: true,
              entityId: true,
              entity: { select: { displayName: true, type: true } },
              createdAt: true,
            },
          });
          const space = agentMemberships.find((m) => m.smartSpace.id === spaceId)?.smartSpace;
          return { spaceId, spaceName: space?.name || spaceId, messages: msgs.reverse() };
        })
      )
    : [];

  return {
    run,
    agentDisplayName,
    isGoToSpaceRun,
    spaceMembers,
    smartSpace,
    triggeredByEntity,
    agentGoals,
    agentMemories,
    agentMemberships,
    crossSpaceMessages,
    agentPlans,
  };
}
