import { registerPrebuiltTool } from './registry.js';
import type { PrebuiltToolContext } from '../builder.js';
import { prisma } from '../../lib/db.js';

/**
 * getMyRuns — Concurrent run awareness.
 * Lets the agent see its own active runs to avoid duplicating work.
 */

registerPrebuiltTool('getMyRuns', {
  inputSchema: {
    type: 'object',
    properties: {},
  },
  defaultDescription:
    'Get your currently active runs. Use this to check if you have concurrent runs to avoid duplicating work.',

  execute: async (_input: unknown, context: PrebuiltToolContext) => {
    const runs = await prisma.run.findMany({
      where: {
        agentEntityId: context.agentEntityId,
        status: { in: ['running', 'waiting_tool', 'queued'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        status: true,
        triggerType: true,
        triggerSpaceId: true,
        triggerServiceName: true,
        triggerPlanName: true,
        triggerMessageContent: true,
        createdAt: true,
      },
    });

    return {
      activeRuns: runs.map((r) => ({
        runId: r.id,
        status: r.status,
        triggerType: r.triggerType,
        triggerSpaceId: r.triggerSpaceId,
        triggerServiceName: r.triggerServiceName,
        triggerPlanName: r.triggerPlanName,
        triggerMessage: r.triggerMessageContent
          ? r.triggerMessageContent.length > 100
            ? r.triggerMessageContent.slice(0, 100) + '...'
            : r.triggerMessageContent
          : null,
        isCurrentRun: r.id === context.runId,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  },
});
