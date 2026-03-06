import { Router, type Request, type Response } from 'express';
import { prisma } from '../lib/db.js';
import { requireSecretKey, requireExtensionKey } from '../middleware/auth.js';
import {
  registerExtension,
  installExtension,
  updateExtension,
  refreshManifest,
} from '../lib/extension-manager.js';

// =============================================================================
// Extension Routes (v4 — Manifest + Webhook)
//
// Admin routes for managing extensions + self-discovery for extensions.
//
// GET    /api/extensions/me                     — Self-discovery (extension key)
// POST   /api/extensions/install                — One-step install from URL (secret key)
// POST   /api/extensions                        — Register extension manually (secret key)
// GET    /api/extensions                        — List all extensions (secret key)
// GET    /api/extensions/:extId                 — Get extension details (secret key)
// PATCH  /api/extensions/:extId                 — Update extension metadata (secret key)
// POST   /api/extensions/:extId/refresh-manifest — Refresh manifest from URL (secret key)
// DELETE /api/extensions/:extId                 — Delete extension (secret key)
// =============================================================================

export const extensionsRouter = Router();

// GET /api/extensions/me — Self-discovery (extension key auth)
// Extensions call this on startup to discover their identity and connected haseefs.
extensionsRouter.get('/me', requireExtensionKey(), async (req: Request, res: Response) => {
  try {
    const extensionId = req.auth?.extensionId;
    if (!extensionId) {
      res.status(401).json({ error: 'No extension resolved' });
      return;
    }

    const extension = await prisma.extension.findUnique({
      where: { id: extensionId },
      include: {
        connections: {
          where: { enabled: true },
          include: {
            haseef: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!extension) {
      res.status(404).json({ error: 'Extension not found' });
      return;
    }

    res.json({
      extension: {
        id: extension.id,
        name: extension.name,
        description: extension.description,
        url: (extension as any).url,
        instructions: extension.instructions,
        manifest: (extension as any).manifest,
        connections: extension.connections.map((c: any) => ({
          connectionId: c.id,
          haseefId: c.haseef.id,
          haseefName: c.haseef.name,
          config: c.config,
          connectedAt: c.connectedAt,
        })),
      },
    });
  } catch (error) {
    console.error('Extension self-discovery error:', error);
    res.status(500).json({ error: 'Failed to get extension info' });
  }
});

// POST /api/extensions/install — One-step install from URL (§1.1)
// Only needs { url }. Fetches manifest, derives name/description/tools, registers.
extensionsRouter.post('/install', requireSecretKey(), async (req: Request, res: Response) => {
  try {
    const { url } = req.body;

    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'url is required' });
      return;
    }

    const result = await installExtension(url);

    res.status(201).json({
      extension: result.extension,
      extensionKey: result.extensionKey,
      manifest: result.manifest,
    });
  } catch (error) {
    console.error('Install extension error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to install extension';
    const status = msg.includes('already exists') ? 409 : 500;
    res.status(status).json({ error: msg });
  }
});

// POST /api/extensions — Register extension manually
// Accepts { name, url?, description?, instructions? }
// If url is provided, fetches manifest from GET {url}/manifest
extensionsRouter.post('/', requireSecretKey(), async (req: Request, res: Response) => {
  try {
    const { name, url, description, instructions } = req.body;

    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    // Check for duplicate name
    const existing = await prisma.extension.findUnique({ where: { name } });
    if (existing) {
      res.status(409).json({ error: `Extension "${name}" already exists` });
      return;
    }

    const result = await registerExtension({ name, url, description, instructions });

    res.status(201).json({
      extension: result.extension,
      extensionKey: result.extensionKey,
    });
  } catch (error) {
    console.error('Register extension error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to register extension';
    res.status(500).json({ error: msg });
  }
});

// GET /api/extensions — List all extensions
extensionsRouter.get('/', requireSecretKey(), async (_req: Request, res: Response) => {
  try {
    const extensions = await prisma.extension.findMany({
      include: {
        _count: { select: { connections: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ extensions });
  } catch (error) {
    console.error('List extensions error:', error);
    res.status(500).json({ error: 'Failed to list extensions' });
  }
});

// GET /api/extensions/:extId — Get extension details
extensionsRouter.get('/:extId', requireSecretKey(), async (req: Request, res: Response) => {
  try {
    const extension = await prisma.extension.findUnique({
      where: { id: req.params.extId },
      include: {
        connections: {
          include: {
            haseef: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!extension) {
      res.status(404).json({ error: 'Extension not found' });
      return;
    }

    res.json({ extension });
  } catch (error) {
    console.error('Get extension error:', error);
    res.status(500).json({ error: 'Failed to get extension' });
  }
});

// PATCH /api/extensions/:extId — Update extension metadata
extensionsRouter.patch('/:extId', requireSecretKey(), async (req: Request, res: Response) => {
  try {
    const { description, instructions, url } = req.body;

    const extension = await prisma.extension.findUnique({
      where: { id: req.params.extId },
    });

    if (!extension) {
      res.status(404).json({ error: 'Extension not found' });
      return;
    }

    const updated = await updateExtension(req.params.extId, { description, instructions, url });

    res.json({ extension: updated });
  } catch (error) {
    console.error('Update extension error:', error);
    res.status(500).json({ error: 'Failed to update extension' });
  }
});

// POST /api/extensions/:extId/refresh-manifest — Re-fetch manifest from extension URL
extensionsRouter.post('/:extId/refresh-manifest', requireSecretKey(), async (req: Request, res: Response) => {
  try {
    const manifest = await refreshManifest(req.params.extId);
    res.json({ manifest });
  } catch (error) {
    console.error('Refresh manifest error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to refresh manifest';
    res.status(500).json({ error: msg });
  }
});

// DELETE /api/extensions/:extId — Delete extension (cascades connections)
extensionsRouter.delete('/:extId', requireSecretKey(), async (req: Request, res: Response) => {
  try {
    const extension = await prisma.extension.findUnique({
      where: { id: req.params.extId },
    });

    if (!extension) {
      res.status(404).json({ error: 'Extension not found' });
      return;
    }

    await prisma.extension.delete({ where: { id: req.params.extId } });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete extension error:', error);
    res.status(500).json({ error: 'Failed to delete extension' });
  }
});
