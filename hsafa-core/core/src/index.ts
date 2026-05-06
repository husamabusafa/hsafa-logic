// BigInt JSON serialization (Prisma seq fields are BigInt)
(BigInt.prototype as any).toJSON = function () { return Number(this); };

import express from 'express';
import type { Request } from 'express';
import { createServer } from 'http';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { haseefsRouter } from './routes/haseefs.js';
import { eventsRouter } from './routes/events.js';
import { globalSkillsRouter } from './routes/global-skills.js';
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
//   POST /api/v7/events                    — push events (triggers runs)
//   PUT  /api/v7/skills/:skill/tools       — register tools
//   GET  /api/v7/skills/:skill/actions/stream — consume tool calls (SSE)
//   POST /api/v7/actions/:actionId/result  — return tool results
//
// The unversioned `/api/*` paths remain mounted as a deprecated alias for
// already-deployed services. Drop them in v8.
// =============================================================================

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3001;
const API_VERSION = 'v7';

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

app.use(express.json({ limit: '5mb' }));

// ── Rate limiter ─────────────────────────────────────────────────────────────
//
// Bucket per `x-api-key` (with IPv6-safe IP fallback for unauthenticated requests).
// Long-lived SSE streams are exempt — otherwise every reconnect burns a slot.
//
// Defaults are intentionally generous; this is abuse protection, not throttling.
//   - RATE_LIMIT_WINDOW_MS  default 60_000  (1 minute)
//   - RATE_LIMIT_MAX        default 1_000   (per window per key/ip)
const apiLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
  limit: Number(process.env.RATE_LIMIT_MAX ?? 1_000),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const apiKey = req.header('x-api-key') ?? (req.query.api_key as string | undefined);
    if (apiKey) return `key:${apiKey}`;
    // Fallback to IP for the rare unauthenticated path; ipKeyGenerator handles IPv6.
    return ipKeyGenerator(req.ip ?? '');
  },
  // Exempt the SSE stream — it's a persistent connection, not a per-request flood.
  skip: (req) => /\/skills\/[^/]+\/actions\/stream$/.test(req.path),
  message: { error: 'rate_limited', message: 'Too many requests — slow down.' },
});

// ── Build the API router (mounted at both /api/v7 and /api) ─────────────────

function buildApiRouter(): express.Router {
  const r = express.Router();
  r.use(requireApiKey());
  r.use(apiLimiter);

  r.use('/haseefs',  haseefsRouter);
  r.use('/events',   eventsRouter);
  r.use('/skills',   globalSkillsRouter);
  r.use('/actions',  globalActionsRouter);
  r.use('/runs',     runsRouter);
  r.use('/memory',   memoryRouter);
  r.use('/dashboard', dashboardRouter);
  return r;
}

// Canonical, versioned mount.
app.use(`/api/${API_VERSION}`, buildApiRouter());

// Legacy alias — already-deployed skills using older SDK versions still work.
// Add a Deprecation header so clients can detect the legacy path.
const legacyDeprecation: express.RequestHandler = (_req, res, next) => {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Sunset', 'v8');
  res.setHeader('Link', `</api/${API_VERSION}>; rel="successor-version"`);
  next();
};
app.use('/api', legacyDeprecation, buildApiRouter());

// ── Health check (no auth, no rate limit) ───────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'hsafa-core',
    version: '7.0.0',
    apiVersion: API_VERSION,
    activeRuns: getActiveHaseefIds().length,
  });
});

// ── Startup ──────────────────────────────────────────────────────────────────

server.listen(PORT, async () => {
  console.log(`Hsafa Core v7 running on http://localhost:${PORT}`);
  console.log(`  API:    /api/${API_VERSION}/* (canonical)`);
  console.log(`  Legacy: /api/* (deprecated alias)`);

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
