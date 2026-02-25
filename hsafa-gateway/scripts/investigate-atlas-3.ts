import { PrismaClient } from '../prisma/generated/client/index.js';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import Redis from 'ioredis';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

async function main() {
  // 1. Find Atlas agent + its entity
  const atlas = await prisma.agent.findUnique({ where: { name: 'Atlas' } });
  if (!atlas) { console.log('Atlas not found'); return; }

  const entity = await prisma.entity.findFirst({ where: { agentId: atlas.id } });
  if (!entity) { console.log('Atlas entity not found'); return; }
  const entityId = entity.id;

  console.log('Atlas agent ID:', atlas.id);
  console.log('Atlas entity ID:', entityId, '| name:', entity.displayName, '| type:', entity.type);

  // 3. Check tools in config
  const config = atlas.configJson as any;
  console.log('\nTools in config:', (config.tools || []).map((t: any) => t.name));

  // 4. Recent runs
  const runs = await prisma.run.findMany({
    where: { agentEntityId: entityId },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { id: true, status: true, cycleNumber: true, createdAt: true, triggerType: true, errorMessage: true },
  });
  console.log('\nRecent runs:');
  for (const r of runs) {
    console.log(`  cycle=${r.cycleNumber} status=${r.status} trigger=${r.triggerType} created=${r.createdAt.toISOString()} error=${r.errorMessage || 'none'}`);
  }

  // 5. Check inbox (Redis)
  const inboxKey = `inbox:${entityId}`;
  const inboxLen = await redis.llen(inboxKey);
  console.log('\nRedis inbox length:', inboxLen);
  if (inboxLen > 0) {
    const items = await redis.lrange(inboxKey, 0, 4);
    for (const item of items) {
      try {
        const parsed = JSON.parse(item);
        console.log('  event:', parsed.type, '| id:', parsed.eventId?.slice(0, 8));
      } catch { console.log('  raw:', item.slice(0, 100)); }
    }
  }

  // 6. Check wakeup key
  const wakeupKey = `wakeup:${entityId}`;
  const wakeupLen = await redis.llen(wakeupKey);
  console.log('Redis wakeup length:', wakeupLen);

  // 7. Check pending inbox events in Postgres
  const pendingEvents = await prisma.inboxEvent.count({
    where: { agentEntityId: entityId, status: 'pending' },
  });
  const processingEvents = await prisma.inboxEvent.count({
    where: { agentEntityId: entityId, status: 'processing' },
  });
  console.log('\nPostgres inbox: pending=', pendingEvents, 'processing=', processingEvents);

  // 8. Check consciousness
  const consciousness = await prisma.agentConsciousness.findUnique({
    where: { agentEntityId: entityId },
  });
  if (consciousness) {
    const msgs = (consciousness.messages as any[]) || [];
    console.log('\nConsciousness messages:', msgs.length);
    const last3 = msgs.slice(-3);
    for (const m of last3) {
      const content = typeof m.content === 'string' 
        ? m.content.slice(0, 150) 
        : JSON.stringify(m.content).slice(0, 150);
      console.log(`  [${m.role}] ${content}...`);
    }
  } else {
    console.log('\nNo consciousness found');
  }

  // 9. Check spaces Atlas is a member of
  const memberships = await prisma.smartSpaceMembership.findMany({
    where: { entityId },
    include: { smartSpace: { select: { id: true, name: true } } },
  });
  console.log('\nAtlas memberships:');
  for (const m of memberships) {
    console.log(`  space: ${m.smartSpace.name} (${m.smartSpace.id})`);
  }

  // 10. Check last few messages in spaces Atlas is in
  for (const m of memberships) {
    const msgs = await prisma.smartSpaceMessage.findMany({
      where: { smartSpaceId: m.smartSpaceId },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { entityId: true, role: true, content: true, createdAt: true },
    });
    console.log(`\nRecent messages in "${m.smartSpace.name}":`);
    for (const msg of msgs) {
      console.log(`  [${msg.role}] entity=${msg.entityId.slice(0, 8)}... content=${(msg.content || '').slice(0, 100)}`);
    }
  }

  await prisma.$disconnect();
  await pool.end();
  await redis.quit();
}

main().catch(console.error);
