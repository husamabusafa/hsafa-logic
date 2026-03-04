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
  // Summary
  // =========================================================================
  console.log('\n🎉 Seed complete!\n');
  console.log('  Name      | ID');
  console.log('  ----------|--------------------------------------');
  console.log(`  Atlas     | ${atlas.id}`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
