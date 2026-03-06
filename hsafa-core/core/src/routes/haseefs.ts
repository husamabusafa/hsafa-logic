import { Router, type Request, type Response } from 'express';
import Redis from 'ioredis';
import { prisma } from '../lib/db.js';
import { requireSecretKey, requireExtensionKey } from '../middleware/auth.js';
import { pushSenseEvent } from '../lib/inbox.js';
import {
  connectExtension,
  disconnectExtension,
  getConnectedExtensions,
  updateExtensionConfig,
  verifyExtensionConnection,
  type ExtensionManifest,
} from '../lib/extension-manager.js';
import type { SenseEvent } from '../agent-builder/types.js';
import { createSnapshot, listSnapshots, restoreSnapshot } from '../lib/consciousness.js';

// =============================================================================
// Haseef Routes (v4 — Manifest + Webhook)
//
// Two auth modes:
//   - secret key (admin): manage haseefs, connect/disconnect extensions
//   - extension key: push senses
//
// POST   /haseefs/:id/senses                        (extension key) — push sense events
// GET    /haseefs/:id/stream                        (secret key) — SSE haseef stream
// POST   /haseefs/:id/snapshot                      (secret key) — create consciousness snapshot
// GET    /haseefs/:id/snapshots                     (secret key) — list snapshots
// POST   /haseefs/:id/restore                       (secret key) — restore from snapshot
// POST   /haseefs/:id/extensions/:extId/connect     (secret key) — connect extension
// DELETE /haseefs/:id/extensions/:extId/disconnect   (secret key) — disconnect extension
// PATCH  /haseefs/:id/extensions/:extId             (secret key) — update extension config
// GET    /haseefs/:id/extensions                     (secret key) — list connected extensions
// GET    /haseefs/:id                                (secret key) — get haseef details
// GET    /haseefs                                    (secret key) — list haseefs
// =============================================================================

export const haseefsRouter = Router();

// =============================================================================
// Helper: Verify haseef exists
// =============================================================================

async function verifyHaseefExists(haseefId: string): Promise<boolean> {
  const haseef = await prisma.haseef.findUnique({
    where: { id: haseefId },
    select: { id: true },
  });
  return !!haseef;
}

// =============================================================================
// Extension Key Routes (extension → core)
// =============================================================================

// POST /haseefs/:id/senses — Push sense events to a Haseef's inbox
haseefsRouter.post('/:id/senses', requireExtensionKey(), async (req: Request, res: Response) => {
  try {
    const haseefId = req.params.id;
    const extensionId = req.auth?.extensionId;

    if (!extensionId) {
      res.status(401).json({ error: 'No extension resolved' });
      return;
    }

    // Verify extension is connected to this haseef
    const connected = await verifyExtensionConnection(extensionId, haseefId);
    if (!connected) {
      res.status(403).json({ error: 'Extension is not connected to this Haseef' });
      return;
    }

    // Verify haseef exists
    const exists = await verifyHaseefExists(haseefId);
    if (!exists) {
      res.status(404).json({ error: 'Haseef not found' });
      return;
    }

    // Accept a single event or an array
    const { event, events } = req.body as {
      event?: SenseEvent & { eventId: string };
      events?: Array<SenseEvent & { eventId: string }>;
    };

    const toProcess = events ?? (event ? [event] : []);

    if (toProcess.length === 0) {
      res.status(400).json({ error: 'event or events array is required' });
      return;
    }

    // Validate and push each event
    for (const e of toProcess) {
      if (!e.eventId || !e.channel || !e.type) {
        res.status(400).json({ error: 'Each event must have eventId, channel, and type' });
        return;
      }
      await pushSenseEvent(haseefId, {
        eventId: e.eventId,
        channel: e.channel,
        source: e.source ?? '',
        type: e.type,
        data: e.data ?? {},
        timestamp: e.timestamp ?? new Date().toISOString(),
      });
    }

    res.json({ success: true, pushed: toProcess.length });
  } catch (error) {
    console.error('Push senses error:', error);
    res.status(500).json({ error: 'Failed to push sense events' });
  }
});

// =============================================================================
// SSE Haseef Stream (real-time LLM output streaming)
// =============================================================================

