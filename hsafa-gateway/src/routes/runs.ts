import { Router, Request, Response } from 'express';
import { prisma } from '../lib/db.js';
import { redis } from '../lib/redis.js';
import { requireAuth, requireSecretKey } from '../middleware/auth.js';
import { emitSmartSpaceEvent } from '../lib/smartspace-events.js';
import { buildToolCallMessageMeta, buildToolCallMessagePayload } from '../lib/tool-call-utils.js';

export const runsRouter = Router();

// =============================================================================
// Helpers
// =============================================================================

/**
 * Verify the authenticated entity has access to a run.
 * Secret key: always allowed.
 * Public key + JWT: entity must be a member of the run's trigger space or active space.
 */
async function verifyRunAccess(req: Request, res: Response): Promise<boolean> {
  if (req.auth?.method === 'secret_key') return true;

  const entityId = req.auth?.entityId;
  if (!entityId) {
    res.status(403).json({ error: 'No entity resolved' });
    return false;
  }

  const run = await prisma.run.findUnique({
    where: { id: req.params.runId },
    select: { triggerSpaceId: true, activeSpaceId: true },
  });

  if (!run) {
    res.status(404).json({ error: 'Run not found' });
    return false;
  }

  // Check membership in trigger space or active space
  const spaceIds = [run.triggerSpaceId, run.activeSpaceId].filter(Boolean) as string[];

  if (spaceIds.length === 0) {
    res.status(403).json({ error: 'No accessible space for this run' });
    return false;
  }

  const membership = await prisma.smartSpaceMembership.findFirst({
    where: {
      entityId,
      smartSpaceId: { in: spaceIds },
    },
  });

  if (!membership) {
    res.status(403).json({ error: 'Not a member of the run\'s space' });
    return false;
  }

  return true;
}

// =============================================================================
// Run CRUD
// =============================================================================

// POST /api/runs — Create a run (admin only, typically used by gateway internals)
runsRouter.post('/', requireSecretKey(), async (req: Request, res: Response) => {
  try {
    const { agentEntityId, agentId, triggerType, triggerSpaceId, triggerMessageId,
            triggerMessageContent, triggerSenderEntityId, triggerSenderName,
            triggerSenderType, triggerServiceName, triggerPayload,
            triggerPlanId, triggerPlanName, triggerPlanInstruction } = req.body;

    if (!agentEntityId || !agentId) {
      res.status(400).json({ error: 'agentEntityId and agentId are required' });
      return;
    }

    const run = await prisma.run.create({
      data: {
        agentEntityId,
        agentId,
        status: 'queued',
        triggerType,
        triggerSpaceId,
        triggerMessageId,
        triggerMessageContent,
        triggerSenderEntityId,
        triggerSenderName,
        triggerSenderType,
        triggerServiceName,
        triggerPayload: triggerPayload ?? undefined,
        triggerPlanId,
        triggerPlanName,
        triggerPlanInstruction,
        // Agent must always call enter_space explicitly — no auto-set
        activeSpaceId: null,
      },
    });

    res.status(201).json({ run });
  } catch (error) {
    console.error('Create run error:', error);
    res.status(500).json({ error: 'Failed to create run' });
  }
});

// GET /api/runs/:runId — Get run
runsRouter.get('/:runId', requireAuth(), async (req: Request, res: Response) => {
  try {
    if (!(await verifyRunAccess(req, res))) return;

    const run = await prisma.run.findUnique({
      where: { id: req.params.runId },
    });

    if (!run) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }

    res.json({ run });
  } catch (error) {
    console.error('Get run error:', error);
    res.status(500).json({ error: 'Failed to get run' });
  }
});

// GET /api/runs — List runs (admin only)
runsRouter.get('/', requireSecretKey(), async (req: Request, res: Response) => {
  try {
    const { agentEntityId, status, limit } = req.query;
    const where: Record<string, unknown> = {};
    if (agentEntityId) where.agentEntityId = agentEntityId;
    if (status) where.status = status;

    const runs = await prisma.run.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(limit) || 20, 100),
    });

    res.json({ runs });
  } catch (error) {
    console.error('List runs error:', error);
    res.status(500).json({ error: 'Failed to list runs' });
  }
});

