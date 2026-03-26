import { Router } from 'express';
import { resolveAction } from '../lib/tool-dispatcher.js';

// =============================================================================
// Global Actions Route (v7)
//
// POST /api/actions/:actionId/result — service submits tool call result
// =============================================================================

export const globalActionsRouter = Router();

globalActionsRouter.post('/:actionId/result', (req, res) => {
  const { actionId } = req.params;
  const { result } = req.body;

  if (result === undefined) {
    res.status(400).json({ error: 'result is required' });
    return;
  }

  const resolved = resolveAction(actionId, result);
  if (!resolved) {
    res.status(404).json({ error: 'Action not found or already expired' });
    return;
  }

  res.json({ success: true });
});
