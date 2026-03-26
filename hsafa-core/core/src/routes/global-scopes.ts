import { Router } from 'express';
import { prisma } from '../lib/db.js';
import {
  addScopeConnection,
  removeScopeConnection,
  isScopeConnected,
} from '../lib/tool-dispatcher.js';

// =============================================================================
// Global Scopes Routes (v7)
//
// Tools are registered globally by services (not per-haseef).
// Haseefs activate scopes by name in their scopes[] array.
//
// PUT  /api/scopes/:scope/tools          — Register/replace tools in scope
// GET  /api/scopes                       — List all scopes
// GET  /api/scopes/:scope/tools          — List tools in scope
// GET  /api/scopes/:scope/actions/stream — SSE: receive tool call actions
// =============================================================================

export const globalScopesRouter = Router();

// PUT /api/scopes/:scope/tools — Register tools for a scope
globalScopesRouter.put('/:scope/tools', async (req, res) => {
  const { scope } = req.params;
  const { tools } = req.body;

  if (!Array.isArray(tools)) {
    res.status(400).json({ error: 'tools must be an array' });
    return;
  }

  try {
    for (const t of tools) {
      if (!t.name || !t.description || !t.inputSchema) {
        res.status(400).json({ error: 'Each tool must have name, description, and inputSchema' });
        return;
      }
    }

    const scopeRecord = await prisma.scope.upsert({
      where: { name: scope },
      create: { name: scope, connected: isScopeConnected(scope) },
      update: {},
    });

    await prisma.scopeTool.deleteMany({ where: { scopeId: scopeRecord.id } });

    const created = await Promise.all(
      (tools as Array<{ name: string; description: string; inputSchema: unknown }>).map((t) =>
        prisma.scopeTool.create({
          data: {
            scopeId: scopeRecord.id,
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema as any,
          },
        }),
      ),
    );

    res.json({ scope, tools: created, count: created.length });
  } catch (err) {
    console.error('[global-scopes] register tools error:', err);
    res.status(500).json({ error: 'Failed to register tools' });
  }
});

// GET /api/scopes — List all scopes with live connection status
globalScopesRouter.get('/', async (_req, res) => {
  try {
    const scopes = await prisma.scope.findMany({
      include: { _count: { select: { tools: true } } },
      orderBy: { name: 'asc' },
    });
    res.json({
      scopes: scopes.map((s: any) => ({
        id: s.id,
        name: s.name,
        connected: isScopeConnected(s.name),
        toolCount: s._count.tools,
        lastSeenAt: s.lastSeenAt,
        createdAt: s.createdAt,
      })),
    });
  } catch (err) {
    console.error('[global-scopes] list error:', err);
    res.status(500).json({ error: 'Failed to list scopes' });
  }
});

// GET /api/scopes/:scope/tools — List tools in a scope
globalScopesRouter.get('/:scope/tools', async (req, res) => {
  const { scope } = req.params;
  try {
    const scopeRecord = await prisma.scope.findUnique({
      where: { name: scope },
      include: { tools: { orderBy: { name: 'asc' } } },
    });
    if (!scopeRecord) {
      res.status(404).json({ error: 'Scope not found' });
      return;
    }
    res.json({ scope, connected: isScopeConnected(scope), tools: scopeRecord.tools });
  } catch (err) {
    console.error('[global-scopes] list tools error:', err);
    res.status(500).json({ error: 'Failed to list scope tools' });
  }
});

// GET /api/scopes/:scope/actions/stream — SSE action stream for a scope
globalScopesRouter.get('/:scope/actions/stream', (req, res) => {
  const { scope } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Confirm connection
  res.write(`: connected to scope "${scope}"\n\n`);

  addScopeConnection(scope, res);

  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 30_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    removeScopeConnection(scope, res);
  });
});
