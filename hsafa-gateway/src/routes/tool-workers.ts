import { Router, type Request, type Response } from 'express';
import Redis from 'ioredis';
import { TOOL_WORKERS_CHANNEL } from '../lib/tool-worker-events.js';
import { requireSecretKey } from '../middleware/auth.js';

// =============================================================================
// Tool Worker Routes
//
// External services (Node.js, Python, etc.) connect here using the same
// HSAFA_SECRET_KEY used for all server-to-server API calls.
//
// Auth: x-secret-key header (same as all other protected endpoints)
//
// Usage:
//   GET  /api/tools/stream   — SSE stream of tool.call events
// =============================================================================

export const toolWorkersRouter = Router();

// GET /api/tools/stream — SSE stream delivering tool.call events
toolWorkersRouter.get('/stream', requireSecretKey(), async (req: Request, res: Response) => {

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  res.write(
    `data: ${JSON.stringify({ type: 'connected', ts: new Date().toISOString() })}\n\n`,
  );

  const subscriber = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  await subscriber.subscribe(TOOL_WORKERS_CHANNEL);

  subscriber.on('message', (_ch: string, message: string) => {
    res.write(`data: ${message}\n\n`);
  });

  const pingInterval = setInterval(() => {
    res.write(': ping\n\n');
  }, 30_000);

  req.on('close', () => {
    clearInterval(pingInterval);
    subscriber.unsubscribe(TOOL_WORKERS_CHANNEL).catch(() => {});
    subscriber.disconnect();
  });
});
