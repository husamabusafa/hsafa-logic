import { Router } from 'express';
import { redis } from '../lib/redis.js';
import { submitActionResult, ensureConsumerGroup } from '../lib/action-dispatch.js';

// =============================================================================
// Actions Routes (v5)
//
// Action dispatch (SSE stream for services) + result submission.
// =============================================================================

export const actionsRouter = Router({ mergeParams: true });

// GET /api/haseefs/:id/scopes/:scope/actions/stream — SSE: action requests for scope
actionsRouter.get('/:scope/actions/stream', async (req, res) => {
  const haseefId = (req.params as Record<string, string>).id;
  const scope = req.params.scope;
  const streamKey = `actions:${haseefId}:${scope}`;
  const groupName = `${scope}-consumer`;
  const consumerName = `client-${Date.now()}`;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Ensure consumer group exists
  await ensureConsumerGroup(haseefId, scope, groupName);

  let closed = false;

  req.on('close', () => {
    closed = true;
  });

  // Create a dedicated Redis connection for blocking XREADGROUP
  const sub = redis.duplicate();

  // Poll loop
  while (!closed) {
    try {
      const results = await (sub as any).xreadgroup(
        'GROUP', groupName, consumerName,
        'BLOCK', 5000,
        'COUNT', 10,
        'STREAMS', streamKey, '>',
      );

      if (!results || closed) continue;

      for (const [, messages] of results) {
        for (const [messageId, fields] of messages) {
          // Parse fields array into object
          const data: Record<string, string> = {};
          for (let i = 0; i < fields.length; i += 2) {
            data[fields[i]] = fields[i + 1];
          }

          // Send SSE event
          res.write(`data: ${JSON.stringify({
            messageId,
            actionId: data.actionId,
            name: data.name,
            args: data.args ? JSON.parse(data.args) : {},
            mode: data.mode,
          })}\n\n`);

          // ACK the message
          await (sub as any).xack(streamKey, groupName, messageId);
        }
      }
    } catch (err) {
      if (closed) break;
      console.error(`[actions] XREADGROUP error for ${scope}:`, err);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  sub.quit().catch(() => {});
});

// POST /api/haseefs/:id/actions/:actionId/result — Submit action result
actionsRouter.post('/:actionId/result', async (req, res) => {
  try {
    const { actionId } = req.params;
    const result = req.body;

    await submitActionResult(actionId, result);

    res.json({ success: true });
  } catch (err) {
    console.error('[actions] submit result error:', err);
    res.status(500).json({ error: 'Failed to submit action result' });
  }
});
