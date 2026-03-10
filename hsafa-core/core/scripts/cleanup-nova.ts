#!/usr/bin/env tsx
// Quick cleanup script for Nova's stuck runs and inbox events
import { PrismaClient } from '../prisma/generated/client/index.js';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import Redis from 'ioredis';

const NOVA = 'd48c1574-9951-4040-9fee-1384ab76df1d';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

async function main() {
  // Clean stuck runs
  const runs = await prisma.run.updateMany({
    where: { haseefId: NOVA, status: 'running' },
    data: { status: 'failed', errorMessage: 'Cleaned up stuck run' },
  });
  console.log('Cleaned stuck runs:', runs.count);

  // Clean stuck inbox events
  const events = await prisma.inboxEvent.updateMany({
    where: { haseefId: NOVA, status: { in: ['processing', 'pending'] } },
    data: { status: 'processed', processedAt: new Date() },
  });
  console.log('Cleaned stuck events:', events.count);

  // Clear Redis inbox
  const deleted = await redis.del(`inbox:${NOVA}`);
  console.log('Redis inbox cleared:', deleted);

  // Clear consciousness so Nova starts fresh
  await prisma.haseefConsciousness.upsert({
    where: { haseefId: NOVA },
    update: { messages: [], cycleCount: 0 },
    create: { haseefId: NOVA, messages: [], cycleCount: 0 },
  });
  console.log('Consciousness reset');

  await prisma.$disconnect();
  redis.disconnect();
  console.log('Done ✓');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
