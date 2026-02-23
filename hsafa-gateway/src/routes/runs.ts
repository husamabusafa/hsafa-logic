import { Router, Request, Response } from 'express';
import { prisma } from '../lib/db.js';
import { redis } from '../lib/redis.js';
import { requireSecretKey, requireAuth } from '../middleware/auth.js';
import Redis from 'ioredis';

export const runsRouter = Router();

// =============================================================================
// Run membership check — verify caller has access to this run
// =============================================================================

async function verifyRunAccess(req: Request, res: Response): Promise<boolean> {
  if (req.auth?.method === 'secret_key') return true;

  const entityId = req.auth?.entityId;
  if (!entityId) {
    res.status(403).json({ error: 'No entity resolved' });
    return false;
  }

  const run = await prisma.run.findUnique({
    where: { id: req.params.runId },
    select: { triggerSpaceId: true },
  });

  if (!run) {
    res.status(404).json({ error: 'Run not found' });
    return false;
  }

  if (run.triggerSpaceId) {
    const membership = await prisma.smartSpaceMembership.findUnique({
      where: {
        smartSpaceId_entityId: { smartSpaceId: run.triggerSpaceId, entityId },
      },
    });
    if (!membership) {
      res.status(403).json({ error: 'Not a member of the trigger space' });
      return false;
    }
  }

  return true;
}

// GET /api/runs — List runs (admin)
runsRouter.get('/', requireSecretKey(), async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const status = req.query.status as string | undefined;
    const agentId = req.query.agentId as string | undefined;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (agentId) where.agentId = agentId;

    const runs = await prisma.run.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    res.json({ runs });
  } catch (error) {
    console.error('List runs error:', error);
    res.status(500).json({ error: 'Failed to list runs' });
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

// GET /api/runs/:runId/events — Get run events
runsRouter.get('/:runId/events', requireAuth(), async (req: Request, res: Response) => {
  try {
    if (!(await verifyRunAccess(req, res))) return;

    // v3: Run events are streamed via Redis Pub/Sub, not stored in DB.
    // Use GET /api/runs/:runId/stream for real-time SSE events.
    // This endpoint returns messages associated with the run.
    const messages = await prisma.smartSpaceMessage.findMany({
      where: { runId: req.params.runId },
      orderBy: { seq: 'asc' },
      take: 100,
    });

    res.json({ events: messages });
  } catch (error) {
    console.error('Get run events error:', error);
    res.status(500).json({ error: 'Failed to get events' });
  }
});

// GET /api/runs/:runId/stream — SSE stream for run events
runsRouter.get('/:runId/stream', requireAuth(), async (req: Request, res: Response) => {
  try {
    if (!(await verifyRunAccess(req, res))) return;

    const { runId } = req.params;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    res.write(`data: ${JSON.stringify({ type: 'connected', runId })}\n\n`);

    const subscriber = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    const channel = `run:${runId}`;
    await subscriber.subscribe(channel);

    subscriber.on('message', (_ch: string, message: string) => {
      res.write(`data: ${message}\n\n`);
    });

    const pingInterval = setInterval(() => {
      res.write(': ping\n\n');
    }, 30_000);

    req.on('close', () => {
      clearInterval(pingInterval);
      subscriber.unsubscribe(channel).catch(() => {});
      subscriber.disconnect();
    });
  } catch (error) {
    console.error('Run SSE error:', error);
    res.status(500).json({ error: 'Failed to start stream' });
  }
});

// POST /api/runs/:runId/tool-results — Submit tool result (for interactive space tools)
runsRouter.post('/:runId/tool-results', requireAuth(), async (req: Request, res: Response) => {
  try {
    if (!(await verifyRunAccess(req, res))) return;

    const { runId } = req.params;
    const { callId, result } = req.body;

    if (!callId) {
      res.status(400).json({ error: 'callId is required' });
      return;
    }

    const run = await prisma.run.findUnique({ where: { id: runId } });
    if (!run) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }

    if (run.status !== 'waiting_tool') {
      res.status(409).json({ error: `Run is not waiting for tool result (status: ${run.status})` });
      return;
    }

    // Store result in run metadata
    const metadata = (run.metadata as Record<string, unknown>) ?? {};
    const clientToolResults = (metadata.clientToolResults as Record<string, unknown>) ?? {};
    clientToolResults[callId] = result;
    metadata.clientToolResults = clientToolResults;

    await prisma.run.update({
      where: { id: runId },
      data: { metadata: metadata as any },
    });

    // TODO: Check if all pending tools have results, then resume the cycle

    res.json({ success: true });
  } catch (error) {
    console.error('Tool result error:', error);
    res.status(500).json({ error: 'Failed to submit tool result' });
  }
});
