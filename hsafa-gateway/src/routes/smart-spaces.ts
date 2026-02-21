import { Router, Request, Response } from 'express';
import { prisma } from '../lib/db.js';
import { redis } from '../lib/redis.js';
import { requireAuth, requireSecretKey, requireMembership } from '../middleware/auth.js';
import { triggerAllAgents } from '../lib/agent-trigger.js';
import { createSmartSpaceMessage } from '../lib/smartspace-db.js';
import { emitSmartSpaceEvent } from '../lib/smartspace-events.js';

export const smartSpacesRouter = Router();

// =============================================================================
// Space CRUD (admin only)
// =============================================================================

// POST /api/smart-spaces — Create space
smartSpacesRouter.post('/', requireSecretKey(), async (req: Request, res: Response) => {
  try {
    const { name, description, metadata } = req.body;

    const space = await prisma.smartSpace.create({
      data: { name, description, metadata: metadata ?? undefined },
    });

    res.status(201).json({ smartSpace: space });
  } catch (error) {
    console.error('Create space error:', error);
    res.status(500).json({ error: 'Failed to create space' });
  }
});

// GET /api/smart-spaces — List spaces
smartSpacesRouter.get('/', requireAuth(), async (req: Request, res: Response) => {
  try {
    // For public_key_jwt, only return spaces the user is a member of
    if (req.auth?.method === 'public_key_jwt' && req.auth.entityId) {
      const memberships = await prisma.smartSpaceMembership.findMany({
        where: { entityId: req.auth.entityId },
        include: { smartSpace: true },
        orderBy: { joinedAt: 'desc' },
      });
      res.json({ smartSpaces: memberships.map((m) => m.smartSpace) });
      return;
    }

    // Secret key: return all
    const spaces = await prisma.smartSpace.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json({ smartSpaces: spaces });
  } catch (error) {
    console.error('List spaces error:', error);
    res.status(500).json({ error: 'Failed to list spaces' });
  }
});

// GET /api/smart-spaces/:smartSpaceId — Get space
smartSpacesRouter.get('/:smartSpaceId', requireAuth(), requireMembership(), async (req: Request, res: Response) => {
  try {
    const space = await prisma.smartSpace.findUnique({
      where: { id: req.params.smartSpaceId },
    });

    if (!space) {
      res.status(404).json({ error: 'Space not found' });
      return;
    }

    res.json({ smartSpace: space });
  } catch (error) {
    console.error('Get space error:', error);
    res.status(500).json({ error: 'Failed to get space' });
  }
});

// PATCH /api/smart-spaces/:smartSpaceId — Update space
smartSpacesRouter.patch('/:smartSpaceId', requireSecretKey(), async (req: Request, res: Response) => {
  try {
    const { name, description, metadata } = req.body;
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (metadata !== undefined) data.metadata = metadata;

    const space = await prisma.smartSpace.update({
      where: { id: req.params.smartSpaceId },
      data,
    });

    res.json({ smartSpace: space });
  } catch (error) {
    console.error('Update space error:', error);
    res.status(500).json({ error: 'Failed to update space' });
  }
});

// DELETE /api/smart-spaces/:smartSpaceId — Delete space
smartSpacesRouter.delete('/:smartSpaceId', requireSecretKey(), async (req: Request, res: Response) => {
  try {
    await prisma.smartSpace.delete({ where: { id: req.params.smartSpaceId } });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete space error:', error);
    res.status(500).json({ error: 'Failed to delete space' });
  }
});

// =============================================================================
// Membership
// =============================================================================

// POST /api/smart-spaces/:smartSpaceId/members — Add member
smartSpacesRouter.post('/:smartSpaceId/members', requireSecretKey(), async (req: Request, res: Response) => {
  try {
    const { entityId, role } = req.body;

    if (!entityId) {
      res.status(400).json({ error: 'entityId is required' });
      return;
    }

    const membership = await prisma.smartSpaceMembership.upsert({
      where: {
        smartSpaceId_entityId: {
          smartSpaceId: req.params.smartSpaceId,
          entityId,
        },
      },
      update: { role: role ?? undefined },
      create: {
        smartSpaceId: req.params.smartSpaceId,
        entityId,
        role: role ?? undefined,
      },
    });

    res.status(201).json({ membership });
  } catch (error) {
    console.error('Add member error:', error);
    res.status(500).json({ error: 'Failed to add member' });
  }
});

