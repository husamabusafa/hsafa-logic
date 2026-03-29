import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { isScopeConnected } from '../lib/tool-dispatcher.js';
import { getActiveHaseefIds } from '../lib/coordinator.js';

// =============================================================================
// Dashboard Routes (v7)
//
// Status overview for the dashboard UI.
// =============================================================================

export const dashboardRouter = Router();

// GET /api/dashboard/status — Overall system status
dashboardRouter.get('/status', async (_req, res) => {
  try {
    const activeHaseefIds = getActiveHaseefIds();

    const [haseefCount, scopeCount, recentRuns] = await Promise.all([
      prisma.haseef.count(),
      prisma.scope.count(),
      prisma.run.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          haseefId: true,
          status: true,
          triggerScope: true,
          triggerType: true,
          summary: true,
          durationMs: true,
          createdAt: true,
        },
      }),
    ]);

    // Get connected scopes
    const scopes = await prisma.scope.findMany({
      select: { name: true },
    });
    const connectedScopes = scopes
      .filter((s) => isScopeConnected(s.name))
      .map((s) => s.name);

    res.json({
      haseefs: {
        total: haseefCount,
        activeCount: activeHaseefIds.length,
        activeIds: activeHaseefIds,
      },
      scopes: {
        total: scopeCount,
        connected: connectedScopes,
      },
      recentRuns,
    });
  } catch (err) {
    console.error('[dashboard] status error:', err);
    res.status(500).json({ error: 'Failed to get dashboard status' });
  }
});
