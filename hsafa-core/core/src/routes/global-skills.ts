import { Router } from 'express';
import { prisma } from '../lib/db.js';
import {
  addSkillConnection,
  removeSkillConnection,
  isSkillConnected,
} from '../lib/tool-dispatcher.js';

// =============================================================================
// Global Skills Routes (v7)
//
// Tools are registered globally by services (not per-haseef).
// Haseefs activate skills by name in their skills[] array.
//
// PUT  /api/skills/:skill/tools          — Register/replace tools in skill
// GET  /api/skills                       — List all skills
// GET  /api/skills/:skill/tools          — List tools in skill
// GET  /api/skills/:skill/actions/stream — SSE: receive tool call actions
// =============================================================================

export const globalSkillsRouter = Router();

// PUT /api/skills/:skill/tools — Register tools for a skill
globalSkillsRouter.put('/:skill/tools', async (req, res) => {
  const { skill } = req.params;
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

    const skillRecord = await prisma.skill.upsert({
      where: { name: skill },
      create: { name: skill, connected: isSkillConnected(skill) },
      update: {},
    });

    // Atomic: delete all existing tools then recreate in a transaction
    const created = await prisma.$transaction(async (tx) => {
      await tx.skillTool.deleteMany({ where: { skillId: skillRecord.id } });
      const results = [];
      for (const t of tools as Array<{ name: string; description: string; inputSchema: unknown }>) {
        results.push(
          await tx.skillTool.create({
            data: {
              skillId: skillRecord.id,
              name: t.name,
              description: t.description,
              inputSchema: t.inputSchema as any,
            },
          }),
        );
      }
      return results;
    });

    res.json({ skill, tools: created, count: created.length });
  } catch (err) {
    console.error('[global-skills] register tools error:', err);
    res.status(500).json({ error: 'Failed to register tools' });
  }
});

// GET /api/skills — List all skills with live connection status
globalSkillsRouter.get('/', async (_req, res) => {
  try {
    const skills = await prisma.skill.findMany({
      include: { _count: { select: { tools: true } } },
      orderBy: { name: 'asc' },
    });
    res.json({
      skills: skills.map((s: any) => ({
        id: s.id,
        name: s.name,
        connected: isSkillConnected(s.name),
        toolCount: s._count.tools,
        lastSeenAt: s.lastSeenAt,
        createdAt: s.createdAt,
      })),
    });
  } catch (err) {
    console.error('[global-skills] list error:', err);
    res.status(500).json({ error: 'Failed to list skills' });
  }
});

// GET /api/skills/:skill/tools — List tools in a skill
globalSkillsRouter.get('/:skill/tools', async (req, res) => {
  const { skill } = req.params;
  try {
    const skillRecord = await prisma.skill.findUnique({
      where: { name: skill },
      include: { tools: { orderBy: { name: 'asc' } } },
    });
    if (!skillRecord) {
      res.status(404).json({ error: 'Skill not found' });
      return;
    }
    res.json({ skill, connected: isSkillConnected(skill), tools: skillRecord.tools });
  } catch (err) {
    console.error('[global-skills] list tools error:', err);
    res.status(500).json({ error: 'Failed to list skill tools' });
  }
});

// GET /api/skills/:skill/actions/stream — SSE action stream for a skill
globalSkillsRouter.get('/:skill/actions/stream', (req, res) => {
  const { skill } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Confirm connection
  res.write(`: connected to skill "${skill}"\n\n`);

  addSkillConnection(skill, res);

  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 30_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    removeSkillConnection(skill, res);
  });
});
