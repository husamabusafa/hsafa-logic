// BigInt JSON serialization (Prisma seq fields are BigInt)
(BigInt.prototype as any).toJSON = function () { return Number(this); };

import express from 'express';
import { createServer } from 'http';
import { agentsRouter } from './routes/agents.js';
import { runsRouter } from './routes/runs.js';
import { toolWorkersRouter } from './routes/tool-workers.js';
import { extensionsRouter } from './routes/extensions.js';
import { haseefsRouter } from './routes/haseefs.js';
import { prisma } from './lib/db.js';
import { redis } from './lib/redis.js';
import { startAllProcesses, stopAllProcesses, getProcessCount, getProcessStatuses } from './lib/process-manager.js';
import { startPlanScheduler, stopPlanScheduler } from './lib/plan-scheduler.js';

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3001;

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-public-key, x-secret-key, x-extension-key, x-request-id, Cache-Control');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Type, Cache-Control, Connection, X-Accel-Buffering');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

app.use(express.json());

// Routes
app.use('/api/agents', agentsRouter);
app.use('/api/runs', runsRouter);
app.use('/api/tools', toolWorkersRouter);
// v4: Extension system routes
app.use('/api/extensions', extensionsRouter);
app.use('/api/haseefs', haseefsRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'hsafa-core',
    version: '4.0.0',
    processes: getProcessCount(),
  });
});

// §6.6: Observability dashboard — admin status overview
app.get('/api/status', async (_req, res) => {
  try {
    const secretKey = _req.headers['x-secret-key'] as string;
    if (!secretKey || secretKey !== process.env.HSAFA_SECRET_KEY) {
      res.status(401).json({ error: 'Secret key required' });
      return;
    }

    const runningProcesses = getProcessStatuses();
    const haseefIds = runningProcesses.map((p) => p.haseefId);

    // Batch queries for all running haseefs
    const [consciousness, lastRuns, failedRuns, inboxDepths, extensions] = await Promise.all([
      // Consciousness: cycle count + token estimate
      prisma.haseefConsciousness.findMany({
        where: { haseefId: { in: haseefIds } },
        select: { haseefId: true, cycleCount: true, tokenEstimate: true, lastCycleAt: true },
      }),
      // Last completed run per haseef
      prisma.run.findMany({
        where: { haseefId: { in: haseefIds }, status: 'completed' },
        orderBy: { completedAt: 'desc' },
        distinct: ['haseefId'],
        select: { haseefId: true, durationMs: true, promptTokens: true, completionTokens: true, completedAt: true },
      }),
      // Failed run count (last 24h)
      prisma.run.groupBy({
        by: ['haseefId'],
        where: {
          haseefId: { in: haseefIds },
          status: 'failed',
          createdAt: { gte: new Date(Date.now() - 86_400_000) },
        },
        _count: true,
      }),
      // Inbox depth (pending events)
      prisma.inboxEvent.groupBy({
        by: ['haseefId'],
        where: { haseefId: { in: haseefIds }, status: 'pending' },
        _count: true,
      }),
      // Connected extensions
      prisma.haseefExtension.findMany({
        where: { haseefId: { in: haseefIds }, enabled: true },
        select: { haseefId: true, extension: { select: { name: true } } },
      }),
    ]);

    // Index by haseefId for fast lookup
    const consciousnessMap = new Map(consciousness.map((c) => [c.haseefId, c]));
    const lastRunMap = new Map(lastRuns.map((r) => [r.haseefId, r]));
    const failedMap = new Map(failedRuns.map((f) => [f.haseefId, f._count]));
    const inboxMap = new Map(inboxDepths.map((i) => [i.haseefId, i._count]));
    const extMap = new Map<string, string[]>();
    for (const e of extensions) {
      const list = extMap.get(e.haseefId) ?? [];
      list.push(e.extension.name);
      extMap.set(e.haseefId, list);
    }

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
        lastRunTokens: lastRun ? { prompt: lastRun.promptTokens, completion: lastRun.completionTokens } : null,
        failedRuns24h: failedMap.get(p.haseefId) ?? 0,
        inboxDepth: inboxMap.get(p.haseefId) ?? 0,
        extensions: extMap.get(p.haseefId) ?? [],
      };
    });

    res.json({
      uptime: process.uptime(),
      processCount: runningProcesses.length,
      haseefs,
    });
  } catch (error) {
    console.error('Status endpoint error:', error);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

server.listen(PORT, async () => {
  console.log(`Hsafa Core v4 running on http://localhost:${PORT}`);

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

  // v3: Start all agent processes
  try {
    await startAllProcesses();
  } catch (error) {
    console.error('Failed to start agent processes:', error);
  }

  // v3: Start plan scheduler (BullMQ)
  try {
    await startPlanScheduler();
  } catch (error) {
    console.error('Failed to start plan scheduler:', error);
  }
});

// Graceful shutdown
const shutdown = async () => {
  console.log('\nShutting down...');

  try {
    await stopPlanScheduler();
    await stopAllProcesses();
  } catch (error) {
    console.error('Error stopping processes:', error);
  }

  server.close(() => {
    prisma.$disconnect();
    redis.disconnect();
    process.exit(0);
  });

  // Force exit after 15s
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 15_000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
