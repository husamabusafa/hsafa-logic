// =============================================================================
// Prebuilt Tool: stop_run
// =============================================================================
// Cancels one of the agent's own active runs by ID.

import { tool } from 'ai';
import { z } from 'zod';
import { prisma } from '../../lib/db.js';
import { registerPrebuiltTool } from './registry.js';

registerPrebuiltTool('stop_run', {
  asTool: (context) =>
    tool({
      description:
        'Cancel one of your active runs by ID. Use this to cancel a stale or superseded run. ' +
        'To end the current run, simply stop generating — no tool call needed.',
      inputSchema: z.object({
        runId: z
          .string()
          .describe('ID of the run to cancel. Must be one of your own active runs.'),
      }),
      execute: async ({ runId }) => {
        // Verify the run belongs to this agent and is cancellable
        const run = await prisma.run.findUnique({
          where: { id: runId },
          select: { id: true, agentEntityId: true, status: true },
        });

        if (!run) {
          return { success: false, error: 'Run not found.' };
        }
        if (run.agentEntityId !== context.agentEntityId) {
          return { success: false, error: 'Can only cancel your own runs.' };
        }
        if (run.status !== 'running' && run.status !== 'queued') {
          return {
            success: false,
            error: `Run is already ${run.status} — cannot cancel.`,
          };
        }

        // Optimistic cancel (another run may beat us to it)
        const updated = await prisma.run.updateMany({
          where: { id: runId, status: { in: ['running', 'queued'] } },
          data: { status: 'canceled', completedAt: new Date() },
        });

        if (updated.count === 0) {
          return {
            success: false,
            error: 'Run already transitioned — could not cancel.',
          };
        }

        return { success: true, canceledRunId: runId };
      },
    }),
});
