import { PrismaClient } from './generated/client/index.js';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  console.log('🌱 Seeding v3 agents...\n');

  // =========================================================================
  // Agent 1: Atlas — General-purpose assistant
  // =========================================================================
  const atlas = await prisma.haseef.upsert({
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
          maxTokens: 200000,
          minRecentCycles: 10,
          compactionStrategy: 'summarize',
        },
        loop: {},
        tools: [],
      },
    },
  });

  console.log(`  ✅ Atlas — ${atlas.id}`);

  // =========================================================================
  // Agent 2: Nova — Creative writer & brainstormer
  // =========================================================================
  const nova = await prisma.haseef.upsert({
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
          maxTokens: 200000,
          minRecentCycles: 10,
          compactionStrategy: 'summarize',
        },
        loop: {},
        tools: [],
      },
    },
  });

  console.log(`  ✅ Nova — ${nova.id}`);

  // =========================================================================
  // Agent 3: Sentinel — Code reviewer & technical advisor
  // =========================================================================
  const sentinel = await prisma.haseef.upsert({
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
          maxTokens: 200000,
          minRecentCycles: 10,
          compactionStrategy: 'summarize',
        },
        loop: {},
        tools: [],
      },
    },
  });

  console.log(`  ✅ Sentinel — ${sentinel.id}`);

  // =========================================================================
  // Summary
  // =========================================================================
  console.log('\n🎉 Seed complete! 3 Haseefs created:\n');
  console.log('  Name      | ID');
  console.log('  ----------|--------------------------------------');
  console.log(`  Atlas     | ${atlas.id}`);
  console.log(`  Nova      | ${nova.id}`);
  console.log(`  Sentinel  | ${sentinel.id}`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
