// BigInt JSON serialization (Prisma seq fields are BigInt)
(BigInt.prototype as any).toJSON = function () { return Number(this); };

import express from 'express';
import { createServer } from 'http';
import { runsRouter } from './routes/runs.js';
import { haseefsRouter } from './routes/haseefs.js';
import { scopesRouter } from './routes/scopes.js';
import { actionsRouter } from './routes/actions.js';
import { requireApiKey } from './middleware/auth.js';
import { prisma } from './lib/db.js';
import { redis } from './lib/redis.js';
import { startAllProcesses, stopAllProcesses, getProcessCount, getProcessStatuses } from './lib/process-manager.js';

// =============================================================================
// Hsafa Core (v5)
//
// No extensions. No plan scheduler.
// Services connect via:
//   POST /api/haseefs/:id/events      — push events
//   PUT  /api/haseefs/:id/scopes/...  — register tools
//   GET  /api/haseefs/:id/scopes/:scope/actions/stream — consume actions (SSE)
//   POST /api/haseefs/:id/actions/:actionId/result — return action results
// =============================================================================

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3001;

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, x-request-id, Cache-Control');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Type, Cache-Control, Connection, X-Accel-Buffering');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

app.use(express.json());

// All API routes require x-api-key
app.use('/api', requireApiKey());

// Routes
app.use('/api/haseefs', haseefsRouter);
app.use('/api/runs', runsRouter);
// Scopes are nested under haseefs: /api/haseefs/:id/scopes/...
app.use('/api/haseefs/:id/scopes', scopesRouter);
// Actions: /api/haseefs/:id/scopes/:scope/actions/stream (SSE)
//          /api/haseefs/:id/actions/:actionId/result (POST)
app.use('/api/haseefs/:id/scopes', actionsRouter);
app.use('/api/haseefs/:id/actions', actionsRouter);

// Health check (no auth)
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'hsafa-core',
    version: '5.0.0',
    processes: getProcessCount(),
  });
});

// Admin status overview
app.get('/api/status', async (_req, res) => {
  try {
    const runningProcesses = getProcessStatuses();
    const haseefIds = runningProcesses.map((p) => p.haseefId);

    const [consciousness, lastRuns, failedRuns, inboxDepths] = await Promise.all([
      prisma.haseefConsciousness.findMany({
        where: { haseefId: { in: haseefIds } },
        select: { haseefId: true, cycleCount: true, tokenEstimate: true, lastCycleAt: true },
      }),
      prisma.run.findMany({
        where: { haseefId: { in: haseefIds }, status: 'completed' },
        orderBy: { completedAt: 'desc' },
        distinct: ['haseefId'],
        select: { haseefId: true, durationMs: true, completedAt: true },
      }),
      prisma.run.groupBy({
        by: ['haseefId'],
        where: {
          haseefId: { in: haseefIds },
          status: 'failed',
          createdAt: { gte: new Date(Date.now() - 86_400_000) },
        },
        _count: true,
      }),
      prisma.inboxEvent.groupBy({
        by: ['haseefId'],
        where: { haseefId: { in: haseefIds }, status: 'pending' },
        _count: true,
      }),
    ]);

    const consciousnessMap = new Map(consciousness.map((c) => [c.haseefId, c]));
    const lastRunMap = new Map(lastRuns.map((r) => [r.haseefId, r]));
    const failedMap = new Map(failedRuns.map((f) => [f.haseefId, f._count]));
    const inboxMap = new Map(inboxDepths.map((i) => [i.haseefId, i._count]));

    const haseefs = runningProcesses.map((p) => {
      const c = consciousnessMap.get(p.haseefId);
      const lastRun = lastRunMap.get(p.haseefId);
      return {
        haseefId: p.haseefId,
        name: p.haseefName,
        status: 'running',
        cycleCount: c?.cycleCount ?? 0,
        tokenEstimate: c?.tokenEstimate ?? 0,
        lastCycleAt: c?.lastCycleAt ?? null,
        lastRunDurationMs: lastRun?.durationMs ?? null,
        failedRuns24h: failedMap.get(p.haseefId) ?? 0,
        inboxDepth: inboxMap.get(p.haseefId) ?? 0,
      };
    });

    res.json({
      uptime: process.uptime(),
      processCount: runningProcesses.length,
      haseefs,
    });
  } catch (error) {
    console.error('[status] error:', error);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

server.listen(PORT, async () => {
  console.log(`Hsafa Core v5 running on http://localhost:${PORT}`);

  try {
    await prisma.$connect();
    console.log('Database connected');
  } catch (error) {
    console.error('Database connection failed:', error);
  }

  try {
    await redis.ping();
    console.log('Redis connected');
  } catch (error) {
    console.error('Redis connection failed:', error);
  }

  // Start all Haseef processes
  try {
    await startAllProcesses();
  } catch (error) {
    console.error('Failed to start Haseef processes:', error);
  }
});

// Graceful shutdown
const shutdown = async () => {
  console.log('\nShutting down...');

  try {
    await stopAllProcesses();
  } catch (error) {
    console.error('Error stopping processes:', error);
  }

  server.close(() => {
    prisma.$disconnect();
    redis.disconnect();
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 15_000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
