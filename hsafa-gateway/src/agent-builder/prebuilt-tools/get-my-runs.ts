// =============================================================================
// Prebuilt Tool: get_my_runs
// =============================================================================
// Lists the agent's own runs. Used for concurrent run awareness.

import { tool } from 'ai';
import { z } from 'zod';
import { prisma } from '../../lib/db.js';
import { registerPrebuiltTool } from './registry.js';

const DEFAULT_LIMIT = 10;

registerPrebuiltTool('get_my_runs', {
  asTool: (context) =>
    tool({
      description:
        'List your own runs. Use this for concurrent run awareness — to see if you are already handling a related task.',
      inputSchema: z.object({
        status: z
          .enum(['running', 'waiting_tool', 'completed', 'canceled', 'failed', 'queued'])
          .optional()
          .describe('Filter by run status. Omit to return all recent runs.'),
        limit: z
          .number()
          .optional()
          .describe(`Max runs to return. Default: ${DEFAULT_LIMIT}.`),
      }),
      execute: async ({ status, limit }) => {
        const runs = await prisma.run.findMany({
          where: {
            agentEntityId: context.agentEntityId,
            ...(status ? { status } : {}),
          },
          orderBy: { createdAt: 'desc' },
          take: limit ?? DEFAULT_LIMIT,
          select: {
            id: true,
            status: true,
            triggerType: true,
            triggerSpaceId: true,
            triggerMessageContent: true,
            triggerSenderName: true,
            activeSpaceId: true,
            startedAt: true,
            createdAt: true,
          },
        });

        return {
          runs: runs.map((r) => ({
            runId: r.id,
            status: r.status,
            triggerType: r.triggerType ?? 'unknown',
            triggerSummary: r.triggerSenderName
              ? `${r.triggerSenderName}: "${r.triggerMessageContent ?? ''}"`
              : (r.triggerMessageContent ?? ''),
            activeSpaceId: r.activeSpaceId ?? null,
            startedAt: r.startedAt?.toISOString() ?? r.createdAt.toISOString(),
          })),
        };
      },
    }),
});
