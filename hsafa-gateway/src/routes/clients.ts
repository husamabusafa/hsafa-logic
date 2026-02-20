import { Router, Request, Response } from 'express';
import { prisma } from '../lib/db.js';
import { requireAuth, requireSecretKey } from '../middleware/auth.js';

export const clientsRouter = Router();

// POST /api/clients/register — Register a client connection
clientsRouter.post('/register', requireAuth(), async (req: Request, res: Response) => {
  try {
    const { clientKey, clientType, displayName, capabilities } = req.body;

    if (!clientKey) {
      res.status(400).json({ error: 'clientKey is required' });
      return;
    }

    // For public_key_jwt auth, force entityId from JWT (anti-impersonation)
    let entityId = req.body.entityId;
    if (req.auth?.method === 'public_key_jwt') {
      entityId = req.auth.entityId;
    }

    if (!entityId) {
      res.status(400).json({ error: 'entityId is required' });
      return;
    }

    const client = await prisma.client.upsert({
      where: { clientKey },
      update: {
        lastSeenAt: new Date(),
        clientType: clientType ?? undefined,
        displayName: displayName ?? undefined,
        capabilities: capabilities ?? undefined,
      },
      create: {
        entityId,
        clientKey,
        clientType,
        displayName,
        capabilities: capabilities ?? {},
      },
    });

    res.status(201).json(client);
  } catch (error) {
    console.error('Register client error:', error);
    res.status(500).json({ error: 'Failed to register client' });
  }
});

// GET /api/clients — List clients (admin only)
clientsRouter.get('/', requireSecretKey(), async (_req: Request, res: Response) => {
  try {
    const clients = await prisma.client.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json(clients);
  } catch (error) {
    console.error('List clients error:', error);
    res.status(500).json({ error: 'Failed to list clients' });
  }
});

// DELETE /api/clients/:clientId — Delete client (admin only)
clientsRouter.delete('/:clientId', requireSecretKey(), async (req: Request, res: Response) => {
  try {
    await prisma.client.delete({ where: { id: req.params.clientId } });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete client error:', error);
    res.status(500).json({ error: 'Failed to delete client' });
  }
});
