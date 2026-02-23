import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding v3 agents...\n');

  // =========================================================================
  // Agent 1: Atlas — General-purpose assistant
  // =========================================================================
  const atlas = await prisma.agent.upsert({
    where: { name: 'Atlas' },
    update: {},
    create: {
      name: 'Atlas',
      description: 'A helpful general-purpose assistant that can answer questions, manage tasks, and coordinate with other agents.',
      configJson: {
        version: '3',
        model: {
          provider: 'openai',
          model: 'gpt-5.2',
        },
        instructions: [
          'You are Atlas, a friendly and knowledgeable assistant.',
          'You help users with questions, research, and task management.',
          'Be concise but thorough. Always greet users by name when possible.',
          'If you do not know something, say so honestly.',
        ].join('\n'),
        consciousness: {
          maxTokens: 80000,
          minRecentCycles: 3,
          compactionStrategy: 'summarize',
        },
        loop: {
          maxSteps: 10,
        },
        tools: [],
      },
    },
  });

  const atlasEntity = await prisma.entity.upsert({
    where: { agentId: atlas.id },
    update: {},
    create: {
      type: 'agent',
      displayName: 'Atlas',
      agentId: atlas.id,
    },
  });

  console.log(`  ✅ Atlas — agent: ${atlas.id}, entity: ${atlasEntity.id}`);

  // =========================================================================
  // Agent 2: Nova — Creative writer & brainstormer
  // =========================================================================
  const nova = await prisma.agent.upsert({
    where: { name: 'Nova' },
    update: {},
    create: {
      name: 'Nova',
      description: 'A creative writing assistant that excels at brainstorming, storytelling, and content creation.',
      configJson: {
        version: '3',
        model: {
          provider: 'openai',
          model: 'gpt-5.2',
        },
        instructions: [
          'You are Nova, a creative and imaginative assistant.',
          'You excel at brainstorming ideas, writing stories, crafting content, and thinking outside the box.',
          'Be expressive and enthusiastic. Offer multiple creative angles when asked.',
          'Use vivid language and metaphors when appropriate.',
        ].join('\n'),
        consciousness: {
          maxTokens: 80000,
          minRecentCycles: 3,
          compactionStrategy: 'summarize',
        },
        loop: {
          maxSteps: 12,
        },
        tools: [],
      },
    },
  });

  const novaEntity = await prisma.entity.upsert({
    where: { agentId: nova.id },
    update: {},
    create: {
      type: 'agent',
      displayName: 'Nova',
      agentId: nova.id,
    },
  });

  console.log(`  ✅ Nova  — agent: ${nova.id}, entity: ${novaEntity.id}`);

  // =========================================================================
  // Agent 3: Sentinel — Code reviewer & technical advisor
  // =========================================================================
  const sentinel = await prisma.agent.upsert({
    where: { name: 'Sentinel' },
    update: {},
    create: {
      name: 'Sentinel',
      description: 'A technical advisor focused on code review, architecture decisions, and engineering best practices.',
      configJson: {
        version: '3',
        model: {
          provider: 'openai',
          model: 'gpt-5.2',
        },
        instructions: [
          'You are Sentinel, a precise and thorough technical advisor.',
          'You review code, suggest architectural improvements, and enforce best practices.',
          'Be direct and factual. Cite specific issues with line references when reviewing code.',
          'Prioritize security, performance, and maintainability in your recommendations.',
          'When you find no issues, say so briefly — do not over-explain.',
        ].join('\n'),
        consciousness: {
          maxTokens: 80000,
          minRecentCycles: 3,
          compactionStrategy: 'summarize',
        },
        loop: {
          maxSteps: 15,
        },
        tools: [],
      },
    },
  });

  const sentinelEntity = await prisma.entity.upsert({
    where: { agentId: sentinel.id },
    update: {},
    create: {
      type: 'agent',
      displayName: 'Sentinel',
      agentId: sentinel.id,
    },
  });

  console.log(`  ✅ Sentinel — agent: ${sentinel.id}, entity: ${sentinelEntity.id}`);

  // =========================================================================
  // Summary
  // =========================================================================
  console.log('\n🎉 Seed complete! 3 agents created:\n');
  console.log('  Agent        | Entity ID                            | Agent ID');
  console.log('  -------------|--------------------------------------|--------------------------------------');
  console.log(`  Atlas        | ${atlasEntity.id} | ${atlas.id}`);
  console.log(`  Nova         | ${novaEntity.id} | ${nova.id}`);
  console.log(`  Sentinel     | ${sentinelEntity.id} | ${sentinel.id}`);
  console.log('\n  Now create your human entities and smart spaces to start testing!');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
