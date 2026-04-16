import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { redis } from '../lib/redis.js';
import { isRunning, getActiveRunId } from '../lib/coordinator.js';

// =============================================================================
// Haseefs Routes (v7)
//
// CRUD, profile, status, real-time stream.
// No consciousness, no process management, no inbox.
// =============================================================================

export const haseefsRouter = Router();

// ── CRUD ─────────────────────────────────────────────────────────────────────

// POST /api/haseefs — Create
haseefsRouter.post('/', async (req, res) => {
  try {
    const { name, description, profileJson, configJson, skills } = req.body;

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
        skills: skills ?? ['spaces'],
      },
    });

    res.status(201).json({ haseef });
  } catch (err: any) {
    if (err.code === 'P2002') {
      res.status(409).json({ error: 'Haseef with this name already exists' });
      return;
    }
    console.error('[haseefs] create error:', err);
    res.status(500).json({ error: 'Failed to create haseef' });
  }
});

// GET /api/haseefs — List
haseefsRouter.get('/', async (req, res) => {
  try {
    const where = {};

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
    const { name, description, configJson, profileJson, skills } = req.body;
    const data: Record<string, unknown> = {};

    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (configJson !== undefined) data.configJson = configJson;
    if (profileJson !== undefined) data.profileJson = profileJson;
    if (skills !== undefined) data.skills = skills;

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
    const haseefId = req.params.id;

    // Delete the haseef (cascades runs, memories)
    await prisma.haseef.delete({ where: { id: haseefId } });

    // Clean up Redis state
    await redis.del(`inbox:${haseefId}`).catch(() => {});

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
  const running = isRunning(req.params.id);
  const activeRunId = getActiveRunId(req.params.id);
  res.json({ running, activeRunId: activeRunId ?? null });
});

// ── Real-time Stream ─────────────────────────────────────────────────────────

// GET /api/haseefs/:id/stream — SSE: real-time run events
haseefsRouter.get('/:id/stream', async (req, res) => {
  const haseefId = req.params.id;

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
