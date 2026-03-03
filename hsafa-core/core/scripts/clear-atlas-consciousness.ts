import { PrismaClient } from '../prisma/generated/client/index.js';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  const atlas = await prisma.agent.findUnique({ where: { name: 'Atlas' } });
  if (!atlas) { console.error('Atlas not found'); process.exit(1); }

  const entity = await prisma.entity.findFirst({ where: { agentId: atlas.id } });
  if (!entity) { console.error('Atlas entity not found'); process.exit(1); }

  const deleted = await prisma.agentConsciousness.deleteMany({
    where: { agentEntityId: entity.id },
  });

  console.log(`Cleared consciousness for Atlas (${entity.id}): ${deleted.count} record(s) deleted`);
  await prisma.$disconnect();
  await pool.end();
}

main().catch(console.error);
