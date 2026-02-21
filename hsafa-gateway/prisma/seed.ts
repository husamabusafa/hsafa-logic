import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Fixed IDs so re-runs are idempotent
const ASSISTANT_AGENT_ID = 'de1b221c-8549-43be-a6e3-b1e416405874';
const WRITER_AGENT_ID = 'a72f9c01-3e84-4b5a-9d12-6f8e0a4c71b3';

async function main() {
  console.log('🌱 Seeding v2 gateway database...');

  // ── Agent 1: General assistant ──────────────────────────────────────────
  const assistantConfig = {
    model: {
      provider: 'openai',
      model: 'gpt-4o-mini',
      maxTokens: 4096,
    },
    instructions: `You are a helpful assistant. Keep responses concise and friendly.
When asked a question, provide a clear and direct answer.
If the user asks you to perform an action, do your best to help.

You have the following tools:
- getCurrentWeather: Fetches live weather data for a city. Use it when the user asks about weather.
- confirmAction: Shows a confirmation dialog to the user. Use it when you need the user to explicitly approve or reject an action before proceeding (e.g. deleting something, making a purchase, sending an email). Always provide a clear title and message. Wait for the user's response before continuing.`,
    tools: [
      {
        name: 'getCurrentWeather',
        description: 'Get current weather conditions for a city. Returns temperature, humidity, wind, and conditions.',
        inputSchema: {
          type: 'object',
          properties: {
            city: { type: 'string', description: 'City name (e.g. "London", "New York", "Tokyo")' },
          },
          required: ['city'],
        },
        executionType: 'gateway',
        visible: true,
        execution: {
          url: 'https://wttr.in/{{input.city}}?format=j1',
          method: 'GET',
          timeout: 10000,
        },
      },
      {
        name: 'confirmAction',
        description: 'Ask the user to confirm or reject an action. The run pauses until the user responds. Use for any destructive or irreversible actions.',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Short title of the action requiring confirmation' },
            message: { type: 'string', description: 'Detailed description of what will happen if confirmed' },
            confirmLabel: { type: 'string', description: 'Label for the confirm button (default: "Confirm")' },
            rejectLabel: { type: 'string', description: 'Label for the reject button (default: "Cancel")' },
          },
          required: ['title', 'message'],
        },
        executionType: 'space',
        visible: true,
        display: { customUI: 'confirmAction' },
      },
    ],
  };

  const assistant = await prisma.agent.upsert({
    where: { id: ASSISTANT_AGENT_ID },
    update: { configJson: assistantConfig },
    create: {
      id: ASSISTANT_AGENT_ID,
      name: 'hsafa-assistant',
      description: 'Default assistant agent for testing',
      configJson: assistantConfig,
    },
  });
  console.log('✅ Agent created:', assistant.name, '(id:', assistant.id, ')');

  const assistantEntity = await prisma.entity.upsert({
    where: { agentId: ASSISTANT_AGENT_ID },
    update: {},
    create: {
      type: 'agent',
      agentId: ASSISTANT_AGENT_ID,
      externalId: `agent:${assistant.name}`,
      displayName: 'Hsafa Assistant',
    },
  });
  console.log('✅ Entity created:', assistantEntity.displayName, '(id:', assistantEntity.id, ')');

  // ── Agent 2: Creative writer ────────────────────────────────────────────
  const writerConfig = {
    model: {
      provider: 'openai',
      model: 'gpt-4o-mini',
      maxTokens: 4096,
    },
    instructions: `You are a creative writer agent. You specialize in storytelling, poetry, and creative content.
When asked to write, produce vivid and engaging prose.
You can collaborate with other agents — if someone asks you for creative input, deliver it enthusiastically.`,
    tools: [],
  };

  const writer = await prisma.agent.upsert({
    where: { id: WRITER_AGENT_ID },
    update: { configJson: writerConfig },
    create: {
      id: WRITER_AGENT_ID,
      name: 'creative-writer',
      description: 'Creative writing agent for testing multi-agent flows',
      configJson: writerConfig,
    },
  });
  console.log('✅ Agent created:', writer.name, '(id:', writer.id, ')');

  const writerEntity = await prisma.entity.upsert({
    where: { agentId: WRITER_AGENT_ID },
    update: {},
    create: {
      type: 'agent',
      agentId: WRITER_AGENT_ID,
      externalId: `agent:${writer.name}`,
      displayName: 'Creative Writer',
    },
  });
  console.log('✅ Entity created:', writerEntity.displayName, '(id:', writerEntity.id, ')');

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log('\n🎉 Seed complete!');
  console.log('\nAgents:');
  console.log(`  1. ${assistant.name}  — Agent ${assistant.id} / Entity ${assistantEntity.id}`);
  console.log(`  2. ${writer.name}  — Agent ${writer.id} / Entity ${writerEntity.id}`);
  console.log('\nThe use-case-app register flow will create human entities and spaces automatically.');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
