import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { isSkillConnected, getConnectedSkills } from '../lib/tool-dispatcher.js';
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

    const [haseefCount, skillCount, recentRuns] = await Promise.all([
      prisma.haseef.count(),
      prisma.skill.count(),
      prisma.run.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          haseefId: true,
          status: true,
          triggerSkill: true,
          triggerType: true,
          summary: true,
          durationMs: true,
          createdAt: true,
        },
      }),
    ]);

    // Get connected skills
    const connectedSkills = getConnectedSkills();

    res.json({
      haseefs: {
        total: haseefCount,
        activeCount: activeHaseefIds.length,
        activeIds: activeHaseefIds,
      },
      skills: {
        total: skillCount,
        connected: connectedSkills,
      },
      recentRuns,
    });
  } catch (err) {
    console.error('[dashboard] status error:', err);
    res.status(500).json({ error: 'Failed to get dashboard status' });
  }
});
