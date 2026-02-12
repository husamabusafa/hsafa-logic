import { prisma } from '../../lib/db.js';
import { registerPrebuiltTool } from './registry.js';
import type { PrebuiltToolContext } from '../builder.js';

interface GetSpaceMessagesInput {
  spaceId: string;
  search?: string;
  limit?: number;
  aroundTime?: string;
}

registerPrebuiltTool('getSpaceMessages', {
  defaultDescription:
    'Retrieve recent messages from a specific space you belong to. By default returns the last 10 messages. You can search by text, change the limit, or provide an aroundTime (ISO 8601) to see messages around a specific point in time.',

  inputSchema: {
    type: 'object',
    properties: {
      spaceId: {
        type: 'string',
        description: 'The ID of the space to read messages from. You must be a member of this space.',
      },
      search: {
        type: 'string',
        description: 'Optional text to filter messages by content (case-insensitive substring match).',
      },
      limit: {
        type: 'number',
        description: 'Number of messages to return. Default 10, max 50.',
      },
      aroundTime: {
        type: 'string',
        description:
          'Optional ISO 8601 timestamp. When provided, returns messages centered around this time — half before, half after. If one side has fewer messages, the remaining slots go to the other side.',
      },
    },
    required: ['spaceId'],
  },

  async execute(input: unknown, context: PrebuiltToolContext) {
    const { spaceId, search, limit: rawLimit, aroundTime } = input as GetSpaceMessagesInput;
    const { agentEntityId } = context;

    const limit = Math.min(Math.max(rawLimit ?? 10, 1), 50);

    // Verify the agent is a member of the target space
    const membership = await prisma.smartSpaceMembership.findUnique({
      where: { smartSpaceId_entityId: { smartSpaceId: spaceId, entityId: agentEntityId } },
      include: { smartSpace: { select: { name: true } } },
    });

    if (!membership) {
      return { error: 'You are not a member of this space.' };
    }

    const spaceName = membership.smartSpace.name;

    // Base where clause (optionally with text search)
    const baseWhere: Record<string, unknown> = { smartSpaceId: spaceId };
    if (search) {
      baseWhere.content = { contains: search, mode: 'insensitive' };
    }

    const selectFields = {
      id: true,
      content: true,
      role: true,
      createdAt: true,
      entityId: true,
      entity: { select: { displayName: true, type: true } },
    } as const;

    let messages: Array<{
      id: string;
      content: string | null;
      role: string;
      createdAt: Date;
      entityId: string;
      entity: { displayName: string | null; type: string };
    }>;

    if (aroundTime) {
      const pivot = new Date(aroundTime);
      if (isNaN(pivot.getTime())) {
        return { error: 'Invalid aroundTime — provide a valid ISO 8601 timestamp.' };
      }

      const half = Math.ceil(limit / 2);

      // Fetch messages before pivot (inclusive)
      const before = await prisma.smartSpaceMessage.findMany({
        where: { ...baseWhere, createdAt: { lte: pivot } },
        orderBy: { seq: 'desc' },
        take: limit, // fetch up to full limit so we can redistribute
        select: selectFields,
      });

      // Fetch messages after pivot
      const after = await prisma.smartSpaceMessage.findMany({
        where: { ...baseWhere, createdAt: { gt: pivot } },
        orderBy: { seq: 'asc' },
        take: limit,
        select: selectFields,
      });

      // Redistribute: if one side is short, give remaining slots to the other
      let takeBefore: number;
      let takeAfter: number;

      if (before.length < half) {
        takeBefore = before.length;
        takeAfter = Math.min(after.length, limit - takeBefore);
      } else if (after.length < half) {
        takeAfter = after.length;
        takeBefore = Math.min(before.length, limit - takeAfter);
      } else {
        takeBefore = half;
        takeAfter = limit - half;
      }

      const beforeSlice = before.slice(0, takeBefore).reverse(); // oldest first
      const afterSlice = after.slice(0, takeAfter);

      messages = [...beforeSlice, ...afterSlice];
    } else {
      // Simple: fetch the most recent N messages
      const rows = await prisma.smartSpaceMessage.findMany({
        where: baseWhere,
        orderBy: { seq: 'desc' },
        take: limit,
        select: selectFields,
      });
      messages = rows.reverse(); // oldest first
    }

    const formatted = messages.map((m) => ({
      id: m.id,
      sender: m.entity.displayName || 'Unknown',
      senderType: m.entity.type,
      role: m.role,
      content: m.content || '(empty)',
      time: m.createdAt.toISOString(),
    }));

    return {
      spaceName,
      spaceId,
      messageCount: formatted.length,
      messages: formatted,
    };
  },
});
