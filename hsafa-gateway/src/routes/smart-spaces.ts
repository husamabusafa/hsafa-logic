import { Router, Request, Response } from 'express';
import { prisma } from '../lib/db.js';
import { redis } from '../lib/redis.js';
import { requireSecretKey, requireAuth, requireMembership } from '../middleware/auth.js';
import { createSmartSpaceMessage } from '../lib/smartspace-db.js';
import { emitSmartSpaceEvent } from '../lib/smartspace-events.js';
import { pushSpaceMessageEvent } from '../lib/inbox.js';
import Redis from 'ioredis';

export const smartSpacesRouter = Router();

// POST /api/smart-spaces — Create space
smartSpacesRouter.post('/', requireSecretKey(), async (req: Request, res: Response) => {
  try {
    const { name, description, metadata } = req.body;
    const smartSpace = await prisma.smartSpace.create({
      data: { name, description, metadata: metadata ?? undefined },
    });
    res.status(201).json({ smartSpace });
  } catch (error) {
    console.error('Create space error:', error);
    res.status(500).json({ error: 'Failed to create space' });
  }
});

// GET /api/smart-spaces — List spaces
smartSpacesRouter.get('/', requireAuth(), async (req: Request, res: Response) => {
  try {
    let smartSpaces;
    if (req.auth?.method === 'secret_key') {
      smartSpaces = await prisma.smartSpace.findMany({ orderBy: { createdAt: 'desc' } });
    } else {
      const entityId = req.auth?.entityId;
      if (!entityId) { res.status(403).json({ error: 'No entity' }); return; }
      const memberships = await prisma.smartSpaceMembership.findMany({
        where: { entityId },
        include: { smartSpace: true },
      });
      smartSpaces = memberships.map((m) => m.smartSpace);
    }
    res.json({ smartSpaces });
  } catch (error) {
    console.error('List spaces error:', error);
    res.status(500).json({ error: 'Failed to list spaces' });
  }
});

// GET /api/smart-spaces/:smartSpaceId — Get space
smartSpacesRouter.get('/:smartSpaceId', requireAuth(), requireMembership(), async (req: Request, res: Response) => {
  try {
    const smartSpace = await prisma.smartSpace.findUnique({
      where: { id: req.params.smartSpaceId },
    });
    if (!smartSpace) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ smartSpace });
  } catch (error) {
    console.error('Get space error:', error);
    res.status(500).json({ error: 'Failed to get space' });
  }
});

