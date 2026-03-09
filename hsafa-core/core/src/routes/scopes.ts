import { Router } from 'express';
import { prisma } from '../lib/db.js';

// =============================================================================
// Scopes Routes (v5)
//
// Tool management per scope. Services register tools under their scope.
// PUT syncs all tools in a scope, PUT /:name upserts one tool.
// =============================================================================

export const scopesRouter = Router({ mergeParams: true });

// PUT /api/haseefs/:id/scopes/:scope/tools — Sync all tools in scope
scopesRouter.put('/:scope/tools', async (req, res) => {
  try {
    const { id: haseefId } = req.params as Record<string, string>;
    const scope = req.params.scope;
    const { tools } = req.body;

    if (!Array.isArray(tools)) {
      res.status(400).json({ error: 'tools must be an array' });
      return;
    }

    // Delete all existing tools in this scope
    await prisma.haseefTool.deleteMany({
      where: { haseefId, scope },
    });

    // Create new tools
    const created = [];
    for (const t of tools) {
      if (!t.name || !t.description || !t.inputSchema) {
        res.status(400).json({ error: 'Each tool must have name, description, and inputSchema' });
        return;
      }
      const tool = await prisma.haseefTool.create({
        data: {
          haseefId,
          scope,
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
          mode: t.mode ?? 'sync',
          timeout: t.timeout ?? null,
        },
      });
      created.push(tool);
    }

    res.json({ tools: created, count: created.length });
  } catch (err) {
    console.error('[scopes] sync tools error:', err);
    res.status(500).json({ error: 'Failed to sync tools' });
  }
});

// PUT /api/haseefs/:id/scopes/:scope/tools/:name — Upsert one tool
scopesRouter.put('/:scope/tools/:name', async (req, res) => {
  try {
    const { id: haseefId, scope, name } = req.params as Record<string, string>;
    const { description, inputSchema, mode, timeout } = req.body;

    if (!description || !inputSchema) {
      res.status(400).json({ error: 'description and inputSchema are required' });
      return;
    }

    const tool = await prisma.haseefTool.upsert({
      where: {
        haseefId_scope_name: { haseefId, scope, name },
      },
      create: {
        haseefId,
        scope,
        name,
        description,
        inputSchema,
        mode: mode ?? 'sync',
        timeout: timeout ?? null,
      },
      update: {
        description,
        inputSchema,
        mode: mode ?? 'sync',
        timeout: timeout ?? null,
      },
    });

    res.json({ tool });
  } catch (err) {
    console.error('[scopes] upsert tool error:', err);
    res.status(500).json({ error: 'Failed to upsert tool' });
  }
});

// DELETE /api/haseefs/:id/scopes/:scope/tools/:name — Remove one tool
scopesRouter.delete('/:scope/tools/:name', async (req, res) => {
  try {
    const { id: haseefId, scope, name } = req.params as Record<string, string>;

    await prisma.haseefTool.delete({
      where: {
        haseefId_scope_name: { haseefId, scope, name },
      },
    });

    res.json({ success: true });
  } catch (err: any) {
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Tool not found' });
      return;
    }
    console.error('[scopes] delete tool error:', err);
    res.status(500).json({ error: 'Failed to delete tool' });
  }
});

// GET /api/haseefs/:id/scopes/:scope/tools — List tools in scope
scopesRouter.get('/:scope/tools', async (req, res) => {
  try {
    const { id: haseefId, scope } = req.params as Record<string, string>;

    const tools = await prisma.haseefTool.findMany({
      where: { haseefId, scope },
      orderBy: { name: 'asc' },
    });

    res.json({ tools });
  } catch (err) {
    console.error('[scopes] list scope tools error:', err);
    res.status(500).json({ error: 'Failed to list tools' });
  }
});

// DELETE /api/haseefs/:id/scopes/:scope — Remove entire scope
scopesRouter.delete('/:scope', async (req, res) => {
  try {
    const { id: haseefId, scope } = req.params as Record<string, string>;

    const result = await prisma.haseefTool.deleteMany({
      where: { haseefId, scope },
    });

    res.json({ deleted: result.count });
  } catch (err) {
    console.error('[scopes] delete scope error:', err);
    res.status(500).json({ error: 'Failed to delete scope' });
  }
});

// GET /api/haseefs/:id/tools — List ALL tools across all scopes
scopesRouter.get('/', async (req, res) => {
  try {
    const haseefId = (req.params as Record<string, string>).id;

    const tools = await prisma.haseefTool.findMany({
      where: { haseefId },
      orderBy: [{ scope: 'asc' }, { name: 'asc' }],
    });

    res.json({ tools });
  } catch (err) {
    console.error('[scopes] list all tools error:', err);
    res.status(500).json({ error: 'Failed to list tools' });
  }
});
