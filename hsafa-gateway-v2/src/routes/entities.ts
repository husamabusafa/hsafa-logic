import { Router, Request, Response } from 'express';
import { prisma } from '../lib/db.js';
import { requireSecretKey } from '../middleware/auth.js';

export const entitiesRouter = Router();

// POST /api/entities — Create human entity
entitiesRouter.post('/', requireSecretKey(), async (req: Request, res: Response) => {
  try {
    const { externalId, displayName, metadata } = req.body;

    if (!externalId) {
      res.status(400).json({ error: 'externalId is required' });
      return;
    }

    const existing = await prisma.entity.findUnique({ where: { externalId } });
    if (existing) {
      res.status(409).json({ error: 'Entity with this externalId already exists', entity: existing });
      return;
    }

    const entity = await prisma.entity.create({
      data: {
        type: 'human',
        externalId,
        displayName,
        metadata: metadata ?? undefined,
      },
    });

    res.status(201).json({ entity });
  } catch (error) {
    console.error('Create entity error:', error);
    res.status(500).json({ error: 'Failed to create entity' });
  }
});

// GET /api/entities — List entities
entitiesRouter.get('/', requireSecretKey(), async (req: Request, res: Response) => {
  try {
    const { type } = req.query;
    const where: Record<string, unknown> = {};
    if (type === 'human' || type === 'agent') {
      where.type = type;
    }

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

// GET /api/entities/:entityId — Get entity
entitiesRouter.get('/:entityId', requireSecretKey(), async (req: Request, res: Response) => {
  try {
    const entity = await prisma.entity.findUnique({
      where: { id: req.params.entityId },
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

// PATCH /api/entities/:entityId — Update entity
entitiesRouter.patch('/:entityId', requireSecretKey(), async (req: Request, res: Response) => {
  try {
    const { displayName, metadata } = req.body;
    const data: Record<string, unknown> = {};
    if (displayName !== undefined) data.displayName = displayName;
    if (metadata !== undefined) data.metadata = metadata;

    const entity = await prisma.entity.update({
      where: { id: req.params.entityId },
      data,
    });

    res.json({ entity });
  } catch (error) {
    console.error('Update entity error:', error);
    res.status(500).json({ error: 'Failed to update entity' });
  }
});

// POST /api/entities/agent — Create agent entity (for an existing agent)
entitiesRouter.post('/agent', requireSecretKey(), async (req: Request, res: Response) => {
  try {
    const { agentId, externalId, displayName, metadata } = req.body;

    if (!agentId) {
      res.status(400).json({ error: 'agentId is required' });
      return;
    }

    // Verify the agent exists
    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    // Check if an entity already exists for this agent
    const existing = await prisma.entity.findUnique({ where: { agentId } });
    if (existing) {
      res.json({ entity: existing });
      return;
    }

    const entity = await prisma.entity.create({
      data: {
        type: 'agent',
        externalId: externalId ?? `agent:${agent.name}`,
        displayName: displayName ?? agent.name,
        agentId,
        metadata: metadata ?? undefined,
      },
    });

    res.status(201).json({ entity });
  } catch (error) {
    console.error('Create agent entity error:', error);
    res.status(500).json({ error: 'Failed to create agent entity' });
  }
});

// DELETE /api/entities/:entityId — Delete entity
entitiesRouter.delete('/:entityId', requireSecretKey(), async (req: Request, res: Response) => {
  try {
    await prisma.entity.delete({ where: { id: req.params.entityId } });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete entity error:', error);
    res.status(500).json({ error: 'Failed to delete entity' });
  }
});
