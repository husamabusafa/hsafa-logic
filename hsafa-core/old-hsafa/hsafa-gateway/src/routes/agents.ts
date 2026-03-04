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

    const agent = await prisma.agent.create({
      data: { name, description, configJson },
    });

    // Auto-create an entity for the agent
    const entity = await prisma.entity.create({
      data: {
        type: 'agent',
        agentId: agent.id,
        displayName: name,
      },
    });

    // Start agent process
    await startProcess(agent.id, entity.id, name);

    res.status(201).json({ agent, entityId: entity.id });
  } catch (error) {
    console.error('Create agent error:', error);
    res.status(500).json({ error: 'Failed to create agent' });
  }
});

// GET /api/agents — List agents
agentsRouter.get('/', requireSecretKey(), async (req, res) => {
  try {
    const agents = await prisma.agent.findMany({
      include: { entity: { select: { id: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ agents });
  } catch (error) {
    console.error('List agents error:', error);
    res.status(500).json({ error: 'Failed to list agents' });
  }
});

// GET /api/agents/:id — Get agent
agentsRouter.get('/:id', requireSecretKey(), async (req, res) => {
  try {
    const agent = await prisma.agent.findUnique({
      where: { id: req.params.id },
      include: { entity: { select: { id: true } } },
    });
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    res.json({ agent });
  } catch (error) {
    console.error('Get agent error:', error);
    res.status(500).json({ error: 'Failed to get agent' });
  }
});

// PATCH /api/agents/:id — Update agent
agentsRouter.patch('/:id', requireSecretKey(), async (req, res) => {
  try {
    const { name, description, configJson } = req.body;
    const agent = await prisma.agent.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(configJson !== undefined && { configJson }),
      },
    });
    res.json({ agent });
  } catch (error) {
    console.error('Update agent error:', error);
    res.status(500).json({ error: 'Failed to update agent' });
  }
});

// DELETE /api/agents/:id — Delete agent
agentsRouter.delete('/:id', requireSecretKey(), async (req, res) => {
  try {
    const agent = await prisma.agent.findUnique({
      where: { id: req.params.id },
      include: { entity: { select: { id: true } } },
    });

    if (agent?.entity) {
      await stopProcess(agent.entity.id);
    }

    await prisma.agent.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete agent error:', error);
    res.status(500).json({ error: 'Failed to delete agent' });
  }
});

// POST /api/agents/:agentId/trigger — Service trigger (external systems)
agentsRouter.post('/:agentId/trigger', requireSecretKey(), async (req, res) => {
  try {
    const { agentId } = req.params;
    const { serviceName, payload } = req.body;

    if (!serviceName) {
      res.status(400).json({ error: 'serviceName is required' });
      return;
    }

    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      include: { entity: { select: { id: true } } },
    });

    if (!agent || !agent.entity) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    await pushServiceEvent(agent.entity.id, {
      serviceName,
      payload: payload ?? {},
    });

    res.json({ success: true, agentEntityId: agent.entity.id });
  } catch (error) {
    console.error('Trigger agent error:', error);
    res.status(500).json({ error: 'Failed to trigger agent' });
  }
});
