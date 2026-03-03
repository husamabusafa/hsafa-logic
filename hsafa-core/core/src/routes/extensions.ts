import { Router, type Request, type Response } from 'express';
import { prisma } from '../lib/db.js';
import { requireSecretKey, requireExtensionKey } from '../middleware/auth.js';
import {
  registerExtension,
  updateExtension,
  syncExtensionTools,
  type ExtensionToolDef,
} from '../lib/extension-manager.js';

// =============================================================================
// Extension Routes (v4)
//
// Admin routes for managing extensions + self-discovery for extensions.
//
// GET    /api/extensions/me           — Self-discovery (extension key)
// POST   /api/extensions              — Register a new extension (secret key)
// GET    /api/extensions              — List all extensions (secret key)
// GET    /api/extensions/:extId       — Get extension details (secret key)
// PATCH  /api/extensions/:extId       — Update extension metadata (secret key)
// PUT    /api/extensions/:extId/tools — Sync extension tools (secret key)
// DELETE /api/extensions/:extId       — Delete extension (secret key)
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
        tools: { select: { id: true, name: true, description: true } },
        connections: {
          where: { enabled: true },
          include: {
            haseef: {
              select: {
                id: true,
                name: true,
                entity: { select: { id: true, displayName: true } },
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
        instructions: extension.instructions,
        tools: extension.tools,
        connections: extension.connections.map((c: any) => ({
          connectionId: c.id,
          haseefId: c.haseef.id,
          haseefName: c.haseef.name,
          haseefEntityId: c.haseef.entity?.id,
          haseefDisplayName: c.haseef.entity?.displayName,
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

// POST /api/extensions — Register a new extension
extensionsRouter.post('/', requireSecretKey(), async (req: Request, res: Response) => {
  try {
    const { name, description, instructions } = req.body;

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

    const result = await registerExtension({ name, description, instructions });

    res.status(201).json({
      extension: {
        id: result.id,
        name,
        description: description ?? null,
        instructions: instructions ?? null,
        extensionKey: result.extensionKey,
      },
    });
  } catch (error) {
    console.error('Register extension error:', error);
    res.status(500).json({ error: 'Failed to register extension' });
  }
});

// GET /api/extensions — List all extensions
extensionsRouter.get('/', requireSecretKey(), async (_req: Request, res: Response) => {
  try {
    const extensions = await prisma.extension.findMany({
      include: {
        tools: { select: { id: true, name: true, description: true } },
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
        tools: true,
        connections: {
          include: {
            agent: { select: { id: true, name: true } },
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
    const { description, instructions } = req.body;

    const extension = await prisma.extension.findUnique({
      where: { id: req.params.extId },
    });

    if (!extension) {
      res.status(404).json({ error: 'Extension not found' });
      return;
    }

    await updateExtension(req.params.extId, { description, instructions });

    const updated = await prisma.extension.findUnique({
      where: { id: req.params.extId },
      include: { tools: true },
    });

    res.json({ extension: updated });
  } catch (error) {
    console.error('Update extension error:', error);
    res.status(500).json({ error: 'Failed to update extension' });
  }
});

// PUT /api/extensions/:extId/tools — Sync extension tools (full replace)
extensionsRouter.put('/:extId/tools', requireSecretKey(), async (req: Request, res: Response) => {
  try {
    const { tools } = req.body as { tools?: ExtensionToolDef[] };

    if (!tools || !Array.isArray(tools)) {
      res.status(400).json({ error: 'tools array is required' });
      return;
    }

    // Validate each tool
    for (const t of tools) {
      if (!t.name || !t.description) {
        res.status(400).json({ error: `Each tool must have name and description` });
        return;
      }
    }

    const extension = await prisma.extension.findUnique({
      where: { id: req.params.extId },
    });

    if (!extension) {
      res.status(404).json({ error: 'Extension not found' });
      return;
    }

    await syncExtensionTools(req.params.extId, tools);

    const updated = await prisma.extensionTool.findMany({
      where: { extensionId: req.params.extId },
    });

    res.json({ tools: updated });
  } catch (error) {
    console.error('Sync extension tools error:', error);
    res.status(500).json({ error: 'Failed to sync tools' });
  }
});

// DELETE /api/extensions/:extId — Delete extension (cascades tools + connections)
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
