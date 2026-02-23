import { Router, Request, Response } from 'express';
import { prisma } from '../lib/db.js';
import { requireSecretKey, requireAuth } from '../middleware/auth.js';

export const clientsRouter = Router();

// POST /api/clients — Register a client
clientsRouter.post('/', requireAuth(), async (req: Request, res: Response) => {
  try {
    let { entityId, clientKey, clientType, displayName, capabilities } = req.body;

    // Anti-impersonation: force entityId from JWT for public_key_jwt auth
    if (req.auth?.method === 'public_key_jwt') {
      entityId = req.auth.entityId;
    }

    if (!entityId || !clientKey) {
      res.status(400).json({ error: 'entityId and clientKey are required' });
      return;
    }

    const client = await prisma.client.upsert({
      where: { clientKey },
      create: {
        entityId,
        clientKey,
        clientType: clientType ?? undefined,
        displayName: displayName ?? undefined,
        capabilities: capabilities ?? {},
        lastSeenAt: new Date(),
      },
      update: {
        lastSeenAt: new Date(),
        ...(clientType !== undefined && { clientType }),
        ...(displayName !== undefined && { displayName }),
        ...(capabilities !== undefined && { capabilities }),
      },
    });

    res.status(201).json({ client });
  } catch (error) {
    console.error('Register client error:', error);
    res.status(500).json({ error: 'Failed to register client' });
  }
});

// GET /api/clients — List clients
clientsRouter.get('/', requireSecretKey(), async (req: Request, res: Response) => {
  try {
    const entityId = req.query.entityId as string | undefined;
    const where: Record<string, unknown> = {};
    if (entityId) where.entityId = entityId;

    const clients = await prisma.client.findMany({
      where,
      orderBy: { lastSeenAt: 'desc' },
    });

    res.json({ clients });
  } catch (error) {
    console.error('List clients error:', error);
    res.status(500).json({ error: 'Failed to list clients' });
  }
});

// DELETE /api/clients/:id — Delete client
clientsRouter.delete('/:id', requireSecretKey(), async (req: Request, res: Response) => {
  try {
    await prisma.client.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete client error:', error);
    res.status(500).json({ error: 'Failed to delete client' });
  }
});
