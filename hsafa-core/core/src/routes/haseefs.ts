import { Router } from 'express';
import crypto from 'crypto';
import { prisma } from '../lib/db.js';
import { pushToInbox } from '../lib/inbox.js';
import { redis } from '../lib/redis.js';
import {
  createSnapshot,
  listSnapshots,
  restoreSnapshot,
} from '../lib/consciousness.js';
import {
  startProcess,
  stopProcess,
  isProcessRunning,
} from '../lib/process-manager.js';
import type { SenseEvent } from '../agent-builder/types.js';

// =============================================================================
// Haseefs Routes (v5)
//
// CRUD, profile, events, process management, consciousness, streaming.
// =============================================================================

export const haseefsRouter = Router();

// ── CRUD ─────────────────────────────────────────────────────────────────────

// POST /api/haseefs — Create
haseefsRouter.post('/', async (req, res) => {
  try {
    const { name, description, profileJson, configJson } = req.body;

    if (!name || !configJson) {
      res.status(400).json({ error: 'name and configJson are required' });
      return;
    }

    const configHash = crypto
      .createHash('md5')
      .update(JSON.stringify(configJson))
      .digest('hex');

    const haseef = await prisma.haseef.create({
      data: {
        name,
        description,
        profileJson: profileJson ?? undefined,
        configJson,
        configHash,
      },
    });

    // Auto-start the haseef process so it can immediately consume inbox events
    try {
      await startProcess(haseef.id, haseef.name);
    } catch (err) {
      console.warn(`[haseefs] Failed to auto-start process for ${haseef.name}:`, err);
    }

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
haseefsRouter.get('/', async (_req, res) => {
  try {
    const haseefs = await prisma.haseef.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json({ haseefs });
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
    res.json({ haseef });
  } catch (err) {
    console.error('[haseefs] get error:', err);
    res.status(500).json({ error: 'Failed to get haseef' });
  }
});

// PATCH /api/haseefs/:id — Update config
haseefsRouter.patch('/:id', async (req, res) => {
  try {
    const { name, description, configJson } = req.body;
    const data: Record<string, unknown> = {};

    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (configJson !== undefined) {
      data.configJson = configJson;
      data.configHash = crypto
        .createHash('md5')
        .update(JSON.stringify(configJson))
        .digest('hex');
    }

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
    await stopProcess(req.params.id);
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

// ── Events (senses in) ──────────────────────────────────────────────────────

// POST /api/haseefs/:id/events — Push events
haseefsRouter.post('/:id/events', async (req, res) => {
  try {
    const haseefId = req.params.id;
    const events: SenseEvent[] = Array.isArray(req.body) ? req.body : [req.body];

    // Verify haseef exists
    const exists = await prisma.haseef.findUnique({
      where: { id: haseefId },
      select: { id: true },
    });
    if (!exists) {
      res.status(404).json({ error: 'Haseef not found' });
      return;
    }

    for (const event of events) {
      if (!event.eventId || !event.scope || !event.type) {
        res.status(400).json({ error: 'Each event must have eventId, scope, and type' });
        return;
      }
      event.timestamp = event.timestamp ?? new Date().toISOString();
      await pushToInbox(haseefId, event);
    }

    res.json({ pushed: events.length });
  } catch (err) {
    console.error('[haseefs] push events error:', err);
    res.status(500).json({ error: 'Failed to push events' });
  }
});

// ── Process management ───────────────────────────────────────────────────────

// POST /api/haseefs/:id/start
haseefsRouter.post('/:id/start', async (req, res) => {
  try {
    const haseef = await prisma.haseef.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true },
    });
    if (!haseef) {
      res.status(404).json({ error: 'Haseef not found' });
      return;
    }
    await startProcess(haseef.id, haseef.name);
    res.json({ status: 'started' });
  } catch (err) {
    console.error('[haseefs] start error:', err);
    res.status(500).json({ error: 'Failed to start process' });
  }
});

// POST /api/haseefs/:id/stop
haseefsRouter.post('/:id/stop', async (req, res) => {
  try {
    await stopProcess(req.params.id);
    res.json({ status: 'stopped' });
  } catch (err) {
    console.error('[haseefs] stop error:', err);
    res.status(500).json({ error: 'Failed to stop process' });
  }
});

// GET /api/haseefs/:id/status
haseefsRouter.get('/:id/status', async (req, res) => {
  const running = isProcessRunning(req.params.id);
  res.json({ running });
});

// ── Consciousness ────────────────────────────────────────────────────────────

// GET /api/haseefs/:id/stream — SSE: real-time thinking
haseefsRouter.get('/:id/stream', async (req, res) => {
  const haseefId = req.params.id;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const channel = `haseef:${haseefId}:stream`;
  const sub = redis.duplicate();

  sub.on('message', (_ch: string, message: string) => {
    res.write(`data: ${message}\n\n`);
  });

  await sub.subscribe(channel);

  req.on('close', () => {
    sub.unsubscribe(channel).catch(() => {});
    sub.quit().catch(() => {});
  });
});

// POST /api/haseefs/:id/snapshot — Create snapshot
haseefsRouter.post('/:id/snapshot', async (req, res) => {
  try {
    const snapshot = await createSnapshot(req.params.id, 'manual');
    res.json({ snapshot });
  } catch (err: any) {
    console.error('[haseefs] snapshot error:', err);
    res.status(500).json({ error: err.message || 'Failed to create snapshot' });
  }
});

// GET /api/haseefs/:id/snapshots — List snapshots
haseefsRouter.get('/:id/snapshots', async (req, res) => {
  try {
    const snapshots = await listSnapshots(req.params.id);
    res.json({ snapshots });
  } catch (err) {
    console.error('[haseefs] list snapshots error:', err);
    res.status(500).json({ error: 'Failed to list snapshots' });
  }
});

// POST /api/haseefs/:id/restore — Restore snapshot
haseefsRouter.post('/:id/restore', async (req, res) => {
  try {
    const { snapshotId } = req.body;
    if (!snapshotId) {
      res.status(400).json({ error: 'snapshotId is required' });
      return;
    }
    const result = await restoreSnapshot(req.params.id, snapshotId);
    res.json(result);
  } catch (err: any) {
    console.error('[haseefs] restore error:', err);
    res.status(500).json({ error: err.message || 'Failed to restore snapshot' });
  }
});
