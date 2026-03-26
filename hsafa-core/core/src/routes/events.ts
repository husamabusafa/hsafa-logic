import { Router } from 'express';
import { randomUUID } from 'crypto';
import { prisma } from '../lib/db.js';
import { pushEvent } from '../lib/inbox.js';

// =============================================================================
// Events Route (v7)
//
// POST /api/events — push an event to a Haseef.
//
// Routing modes:
//   haseefId  — direct routing by Haseef UUID
//   target    — profile-based routing (e.g. { phone: "+966..." })
//
// The scope must be active in the target Haseef's scopes[] array.
// =============================================================================

export const eventsRouter = Router();

eventsRouter.post('/', async (req, res) => {
  try {
    const { scope, type, data, attachments, haseefId, target } = req.body;

    if (!scope || !type || !data) {
      res.status(400).json({ error: 'scope, type, and data are required' });
      return;
    }

    if (!haseefId && !target) {
      res.status(400).json({ error: 'Either haseefId or target is required for routing' });
      return;
    }

    let resolvedId: string;

    if (haseefId) {
      const haseef = await prisma.haseef.findUnique({
        where: { id: haseefId },
        select: { id: true, scopes: true },
      });
      if (!haseef) {
        res.status(404).json({ error: 'Haseef not found' });
        return;
      }
      const haseefScopes: string[] = haseef.scopes ?? [];
      if (!haseefScopes.includes(scope)) {
        res.status(400).json({ error: `Scope "${scope}" is not active for this Haseef` });
        return;
      }
      resolvedId = haseef.id;
    } else {
      const haseef = await resolveByTarget(target as Record<string, string>);
      if (!haseef) {
        res.status(404).json({ error: 'No Haseef found matching target profile' });
        return;
      }
      const haseefScopes: string[] = haseef.scopes ?? [];
      if (!haseefScopes.includes(scope)) {
        res.status(400).json({ error: `Scope "${scope}" is not active for matching Haseef` });
        return;
      }
      resolvedId = haseef.id;
    }

    const event = {
      eventId: randomUUID(),
      scope,
      type,
      data,
      attachments: attachments ?? undefined,
      timestamp: new Date().toISOString(),
    };

    await pushEvent(resolvedId, event);

    res.json({ pushed: true, haseefId: resolvedId, eventId: event.eventId });
  } catch (err) {
    console.error('[events] push error:', err);
    res.status(500).json({ error: 'Failed to push event' });
  }
});

// ── Profile-based routing ────────────────────────────────────────────────────

async function resolveByTarget(
  target: Record<string, string>,
): Promise<{ id: string; scopes: string[] } | null> {
  for (const [key, value] of Object.entries(target)) {
    try {
      const haseef = await prisma.haseef.findFirst({
        where: {
          profileJson: {
            path: [key],
            equals: value,
          },
        },
        select: { id: true, scopes: true },
      });
      if (haseef) return haseef;
    } catch {
      // Unsupported path filter, skip
    }
  }
  return null;
}
