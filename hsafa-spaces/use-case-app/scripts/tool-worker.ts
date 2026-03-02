/**
 * Hsafa Tool Worker — use-case-app
 *
 * Connects to the gateway SSE tool-worker stream and handles external tool
 * calls using the @hsafa/node SDK.
 *
 * Run this process alongside pnpm dev to enable external tool execution:
 *   npx tsx scripts/tool-worker.ts
 *
 * Required env vars:
 *   GATEWAY_URL        — default: http://localhost:3001
 *   HSAFA_SECRET_KEY   — same gateway secret key used for all server-to-server API calls
 */

import { HsafaClient } from '@hsafa/node';

const gatewayUrl = process.env.GATEWAY_URL ?? process.env.HSAFA_GATEWAY_URL ?? 'http://localhost:3001';
const secretKey = process.env.HSAFA_SECRET_KEY ?? '';

if (!secretKey) {
  console.error('[tool-worker] HSAFA_SECRET_KEY env var is required');
  process.exit(1);
}

const client = new HsafaClient({ gatewayUrl, secretKey });

console.log(`[tool-worker] Starting — gateway: ${gatewayUrl}`);

const worker = client.tools.listen({
  /**
   * fetchExternalData — simulates querying a project management system.
   * Replace this body with real database/API calls in production.
   */
  async fetchExternalData(args) {
    const query = (args.query as string) ?? '';
    console.log(`[tool-worker] fetchExternalData query="${query}"`);

    // Example data — replace with real logic
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
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('[tool-worker] Shutting down...');
  worker.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  worker.close();
  process.exit(0);
});