// GET /api/smart-spaces/:smartSpaceId/members — List members
smartSpacesRouter.get('/:smartSpaceId/members', requireAuth(), requireMembership(), async (req: Request, res: Response) => {
  try {
    const memberships = await prisma.smartSpaceMembership.findMany({
      where: { smartSpaceId: req.params.smartSpaceId },
      include: {
        entity: {
          select: { id: true, type: true, displayName: true, externalId: true },
        },
      },
    });

    res.json({ members: memberships });
  } catch (error) {
    console.error('List members error:', error);
    res.status(500).json({ error: 'Failed to list members' });
  }
});

// DELETE /api/smart-spaces/:smartSpaceId/members/:entityId — Remove member
smartSpacesRouter.delete('/:smartSpaceId/members/:entityId', requireSecretKey(), async (req: Request, res: Response) => {
  try {
    await prisma.smartSpaceMembership.delete({
      where: {
        smartSpaceId_entityId: {
          smartSpaceId: req.params.smartSpaceId,
          entityId: req.params.entityId,
        },
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// =============================================================================
// Messages
// =============================================================================

// POST /api/smart-spaces/:smartSpaceId/messages — Send a message
smartSpacesRouter.post('/:smartSpaceId/messages', requireAuth(), requireMembership(), async (req: Request, res: Response) => {
  try {
    const { content, metadata } = req.body;

    if (!content) {
      res.status(400).json({ error: 'content is required' });
      return;
    }

    // For public_key_jwt, force entityId from JWT (anti-impersonation)
    let entityId = req.body.entityId;
    if (req.auth?.method === 'public_key_jwt') {
      entityId = req.auth.entityId;
    }

    if (!entityId) {
      res.status(400).json({ error: 'entityId is required' });
      return;
    }

    // Get sender info
    const sender = await prisma.entity.findUnique({
      where: { id: entityId },
      select: { id: true, type: true, displayName: true },
    });

    if (!sender) {
      res.status(404).json({ error: 'Sender entity not found' });
      return;
    }

    const role = sender.type === 'agent' ? 'assistant' : 'user';

    const message = await createSmartSpaceMessage({
      smartSpaceId: req.params.smartSpaceId,
      entityId,
      role,
      content,
      metadata: metadata ?? undefined,
    });

    // Emit to space SSE stream
    await emitSmartSpaceEvent(req.params.smartSpaceId, {
      type: 'space.message',
      message: {
        id: message.id,
        smartSpaceId: message.smartSpaceId,
        entityId: message.entityId,
        role: message.role,
        content: message.content,
        metadata: message.metadata,
        seq: Number(message.seq),
        createdAt: message.createdAt.toISOString(),
      },
    });

    // v2: Trigger ALL other agent members in the space (sender excluded)
    // Fire-and-forget — do NOT await (run executes in background)
    triggerAllAgents({
      spaceId: req.params.smartSpaceId,
      senderEntityId: entityId,
      senderName: sender.displayName ?? entityId,
      senderType: sender.type as 'human' | 'agent',
      messageContent: content,
      messageId: message.id,
    }).catch((err: unknown) => {
      console.error('[smart-spaces] triggerAllAgents error:', err);
    });

    res.status(201).json({
      message: {
        id: message.id,
        smartSpaceId: message.smartSpaceId,
        entityId: message.entityId,
        role: message.role,
        content: message.content,
        metadata: message.metadata,
        seq: Number(message.seq),
        createdAt: message.createdAt.toISOString(),
      },
      runs: [],
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// GET /api/smart-spaces/:smartSpaceId/messages — List messages
smartSpacesRouter.get('/:smartSpaceId/messages', requireAuth(), requireMembership(), async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const before = req.query.before as string | undefined;
    const afterSeq = req.query.afterSeq as string | undefined;
    const beforeSeq = req.query.beforeSeq as string | undefined;

    const where: Record<string, unknown> = {
      smartSpaceId: req.params.smartSpaceId,
    };

    if (before) {
      where.createdAt = { lt: new Date(before) };
    }
    if (afterSeq) {
      where.seq = { ...(where.seq as object || {}), gt: BigInt(afterSeq) };
    }
    if (beforeSeq) {
      where.seq = { ...(where.seq as object || {}), lt: BigInt(beforeSeq) };
    }

    const messages = await prisma.smartSpaceMessage.findMany({
      where,
      orderBy: { seq: 'desc' },
      take: limit,
      include: {
        entity: {
          select: { id: true, type: true, displayName: true },
        },
      },
    });

    // Return in chronological order
    res.json({ messages: messages.reverse().map((m) => ({
      id: m.id,
      smartSpaceId: m.smartSpaceId,
      entityId: m.entityId,
      role: m.role,
      content: m.content,
      metadata: m.metadata,
      seq: Number(m.seq),
      createdAt: m.createdAt.toISOString(),
      entityType: m.entity?.type,
      entityName: m.entity?.displayName,
    })) });
  } catch (error) {
    console.error('List messages error:', error);
    res.status(500).json({ error: 'Failed to list messages' });
  }
});

// POST /api/smart-spaces/:smartSpaceId/read — Mark messages as read (for humans)
smartSpacesRouter.post('/:smartSpaceId/read', requireAuth(), requireMembership(), async (req: Request, res: Response) => {
  try {
    const entityId = req.auth?.entityId;
    const { lastMessageId } = req.body;

    if (!entityId || !lastMessageId) {
      res.status(400).json({ error: 'lastMessageId is required' });
      return;
    }

    await prisma.smartSpaceMembership.updateMany({
      where: {
        smartSpaceId: req.params.smartSpaceId,
        entityId,
      },
      data: { lastSeenMessageId: lastMessageId },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

// =============================================================================
// SSE Stream — Real-time events for a space
// =============================================================================

smartSpacesRouter.get('/:smartSpaceId/stream', requireAuth(), requireMembership(), async (req: Request, res: Response) => {
  try {
    const spaceId = req.params.smartSpaceId;

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Query active runs for this space so the client can restore state on reconnect
    const activeRuns = await prisma.run.findMany({
      where: {
        status: 'running',
        OR: [
          { triggerSpaceId: spaceId },
          { activeSpaceId: spaceId },
        ],
      },
      select: {
        id: true,
        agentEntityId: true,
        agentEntity: { select: { displayName: true } },
      },
    });

    const activeAgents = activeRuns.map((r) => ({
      runId: r.id,
      agentEntityId: r.agentEntityId,
      agentName: r.agentEntity?.displayName || '',
    }));

    // Send connected event with active state
    res.write(`data: ${JSON.stringify({ type: 'connected', activeAgents })}\n\n`);

    // Subscribe to Redis channel for this space
    const subscriber = redis.duplicate();
    await subscriber.subscribe(`smartspace:${spaceId}`);

    subscriber.on('message', (_channel: string, message: string) => {
      res.write(`data: ${message}\n\n`);
    });

    // Heartbeat to keep connection alive
    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 30000);

    // Cleanup on disconnect
    req.on('close', () => {
      clearInterval(heartbeat);
      subscriber.unsubscribe();
      subscriber.disconnect();
    });
  } catch (error) {
    console.error('SSE stream error:', error);
    res.status(500).json({ error: 'Failed to start stream' });
  }
});

// =============================================================================
// Space-scoped runs list
// =============================================================================

smartSpacesRouter.get('/:smartSpaceId/runs', requireAuth(), requireMembership(), async (req: Request, res: Response) => {
  try {
    const runs = await prisma.run.findMany({
      where: {
        OR: [
          { triggerSpaceId: req.params.smartSpaceId },
          { activeSpaceId: req.params.smartSpaceId },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        agentEntityId: true,
        status: true,
        triggerType: true,
        activeSpaceId: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
      },
    });

    res.json({ runs });
  } catch (error) {
    console.error('List space runs error:', error);
    res.status(500).json({ error: 'Failed to list runs' });
  }
});
