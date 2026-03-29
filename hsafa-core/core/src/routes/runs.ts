import { Router, Request, Response } from 'express';
import { prisma } from '../lib/db.js';

// =============================================================================
// Runs Routes (v7)
//
// Read-only run history. Runs are created/updated by the invoker.
// =============================================================================

export const runsRouter = Router();

// GET /api/runs — List runs
runsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const status = req.query.status as string | undefined;
    const haseefId = req.query.haseefId as string | undefined;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (haseefId) where.haseefId = haseefId;

    const runs = await prisma.run.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    res.json({ runs });
  } catch (error) {
    console.error('[runs] list error:', error);
    res.status(500).json({ error: 'Failed to list runs' });
  }
});

// GET /api/runs/:runId — Get run
runsRouter.get('/:runId', async (req: Request, res: Response) => {
  try {
    const run = await prisma.run.findUnique({
      where: { id: req.params.runId },
    });

    if (!run) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }

    res.json({ run });
  } catch (error) {
    console.error('[runs] get error:', error);
    res.status(500).json({ error: 'Failed to get run' });
  }
});

