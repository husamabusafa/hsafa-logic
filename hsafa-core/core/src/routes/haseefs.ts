import { Router, type Request, type Response } from 'express';
import { prisma } from '../lib/db.js';
import { requireSecretKey, requireExtensionKey } from '../middleware/auth.js';
import { pushSenseEvent } from '../lib/inbox.js';
import { publishToolResult } from '../agent-builder/builder.js';
import { pushToolResultEvent } from '../lib/inbox.js';
import {
  connectExtension,
  disconnectExtension,
  getConnectedExtensions,
  getPendingToolCalls,
  verifyExtensionConnection,
} from '../lib/extension-manager.js';
import type { SenseEvent } from '../agent-builder/types.js';

// =============================================================================
// Haseef Routes (v4 Core API)
//
// These are the core API endpoints for interacting with Haseefs.
// Two auth modes:
//   - secret key (admin): create, get, manage extensions
//   - extension key: push senses, return tool results, poll tool calls
//
// POST   /haseefs/:id/senses                        (extension key) — push sense events
// POST   /haseefs/:id/tools/:callId/result           (extension key) — return tool results
// GET    /haseefs/:id/tools/calls                    (extension key) — poll pending calls
// POST   /haseefs/:id/extensions/:extId/connect      (secret key) — connect extension
// DELETE /haseefs/:id/extensions/:extId/disconnect    (secret key) — disconnect extension
// GET    /haseefs/:id/extensions                      (secret key) — list connected extensions
// GET    /haseefs/:id                                 (secret key) — get haseef details
// GET    /haseefs                                     (secret key) — list haseefs
// =============================================================================

export const haseefsRouter = Router();

// =============================================================================
// Helper: Resolve haseefId to haseefId
// =============================================================================

async function resolveHaseefEntityId(haseefId: string): Promise<string | null> {
  const haseef = await prisma.haseef.findUnique({
    where: { id: haseefId },
    include: { entity: { select: { id: true } } },
  });
  return haseef?.entity?.id ?? null;
}

// =============================================================================
// Extension Key Routes (extension → core)
// =============================================================================

// POST /haseefs/:id/senses — Push sense events to a Haseef's inbox
haseefsRouter.post('/:id/senses', requireExtensionKey(), async (req: Request, res: Response) => {
  try {
    const haseefId = req.params.id;
    const extensionId = req.auth?.extensionId;

    if (!extensionId) {
      res.status(401).json({ error: 'No extension resolved' });
      return;
    }

    // Verify extension is connected to this haseef
    const connected = await verifyExtensionConnection(extensionId, haseefId);
    if (!connected) {
      res.status(403).json({ error: 'Extension is not connected to this Haseef' });
      return;
    }

    const haseefId = await resolveHaseefEntityId(haseefId);
    if (!haseefId) {
      res.status(404).json({ error: 'Haseef not found' });
      return;
    }

    // Accept a single event or an array
    const { event, events } = req.body as {
      event?: SenseEvent & { eventId: string };
      events?: Array<SenseEvent & { eventId: string }>;
    };

    const toProcess = events ?? (event ? [event] : []);

    if (toProcess.length === 0) {
      res.status(400).json({ error: 'event or events array is required' });
      return;
    }

    // Validate and push each event
    for (const e of toProcess) {
      if (!e.eventId || !e.channel || !e.type) {
        res.status(400).json({ error: 'Each event must have eventId, channel, and type' });
        return;
      }
      await pushSenseEvent(haseefId, {
        eventId: e.eventId,
        channel: e.channel,
        source: e.source ?? '',
        type: e.type,
        data: e.data ?? {},
        timestamp: e.timestamp ?? new Date().toISOString(),
      });
    }

    res.json({ success: true, pushed: toProcess.length });
  } catch (error) {
    console.error('Push senses error:', error);
    res.status(500).json({ error: 'Failed to push sense events' });
  }
});

