// =============================================================================
// Prebuilt Tool: absorb_run
// =============================================================================
// Cancel another of the agent's own active runs and inherit its full context.
// Used when a newer run supersedes or supplements an older one.

import { tool } from 'ai';
import { z } from 'zod';
import { prisma } from '../../lib/db.js';
import { registerPrebuiltTool } from './registry.js';

registerPrebuiltTool('absorb_run', {
  asTool: (context) =>
    tool({
      description:
        'Cancel another of your active runs and inherit its trigger context and actions taken. ' +
        'Use when you see a related active run handling the same topic — the latest run should absorb older ones. ' +
        'Returns the absorbed run\'s trigger and actions so you can handle both in this run.',
      inputSchema: z.object({
        runId: z
          .string()
          .describe('ID of the run to absorb. Must be one of your own active runs (not this run).'),
      }),
      execute: async ({ runId }) => {
        // Cannot absorb yourself
        if (runId === context.runId) {
          return { success: false, error: 'Cannot absorb the current run.' };
        }

        // Verify the run belongs to this agent
        const run = await prisma.run.findUnique({
          where: { id: runId },
          select: {
            id: true,
            agentEntityId: true,
            status: true,
            triggerType: true,
            triggerSpaceId: true,
            triggerSenderName: true,
            triggerSenderType: true,
            triggerMessageContent: true,
            triggerServiceName: true,
            triggerPlanName: true,
            triggerPlanInstruction: true,
            activeSpaceId: true,
          },
        });

        if (!run) {
          return { success: false, error: 'Run not found.' };
        }
        if (run.agentEntityId !== context.agentEntityId) {
          return { success: false, error: 'Can only absorb your own runs.' };
        }
        if (run.status !== 'running' && run.status !== 'queued' && run.status !== 'waiting_tool') {
          return {
            success: false,
            error: `Run is already ${run.status} — cannot absorb.`,
          };
        }

        // Optimistic cancel (race-safe)
        const updated = await prisma.run.updateMany({
          where: { id: runId, status: { in: ['running', 'queued', 'waiting_tool'] } },
          data: { status: 'canceled', completedAt: new Date() },
        });

        if (updated.count === 0) {
          return {
            success: false,
            error: 'Run already transitioned — could not absorb.',
          };
        }

        // Load what the absorbed run did: messages sent + tools called
        const [messages, toolCalls] = await Promise.all([
          prisma.smartSpaceMessage.findMany({
            where: { runId, entityId: context.agentEntityId },
            orderBy: { seq: 'asc' },
            select: {
              content: true,
              smartSpace: { select: { name: true } },
            },
            take: 10,
          }),
          prisma.toolCall.findMany({
            where: { runId },
            orderBy: { seq: 'asc' },
            select: { toolName: true, args: true, output: true, status: true },
            take: 10,
          }),
        ]);

        // Build trigger summary
        const trigger: Record<string, unknown> = {
          type: run.triggerType,
        };
        if (run.triggerSpaceId) {
          const space = await prisma.smartSpace.findUnique({
            where: { id: run.triggerSpaceId },
            select: { name: true },
          });
          trigger.spaceId = run.triggerSpaceId;
          trigger.spaceName = space?.name ?? null;
        }
        if (run.triggerSenderName) {
          trigger.senderName = run.triggerSenderName;
          trigger.messageContent = run.triggerMessageContent;
        }
        if (run.triggerServiceName) trigger.serviceName = run.triggerServiceName;
        if (run.triggerPlanName) trigger.planName = run.triggerPlanName;
        if (run.triggerPlanInstruction) trigger.planInstruction = run.triggerPlanInstruction;

        // Build actions taken
        const actionsTaken = [
          ...toolCalls.map((tc) => ({
            tool: tc.toolName,
            input: tc.args,
            result: tc.output,
            status: tc.status,
          })),
          ...messages.map((m) => ({
            tool: 'send_message',
            input: { text: (m.content ?? '').slice(0, 200) },
            spaceName: m.smartSpace?.name ?? 'unknown',
          })),
        ];

        return {
          success: true,
          absorbedRunId: runId,
          absorbed: {
            trigger,
            actionsTaken,
          },
        };
      },
    }),
});