// POST /api/runs/:runId/cancel — Cancel a run
runsRouter.post('/:runId/cancel', requireSecretKey(), async (req: Request, res: Response) => {
  try {
    const updated = await prisma.run.updateMany({
      where: {
        id: req.params.runId,
        status: { in: ['queued', 'running', 'waiting_tool'] },
      },
      data: {
        status: 'canceled',
        completedAt: new Date(),
      },
    });

    if (updated.count === 0) {
      res.status(404).json({ error: 'Run not found or already finished' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Cancel run error:', error);
    res.status(500).json({ error: 'Failed to cancel run' });
  }
});

// DELETE /api/runs/:runId — Delete a run
runsRouter.delete('/:runId', requireSecretKey(), async (req: Request, res: Response) => {
  try {
    await prisma.run.delete({ where: { id: req.params.runId } });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete run error:', error);
    res.status(500).json({ error: 'Failed to delete run' });
  }
});

// =============================================================================
// Run Events
// =============================================================================

// GET /api/runs/:runId/events — Get run events
runsRouter.get('/:runId/events', requireAuth(), async (req: Request, res: Response) => {
  try {
    if (!(await verifyRunAccess(req, res))) return;

    const events = await prisma.runEvent.findMany({
      where: { runId: req.params.runId },
      orderBy: { seq: 'asc' },
    });

    res.json({ events: events.map((e) => ({
      ...e,
      seq: Number(e.seq),
    })) });
  } catch (error) {
    console.error('Get run events error:', error);
    res.status(500).json({ error: 'Failed to get run events' });
  }
});

// =============================================================================
// Run SSE Stream
// =============================================================================

runsRouter.get('/:runId/stream', requireAuth(), async (req: Request, res: Response) => {
  try {
    if (!(await verifyRunAccess(req, res))) return;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    res.write('data: {"type":"connected"}\n\n');

    const subscriber = redis.duplicate();
    await subscriber.subscribe(`run:${req.params.runId}`);

    subscriber.on('message', (_channel: string, message: string) => {
      res.write(`data: ${message}\n\n`);
    });

    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 30000);

    req.on('close', () => {
      clearInterval(heartbeat);
      subscriber.unsubscribe();
      subscriber.disconnect();
    });
  } catch (error) {
    console.error('Run SSE stream error:', error);
    res.status(500).json({ error: 'Failed to start run stream' });
  }
});

// =============================================================================
// Tool Results (for waiting_tool runs — interactive UI tools)
// =============================================================================

runsRouter.post('/:runId/tool-results', requireAuth(), async (req: Request, res: Response) => {
  try {
    if (!(await verifyRunAccess(req, res))) return;

    const { callId, result } = req.body;

    if (!callId || result === undefined) {
      res.status(400).json({ error: 'callId and result are required' });
      return;
    }

    const run = await prisma.run.findUnique({
      where: { id: req.params.runId },
      select: { status: true, metadata: true },
    });

    if (!run) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }

    if (run.status !== 'waiting_tool') {
      res.status(400).json({ error: `Run is ${run.status}, not waiting_tool` });
      return;
    }

    // Update the ToolCall record with the result
    const toolCall = await prisma.toolCall.findFirst({
      where: { runId: req.params.runId, callId },
    });

    if (!toolCall) {
      res.status(404).json({ error: `Tool call ${callId} not found for this run` });
      return;
    }

    if (toolCall.status === 'completed') {
      res.status(400).json({ error: `Tool call ${callId} already completed` });
      return;
    }

    await prisma.toolCall.update({
      where: { id: toolCall.id },
      data: {
        status: 'completed',
        output: result as any,
        completedAt: new Date(),
      },
    });

    // Update the persisted SmartSpaceMessage for this tool call (if it exists)
    // so the tool shows as complete with result on page refresh.
    try {
      const toolMessages = await prisma.smartSpaceMessage.findMany({
        where: { runId: req.params.runId },
      });
      const toolMsg = toolMessages.find((m) => {
        const meta = m.metadata as Record<string, unknown> | null;
        return meta?.toolCallId === callId;
      });
      if (toolMsg) {
        const completeMeta = buildToolCallMessageMeta({
          toolCallId: callId,
          toolName: toolCall.toolName,
          args: toolCall.args as unknown,
          result,
          status: 'complete',
          runId: req.params.runId,
        });
        await prisma.smartSpaceMessage.update({
          where: { id: toolMsg.id },
          data: { metadata: completeMeta as any },
        });
        // Emit updated space.message so the frontend refreshes this tool call
        if (toolMsg.smartSpaceId) {
          await emitSmartSpaceEvent(toolMsg.smartSpaceId, {
            type: 'space.message',
            streamId: callId,
            message: buildToolCallMessagePayload({
              messageId: toolMsg.id,
              smartSpaceId: toolMsg.smartSpaceId,
              entityId: toolMsg.entityId,
              toolCallId: callId,
              toolName: toolCall.toolName,
              args: toolCall.args as unknown,
              result,
              status: 'complete',
              runId: req.params.runId,
            }),
          });
        }
      }
    } catch (err) {
      console.warn(`[runs] Failed to update tool message for callId ${callId}:`, err);
    }

    // Check if ALL pending tool calls for this run now have results
    const pendingCount = await prisma.toolCall.count({
      where: {
        runId: req.params.runId,
        status: { not: 'completed' },
      },
    });

    if (pendingCount === 0) {
      // All tool results collected — transition back to queued for re-execution.
      // Tool results are read from ToolCall records on resume (no metadata duplication).
      await prisma.run.update({
        where: { id: req.params.runId },
        data: { status: 'queued' },
      });

      // Re-execute the run asynchronously
      (async () => {
        try {
          const { executeRun } = await import('../lib/run-runner.js');
          await executeRun(req.params.runId);
        } catch (err) {
          console.error(`[runs] Resume run ${req.params.runId} failed:`, err);
        }
      })();
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Submit tool result error:', error);
    res.status(500).json({ error: 'Failed to submit tool result' });
  }
});
