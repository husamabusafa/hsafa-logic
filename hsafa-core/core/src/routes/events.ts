import { Router } from 'express';
import { routeEvent } from '../lib/event-router.js';
import { trigger } from '../lib/coordinator.js';

// =============================================================================
// Events Route (v7)
//
// POST /api/events — push an event to a Haseef.
//
// Routing modes:
//   haseefId  — direct routing by Haseef UUID
//   target    — profile-based routing (e.g. { phone: "+966..." })
//
// The skill must be active in the target Haseef's skills[] array.
// Events trigger runs immediately via the coordinator (no inbox queue).
// =============================================================================

export const eventsRouter = Router();

eventsRouter.post('/', async (req, res) => {
  try {
    const { skill, type, data, haseefId, target, attachments } = req.body;

    // Support legacy 'scope' field for backward compatibility
    const resolvedSkill = skill || req.body.scope;

    if (!resolvedSkill || !type || !data) {
      res.status(400).json({ error: 'skill, type, and data are required' });
      return;
    }

    if (!haseefId && !target) {
      res.status(400).json({ error: 'Either haseefId or target is required for routing' });
      return;
    }

    // Route: resolve event to a specific haseef
    const routed = await routeEvent({
      skill: resolvedSkill,
      type,
      data,
      attachments,
      haseefId,
      target,
    });

    if (!routed) {
      res.status(404).json({ error: 'No Haseef found for this event' });
      return;
    }

    // Trigger: start a run via the coordinator (interrupts if already running)
    const { runId } = await trigger(routed);

    res.json({
      triggered: true,
      haseefId: routed.haseefId,
      haseefName: routed.haseefName,
      runId,
    });
  } catch (err: any) {
    if (err.message?.includes('not active')) {
      res.status(400).json({ error: err.message });
      return;
    }
    console.error('[events] push error:', err);
    res.status(500).json({ error: 'Failed to push event' });
  }
});
