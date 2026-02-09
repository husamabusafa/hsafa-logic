import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/db.js';
import { registerPrebuiltTool } from './registry.js';
import type { PrebuiltToolContext } from '../builder.js';
import { executeRun } from '../../lib/run-runner.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

registerPrebuiltTool('goToSpace', {
  defaultDescription:
    'Go to a SmartSpace and carry out a task there. ' +
    'A new run will start in that space and your response will appear as a regular message. ' +
    'This returns immediately — you will not see the result. ' +
    'Call getSpaces first to find space IDs.',

  inputSchema: {
    type: 'object',
    properties: {
      smartSpaceId: {
        type: 'string',
        description: 'UUID of the target SmartSpace. Use getSpaces to look up IDs.',
      },
      instruction: {
        type: 'string',
        description: 'What to do in that space. Be specific. Example: "Answer any pending questions about the project".',
      },
    },
    required: ['smartSpaceId', 'instruction'],
  },

  async execute(input: unknown, context: PrebuiltToolContext) {
    const { smartSpaceId, instruction } = input as { smartSpaceId: string; instruction: string };
    const { agentEntityId, agentId, runId: parentRunId, smartSpaceId: originSmartSpaceId } = context;

    if (!UUID_RE.test(smartSpaceId)) {
      return { success: false, error: `"${smartSpaceId}" is not a valid UUID. Use getSpaces to find space IDs.` };
    }

    if (smartSpaceId === originSmartSpaceId) {
      return { success: false, error: 'You are already in this space.' };
    }

    // Verify target space + resolve origin space name in parallel
    const [targetSpace, originSpace] = await Promise.all([
      prisma.smartSpace.findUnique({ where: { id: smartSpaceId }, select: { id: true, name: true } }),
      prisma.smartSpace.findUnique({ where: { id: originSmartSpaceId }, select: { name: true } }),
    ]);

    if (!targetSpace) {
      return { success: false, error: 'SmartSpace not found.' };
    }

    // Auto-join if not a member
    const membership = await prisma.smartSpaceMembership.findUnique({
      where: { smartSpaceId_entityId: { smartSpaceId, entityId: agentEntityId } },
    });
    if (!membership) {
      await prisma.smartSpaceMembership.create({ data: { smartSpaceId, entityId: agentEntityId } });
    }

    // Create child run with instruction in metadata.
    // run-runner will inject the instruction as a synthetic user message (in-memory only,
    // not persisted) so the agent responds to it naturally without confusing the real user.
    const run = await prisma.run.create({
      data: {
        smartSpaceId,
        agentEntityId,
        agentId,
        parentRunId,
        triggeredById: agentEntityId,
        status: 'queued',
        metadata: {
          instruction,
          originSmartSpaceId,
          originSmartSpaceName: originSpace?.name ?? originSmartSpaceId,
          parentRunId,
        } as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    // Fire and forget — don't block the parent run
    executeRun(run.id).catch((err) => {
      console.error(`[goToSpace] Child run ${run.id} failed:`, err);
    });

    return {
      success: true,
      runId: run.id,
      targetSpace: targetSpace.name ?? smartSpaceId,
      message: `Going to "${targetSpace.name ?? smartSpaceId}" to: ${instruction}. The response will appear there as a regular message.`,
    };
  },
});
