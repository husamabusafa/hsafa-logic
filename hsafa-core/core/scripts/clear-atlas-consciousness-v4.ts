/**
 * Clear Atlas's consciousness (v4 schema).
 * Run after updating extension tools so the next run uses fresh context.
 */
import { PrismaClient } from '../prisma/generated/client/index.js';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  const atlas = await prisma.haseef.findUnique({ where: { name: 'Atlas' } });
  if (!atlas) {
    console.error('Atlas not found');
    process.exit(1);
  }

  const deleted = await prisma.haseefConsciousness.deleteMany({
    where: { haseefId: atlas.id },
  });

  console.log(`Cleared consciousness for Atlas (${atlas.id}): ${deleted.count} record(s) deleted`);
  await prisma.$disconnect();
  await pool.end();
}

main().catch(console.error);
