import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Existing entities
const HUSAM_ENTITY_ID = '4d0b1ee3-62f2-46dc-8c0c-432de2d84281';
const AHMAD_ENTITY_ID = 'ebe1583d-8417-4136-8db4-f108741f98bc';
const ASSISTANT_ENTITY_ID = '5be70606-9db0-4c4f-861f-621e5786649c'; // Hsafa Assistant (demo-agent)

async function main() {
  console.log('🌱 Seeding spaces...\n');

  // ═══════════════════════════════════════════════════════════════════════════
  // SPACE 1: Shared space — 2 humans + 1 agent
  // ═══════════════════════════════════════════════════════════════════════════

  const SHARED_SPACE_NAME = 'Team Chat';

  let sharedSpace = await prisma.smartSpace.findFirst({ where: { name: SHARED_SPACE_NAME } });
  if (sharedSpace) {
    await prisma.smartSpaceMessage.deleteMany({ where: { smartSpaceId: sharedSpace.id } });
    await prisma.run.deleteMany({ where: { smartSpaceId: sharedSpace.id } });
    await prisma.smartSpaceMembership.deleteMany({ where: { smartSpaceId: sharedSpace.id } });
    console.log('🧹 Cleaned existing shared space');
  } else {
    sharedSpace = await prisma.smartSpace.create({
      data: {
        name: SHARED_SPACE_NAME,
        description: 'Shared space with 2 humans and 1 agent',
        adminAgentEntityId: ASSISTANT_ENTITY_ID,
      },
    });
  }

  const sharedMembers = [
    { entityId: HUSAM_ENTITY_ID, role: 'member', label: 'husam abusafa (human)' },
    { entityId: AHMAD_ENTITY_ID, role: 'member', label: 'ahmad abduallah (human)' },
    { entityId: ASSISTANT_ENTITY_ID, role: 'assistant', label: 'Hsafa Assistant (agent)' },
  ];

  for (const m of sharedMembers) {
    await prisma.smartSpaceMembership.upsert({
      where: { smartSpaceId_entityId: { smartSpaceId: sharedSpace.id, entityId: m.entityId } },
      update: {},
      create: { smartSpaceId: sharedSpace.id, entityId: m.entityId, role: m.role },
    });
  }

  console.log(`✅ "${SHARED_SPACE_NAME}" created: ${sharedSpace.id}`);
  for (const m of sharedMembers) console.log(`   - ${m.label}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // SPACE 2: Multi-agent space — 3 agents + 1 human
  // ═══════════════════════════════════════════════════════════════════════════

  // Create 2 new agents (reuse Hsafa Assistant as the 3rd)

  const coderConfig = {
    version: '1.0',
    agent: {
      name: 'coder-agent',
      description: 'A coding assistant that writes and reviews code',
      system: `You are Coder, a coding assistant. You write clean, well-structured code and review code for bugs and improvements. You specialize in TypeScript, Python, and system design. Keep responses focused and technical.`,
    },
    model: {
      provider: 'openai',
      name: 'gpt-5.2',
      api: 'default',
      maxOutputTokens: 16000,
      reasoning: { enabled: true, effort: 'medium', includeThoughts: true },
    },
    loop: { maxSteps: 5, toolChoice: 'auto' },
    tools: [],
  };

  const coderAgent = await prisma.agent.upsert({
    where: { name: 'coder-agent' },
    update: { configJson: coderConfig },
    create: {
      name: 'coder-agent',
      description: 'A coding assistant that writes and reviews code',
      configJson: coderConfig,
    },
  });

  const coderEntity = await prisma.entity.upsert({
    where: { agentId: coderAgent.id },
    update: { displayName: 'Coder Agent' },
    create: {
      type: 'agent',
      agentId: coderAgent.id,
      displayName: 'Coder Agent',
    },
  });
  console.log(`\n✅ Coder Agent: ${coderAgent.name} → entity ${coderEntity.id}`);

  const researchConfig = {
    version: '1.0',
    agent: {
      name: 'research-agent',
      description: 'A research assistant that finds and synthesizes information',
      system: `You are Researcher, a research assistant. You find, analyze, and synthesize information on any topic. You provide well-sourced, balanced perspectives and can dive deep into technical subjects. Be thorough but concise.`,
    },
    model: {
      provider: 'openai',
      name: 'gpt-5.2',
      api: 'default',
      maxOutputTokens: 16000,
      reasoning: { enabled: true, effort: 'medium', includeThoughts: true },
    },
    loop: { maxSteps: 5, toolChoice: 'auto' },
    tools: [],
  };

  const researchAgent = await prisma.agent.upsert({
    where: { name: 'research-agent' },
    update: { configJson: researchConfig },
    create: {
      name: 'research-agent',
      description: 'A research assistant that finds and synthesizes information',
      configJson: researchConfig,
    },
  });

  // research-agent may not have an entity yet — create one
  let researchEntity = await prisma.entity.findUnique({ where: { agentId: researchAgent.id } });
  if (!researchEntity) {
    researchEntity = await prisma.entity.create({
      data: {
        type: 'agent',
        agentId: researchAgent.id,
        displayName: 'Research Agent',
      },
    });
  }
  console.log(`✅ Research Agent: ${researchAgent.name} → entity ${researchEntity.id}`);

  // Create the multi-agent space
  const MULTI_AGENT_SPACE_NAME = 'Agent Team';

  let multiSpace = await prisma.smartSpace.findFirst({ where: { name: MULTI_AGENT_SPACE_NAME } });
  if (multiSpace) {
    await prisma.smartSpaceMessage.deleteMany({ where: { smartSpaceId: multiSpace.id } });
    await prisma.run.deleteMany({ where: { smartSpaceId: multiSpace.id } });
    await prisma.smartSpaceMembership.deleteMany({ where: { smartSpaceId: multiSpace.id } });
    console.log('🧹 Cleaned existing multi-agent space');
  } else {
    multiSpace = await prisma.smartSpace.create({
      data: {
        name: MULTI_AGENT_SPACE_NAME,
        description: '3 agents + 1 human for multi-agent collaboration',
        adminAgentEntityId: ASSISTANT_ENTITY_ID,
      },
    });
  }

  const multiMembers = [
    { entityId: HUSAM_ENTITY_ID, role: 'member', label: 'husam abusafa (human)' },
    { entityId: ASSISTANT_ENTITY_ID, role: 'assistant', label: 'Hsafa Assistant (admin agent)' },
    { entityId: coderEntity.id, role: 'assistant', label: 'Coder Agent' },
    { entityId: researchEntity.id, role: 'assistant', label: 'Research Agent' },
  ];

  for (const m of multiMembers) {
    await prisma.smartSpaceMembership.upsert({
      where: { smartSpaceId_entityId: { smartSpaceId: multiSpace.id, entityId: m.entityId } },
      update: {},
      create: { smartSpaceId: multiSpace.id, entityId: m.entityId, role: m.role },
    });
  }

  console.log(`\n✅ "${MULTI_AGENT_SPACE_NAME}" created: ${multiSpace.id}`);
  for (const m of multiMembers) console.log(`   - ${m.label}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('\n══════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('══════════════════════════════════════════');
  console.log(`\n1. "${SHARED_SPACE_NAME}" (${sharedSpace.id})`);
  console.log('   2 humans + 1 agent (admin: Hsafa Assistant)');
  console.log(`\n2. "${MULTI_AGENT_SPACE_NAME}" (${multiSpace.id})`);
  console.log('   1 human + 3 agents (admin: Hsafa Assistant)');
  console.log('\n🎉 Done!');
}

main()
  .catch((e) => { console.error('❌ Failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
