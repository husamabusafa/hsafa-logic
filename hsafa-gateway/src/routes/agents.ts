import { Router, type Router as ExpressRouter } from 'express';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/db.js';
import { validateAgentConfig } from '../agent-builder/parser.js';

export const agentsRouter: ExpressRouter = Router();

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }

  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};

    for (const key of Object.keys(obj).sort()) {
      const v = obj[key];
      if (v === undefined) continue;
      out[key] = sortKeysDeep(v);
    }

    return out;
  }

  return value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

agentsRouter.post('/', async (req, res) => {
  try {
    const { name, config, version, metadata } = req.body;

    if (!config || typeof config !== 'object') {
      return res.status(400).json({
        error: 'Missing or invalid field: config (must be an object)',
      });
    }

    const validatedConfig = validateAgentConfig(config);

    const agentName =
      typeof name === 'string' && name.trim().length > 0
        ? name.trim()
        : validatedConfig.agent?.name;

    if (!agentName || agentName.trim().length === 0) {
      return res.status(400).json({
        error: 'Missing agent name (provide req.body.name or config.agent.name)',
      });
    }

    const agent =
      (await prisma.agent.findUnique({
        where: { name: agentName },
      })) ??
      (await prisma.agent.create({
        data: {
          name: agentName,
          description: validatedConfig.agent?.description,
        },
      }));

    const configHash = createHash('sha256')
      .update(stableStringify(validatedConfig))
      .digest('hex');

    const existingVersion = await prisma.agentVersion.findUnique({
      where: {
        agentId_configHash: {
          agentId: agent.id,
          configHash,
        },
      },
    });

    if (existingVersion) {
      return res.json({
        agentId: agent.id,
        agentVersionId: existingVersion.id,
        configHash,
        created: false,
      });
    }

    let versionTag =
      typeof version === 'string' && version.trim().length > 0
        ? version.trim()
        : validatedConfig.version;

    if (!versionTag || versionTag.trim().length === 0) {
      versionTag = 'auto';
    }

    const existingVersionTag = await prisma.agentVersion.findUnique({
      where: {
        agentId_version: {
          agentId: agent.id,
          version: versionTag,
        },
      },
    });

    if (existingVersionTag) {
      versionTag = `${versionTag}-${configHash.slice(0, 8)}`;
    }

    const newVersion = await prisma.agentVersion.create({
      data: {
        agentId: agent.id,
        version: versionTag,
        configJson: validatedConfig as unknown as Prisma.InputJsonValue,
        configHash,
        metadata: metadata ?? null,
      },
    });

    res.json({
      agentId: agent.id,
      agentVersionId: newVersion.id,
      configHash,
      created: true,
    });
  } catch (error) {
    console.error('[Agents API Error]', error);
    res.status(500).json({
      error: 'Failed to create agent',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
