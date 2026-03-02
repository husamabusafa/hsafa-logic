import { PrismaClient } from '../prisma/generated/client/index.js';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  const entityId = process.argv[2] || '889ff57f-35c2-4bc2-9bfb-d73ef01d1ce0';
  await prisma.agentConsciousness.upsert({
    where: { agentEntityId: entityId },
    update: { messages: [], cycleCount: 0 },
    create: { agentEntityId: entityId, messages: [], cycleCount: 0 },
  });
  console.log(`Consciousness cleared for ${entityId}`);
  await prisma.$disconnect();
  await pool.end();
}

main().catch(console.error);
