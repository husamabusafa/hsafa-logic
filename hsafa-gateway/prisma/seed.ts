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
If the user asks you to perform an action, do your best to help.`,
    tools: [],
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
