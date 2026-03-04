import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { requireSecretKey } from '../middleware/auth.js';
import { pushServiceEvent } from '../lib/inbox.js';
import { startProcess, stopProcess } from '../lib/process-manager.js';

export const agentsRouter = Router();

// POST /api/agents — Create agent
agentsRouter.post('/', requireSecretKey(), async (req, res) => {
  try {
    const { name, description, configJson } = req.body;

    if (!name || !configJson) {
      res.status(400).json({ error: 'name and configJson are required' });
      return;
    }

    const haseef = await prisma.haseef.create({
      data: { name, description, configJson },
    });

    // Start Haseef process
    await startProcess(haseef.id, name);

    res.status(201).json({ haseef, haseefId: haseef.id });
  } catch (error) {
    console.error('Create haseef error:', error);
    res.status(500).json({ error: 'Failed to create haseef' });
  }
});

// GET /api/agents — List agents
agentsRouter.get('/', requireSecretKey(), async (req, res) => {
  try {
    const haseefs = await prisma.haseef.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json({ haseefs });
  } catch (error) {
    console.error('List agents error:', error);
    res.status(500).json({ error: 'Failed to list agents' });
  }
});

// GET /api/agents/:id — Get agent
agentsRouter.get('/:id', requireSecretKey(), async (req, res) => {
  try {
    const haseef = await prisma.haseef.findUnique({
      where: { id: req.params.id },
    });
    if (!haseef) {
      res.status(404).json({ error: 'Haseef not found' });
      return;
    }
    res.json({ haseef });
  } catch (error) {
    console.error('Get agent error:', error);
    res.status(500).json({ error: 'Failed to get agent' });
  }
});

// PATCH /api/agents/:id — Update agent
agentsRouter.patch('/:id', requireSecretKey(), async (req, res) => {
  try {
    const { name, description, configJson } = req.body;
    const haseef = await prisma.haseef.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(configJson !== undefined && { configJson }),
      },
    });
    res.json({ haseef });
  } catch (error) {
    console.error('Update agent error:', error);
    res.status(500).json({ error: 'Failed to update agent' });
  }
});

// DELETE /api/agents/:id — Delete agent
agentsRouter.delete('/:id', requireSecretKey(), async (req, res) => {
  try {
    const haseef = await prisma.haseef.findUnique({
      where: { id: req.params.id },
    });

    if (haseef) {
      await stopProcess(haseef.id);
    }

    await prisma.haseef.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete agent error:', error);
    res.status(500).json({ error: 'Failed to delete agent' });
  }
});

// POST /api/agents/:haseefId/trigger — Service trigger (external systems)
agentsRouter.post('/:haseefId/trigger', requireSecretKey(), async (req, res) => {
  try {
    const { haseefId } = req.params;
    const { serviceName, payload } = req.body;

    if (!serviceName) {
      res.status(400).json({ error: 'serviceName is required' });
      return;
    }

    const haseef = await prisma.haseef.findUnique({
      where: { id: haseefId },
    });

    if (!haseef) {
      res.status(404).json({ error: 'Haseef not found' });
      return;
    }

    await pushServiceEvent(haseefId, {
      serviceName,
      payload: payload ?? {},
    });

    res.json({ success: true, haseefId });
  } catch (error) {
    console.error('Trigger agent error:', error);
    res.status(500).json({ error: 'Failed to trigger agent' });
  }
});
