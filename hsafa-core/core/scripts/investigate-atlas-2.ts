import { PrismaClient } from '../prisma/generated/client/index.js';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

async function investigate() {
  // 1. Check messages in ALL Ahmad spaces
  const ahmadSpaces = await prisma.smartSpace.findMany({
    where: { name: { contains: 'ahmad', mode: 'insensitive' } },
  });

  for (const space of ahmadSpaces) {
    console.log(`\n=== SPACE: "${space.name}" [${space.id}] ===`);
    const msgs = await prisma.smartSpaceMessage.findMany({
      where: { smartSpaceId: space.id },
      orderBy: { seq: 'asc' },
      include: { entity: { select: { displayName: true, type: true } } },
    });
    console.log(`  Message count: ${msgs.length}`);
    for (const m of msgs) {
      console.log(`  [seq=${m.seq}] ${m.entity.displayName} (${m.entity.type}): "${(m.content ?? '').slice(0, 200)}"`);
    }
  }

  // 2. Dump raw consciousness for Atlas messages 176-190 (the Ahmad demo cycle)
  const atlas = await prisma.entity.findFirst({
    where: { displayName: { contains: 'Atlas', mode: 'insensitive' } },
  });
  if (!atlas) { console.log('No Atlas entity'); return; }

  const consciousness = await prisma.agentConsciousness.findUnique({
    where: { agentEntityId: atlas.id },
  });
  if (!consciousness) { console.log('No consciousness'); return; }

  const msgs = consciousness.messages as any[];
  console.log(`\n=== ATLAS CONSCIOUSNESS RAW (messages 176-190) ===`);
  for (let i = 176; i < Math.min(191, msgs.length); i++) {
    const msg = msgs[i];
    console.log(`\n--- [${i}] role=${msg.role} ---`);
    console.log(JSON.stringify(msg.content, null, 2)?.slice(0, 600));
  }

  await prisma.$disconnect();
  await pool.end();
}

investigate().catch(console.error);
