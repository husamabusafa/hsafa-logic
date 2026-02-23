import { Router, Request, Response } from 'express';
import { prisma } from '../lib/db.js';
import { requireSecretKey } from '../middleware/auth.js';
import { createAndExecuteRun } from '../lib/agent-trigger.js';

export const agentsRouter = Router();

// POST /api/agents — Create agent + entity
agentsRouter.post('/', requireSecretKey(), async (req: Request, res: Response) => {
  try {
    const { name, description, configJson } = req.body;

    if (!name || !configJson) {
      res.status(400).json({ error: 'name and configJson are required' });
      return;
    }

    const existing = await prisma.agent.findUnique({ where: { name } });
    if (existing) {
      res.status(409).json({ error: `Agent "${name}" already exists` });
      return;
    }

    const agent = await prisma.$transaction(async (tx) => {
      const a = await tx.agent.create({
        data: { name, description, configJson },
      });

      await tx.entity.create({
        data: {
          type: 'agent',
          externalId: `agent:${name}`,
          displayName: name,
          agentId: a.id,
        },
      });

      return a;
    });

    const entity = await prisma.entity.findUnique({
      where: { agentId: agent.id },
      select: { id: true },
    });

    res.status(201).json({ agent: { ...agent, entityId: entity?.id } });
  } catch (error) {
    console.error('Create agent error:', error);
    res.status(500).json({ error: 'Failed to create agent' });
  }
});

// GET /api/agents — List agents
agentsRouter.get('/', requireSecretKey(), async (_req: Request, res: Response) => {
  try {
    const agents = await prisma.agent.findMany({
      orderBy: { createdAt: 'desc' },
      include: { entity: { select: { id: true, displayName: true } } },
    });
    res.json({ agents });
  } catch (error) {
    console.error('List agents error:', error);
    res.status(500).json({ error: 'Failed to list agents' });
  }
});

// GET /api/agents/:agentId — Get agent
agentsRouter.get('/:agentId', requireSecretKey(), async (req: Request, res: Response) => {
  try {
    const agent = await prisma.agent.findUnique({
      where: { id: req.params.agentId },
      include: { entity: { select: { id: true, displayName: true } } },
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

// PATCH /api/agents/:agentId — Update agent config
agentsRouter.patch('/:agentId', requireSecretKey(), async (req: Request, res: Response) => {
  try {
    const { description, configJson } = req.body;
    const data: Record<string, unknown> = {};
    if (description !== undefined) data.description = description;
    if (configJson !== undefined) data.configJson = configJson;

    const agent = await prisma.agent.update({
      where: { id: req.params.agentId },
      data,
    });

    res.json({ agent });
  } catch (error) {
    console.error('Update agent error:', error);
    res.status(500).json({ error: 'Failed to update agent' });
  }
});

// DELETE /api/agents/:agentId — Delete agent + entity
agentsRouter.delete('/:agentId', requireSecretKey(), async (req: Request, res: Response) => {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.entity.deleteMany({ where: { agentId: req.params.agentId } });
      await tx.agent.delete({ where: { id: req.params.agentId } });
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete agent error:', error);
    res.status(500).json({ error: 'Failed to delete agent' });
  }
});

// POST /api/agents/:agentId/trigger — Service trigger (external systems)
agentsRouter.post('/:agentId/trigger', requireSecretKey(), async (req: Request, res: Response) => {
  try {
    const { serviceName, payload } = req.body;

    if (!serviceName) {
      res.status(400).json({ error: 'serviceName is required' });
      return;
    }

    const agent = await prisma.agent.findUnique({
      where: { id: req.params.agentId },
      include: { entity: { select: { id: true } } },
    });

    if (!agent || !agent.entity) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    const runId = await createAndExecuteRun({
      agentEntityId: agent.entity.id,
      agentId: agent.id,
      triggerType: 'service',
      triggerServiceName: serviceName,
      triggerPayload: payload ?? undefined,
      // No activeSpaceId — agent must call enter_space first
    });

    res.status(201).json({
      runId,
      agentEntityId: agent.entity.id,
      status: 'queued',
    });
  } catch (error) {
    console.error('Trigger agent error:', error);
    res.status(500).json({ error: 'Failed to trigger agent' });
  }
});
