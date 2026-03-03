import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../lib/db.js';
import { requireSecretKey, requireAuth } from '../middleware/auth.js';

export const entitiesRouter = Router();

// =============================================================================
// Entity Routes (Read-Only in Spaces App)
//
// Entities are created/managed by Core. Spaces App reads them from the shared
// DB so that clients can resolve entity info (display names, types, etc.).
//
// The only write operation is creating human entities — this is needed because
// the Spaces App's client registration flow may need to create a human entity
// before Core knows about it. Core will see it via the shared DB.
// =============================================================================

// POST /api/entities — Create a human entity
entitiesRouter.post('/', requireSecretKey(), async (req: Request, res: Response) => {
  try {
    const { type, externalId, displayName, metadata } = req.body;

    if (type !== 'human') {
      res.status(400).json({ error: 'Spaces App can only create human entities' });
      return;
    }

    // Upsert by externalId if provided
    if (externalId) {
      const existing = await prisma.entity.findUnique({ where: { externalId } });
      if (existing) {
        const updated = await prisma.entity.update({
          where: { externalId },
          data: {
            ...(displayName !== undefined && { displayName }),
            ...(metadata !== undefined && { metadata }),
          },
        });
        res.json({ entity: updated });
        return;
      }
    }

    const entity = await prisma.entity.create({
      data: {
        id: crypto.randomUUID(),
        type: 'human',
        externalId: externalId ?? undefined,
        displayName: displayName ?? undefined,
        metadata: metadata ?? undefined,
      },
    });

    // Auto-create a space with each agent entity
    const agents = await prisma.entity.findMany({ where: { type: 'agent' } });
    const spaces = [];
    for (const agent of agents) {
      const humanName = entity.displayName ?? 'User';
      const agentName = agent.displayName ?? 'Agent';
      const space = await prisma.smartSpace.create({
        data: {
          name: `${humanName} & ${agentName}`,
          description: `Personal space between ${humanName} and ${agentName}`,
          memberships: {
            create: [
              { entityId: entity.id, role: 'owner' },
              { entityId: agent.id, role: 'assistant' },
            ],
          },
        },
      });
      spaces.push({ id: space.id, name: space.name, agentId: agent.id });
      console.log(`[entities] Auto-created space "${space.name}" (${space.id}) for ${humanName} + ${agentName}`);
    }

    res.status(201).json({ entity, spaces });
  } catch (error) {
    console.error('Create entity error:', error);
    res.status(500).json({ error: 'Failed to create entity' });
  }
});

// GET /api/entities — List entities
entitiesRouter.get('/', requireAuth(), async (req: Request, res: Response) => {
  try {
    const type = req.query.type as string | undefined;
    const where: Record<string, unknown> = {};
    if (type) where.type = type;

    const entities = await prisma.entity.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    res.json({ entities });
  } catch (error) {
    console.error('List entities error:', error);
    res.status(500).json({ error: 'Failed to list entities' });
  }
});

// GET /api/entities/:id — Get entity
entitiesRouter.get('/:id', requireAuth(), async (req: Request, res: Response) => {
  try {
    const entity = await prisma.entity.findUnique({
      where: { id: req.params.id },
    });
    if (!entity) {
      res.status(404).json({ error: 'Entity not found' });
      return;
    }
    res.json({ entity });
  } catch (error) {
    console.error('Get entity error:', error);
    res.status(500).json({ error: 'Failed to get entity' });
  }
});
