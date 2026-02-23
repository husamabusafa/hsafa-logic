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
            triggerSenderType: true,
            triggerServiceName: true,
            triggerPlanName: true,
            activeSpaceId: true,
            startedAt: true,
            completedAt: true,
            createdAt: true,
          },
        });

        // Enrich each run with its actions (messages sent + tools called)
        const enrichedRuns = await Promise.all(
          runs.map(async (r) => {
            const [messages, toolCalls] = await Promise.all([
              prisma.smartSpaceMessage.findMany({
                where: { runId: r.id, entityId: context.agentEntityId },
                orderBy: { seq: 'asc' },
                select: {
                  content: true,
                  smartSpace: { select: { name: true } },
                  createdAt: true,
                },
                take: 5,
              }),
              prisma.toolCall.findMany({
                where: { runId: r.id },
                orderBy: { seq: 'asc' },
                select: { toolName: true, status: true },
                take: 10,
              }),
            ]);

            return {
              runId: r.id,
              status: r.status,
              triggerType: r.triggerType ?? 'unknown',
              triggerSummary: r.triggerSenderName
                ? `${r.triggerSenderName} (${r.triggerSenderType ?? 'unknown'}): "${r.triggerMessageContent ?? ''}"`
                : r.triggerType === 'service'
                  ? `service "${r.triggerServiceName ?? 'unknown'}"`
                  : r.triggerType === 'plan'
                    ? `plan "${r.triggerPlanName ?? 'unknown'}"`
                    : (r.triggerMessageContent ?? ''),
              activeSpaceId: r.activeSpaceId ?? null,
              startedAt: r.startedAt?.toISOString() ?? r.createdAt.toISOString(),
              completedAt: r.completedAt?.toISOString() ?? null,
              messagesSent: messages.map((m) => ({
                spaceName: m.smartSpace?.name ?? 'unknown',
                preview: (m.content ?? '').slice(0, 100),
                timestamp: m.createdAt.toISOString(),
              })),
              toolsCalled: toolCalls.map((tc) => ({
                name: tc.toolName,
                status: tc.status,
              })),
            };
          }),
        );

        return { runs: enrichedRuns };
      },
    }),
});