// GET /haseefs/:id/stream — SSE stream of haseef events (text deltas, tool input deltas, etc.)
haseefsRouter.get('/:id/stream', requireSecretKey(), async (req: Request, res: Response) => {
  const haseefId = req.params.id;

  const exists = await verifyHaseefExists(haseefId);
  if (!exists) {
    res.status(404).json({ error: 'Haseef not found' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  res.write(`data: ${JSON.stringify({ type: 'connected', haseefId, ts: new Date().toISOString() })}\n\n`);

  const subscriber = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  const channel = `haseef:${haseefId}:stream`;
  await subscriber.subscribe(channel);

  subscriber.on('message', (_ch: string, message: string) => {
    res.write(`data: ${message}\n\n`);
  });

  const pingInterval = setInterval(() => {
    res.write(': ping\n\n');
  }, 30_000);

  req.on('close', () => {
    clearInterval(pingInterval);
    subscriber.unsubscribe(channel).catch(() => {});
    subscriber.disconnect();
  });
});

// =============================================================================
// Secret Key Routes (admin management)
// =============================================================================

// GET /haseefs — List all Haseefs
haseefsRouter.get('/', requireSecretKey(), async (_req: Request, res: Response) => {
  try {
    const haseefs = await prisma.haseef.findMany({
      include: {
        connections: {
          include: {
            extension: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json({
      haseefs: haseefs.map((h) => ({
        id: h.id,
        name: h.name,
        description: h.description,
        haseefId: h.id,
        displayName: h.name,
        extensions: h.connections.map((c: any) => ({
          extensionId: c.extension.id,
          extensionName: c.extension.name,
          enabled: c.enabled,
        })),
        createdAt: h.createdAt,
      })),
    });
  } catch (error) {
    console.error('List haseefs error:', error);
    res.status(500).json({ error: 'Failed to list haseefs' });
  }
});

// =============================================================================
// Consciousness Snapshots (§6.3)
// =============================================================================

// POST /haseefs/:id/snapshot — Create a consciousness snapshot
haseefsRouter.post('/:id/snapshot', requireSecretKey(), async (req: Request, res: Response) => {
  try {
    const haseefId = req.params.id;
    const exists = await verifyHaseefExists(haseefId);
    if (!exists) {
      res.status(404).json({ error: 'Haseef not found' });
      return;
    }

    const snapshot = await createSnapshot(haseefId, 'manual');
    res.status(201).json({ snapshot });
  } catch (error) {
    console.error('Create snapshot error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to create snapshot';
    res.status(500).json({ error: msg });
  }
});

// GET /haseefs/:id/snapshots — List consciousness snapshots
haseefsRouter.get('/:id/snapshots', requireSecretKey(), async (req: Request, res: Response) => {
  try {
    const haseefId = req.params.id;
    const exists = await verifyHaseefExists(haseefId);
    if (!exists) {
      res.status(404).json({ error: 'Haseef not found' });
      return;
    }

    const limit = parseInt(req.query.limit as string) || 20;
    const snapshots = await listSnapshots(haseefId, Math.min(limit, 100));
    res.json({ snapshots });
  } catch (error) {
    console.error('List snapshots error:', error);
    res.status(500).json({ error: 'Failed to list snapshots' });
  }
});

// POST /haseefs/:id/restore — Restore consciousness from a snapshot
haseefsRouter.post('/:id/restore', requireSecretKey(), async (req: Request, res: Response) => {
  try {
    const haseefId = req.params.id;
    const { snapshotId } = req.body;

    if (!snapshotId) {
      res.status(400).json({ error: 'snapshotId is required' });
      return;
    }

    const exists = await verifyHaseefExists(haseefId);
    if (!exists) {
      res.status(404).json({ error: 'Haseef not found' });
      return;
    }

    const result = await restoreSnapshot(haseefId, snapshotId);
    res.json({ success: true, restored: result });
  } catch (error) {
    console.error('Restore snapshot error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to restore snapshot';
    res.status(500).json({ error: msg });
  }
});

// GET /haseefs/:id — Get Haseef details
haseefsRouter.get('/:id', requireSecretKey(), async (req: Request, res: Response) => {
  try {
    const haseef = await prisma.haseef.findUnique({
      where: { id: req.params.id },
      include: {
        connections: {
          include: {
            extension: true,
          },
        },
      },
    });

    if (!haseef) {
      res.status(404).json({ error: 'Haseef not found' });
      return;
    }

    res.json({
      haseef: {
        id: haseef.id,
        name: haseef.name,
        description: haseef.description,
        haseefId: haseef.id,
        displayName: haseef.name,
        extensions: haseef.connections.map((c: any) => {
          const manifest = c.extension.manifest as ExtensionManifest | null;
          return {
            extensionId: c.extension.id,
            extensionName: c.extension.name,
            enabled: c.enabled,
            config: c.config,
            tools: manifest?.tools ?? [],
          };
        }),
        createdAt: haseef.createdAt,
      },
    });
  } catch (error) {
    console.error('Get haseef error:', error);
    res.status(500).json({ error: 'Failed to get haseef' });
  }
});

// POST /haseefs/:id/extensions/:extId/connect — Connect extension to Haseef
haseefsRouter.post('/:id/extensions/:extId/connect', requireSecretKey(), async (req: Request, res: Response) => {
  try {
    const haseefId = req.params.id;
    const extensionId = req.params.extId;
    const { config } = req.body ?? {};

    // Verify haseef exists
    const haseef = await prisma.haseef.findUnique({ where: { id: haseefId } });
    if (!haseef) {
      res.status(404).json({ error: 'Haseef not found' });
      return;
    }

    // Verify extension exists
    const extension = await prisma.extension.findUnique({ where: { id: extensionId } });
    if (!extension) {
      res.status(404).json({ error: 'Extension not found' });
      return;
    }

    const connection = await connectExtension(haseefId, extensionId, config);

    res.json({ success: true, connectionId: connection.id });
  } catch (error) {
    console.error('Connect extension error:', error);
    res.status(500).json({ error: 'Failed to connect extension' });
  }
});

// DELETE /haseefs/:id/extensions/:extId/disconnect — Disconnect extension from Haseef
haseefsRouter.delete('/:id/extensions/:extId/disconnect', requireSecretKey(), async (req: Request, res: Response) => {
  try {
    const haseefId = req.params.id;
    const extensionId = req.params.extId;

    await disconnectExtension(haseefId, extensionId);

    res.json({ success: true });
  } catch (error) {
    console.error('Disconnect extension error:', error);
    res.status(500).json({ error: 'Failed to disconnect extension' });
  }
});

// PATCH /haseefs/:id/extensions/:extId — Update extension config for this Haseef
haseefsRouter.patch('/:id/extensions/:extId', requireSecretKey(), async (req: Request, res: Response) => {
  try {
    const haseefId = req.params.id;
    const extensionId = req.params.extId;
    const { config } = req.body;

    if (!config || typeof config !== 'object') {
      res.status(400).json({ error: 'config object is required' });
      return;
    }

    const connection = await updateExtensionConfig(haseefId, extensionId, config);

    res.json({ success: true, connectionId: connection.id, config: connection.config });
  } catch (error) {
    console.error('Update extension config error:', error);
    res.status(500).json({ error: 'Failed to update extension config' });
  }
});

// GET /haseefs/:id/extensions — List connected extensions for a Haseef
haseefsRouter.get('/:id/extensions', requireSecretKey(), async (req: Request, res: Response) => {
  try {
    const haseefId = req.params.id;

    const haseef = await prisma.haseef.findUnique({ where: { id: haseefId } });
    if (!haseef) {
      res.status(404).json({ error: 'Haseef not found' });
      return;
    }

    const connections = await getConnectedExtensions(haseefId);

    res.json({
      extensions: connections.map((c: any) => {
        const manifest = c.extension.manifest as ExtensionManifest | null;
        return {
          extensionId: c.extension.id,
          extensionName: c.extension.name,
          extensionUrl: c.extension.url,
          enabled: c.enabled,
          config: c.config,
          connectedAt: c.connectedAt,
          tools: manifest?.tools?.map((t: any) => ({
            name: t.name,
            description: t.description,
          })) ?? [],
          instructions: c.extension.instructions,
        };
      }),
    });
  } catch (error) {
    console.error('List connected extensions error:', error);
    res.status(500).json({ error: 'Failed to list extensions' });
  }
});
