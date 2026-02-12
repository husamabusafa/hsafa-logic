import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_AGENT_ID = 'de1b221c-8549-43be-a6e3-b1e416405874';
const DEMO_USER_EXTERNAL_ID = 'test-user-1';
const DEMO_SPACE_NAME = 'Demo SmartSpace';

async function main() {
  console.log('🌱 Seeding database...');

  // 1. Create demo agent
  const agentConfigJson = {
    version: '1.0',
    agent: {
      name: 'demo-agent',
      description: 'A simple demo agent for testing',
      system: `You are a helpful assistant. Keep responses concise.

You have access to these tools:
1. clientTestTool - A client-side tool that executes in the browser and returns example data. Use when asked to test tools or get client data.
2. getSystemStatus - Returns current system health status. Use when asked about system status.
3. displayNotification - Shows a notification to the user. Use when asked to show notifications or alerts.
4. showProductCard - Displays a rich product card UI. Use when the user asks about products or wants to see product details.

Use these tools when the user asks about them or requests related functionality.`,
    },
    model: {
      provider: 'google',
      name: 'gemini-2.5-flash',
      api: 'default',
      maxOutputTokens: 16000,
      reasoning: {
        enabled: true,
        effort: 'medium',
        includeThoughts: true,
      },
    },
    loop: {
      maxSteps: 5,
      toolChoice: 'auto',
    },
    tools: [
      // 1. NO-EXECUTION MODE: Runs on CLIENT (execution is null/undefined)
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
        execution: null, // no-execution → runs on client
      },
      // 2. STATIC MODE: Runs on SERVER (has execution config)
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
            services: {
              database: 'online',
              cache: 'online',
              api: 'online',
            },
            lastChecked: '2024-01-01T00:00:00Z',
            message: 'All systems operational',
          },
        },
      },
      // 3. PASS-THROUGH MODE: Runs on SERVER (has execution config)
      {
        name: 'displayNotification',
        description: 'Display a notification message to the user. The notification will be shown in the UI. Use when asked to show notifications, alerts, or messages.',
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
        execution: {
          mode: 'pass-through',
        },
      },
      // 4. NO-EXECUTION (client tool): Frontend renders a rich product card + user clicks to submit
      {
        name: 'showProductCard',
        description: 'Display a rich product card to the user. Use when the user asks about a product, wants to see product details, or when recommending products. The frontend renders a custom UI card for this tool.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Product name' },
            price: { type: 'number', description: 'Product price in USD' },
            description: { type: 'string', description: 'Short product description' },
            imageUrl: { type: 'string', description: 'URL to the product image (use a placeholder like https://picsum.photos/300/200 if unknown)' },
            rating: { type: 'number', description: 'Product rating from 1-5' },
            inStock: { type: 'boolean', description: 'Whether the product is in stock' },
          },
          required: ['name', 'price', 'description'],
        },
        executionType: 'basic',
        execution: {
          mode: 'no-execution',
        },
      },
    ],
  };

  const agent = await prisma.agent.upsert({
    where: { id: DEMO_AGENT_ID },
    update: { configJson: agentConfigJson },
    create: {
      id: DEMO_AGENT_ID,
      name: 'demo-agent',
      description: 'A simple demo agent for testing',
      configJson: agentConfigJson,
    },
  });
  console.log('✅ Agent created:', agent.name);

  // 2. Create human entity
  const humanEntity = await prisma.entity.upsert({
    where: { externalId: DEMO_USER_EXTERNAL_ID },
    update: {},
    create: {
      type: 'human',
      externalId: DEMO_USER_EXTERNAL_ID,
      displayName: 'Test User',
    },
  });
  console.log('✅ Human entity created:', humanEntity.displayName);

  // 3. Create agent entity (linked to agent)
  const agentEntity = await prisma.entity.upsert({
    where: { agentId: DEMO_AGENT_ID },
    update: {},
    create: {
      type: 'agent',
      agentId: DEMO_AGENT_ID,
      displayName: 'Demo Agent',
    },
  });
  console.log('✅ Agent entity created:', agentEntity.displayName);

  // 4. Create SmartSpace
  let smartSpace = await prisma.smartSpace.findFirst({
    where: { name: DEMO_SPACE_NAME },
  });

  if (!smartSpace) {
    smartSpace = await prisma.smartSpace.create({
      data: {
        name: DEMO_SPACE_NAME,
        description: 'A demo SmartSpace for testing the chat interface',
      },
    });
  }
  console.log('✅ SmartSpace created:', smartSpace.name);

  // 5. Add human to SmartSpace
  await prisma.smartSpaceMembership.upsert({
    where: {
      smartSpaceId_entityId: {
        smartSpaceId: smartSpace.id,
        entityId: humanEntity.id,
      },
    },
    update: {},
    create: {
      smartSpaceId: smartSpace.id,
      entityId: humanEntity.id,
      role: 'member',
    },
  });
  console.log('✅ Human added to SmartSpace');

  // 6. Add agent to SmartSpace
  await prisma.smartSpaceMembership.upsert({
    where: {
      smartSpaceId_entityId: {
        smartSpaceId: smartSpace.id,
        entityId: agentEntity.id,
      },
    },
    update: {},
    create: {
      smartSpaceId: smartSpace.id,
      entityId: agentEntity.id,
      role: 'assistant',
    },
  });
  console.log('✅ Agent added to SmartSpace');

  console.log('\n🎉 Seed complete!');
  console.log('\nDemo data:');
  console.log(`  Agent ID: ${agent.id}`);
  console.log(`  Human Entity ID: ${humanEntity.id}`);
  console.log(`  Agent Entity ID: ${agentEntity.id}`);
  console.log(`  SmartSpace ID: ${smartSpace.id}`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
