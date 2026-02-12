import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TEST_TOOLS = [
  // 1. NO-EXECUTION MODE: Runs on CLIENT
  {
    name: 'clientTestTool',
    description: 'A client-side test tool that executes on the browser and returns data. Use this when asked to test client tools or get example data from the client.',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'A message to send to the client' },
        data: { type: 'object', description: 'Optional data to pass to the client' },
      },
      required: ['message'],
    },
    executionType: 'basic',
    execution: null,
  },
  // 2. STATIC MODE: Returns fixed data
  {
    name: 'getSystemStatus',
    description: 'Get the current system status. Returns a fixed status response. Use this when asked about system status or health.',
    inputSchema: {
      type: 'object',
      properties: {
        component: { type: 'string', description: 'Optional component name to check' },
      },
    },
    executionType: 'basic',
    execution: {
      mode: 'static',
      output: {
        status: 'healthy',
        uptime: '99.9%',
        services: { database: 'online', cache: 'online', api: 'online' },
        lastChecked: '2024-01-01T00:00:00Z',
        message: 'All systems operational',
      },
    },
  },
  // 3. PASS-THROUGH MODE: Echoes input
  {
    name: 'displayNotification',
    description: 'Display a notification message to the user. Use when asked to show notifications, alerts, or messages.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'The notification title' },
        message: { type: 'string', description: 'The notification message content' },
        type: { type: 'string', enum: ['info', 'success', 'warning', 'error'], description: 'The type of notification' },
      },
      required: ['title', 'message'],
    },
    executionType: 'basic',
    execution: { mode: 'pass-through' },
  },
  // 4. PASS-THROUGH with CUSTOM UI: Product card
  {
    name: 'showProductCard',
    description: 'Display a rich product card to the user. Use when the user asks about a product, wants to see product details, or when recommending products.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Product name' },
        price: { type: 'number', description: 'Product price in USD' },
        description: { type: 'string', description: 'Short product description' },
        imageUrl: { type: 'string', description: 'URL to the product image (use https://picsum.photos/300/200 if unknown)' },
        rating: { type: 'number', description: 'Product rating from 1-5' },
        inStock: { type: 'boolean', description: 'Whether the product is in stock' },
      },
      required: ['name', 'price', 'description'],
    },
    executionType: 'basic',
    execution: { mode: 'pass-through' },
  },
];

async function main() {
  const agents = await prisma.agent.findMany({ select: { id: true, name: true, configJson: true } });
  console.log(`Found ${agents.length} agent(s):\n`);

  for (const agent of agents) {
    const config = agent.configJson as any;
    if (!config || typeof config !== 'object') {
      console.log(`  ⏭ ${agent.name} (${agent.id}) — no valid config, skipping`);
      continue;
    }

    const existingTools: any[] = config.tools ?? [];
    const existingNames = new Set(existingTools.map((t: any) => t.name));

    const toAdd = TEST_TOOLS.filter((t) => !existingNames.has(t.name));

    if (toAdd.length === 0) {
      console.log(`  ✅ ${agent.name} (${agent.id}) — already has all 4 test tools`);
      continue;
    }

    const updatedTools = [...existingTools, ...toAdd];
    const updatedConfig = { ...config, tools: updatedTools };

    // Also update system prompt to mention the new tools
    if (updatedConfig.agent?.system) {
      const toolLines = [
        'clientTestTool - A client-side tool for testing. Use when asked to test client tools.',
        'getSystemStatus - Returns current system health status.',
        'displayNotification - Shows a notification to the user.',
        'showProductCard - Displays a rich product card UI.',
      ];
      const alreadyMentioned = toolLines.filter((l) => updatedConfig.agent.system.includes(l.split(' - ')[0]));
      const newLines = toolLines.filter((l) => !updatedConfig.agent.system.includes(l.split(' - ')[0]));

      if (newLines.length > 0) {
        updatedConfig.agent.system += `\n\nYou also have these additional tools:\n${newLines.map((l, i) => `${i + 1}. ${l}`).join('\n')}\nUse them when the user asks to test them.`;
      }
    }

    await prisma.agent.update({
      where: { id: agent.id },
      data: { configJson: updatedConfig },
    });

    console.log(`  ✅ ${agent.name} (${agent.id}) — added ${toAdd.length} tool(s): ${toAdd.map((t) => t.name).join(', ')}`);
  }

  console.log('\nDone!');
}

main()
  .catch((e) => {
    console.error('❌ Failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
