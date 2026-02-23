import { prisma } from './db.js';

/**
 * All the context data needed to execute a run.
 * Loaded once at the start of executeRun() and passed to downstream modules.
 */
export interface RunContext {
  run: {
    id: string;
    agentEntityId: string;
    agentId: string;
    triggeredById: string | null;
    status: string;
    startedAt: Date | null;
    metadata: unknown;
    // Trigger context
    triggerType: string | null;
    triggerSpaceId: string | null;
    triggerMessageContent: string | null;
    triggerSenderEntityId: string | null;
    triggerSenderName: string | null;
    triggerSenderType: string | null;
    triggerMentionReason: string | null;
    triggerServiceName: string | null;
    triggerPayload: unknown;
    triggerPlanId: string | null;
    triggerPlanName: string | null;
  };
  agentDisplayName: string;
  /** Is this agent the admin for the trigger space? */
  isAdminAgent: boolean;
  /** Is this a multi-agent space? (more than 1 agent member) */
  isMultiAgentSpace: boolean;
  /** Members of the trigger space (empty for service/plan triggers with no trigger space) */
  triggerSpaceMembers: SpaceMember[];
  /** Trigger space info */
  triggerSpace: { id: string; name: string | null; adminAgentEntityId: string | null } | null;
  agentGoals: AgentGoal[];
  agentMemories: AgentMemory[];
  agentMemberships: AgentMembership[];
  agentPlans: AgentPlan[];
  /** Other active runs for this agent (for concurrent run awareness) */
  otherActiveRunCount: number;
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
        id: string;
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
 * Loads all context needed for a run.
 */
export async function loadRunContext(run: RunContext['run']): Promise<RunContext> {
  const triggerSpaceId = run.triggerSpaceId;

  // Load everything in parallel
  const [
    triggerSpaceMembers,
    triggerSpace,
    agentEntity,
    agentGoals,
    agentMemories,
    agentMemberships,
    agentPlans,
    otherActiveRunCount,
  ] = await Promise.all([
    triggerSpaceId
      ? prisma.smartSpaceMembership.findMany({
          where: { smartSpaceId: triggerSpaceId },
          include: { entity: { select: { id: true, displayName: true, type: true, metadata: true } } },
        })
      : [],
    triggerSpaceId
      ? prisma.smartSpace.findUnique({
          where: { id: triggerSpaceId },
          select: { id: true, name: true, adminAgentEntityId: true },
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
              include: { entity: { select: { id: true, displayName: true, type: true, metadata: true } } },
            },
          },
        },
      },
    }),
    (prisma.plan as any).findMany({
      where: { entityId: run.agentEntityId, status: { in: ['pending', 'running'] } },
      orderBy: [{ nextRunAt: 'asc' }],
    }) as Promise<AgentPlan[]>,
    prisma.run.count({
      where: {
        agentEntityId: run.agentEntityId,
        id: { not: run.id },
        status: { in: ['running', 'waiting_tool', 'queued'] },
      },
    }),
  ]);

  const agentDisplayName = agentEntity?.displayName || 'AI Assistant';

  // Determine if this agent is the admin for the trigger space
  const isAdminAgent = triggerSpace
    ? (triggerSpace.adminAgentEntityId === run.agentEntityId) ||
      // If no explicit admin, the only agent is effectively the admin
      (!triggerSpace.adminAgentEntityId && triggerSpaceMembers.filter(m => m.entity.type === 'agent').length === 1)
    : false;

  const agentCount = triggerSpaceMembers.filter(m => m.entity.type === 'agent').length;
  const isMultiAgentSpace = agentCount > 1;

  return {
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
  };
}
