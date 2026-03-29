import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { setMemories, deleteMemories, searchMemories, getAllMemories } from '../memory/semantic.js';
import { searchEpisodes } from '../memory/episodic.js';
import { getAllSocialMemories } from '../memory/social.js';
import { getAllProcedures } from '../memory/procedural.js';

// =============================================================================
// Memory Routes (v7)
//
// CRUD + search for all 4 memory types.
// All routes are scoped to a haseefId.
// =============================================================================

export const memoryRouter = Router();

// ── Semantic Memory ──────────────────────────────────────────────────────────

// GET /api/memory/:haseefId/semantic — List semantic memories
memoryRouter.get('/:haseefId/semantic', async (req, res) => {
  try {
    const { haseefId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const memories = await getAllMemories(haseefId);
    res.json({ memories });
  } catch (err) {
    console.error('[memory] list semantic error:', err);
    res.status(500).json({ error: 'Failed to list memories' });
  }
});

// POST /api/memory/:haseefId/semantic — Set memories
memoryRouter.post('/:haseefId/semantic', async (req, res) => {
  try {
    const { haseefId } = req.params;
    const { memories } = req.body;

    if (!Array.isArray(memories)) {
      res.status(400).json({ error: 'memories must be an array of { key, value, importance }' });
      return;
    }

    await setMemories(haseefId, memories);
    res.json({ stored: memories.length });
  } catch (err) {
    console.error('[memory] set semantic error:', err);
    res.status(500).json({ error: 'Failed to set memories' });
  }
});

// DELETE /api/memory/:haseefId/semantic — Delete memories by keys
memoryRouter.delete('/:haseefId/semantic', async (req, res) => {
  try {
    const { haseefId } = req.params;
    const { keys } = req.body;

    if (!Array.isArray(keys)) {
      res.status(400).json({ error: 'keys must be an array of strings' });
      return;
    }

    const deleted = await deleteMemories(haseefId, keys);
    res.json({ deleted });
  } catch (err) {
    console.error('[memory] delete semantic error:', err);
    res.status(500).json({ error: 'Failed to delete memories' });
  }
});

// GET /api/memory/:haseefId/semantic/search?q=... — Search semantic memories
memoryRouter.get('/:haseefId/semantic/search', async (req, res) => {
  try {
    const { haseefId } = req.params;
    const query = req.query.q as string;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    if (!query) {
      res.status(400).json({ error: 'q query parameter is required' });
      return;
    }

    const results = await searchMemories(haseefId, query, limit);
    res.json({ results });
  } catch (err) {
    console.error('[memory] search semantic error:', err);
    res.status(500).json({ error: 'Failed to search memories' });
  }
});

// ── Episodic Memory ──────────────────────────────────────────────────────────

// GET /api/memory/:haseefId/episodic — List episodic memories
memoryRouter.get('/:haseefId/episodic', async (req, res) => {
  try {
    const { haseefId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    const episodes = await (prisma as any).episodicMemory.findMany({
      where: { haseefId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    res.json({ episodes });
  } catch (err) {
    console.error('[memory] list episodic error:', err);
    res.status(500).json({ error: 'Failed to list episodes' });
  }
});

// GET /api/memory/:haseefId/episodic/search?q=... — Search episodic memory
memoryRouter.get('/:haseefId/episodic/search', async (req, res) => {
  try {
    const { haseefId } = req.params;
    const query = req.query.q as string;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);

    if (!query) {
      res.status(400).json({ error: 'q query parameter is required' });
      return;
    }

    const results = await searchEpisodes(haseefId, query, limit);
    res.json({ results });
  } catch (err) {
    console.error('[memory] search episodic error:', err);
    res.status(500).json({ error: 'Failed to search episodes' });
  }
});

// ── Social Memory ────────────────────────────────────────────────────────────

// GET /api/memory/:haseefId/social — List person models
memoryRouter.get('/:haseefId/social', async (req, res) => {
  try {
    const { haseefId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

    const people = await getAllSocialMemories(haseefId);
    res.json({ people });
  } catch (err) {
    console.error('[memory] list social error:', err);
    res.status(500).json({ error: 'Failed to list social memories' });
  }
});

// ── Procedural Memory ────────────────────────────────────────────────────────

// GET /api/memory/:haseefId/procedural — List learned patterns
memoryRouter.get('/:haseefId/procedural', async (req, res) => {
  try {
    const { haseefId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

    const patterns = await getAllProcedures(haseefId);
    res.json({ patterns });
  } catch (err) {
    console.error('[memory] list procedural error:', err);
    res.status(500).json({ error: 'Failed to list procedural memories' });
  }
});

// ── Stats ────────────────────────────────────────────────────────────────────

// GET /api/memory/:haseefId/stats — Memory stats
memoryRouter.get('/:haseefId/stats', async (req, res) => {
  try {
    const { haseefId } = req.params;

    const [semantic, episodic, social, procedural] = await Promise.all([
      (prisma as any).semanticMemory.count({ where: { haseefId } }),
      (prisma as any).episodicMemory.count({ where: { haseefId } }),
      (prisma as any).socialMemory.count({ where: { haseefId } }),
      (prisma as any).proceduralMemory.count({ where: { haseefId } }),
    ]);

    res.json({
      haseefId,
      counts: { semantic, episodic, social, procedural },
      total: semantic + episodic + social + procedural,
    });
  } catch (err) {
    console.error('[memory] stats error:', err);
    res.status(500).json({ error: 'Failed to get memory stats' });
  }
});
