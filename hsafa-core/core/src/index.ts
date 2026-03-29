// BigInt JSON serialization (Prisma seq fields are BigInt)
(BigInt.prototype as any).toJSON = function () { return Number(this); };

import express from 'express';
import { createServer } from 'http';
import { haseefsRouter } from './routes/haseefs.js';
import { eventsRouter } from './routes/events.js';
import { globalScopesRouter } from './routes/global-scopes.js';
import { globalActionsRouter } from './routes/global-actions.js';
import { runsRouter } from './routes/runs.js';
import { memoryRouter } from './routes/memory.js';
import { dashboardRouter } from './routes/dashboard.js';
import { requireApiKey } from './middleware/auth.js';
import { prisma } from './lib/db.js';
import { redis } from './lib/redis.js';
import { getActiveHaseefIds } from './lib/coordinator.js';

// =============================================================================
// Hsafa Core (v7)
//
// Stateless trigger-based architecture. No living processes.
// Services connect via:
//   POST /api/events                    — push events (triggers runs)
//   PUT  /api/scopes/:scope/tools       — register tools
//   GET  /api/scopes/:scope/actions/stream — consume tool calls (SSE)
//   POST /api/actions/:actionId/result  — return tool results
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

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/haseefs', haseefsRouter);
app.use('/api/events', eventsRouter);
app.use('/api/scopes', globalScopesRouter);
app.use('/api/actions', globalActionsRouter);
app.use('/api/runs', runsRouter);
app.use('/api/memory', memoryRouter);
app.use('/api/dashboard', dashboardRouter);

// Health check (no auth)
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'hsafa-core',
    version: '7.0.0',
    activeRuns: getActiveHaseefIds().length,
  });
});

// ── Startup ──────────────────────────────────────────────────────────────────

server.listen(PORT, async () => {
  console.log(`Hsafa Core v7 running on http://localhost:${PORT}`);

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

  // v7: No process startup needed — haseefs are triggered on-demand by events
  console.log('Ready — waiting for events');
});

// ── Graceful shutdown ────────────────────────────────────────────────────────

const shutdown = async () => {
  console.log('\nShutting down...');

  server.close(() => {
    prisma.$disconnect();
    redis.disconnect();
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