// PATCH /api/smart-spaces/:smartSpaceId — Update space
smartSpacesRouter.patch('/:smartSpaceId', requireSecretKey(), async (req: Request, res: Response) => {
  try {
    const { name, description, metadata } = req.body;
    const smartSpace = await prisma.smartSpace.update({
      where: { id: req.params.smartSpaceId },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(metadata !== undefined && { metadata }),
      },
    });
    res.json({ smartSpace });
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
// Members
// =============================================================================

// POST /api/smart-spaces/:smartSpaceId/members — Add member
smartSpacesRouter.post('/:smartSpaceId/members', requireSecretKey(), async (req: Request, res: Response) => {
  try {
    const { entityId, role } = req.body;
    const membership = await prisma.smartSpaceMembership.create({
      data: {
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
      include: { entity: { select: { id: true, type: true, displayName: true } } },
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

// POST /api/smart-spaces/:smartSpaceId/messages — Send message
smartSpacesRouter.post('/:smartSpaceId/messages', requireAuth(), requireMembership(), async (req: Request, res: Response) => {
  try {
    const { smartSpaceId } = req.params;
    let { entityId, content, metadata: msgMeta } = req.body;

    // Anti-impersonation: force entityId from JWT for public_key_jwt auth
    if (req.auth?.method === 'public_key_jwt') {
      entityId = req.auth.entityId;
    }

    if (!entityId || !content) {
      res.status(400).json({ error: 'entityId and content are required' });
      return;
    }

    // Persist the message
    const message = await createSmartSpaceMessage({
      smartSpaceId,
      entityId,
      role: 'user',
      content,
      metadata: msgMeta ?? undefined,
    });

    // Emit to space SSE
    await emitSmartSpaceEvent(smartSpaceId, {
      type: 'space.message',
      message: {
        id: message.id,
        smartSpaceId,
        entityId,
        role: 'user',
        content,
        metadata: msgMeta ?? null,
        seq: message.seq.toString(),
        createdAt: message.createdAt.toISOString(),
      },
    });

    // v3: Push to inbox of all OTHER agent members (fire-and-forget)
    const senderEntity = await prisma.entity.findUnique({
      where: { id: entityId },
      select: { displayName: true, type: true },
    });

    const agentMembers = await prisma.smartSpaceMembership.findMany({
      where: {
        smartSpaceId,
        entityId: { not: entityId },
        entity: { type: 'agent' },
      },
      select: { entityId: true },
    });

    const space = await prisma.smartSpace.findUnique({
      where: { id: smartSpaceId },
      select: { name: true },
    });

    // Push to each agent's inbox
    for (const member of agentMembers) {
      pushSpaceMessageEvent(member.entityId, {
        spaceId: smartSpaceId,
        spaceName: space?.name ?? 'Unnamed',
        messageId: message.id,
        senderEntityId: entityId,
        senderName: senderEntity?.displayName ?? 'Unknown',
        senderType: (senderEntity?.type ?? 'human') as 'human' | 'agent',
        content,
      }).catch((err) => {
        console.warn(`[smart-spaces] Failed to push to inbox ${member.entityId}:`, err);
      });
    }

    res.status(201).json({ message });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// GET /api/smart-spaces/:smartSpaceId/messages — List messages
smartSpacesRouter.get('/:smartSpaceId/messages', requireAuth(), requireMembership(), async (req: Request, res: Response) => {
  try {
    const { smartSpaceId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const afterSeq = req.query.afterSeq ? BigInt(req.query.afterSeq as string) : undefined;
    const beforeSeq = req.query.beforeSeq ? BigInt(req.query.beforeSeq as string) : undefined;

    const where: Record<string, unknown> = { smartSpaceId };
    if (afterSeq !== undefined) where.seq = { gt: afterSeq };
    if (beforeSeq !== undefined) where.seq = { ...(where.seq as any ?? {}), lt: beforeSeq };

    const messages = await prisma.smartSpaceMessage.findMany({
      where,
      orderBy: { seq: 'desc' },
      take: limit,
      include: { entity: { select: { id: true, displayName: true, type: true } } },
    });

    res.json({ messages: messages.reverse() });
  } catch (error) {
    console.error('List messages error:', error);
    res.status(500).json({ error: 'Failed to list messages' });
  }
});

// =============================================================================
// SSE Stream
// =============================================================================

// GET /api/smart-spaces/:smartSpaceId/stream — SSE event stream
smartSpacesRouter.get('/:smartSpaceId/stream', requireAuth(), requireMembership(), async (req: Request, res: Response) => {
  try {
    const { smartSpaceId } = req.params;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    // Include active agents in the connected event so the indicator restores on refresh
    const activeRuns = await prisma.run.findMany({
      where: {
        status: 'running',
        agent: {
          entity: {
            smartSpaceMemberships: { some: { smartSpaceId } },
          },
        },
      },
      select: {
        id: true,
        agentEntityId: true,
        agent: { select: { name: true } },
      },
    });
    const activeAgents = activeRuns.map((r) => ({
      runId: r.id,
      agentEntityId: r.agentEntityId,
      agentName: r.agent.name,
    }));

    res.write(`data: ${JSON.stringify({ type: 'connected', smartSpaceId, activeAgents })}\n\n`);

    // Subscribe to Redis pub/sub for this space
    const subscriber = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    const channel = `smartspace:${smartSpaceId}`;
    await subscriber.subscribe(channel);

    subscriber.on('message', (_ch: string, message: string) => {
      res.write(`data: ${message}\n\n`);
    });

    // Keepalive ping every 30s
    const pingInterval = setInterval(() => {
      res.write(': ping\n\n');
    }, 30_000);

    // Cleanup on close
    req.on('close', () => {
      clearInterval(pingInterval);
      subscriber.unsubscribe(channel).catch(() => {});
      subscriber.disconnect();
    });
  } catch (error) {
    console.error('SSE stream error:', error);
    res.status(500).json({ error: 'Failed to start stream' });
  }
});

// =============================================================================
// Read receipts
// =============================================================================

// PATCH /api/smart-spaces/:smartSpaceId/read — Mark messages as seen
smartSpacesRouter.patch('/:smartSpaceId/read', requireAuth(), requireMembership(), async (req: Request, res: Response) => {
  try {
    const { smartSpaceId } = req.params;
    const entityId = req.auth?.entityId;
    const { lastSeenMessageId } = req.body;

    if (!entityId || !lastSeenMessageId) {
      res.status(400).json({ error: 'lastSeenMessageId is required' });
      return;
    }

    await prisma.smartSpaceMembership.update({
      where: { smartSpaceId_entityId: { smartSpaceId, entityId } },
      data: { lastSeenMessageId },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Read receipt error:', error);
    res.status(500).json({ error: 'Failed to update read receipt' });
  }
});

// =============================================================================
// Space-scoped runs (audit records)
// =============================================================================

// GET /api/smart-spaces/:smartSpaceId/runs — List runs triggered from this space
smartSpacesRouter.get('/:smartSpaceId/runs', requireAuth(), requireMembership(), async (req: Request, res: Response) => {
  try {
    const { smartSpaceId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    const runs = await prisma.run.findMany({
      where: { triggerSpaceId: smartSpaceId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    res.json({ runs });
  } catch (error) {
    console.error('List space runs error:', error);
    res.status(500).json({ error: 'Failed to list runs' });
  }
});
