import { PrismaClient } from './generated/client/index.js';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import 'dotenv/config';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  console.log('🌱 Seeding spaces-app...\n');

  // 1. Create AI agent entity
  const agent = await prisma.entity.upsert({
    where: { externalId: 'haseef-atlas' },
    update: { displayName: 'Atlas' },
    create: {
      id: crypto.randomUUID(),
      type: 'agent',
      externalId: 'haseef-atlas',
      displayName: 'Atlas',
      metadata: { role: 'personal-assistant' },
    },
  });
  console.log(`✅ Agent entity: ${agent.displayName} (${agent.id})`);

  // 2. Create test human entity
  const human = await prisma.entity.upsert({
    where: { externalId: 'user-husam' },
    update: { displayName: 'Husam' },
    create: {
      id: crypto.randomUUID(),
      type: 'human',
      externalId: 'user-husam',
      displayName: 'Husam',
      metadata: { email: 'husam@test.com' },
    },
  });
  console.log(`✅ Human entity: ${human.displayName} (${human.id})`);

  // 3. Create a space
  const space = await prisma.smartSpace.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: { name: 'Husam & Atlas' },
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Husam & Atlas',
      description: 'Personal space between Husam and Atlas',
    },
  });
  console.log(`✅ Space: "${space.name}" (${space.id})`);

  // 4. Add both as members
  await prisma.smartSpaceMembership.upsert({
    where: {
      smartSpaceId_entityId: { smartSpaceId: space.id, entityId: human.id },
    },
    update: {},
    create: { smartSpaceId: space.id, entityId: human.id, role: 'owner' },
  });
  await prisma.smartSpaceMembership.upsert({
    where: {
      smartSpaceId_entityId: { smartSpaceId: space.id, entityId: agent.id },
    },
    update: {},
    create: { smartSpaceId: space.id, entityId: agent.id, role: 'assistant' },
  });
  console.log(`✅ Memberships: Husam (owner) + Atlas (assistant)`);

  // 5. Create a client for the human (for testing API calls)
  const client = await prisma.client.upsert({
    where: { clientKey: 'ck_husam_web' },
    update: { lastSeenAt: new Date() },
    create: {
      entityId: human.id,
      clientKey: 'ck_husam_web',
      clientType: 'web',
      displayName: 'Husam Web Client',
      capabilities: { streaming: true },
    },
  });
  console.log(`✅ Client: ${client.displayName} (key: ${client.clientKey})`);

  console.log('\n🎉 Seed complete!\n');
  console.log('Test with:');
  console.log(`  Human entity ID:  ${human.id}`);
  console.log(`  Agent entity ID:  ${agent.id}`);
  console.log(`  Space ID:         ${space.id}`);
  console.log(`  Secret key:       dev_spaces_secret_key`);
  console.log(`\nExample API calls:`);
  console.log(`  curl http://localhost:3002/health`);
  console.log(`  curl -H "x-secret-key: dev_spaces_secret_key" http://localhost:3002/api/entities`);
  console.log(`  curl -H "x-secret-key: dev_spaces_secret_key" http://localhost:3002/api/smart-spaces/${space.id}/messages`);
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
