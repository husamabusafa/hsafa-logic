import { PrismaClient } from '../prisma/generated/client/index.js';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

const tools = [
  // ─── 1. Confirmation Tool (space, async, visible) ───────────────────────
  // isAsync: true → returns pending immediately, result arrives via inbox.
  {
    name: 'confirmAction',
    description:
      'Ask a human in the active space to confirm or reject an action. ' +
      'The confirmation card will appear in the space. ' +
      'You will receive the result (confirmed/rejected) in your inbox in a later cycle. ' +
      'Do NOT wait — continue with other tasks.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Title of the confirmation card' },
        message: { type: 'string', description: 'Detailed description of what needs confirmation' },
        confirmLabel: { type: 'string', description: 'Label for the confirm button (default: "Confirm")' },
        rejectLabel: { type: 'string', description: 'Label for the cancel button (default: "Cancel")' },
      },
      required: ['title', 'message'],
    },
    executionType: 'space' as const,
    visible: true,
    isAsync: true,
  },

  // ─── 2. Chart Tool (internal type, visible, sync) ───────────────────────
  // Executes on the gateway (returns args as chart data).
  // Visible in space — the client renders a chart based on the data.
  {
    name: 'displayChart',
    description:
      'Display a chart in the active space. Provide chart type, title, and data points. ' +
      'The chart will appear as a visual element in the space. ' +
      'Supported types: bar, line, pie.',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['bar', 'line', 'pie'],
          description: 'Chart type',
        },
        title: { type: 'string', description: 'Chart title' },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              value: { type: 'number' },
            },
            required: ['label', 'value'],
          },
          description: 'Data points for the chart',
        },
        xLabel: { type: 'string', description: 'X-axis label (optional)' },
        yLabel: { type: 'string', description: 'Y-axis label (optional)' },
      },
      required: ['type', 'title', 'data'],
    },
    executionType: 'internal' as const,
    visible: true,
  },

  // ─── 3. External Data Tool (external, SSE worker pattern) ──────────────
  // executionType: 'external' + no URL → gateway creates PendingToolCall
  // and emits tool.call to the Redis tool-workers channel. Any service
  // running client.tools.listen({ fetchExternalData: handler }) picks it
  // up, executes, and submits the result via the tool-results API.
  // See: use-case-app/scripts/tool-worker.ts for the reference worker.
  {
    name: 'fetchExternalData',
    description:
      'Fetch data from the external project management system. ' +
      'Provide a query string to search for projects, tasks, or reports. ' +
      'The result is returned directly to you.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (e.g. "active projects", "team tasks")' },
      },
      required: ['query'],
    },
    executionType: 'external' as const,
    visible: false,
    isAsync: false,
    timeout: 10000,
  },
];

async function main() {
  console.log('Adding tools to Atlas...\n');

  const atlas = await prisma.agent.findUnique({ where: { name: 'Atlas' } });
  if (!atlas) {
    console.error('Atlas agent not found!');
    process.exit(1);
  }

  const config = atlas.configJson as Record<string, unknown>;
  config.tools = tools;

  await prisma.agent.update({
    where: { id: atlas.id },
    data: { configJson: config as any },
  });

  console.log(`✅ Updated Atlas (${atlas.id}) with ${tools.length} tools:`);
  for (const t of tools) {
    console.log(`   - ${t.name} (${t.executionType}, visible=${t.visible})`);
  }

  console.log('\nTool details:');
  console.log('  1. confirmAction  — space type, async, visible → returns pending, result via inbox');
  console.log('  2. displayChart   — internal type, sync, visible → returns chart data, shown in space UI');
  console.log('  3. fetchExternalData — external type, sync, hidden → calls Next.js API, result direct to agent');

  await prisma.$disconnect();
  await pool.end();
}

main().catch(console.error);
