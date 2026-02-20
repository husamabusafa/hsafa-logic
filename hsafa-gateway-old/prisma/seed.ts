import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_AGENT_ID = 'de1b221c-8549-43be-a6e3-b1e416405874';
const SECOND_AGENT_ID = 'a7f3c92d-1234-4abc-9def-567890abcdef';
const DEMO_USER_EXTERNAL_ID = 'test-user-1';
const DEMO_SPACE_NAME = 'Demo SmartSpace';

async function main() {
  console.log('🌱 Seeding database...');

  // 1. Create demo agent
  const agentConfigJson = {
    version: '1.0',
    agent: {
      name: 'demo-agent',
      description: 'A demo agent with MCP, request, and image generation tools',
      system: `You are a helpful assistant. Keep responses concise.

You have access to these tools:
1. MCP tools from the Hsafa MCP server — use whatever tools are available from the server.
2. fetchTodo — Fetches a todo item from an external API by ID. Use when asked about todos or tasks.
3. generateImage — Generates images from text descriptions using AI. Use when asked to create, draw, or generate any image.

Use these tools when the user asks about them or requests related functionality.`,
    },
    model: {
      provider: 'openai',
      name: 'gpt-5.2',
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
      // 1. REQUEST TOOL: Fetches data from an external REST API
      {
        name: 'fetchTodo',
        description: 'Fetch a todo item from the JSONPlaceholder API. Use when the user asks about a todo, task, or wants to look up a todo by ID.',
        inputSchema: {
          type: 'object',
          properties: {
            todoId: { type: 'number', description: 'The todo ID to fetch (1-200)' },
          },
          required: ['todoId'],
        },
        executionType: 'request',
        execution: {
          url: 'https://jsonplaceholder.typicode.com/todos/{{todoId}}',
          method: 'GET',
        },
      },
      // 2. IMAGE GENERATOR TOOL: Generates images via OpenRouter (Gemini)
      {
        name: 'generateImage',
        description: 'Generate an image from a text description. Use when the user asks to create, draw, or generate any image or visual.',
        executionType: 'image-generator',
        execution: {
          provider: 'openrouter',
          model: 'google/gemini-3-pro-image-preview',
        },
      },
    ],
    // 3. MCP TOOLS: Loaded dynamically from the Hsafa MCP server
    mcp: {
      servers: [
        {
          name: 'hsafa-mcp',
          url: 'https://mcp.hsafa.com/metamcp/hsafa-endpoint/sse',
          transport: 'sse',
        },
      ],
    },
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

  // 2. Create second agent
  const secondAgentConfig = {
    version: '1.0',
    agent: {
      name: 'research-agent',
      description: 'A research assistant that helps find and summarize information',
      system: `You are a research assistant. You help users find information, summarize topics, and answer questions thoroughly. Keep responses well-structured and informative.`,
    },
    model: {
      provider: 'openai',
      name: 'gpt-5.2',
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
    tools: [],
  };

  const secondAgent = await prisma.agent.upsert({
    where: { id: SECOND_AGENT_ID },
    update: { configJson: secondAgentConfig },
    create: {
      id: SECOND_AGENT_ID,
      name: 'research-agent',
      description: 'A research assistant that helps find and summarize information',
      configJson: secondAgentConfig,
    },
  });
  console.log('✅ Second agent created:', secondAgent.name);

  // 3. Create/update human entity
  const humanEntity = await prisma.entity.upsert({
    where: { externalId: DEMO_USER_EXTERNAL_ID },
    update: { displayName: 'حسام' },
    create: {
      type: 'human',
      externalId: DEMO_USER_EXTERNAL_ID,
      displayName: 'حسام',
    },
  });
  console.log('✅ Human entity:', humanEntity.displayName, '(id:', humanEntity.id, ')');

  // 4. Create agent entity for demo-agent
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

  // 5. Create agent entity for research-agent
  const secondAgentEntity = await prisma.entity.upsert({
    where: { agentId: SECOND_AGENT_ID },
    update: {},
    create: {
      type: 'agent',
      agentId: SECOND_AGENT_ID,
      displayName: 'Research Agent',
    },
  });
  console.log('✅ Second agent entity created:', secondAgentEntity.displayName);

  // 6. Create SmartSpace
  let smartSpace = await prisma.smartSpace.findFirst({
    where: { name: DEMO_SPACE_NAME },
  });

  if (!smartSpace) {
    smartSpace = await prisma.smartSpace.create({
      data: {
        name: DEMO_SPACE_NAME,
        description: 'A demo SmartSpace for testing the chat interface',
        adminAgentEntityId: agentEntity.id,
      },
    });
  } else if (!smartSpace.adminAgentEntityId) {
    smartSpace = await prisma.smartSpace.update({
      where: { id: smartSpace.id },
      data: { adminAgentEntityId: agentEntity.id },
    });
  }
  console.log('✅ SmartSpace created:', smartSpace.name, '(admin:', agentEntity.displayName, ')');

  // 7. Add human to SmartSpace
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

  // 8. Add demo-agent to SmartSpace
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
  console.log('✅ Demo Agent added to SmartSpace');

  // 9. Add research-agent to SmartSpace
  await prisma.smartSpaceMembership.upsert({
    where: {
      smartSpaceId_entityId: {
        smartSpaceId: smartSpace.id,
        entityId: secondAgentEntity.id,
      },
    },
    update: {},
    create: {
      smartSpaceId: smartSpace.id,
      entityId: secondAgentEntity.id,
      role: 'assistant',
    },
  });
  console.log('✅ Research Agent added to SmartSpace');

  console.log('\n🎉 Seed complete!');
  console.log('\nDemo data:');
  console.log(`  Agent ID: ${agent.id}`);
  console.log(`  Human Entity ID: ${humanEntity.id}`);
  console.log(`  Agent Entity ID: ${agentEntity.id}`);
  console.log(`  Second Agent ID: ${secondAgent.id}`);
  console.log(`  Second Agent Entity ID: ${secondAgentEntity.id}`);
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
