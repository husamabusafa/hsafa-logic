import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const HUSAM_ENTITY_ID = '7d50af1b-5516-4dd1-84b8-3db254011976';

// Existing agents
const DEMO_AGENT_ID = 'de1b221c-8549-43be-a6e3-b1e416405874';
const RESEARCH_AGENT_ID = 'a7f3c92d-1234-4abc-9def-567890abcdef';

// New agents
const CODER_AGENT_ID = 'b8e2a41f-5678-4def-abcd-1234567890ab';
const PLANNER_AGENT_ID = 'c9f3b52e-6789-4eab-bcde-2345678901cd';

async function main() {
  console.log('🌱 Creating 4-agent test space...\n');

  // ── 1. Create Coder Agent ─────────────────────────────────────────────
  const coderConfig = {
    version: '1.0',
    agent: {
      name: 'coder-agent',
      description: 'A coding assistant that writes and reviews code',
      system: `You are a coding assistant. You write clean, well-structured code and review code for bugs and improvements. You specialize in TypeScript, Python, and system design. Keep responses focused and technical.`,
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
    where: { id: CODER_AGENT_ID },
    update: { configJson: coderConfig },
    create: {
      id: CODER_AGENT_ID,
      name: 'coder-agent',
      description: 'A coding assistant that writes and reviews code',
      configJson: coderConfig,
    },
  });
  console.log('✅ Coder Agent created:', coderAgent.name);

  const coderEntity = await prisma.entity.upsert({
    where: { agentId: CODER_AGENT_ID },
    update: { displayName: 'Coder Agent' },
    create: {
      type: 'agent',
      agentId: CODER_AGENT_ID,
      displayName: 'Coder Agent',
    },
  });
  console.log('   Entity:', coderEntity.id);

  // ── 2. Create Planner Agent ───────────────────────────────────────────
  const plannerConfig = {
    version: '1.0',
    agent: {
      name: 'planner-agent',
      description: 'A project planning and task management assistant',
      system: `You are a project planner and task management assistant. You help break down complex projects into actionable steps, create timelines, identify dependencies, and track progress. You think in terms of milestones, deliverables, and priorities. Keep your plans structured and actionable.`,
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

  const plannerAgent = await prisma.agent.upsert({
    where: { id: PLANNER_AGENT_ID },
    update: { configJson: plannerConfig },
    create: {
      id: PLANNER_AGENT_ID,
      name: 'planner-agent',
      description: 'A project planning and task management assistant',
      configJson: plannerConfig,
    },
  });
  console.log('✅ Planner Agent created:', plannerAgent.name);

  const plannerEntity = await prisma.entity.upsert({
    where: { agentId: PLANNER_AGENT_ID },
    update: { displayName: 'Planner Agent' },
    create: {
      type: 'agent',
      agentId: PLANNER_AGENT_ID,
      displayName: 'Planner Agent',
    },
  });
  console.log('   Entity:', plannerEntity.id);

  // ── 3. Look up existing agent entities ────────────────────────────────
  const demoEntity = await prisma.entity.findUnique({ where: { agentId: DEMO_AGENT_ID } });
  const researchEntity = await prisma.entity.findUnique({ where: { agentId: RESEARCH_AGENT_ID } });

  if (!demoEntity || !researchEntity) {
    throw new Error('Demo Agent or Research Agent entity not found. Run the main seed first.');
  }

  // ── 4. Create the test space ──────────────────────────────────────────
  const SPACE_NAME = 'Mention Chain Test Space';

  let space = await prisma.smartSpace.findFirst({ where: { name: SPACE_NAME } });
  if (space) {
    // Clean existing messages and runs
    await prisma.smartSpaceMessage.deleteMany({ where: { smartSpaceId: space.id } });
    await prisma.run.deleteMany({ where: { smartSpaceId: space.id } });
    await prisma.smartSpaceMembership.deleteMany({ where: { smartSpaceId: space.id } });
    console.log('\n🧹 Cleaned existing space data');
  } else {
    space = await prisma.smartSpace.create({
      data: { name: SPACE_NAME, description: '4-agent space for testing mention chain' },
    });
  }
  console.log('✅ Space:', space.name, `(${space.id})`);

  // ── 5. Add all 5 members ─────────────────────────────────────────────
  const members = [
    { entityId: HUSAM_ENTITY_ID, role: 'member', label: 'حسام (human)' },
    { entityId: demoEntity.id, role: 'assistant', label: 'Demo Agent' },
    { entityId: researchEntity.id, role: 'assistant', label: 'Research Agent' },
    { entityId: coderEntity.id, role: 'assistant', label: 'Coder Agent' },
    { entityId: plannerEntity.id, role: 'assistant', label: 'Planner Agent' },
  ];

  for (const m of members) {
    await prisma.smartSpaceMembership.upsert({
      where: { smartSpaceId_entityId: { smartSpaceId: space.id, entityId: m.entityId } },
      update: {},
      create: { smartSpaceId: space.id, entityId: m.entityId, role: m.role },
    });
    console.log(`   ✅ ${m.label} → ${m.entityId}`);
  }

  console.log('\n🎉 Test space ready!');
  console.log(`\n  Space ID: ${space.id}`);
  console.log(`  Human:    ${HUSAM_ENTITY_ID} (حسام)`);
  console.log(`  Agents:   Demo, Research, Coder, Planner`);
  console.log(`\nTest with:`);
  console.log(`  curl -s -X POST http://localhost:3001/api/smart-spaces/${space.id}/messages \\`);
  console.log(`    -H "Content-Type: application/json" \\`);
  console.log(`    -H "x-secret-key: <KEY>" \\`);
  console.log(`    -d '{"entityId": "${HUSAM_ENTITY_ID}", "content": "hello team!"}'`);
}

main()
  .catch((e) => { console.error('❌ Failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
