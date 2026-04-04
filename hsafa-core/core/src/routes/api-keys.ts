import { Router } from 'express';
import { createApiKey, rotateKey, revokeKey, type KeyType } from '../lib/api-keys.js';
import { prisma } from '../lib/db.js';
import { requireServiceKey } from '../middleware/auth.js';

// =============================================================================
// API Keys Routes — Key lifecycle management (service key only)
//
// POST /api/keys           — Create a new key (haseef, scope, or service)
// GET  /api/keys           — List keys (prefix + metadata, never plaintext)
// POST /api/keys/:id/rotate — Rotate a key (revoke old, create new)
// POST /api/keys/:id/revoke — Revoke a key
// =============================================================================

export const apiKeysRouter = Router();

// All key management requires service key
apiKeysRouter.use(requireServiceKey());

// POST /api/keys — Create a new key
apiKeysRouter.post('/', async (req, res) => {
  try {
    const { type, resourceId, description } = req.body;

    if (!type || !['haseef', 'scope', 'service'].includes(type)) {
      res.status(400).json({ error: 'type must be one of: haseef, scope, service' });
      return;
    }

    if ((type === 'haseef' || type === 'scope') && !resourceId) {
      res.status(400).json({ error: `resourceId is required for ${type} keys` });
      return;
    }

    const { key, record } = await createApiKey({
      type: type as KeyType,
      resourceId,
      description,
    });

    // Return the plaintext key exactly once
    res.status(201).json({ key, ...record });
  } catch (err) {
    console.error('[api-keys] create error:', err);
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

// GET /api/keys — List keys (metadata only)
apiKeysRouter.get('/', async (req, res) => {
  try {
    const { type, resourceId } = req.query;
    const where: Record<string, unknown> = { active: true };
    if (type) where.keyType = type;
    if (resourceId) where.resourceId = resourceId;

    const keys = await prisma.coreApiKey.findMany({
      where: where as any,
      select: {
        id: true,
        keyPrefix: true,
        keyType: true,
        resourceId: true,
        description: true,
        active: true,
        lastUsedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ keys });
  } catch (err) {
    console.error('[api-keys] list error:', err);
    res.status(500).json({ error: 'Failed to list API keys' });
  }
});

// POST /api/keys/:id/rotate — Rotate a key
apiKeysRouter.post('/:id/rotate', async (req, res) => {
  try {
    const result = await rotateKey(req.params.id);
    if (!result) {
      res.status(404).json({ error: 'Key not found' });
      return;
    }
    res.json({ key: result.key });
  } catch (err) {
    console.error('[api-keys] rotate error:', err);
    res.status(500).json({ error: 'Failed to rotate API key' });
  }
});

// POST /api/keys/:id/revoke — Revoke a key
apiKeysRouter.post('/:id/revoke', async (req, res) => {
  try {
    const success = await revokeKey(req.params.id);
    if (!success) {
      res.status(404).json({ error: 'Key not found' });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[api-keys] revoke error:', err);
    res.status(500).json({ error: 'Failed to revoke API key' });
  }
});
