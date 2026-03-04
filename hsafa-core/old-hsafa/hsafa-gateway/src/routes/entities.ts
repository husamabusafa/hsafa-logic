import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { requireSecretKey } from '../middleware/auth.js';

export const entitiesRouter = Router();

// POST /api/entities — Create a human entity
entitiesRouter.post('/', requireSecretKey(), async (req, res) => {
  try {
    const { externalId, displayName, metadata } = req.body;

    const entity = await prisma.entity.create({
      data: {
        type: 'human',
        externalId: externalId ?? undefined,
        displayName: displayName ?? undefined,
        metadata: metadata ?? undefined,
      },
    });

    res.status(201).json({ entity });
  } catch (error) {
    console.error('Create entity error:', error);
    res.status(500).json({ error: 'Failed to create entity' });
  }
});

// POST /api/entities/agent — Create an agent entity (linked to an Agent record)
entitiesRouter.post('/agent', requireSecretKey(), async (req, res) => {
  try {
    const { agentId, displayName, metadata } = req.body;

    if (!agentId) {
      res.status(400).json({ error: 'agentId is required' });
      return;
    }

    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    const entity = await prisma.entity.create({
      data: {
        type: 'agent',
        agentId,
        displayName: displayName ?? agent.name,
        metadata: metadata ?? undefined,
      },
    });

    res.status(201).json({ entity });
  } catch (error) {
    console.error('Create agent entity error:', error);
    res.status(500).json({ error: 'Failed to create agent entity' });
  }
});

// GET /api/entities — List entities
entitiesRouter.get('/', requireSecretKey(), async (req, res) => {
  try {
    const { type } = req.query;
    const where: Record<string, unknown> = {};
    if (type === 'human' || type === 'agent') where.type = type;

    const entities = await prisma.entity.findMany({ where, orderBy: { createdAt: 'desc' } });
    res.json({ entities });
  } catch (error) {
    console.error('List entities error:', error);
    res.status(500).json({ error: 'Failed to list entities' });
  }
});

// GET /api/entities/:id — Get entity
entitiesRouter.get('/:id', requireSecretKey(), async (req, res) => {
  try {
    const entity = await prisma.entity.findUnique({ where: { id: req.params.id } });
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

// PATCH /api/entities/:id — Update entity
entitiesRouter.patch('/:id', requireSecretKey(), async (req, res) => {
  try {
    const { displayName, metadata } = req.body;
    const entity = await prisma.entity.update({
      where: { id: req.params.id },
      data: {
        ...(displayName !== undefined && { displayName }),
        ...(metadata !== undefined && { metadata }),
      },
    });
    res.json({ entity });
  } catch (error) {
    console.error('Update entity error:', error);
    res.status(500).json({ error: 'Failed to update entity' });
  }
});

// DELETE /api/entities/:id — Delete entity
entitiesRouter.delete('/:id', requireSecretKey(), async (req, res) => {
  try {
    await prisma.entity.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete entity error:', error);
    res.status(500).json({ error: 'Failed to delete entity' });
  }
});
