import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_AGENT_ID = 'de1b221c-8549-43be-a6e3-b1e416405874';

async function main() {
  console.log('🌱 Creating test space with Husam, Ahmad, and Demo Agent...\n');

  // Look up existing entities
  const husam = await prisma.entity.findUnique({ where: { id: '586bd371-c70c-40d4-92be-65e9527737e8' } });
  const ahmad = await prisma.entity.findUnique({ where: { externalId: 'cmlmhdueh0004125srbmulm8d' } });
  const demoEntity = await prisma.entity.findUnique({ where: { agentId: DEMO_AGENT_ID } });

  if (!husam) throw new Error('Husam entity not found (externalId: test-user-1)');
  if (!ahmad) throw new Error('Ahmad entity not found (externalId: employee-ahmed)');
  if (!demoEntity) throw new Error('Demo Agent entity not found');

  console.log(`  Husam:      ${husam.id} (${husam.displayName})`);
  console.log(`  Ahmad:      ${ahmad.id} (${ahmad.displayName})`);
  console.log(`  Demo Agent: ${demoEntity.id} (${demoEntity.displayName})\n`);

  // Create space
  const SPACE_NAME = 'Husam & Ahmad Test Space';
  let space = await prisma.smartSpace.findFirst({ where: { name: SPACE_NAME } });

  if (space) {
    console.log('Space already exists, cleaning...');
    await prisma.smartSpaceMessage.deleteMany({ where: { smartSpaceId: space.id } });
    await prisma.run.deleteMany({ where: { smartSpaceId: space.id } });
    await prisma.smartSpaceMembership.deleteMany({ where: { smartSpaceId: space.id } });
  } else {
    space = await prisma.smartSpace.create({
      data: {
        name: SPACE_NAME,
        description: 'Test space for Husam, Ahmad, and Demo Agent',
        adminAgentEntityId: demoEntity.id,
      },
    });
  }
  console.log(`✅ Space: ${space.name} (${space.id})`);

  // Add members
  const members = [
    { entityId: husam.id, role: 'member', label: husam.displayName },
    { entityId: ahmad.id, role: 'member', label: ahmad.displayName },
    { entityId: demoEntity.id, role: 'assistant', label: demoEntity.displayName },
  ];

  for (const m of members) {
    await prisma.smartSpaceMembership.upsert({
      where: { smartSpaceId_entityId: { smartSpaceId: space.id, entityId: m.entityId } },
      update: {},
      create: { smartSpaceId: space.id, entityId: m.entityId, role: m.role },
    });
    console.log(`   ✅ ${m.label} added`);
  }

  console.log('\n🎉 Done!');
  console.log(`  Space ID: ${space.id}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