// POST /haseefs/:id/tools/:callId/result — Return a tool call result
haseefsRouter.post('/:id/tools/:callId/result', requireExtensionKey(), async (req: Request, res: Response) => {
  try {
    const haseefId = req.params.id;
    const { callId } = req.params;
    const extensionId = req.auth?.extensionId;

    if (!extensionId) {
      res.status(401).json({ error: 'No extension resolved' });
      return;
    }

    const connected = await verifyExtensionConnection(extensionId, haseefId);
    if (!connected) {
      res.status(403).json({ error: 'Extension is not connected to this Haseef' });
      return;
    }

    const { result } = req.body;

    // Look up the pending tool call
    const pending = await prisma.pendingToolCall.findUnique({
      where: { toolCallId: callId },
    });

    if (!pending) {
      res.status(404).json({ error: 'Pending tool call not found' });
      return;
    }

    if (pending.status !== 'pending' && pending.status !== 'waiting') {
      res.status(409).json({ error: `Tool call already ${pending.status}` });
      return;
    }

    const wasWaiting = pending.status === 'waiting';

    // Resolve the pending tool call
    await prisma.pendingToolCall.update({
      where: { toolCallId: callId },
      data: {
        status: 'resolved',
        result: result as any,
        resolvedAt: new Date(),
      },
    });

    if (wasWaiting) {
      // Unblock the waiting tool via Redis pub/sub
      await publishToolResult(callId, result);
    } else {
      // Push to inbox for next cycle
      await pushToolResultEvent(pending.haseefId, {
        toolCallId: callId,
        toolName: pending.toolName,
        originRunId: pending.runId,
        result,
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Tool result error:', error);
    res.status(500).json({ error: 'Failed to submit tool result' });
  }
});

// GET /haseefs/:id/tools/calls — Poll pending tool calls for this extension
haseefsRouter.get('/:id/tools/calls', requireExtensionKey(), async (req: Request, res: Response) => {
  try {
    const haseefId = req.params.id;
    const extensionId = req.auth?.extensionId;

    if (!extensionId) {
      res.status(401).json({ error: 'No extension resolved' });
      return;
    }

    const connected = await verifyExtensionConnection(extensionId, haseefId);
    if (!connected) {
      res.status(403).json({ error: 'Extension is not connected to this Haseef' });
      return;
    }

    const calls = await getPendingToolCalls(haseefId, extensionId);

    res.json({
      calls: calls.map((c) => ({
        toolCallId: c.toolCallId,
        toolName: c.toolName,
        args: c.args,
        runId: c.runId,
        status: c.status,
        createdAt: c.createdAt,
      })),
    });
  } catch (error) {
    console.error('Poll tool calls error:', error);
    res.status(500).json({ error: 'Failed to get pending tool calls' });
  }
});

// =============================================================================
// Secret Key Routes (admin management)
// =============================================================================

// GET /haseefs — List all Haseefs
haseefsRouter.get('/', requireSecretKey(), async (_req: Request, res: Response) => {
  try {
    const haseefs = await prisma.haseef.findMany({
      include: {
        entity: { select: { id: true, displayName: true } },
        connections: {
          include: {
            extension: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json({
      haseefs: haseefs.map((h) => ({
        id: h.id,
        name: h.name,
        description: h.description,
        haseefId: h.entity?.id,
        displayName: h.entity?.displayName,
        extensions: h.connections.map((c) => ({
          extensionId: c.extension.id,
          extensionName: c.extension.name,
          enabled: c.enabled,
        })),
        createdAt: h.createdAt,
      })),
    });
  } catch (error) {
    console.error('List haseefs error:', error);
    res.status(500).json({ error: 'Failed to list haseefs' });
  }
});

// GET /haseefs/:id — Get Haseef details
haseefsRouter.get('/:id', requireSecretKey(), async (req: Request, res: Response) => {
  try {
    const haseef = await prisma.haseef.findUnique({
      where: { id: req.params.id },
      include: {
        entity: { select: { id: true, displayName: true } },
        connections: {
          include: {
            extension: {
              include: { tools: { select: { name: true, description: true } } },
            },
          },
        },
      },
    });

    if (!haseef) {
      res.status(404).json({ error: 'Haseef not found' });
      return;
    }

    res.json({
      haseef: {
        id: haseef.id,
        name: haseef.name,
        description: haseef.description,
        haseefId: haseef.entity?.id,
        displayName: haseef.entity?.displayName,
        extensions: haseef.connections.map((c) => ({
          extensionId: c.extension.id,
          extensionName: c.extension.name,
          enabled: c.enabled,
          config: c.config,
          tools: c.extension.tools,
        })),
        createdAt: haseef.createdAt,
      },
    });
  } catch (error) {
    console.error('Get haseef error:', error);
    res.status(500).json({ error: 'Failed to get haseef' });
  }
});

// POST /haseefs/:id/extensions/:extId/connect — Connect extension to Haseef
haseefsRouter.post('/:id/extensions/:extId/connect', requireSecretKey(), async (req: Request, res: Response) => {
  try {
    const haseefId = req.params.id;
    const extensionId = req.params.extId;
    const { config } = req.body ?? {};

    // Verify haseef exists
    const haseef = await prisma.haseef.findUnique({ where: { id: haseefId } });
    if (!haseef) {
      res.status(404).json({ error: 'Haseef not found' });
      return;
    }

    // Verify extension exists
    const extension = await prisma.extension.findUnique({ where: { id: extensionId } });
    if (!extension) {
      res.status(404).json({ error: 'Extension not found' });
      return;
    }

    const connection = await connectExtension(haseefId, extensionId, config);

    res.json({ success: true, connectionId: connection.id });
  } catch (error) {
    console.error('Connect extension error:', error);
    res.status(500).json({ error: 'Failed to connect extension' });
  }
});

// DELETE /haseefs/:id/extensions/:extId/disconnect — Disconnect extension from Haseef
haseefsRouter.delete('/:id/extensions/:extId/disconnect', requireSecretKey(), async (req: Request, res: Response) => {
  try {
    const haseefId = req.params.id;
    const extensionId = req.params.extId;

    await disconnectExtension(haseefId, extensionId);

    res.json({ success: true });
  } catch (error) {
    console.error('Disconnect extension error:', error);
    res.status(500).json({ error: 'Failed to disconnect extension' });
  }
});

// GET /haseefs/:id/extensions — List connected extensions for a Haseef
haseefsRouter.get('/:id/extensions', requireSecretKey(), async (req: Request, res: Response) => {
  try {
    const haseefId = req.params.id;

    const haseef = await prisma.haseef.findUnique({ where: { id: haseefId } });
    if (!haseef) {
      res.status(404).json({ error: 'Haseef not found' });
      return;
    }

    const connections = await getConnectedExtensions(haseefId);

    res.json({
      extensions: connections.map((c) => ({
        extensionId: c.extension.id,
        extensionName: c.extension.name,
        enabled: c.enabled,
        config: c.config,
        connectedAt: c.connectedAt,
        tools: c.extension.tools.map((t) => ({
          name: t.name,
          description: t.description,
        })),
        instructions: c.extension.instructions,
      })),
    });
  } catch (error) {
    console.error('List connected extensions error:', error);
    res.status(500).json({ error: 'Failed to list extensions' });
  }
});
