import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { redis } from '../lib/redis.js';
import { isRunning, getActiveRunId } from '../lib/coordinator.js';
import { createApiKey } from '../lib/api-keys.js';
import { assertHaseefAccess } from '../middleware/auth.js';

// =============================================================================
// Haseefs Routes (v7)
//
// CRUD, profile, status, real-time stream.
// No consciousness, no process management, no inbox.
// =============================================================================

export const haseefsRouter = Router();

// ── CRUD ─────────────────────────────────────────────────────────────────────

// POST /api/haseefs — Create (service key only)
haseefsRouter.post('/', async (req, res) => {
  try {
    // Only service keys can create haseefs
    if (req.auth?.keyType !== 'service') {
      res.status(403).json({ error: 'Service key required to create haseefs' });
      return;
    }

    const { name, description, profileJson, configJson, scopes } = req.body;

    if (!name || !configJson) {
      res.status(400).json({ error: 'name and configJson are required' });
      return;
    }

    const haseef = await prisma.haseef.create({
      data: {
        name,
        description,
        profileJson: profileJson ?? undefined,
        configJson,
        scopes: scopes ?? ['spaces'],
      },
    });

    // Generate a per-haseef API key
    const { key: apiKey } = await createApiKey({
      type: 'haseef',
      resourceId: haseef.id,
      description: `Key for haseef "${name}"`,
    });

    res.status(201).json({ haseef, apiKey });
  } catch (err: any) {
    if (err.code === 'P2002') {
      res.status(409).json({ error: 'Haseef with this name already exists' });
      return;
    }
    console.error('[haseefs] create error:', err);
    res.status(500).json({ error: 'Failed to create haseef' });
  }
});

// GET /api/haseefs — List (service key: all, haseef key: only that haseef)
haseefsRouter.get('/', async (req, res) => {
  try {
    const where = req.auth?.keyType === 'haseef' && req.auth.resourceId
      ? { id: req.auth.resourceId }
      : {};

    const haseefs = await prisma.haseef.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      haseefs: haseefs.map((h) => ({
        ...h,
        running: isRunning(h.id),
        activeRunId: getActiveRunId(h.id),
      })),
    });
  } catch (err) {
    console.error('[haseefs] list error:', err);
    res.status(500).json({ error: 'Failed to list haseefs' });
  }
});

// GET /api/haseefs/:id — Get
haseefsRouter.get('/:id', async (req, res) => {
  try {
    if (!assertHaseefAccess(req, req.params.id)) {
      res.status(403).json({ error: 'Not authorized to access this haseef' });
      return;
    }

    const haseef = await prisma.haseef.findUnique({
      where: { id: req.params.id },
    });
    if (!haseef) {
      res.status(404).json({ error: 'Haseef not found' });
      return;
    }
    res.json({
      haseef: {
        ...haseef,
        running: isRunning(haseef.id),
        activeRunId: getActiveRunId(haseef.id),
      },
    });
  } catch (err) {
    console.error('[haseefs] get error:', err);
    res.status(500).json({ error: 'Failed to get haseef' });
  }
});

// PATCH /api/haseefs/:id — Update
haseefsRouter.patch('/:id', async (req, res) => {
  try {
    if (!assertHaseefAccess(req, req.params.id)) {
      res.status(403).json({ error: 'Not authorized to update this haseef' });
      return;
    }

    const { name, description, configJson, profileJson, scopes } = req.body;
    const data: Record<string, unknown> = {};

    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (configJson !== undefined) data.configJson = configJson;
    if (profileJson !== undefined) data.profileJson = profileJson;
    if (scopes !== undefined) data.scopes = scopes;

    const haseef = await prisma.haseef.update({
      where: { id: req.params.id },
      data: data as any,
    });

    res.json({ haseef });
  } catch (err: any) {
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Haseef not found' });
      return;
    }
    console.error('[haseefs] update error:', err);
    res.status(500).json({ error: 'Failed to update haseef' });
  }
});

// DELETE /api/haseefs/:id — Delete
haseefsRouter.delete('/:id', async (req, res) => {
  try {
    if (!assertHaseefAccess(req, req.params.id)) {
      res.status(403).json({ error: 'Not authorized to delete this haseef' });
      return;
    }

    await prisma.haseef.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err: any) {
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Haseef not found' });
      return;
    }
    console.error('[haseefs] delete error:', err);
    res.status(500).json({ error: 'Failed to delete haseef' });
  }
});

// ── Profile ──────────────────────────────────────────────────────────────────

// GET /api/haseefs/:id/profile
haseefsRouter.get('/:id/profile', async (req, res) => {
  if (!assertHaseefAccess(req, req.params.id)) {
    res.status(403).json({ error: 'Not authorized to access this haseef' });
    return;
  }
  try {
    const haseef = await prisma.haseef.findUnique({
      where: { id: req.params.id },
      select: { profileJson: true },
    });
    if (!haseef) {
      res.status(404).json({ error: 'Haseef not found' });
      return;
    }
    res.json({ profile: haseef.profileJson ?? {} });
  } catch (err) {
    console.error('[haseefs] get profile error:', err);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// PATCH /api/haseefs/:id/profile
haseefsRouter.patch('/:id/profile', async (req, res) => {
  if (!assertHaseefAccess(req, req.params.id)) {
    res.status(403).json({ error: 'Not authorized to update this haseef' });
    return;
  }
  try {
    const haseef = await prisma.haseef.update({
      where: { id: req.params.id },
      data: { profileJson: req.body },
      select: { profileJson: true },
    });
    res.json({ profile: haseef.profileJson });
  } catch (err: any) {
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Haseef not found' });
      return;
    }
    console.error('[haseefs] update profile error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ── Status ───────────────────────────────────────────────────────────────────

// GET /api/haseefs/:id/status
haseefsRouter.get('/:id/status', async (req, res) => {
  if (!assertHaseefAccess(req, req.params.id)) {
    res.status(403).json({ error: 'Not authorized to access this haseef' });
    return;
  }
  const running = isRunning(req.params.id);
  const activeRunId = getActiveRunId(req.params.id);
  res.json({ running, activeRunId: activeRunId ?? null });
});

// ── Real-time Stream ─────────────────────────────────────────────────────────

// GET /api/haseefs/:id/stream — SSE: real-time run events
haseefsRouter.get('/:id/stream', async (req, res) => {
  const haseefId = req.params.id;

  if (!assertHaseefAccess(req, haseefId)) {
    res.status(403).json({ error: 'Not authorized to access this haseef' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const channel = `haseef:${haseefId}:stream`;
  const sub = redis.duplicate();

  sub.on('message', (_ch: string, message: string) => {
    res.write(`data: ${message}\n\n`);
  });

  await sub.subscribe(channel);

  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 30_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sub.unsubscribe(channel).catch(() => {});
    sub.quit().catch(() => {});
  });
});
