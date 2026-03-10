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
  // Agent 2: Nova — Speaker haseef (text deltas = spoken output)
  // =========================================================================
  const nova = await prisma.haseef.upsert({
    where: { name: 'Nova' },
    update: {},
    create: {
      name: 'Nova',
      description: 'A conversational speaker haseef. Her text output is streamed as speech to the user via TTS.',
      configJson: {
        version: '3',
        model: {
          provider: 'anthropic',
          model: 'claude-sonnet-4-20250514',
        },
        instructions: [
          'You are Nova, a warm and expressive conversational assistant.',
          'IMPORTANT: Your text output is directly spoken aloud to the user via text-to-speech.',
          'This means everything you write will be heard, not read.',
          '',
          'Speaking rules:',
          '- Write naturally as if speaking — use conversational language.',
          '- Keep responses concise and clear (1-3 sentences usually).',
          '- Do NOT use markdown, bullet points, code blocks, or formatting.',
          '- Do NOT use emojis or special characters.',
          '- Avoid long lists or structured output — speak in flowing sentences.',
          '- Use punctuation naturally to create good speech rhythm.',
          '',
          'You receive messages from users as events. Respond conversationally.',
          'Use tools when you need to perform actions, but your spoken text is your primary way of communicating with the user.',
        ].join('\n'),
        consciousness: {
          maxTokens: 100000,
          minRecentCycles: 5,
          compactionStrategy: 'summarize',
        },
        loop: {},
        tools: [],
      },
    },
  });

  console.log(`  ✅ Nova  — ${nova.id}`);

  // =========================================================================
  // Summary
  // =========================================================================
  console.log('\n🎉 Seed complete!\n');
  console.log('  Name      | ID');
  console.log('  ----------|--------------------------------------');
  console.log(`  Atlas     | ${atlas.id}`);
  console.log(`  Nova      | ${nova.id}`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
