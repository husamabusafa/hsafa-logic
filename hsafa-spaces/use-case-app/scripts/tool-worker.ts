/**
 * Hsafa Tool Worker — use-case-app
 *
 * Connects to Core's SSE tool-worker stream and handles external tool
 * calls using the @hsafa/node SDK.
 *
 * Run this process alongside pnpm dev to enable external tool execution:
 *   npx tsx scripts/tool-worker.ts
 *
 * Required env vars:
 *   GATEWAY_URL        — default: http://localhost:3001
 *   HSAFA_SECRET_KEY   — same secret key used for all server-to-server API calls
 */

import { Hsafa, CoreClient } from '@hsafa/node';

const coreUrl = process.env.GATEWAY_URL ?? process.env.HSAFA_GATEWAY_URL ?? 'http://localhost:3001';
const secretKey = process.env.HSAFA_SECRET_KEY ?? '';

if (!secretKey) {
  console.error('[tool-worker] HSAFA_SECRET_KEY env var is required');
  process.exit(1);
}

const hsafa = new Hsafa({ coreUrl, secretKey });
const client = new CoreClient({ coreUrl, secretKey });

// Tool handlers
type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;
const handlers: Record<string, ToolHandler> = {
  /**
   * fetchExternalData — simulates querying a project management system.
   * Replace this body with real database/API calls in production.
   */
  async fetchExternalData(args: Record<string, unknown>) {
    const query = (args.query as string) ?? '';
    console.log(`[tool-worker] fetchExternalData query="${query}"`);

    const allProjects = [
      { id: 1, title: 'Project Alpha', status: 'active', progress: 78 },
      { id: 2, title: 'Project Beta', status: 'completed', progress: 100 },
      { id: 3, title: 'Project Gamma', status: 'planning', progress: 12 },
    ];
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const results = !query
      ? allProjects
      : allProjects.filter((p) =>
          words.some(
            (w) =>
              p.title.toLowerCase().includes(w) ||
              p.status.toLowerCase().includes(w),
          ),
        );

    return {
      source: 'use-case-app-worker',
      query,
      timestamp: new Date().toISOString(),
      results,
      summary: `Found ${results.length} result${results.length !== 1 ? 's' : ''} for "${query}".`,
    };
  },
};

// Connect to tool worker SSE stream
const controller = new AbortController();

async function start() {
  console.log(`[tool-worker] Starting — core: ${coreUrl}`);

  const response = await client.streamToolWorker();
  const body = response.body;
  if (!body) throw new Error('No response body');

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (!controller.signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const event = JSON.parse(line.slice(6)) as {
            type: string;
            toolCallId?: string;
            toolName?: string;
            args?: Record<string, unknown>;
            runId?: string;
          };

          if (event.type === 'tool.call' && event.toolName && event.toolCallId && event.runId) {
            const handler = handlers[event.toolName];
            if (handler) {
              console.log(`[tool-worker] Handling ${event.toolName} (call: ${event.toolCallId})`);
              const result = await handler(event.args ?? {});
              await hsafa.runs.submitToolResult(event.runId, event.toolCallId, result);
              console.log(`[tool-worker] Submitted result for ${event.toolCallId}`);
            }
          }
        } catch {
          // skip malformed events
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

start().catch((err) => {
  console.error('[tool-worker] Fatal:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('[tool-worker] Shutting down...');
  controller.abort();
  process.exit(0);
});

process.on('SIGTERM', () => {
  controller.abort();
  process.exit(0);
});
