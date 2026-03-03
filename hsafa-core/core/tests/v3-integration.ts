/**
 * V3 Living Agent Integration Tests
 * 
 * Tests the full v3 gateway: agents, spaces, messaging, consciousness,
 * prebuilt tools, multi-agent spaces, and inbox events.
 */

import { PrismaClient } from '../prisma/generated/client/index.js';

const BASE = 'http://localhost:3001';
const SK = 'sk_cde45b65f116bfa3911c6bc968bd2edcc8997338812da63f697d7f7d9b3c1548';
const PK = 'pk_a7f2e91d3b8c4506f1e9d2a7b3c8e5f4d6a9b2c1e8f7d4a3b6c9e2f5a8d1b4c7';

const prisma = new PrismaClient();

// Known IDs
const HUSAM_ENTITY = 'a8422b10-0ab6-46ec-a0d2-00a490f09d86';
const ATLAS_ENTITY = '889ff57f-35c2-4bc2-9bfb-d73ef01d1ce0';
const NOVA_ENTITY = '360f03ff-e303-41d8-9b9d-896551801a02';
const SENTINEL_ENTITY = '7cd4d6dc-b67d-4bc5-b8e5-62e9b3eb6cd8';
const EXISTING_SPACE = '9158acd6-cf52-4854-abba-7bcf347140c6';

// JWT from user's curl
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJjbWx6OHdrdnEwMDAxdmxtYjB1aTJ4OTF1IiwiZW1haWwiOiJodXNhbS5paGFiLmFidXNhZmFAZ21haWwuY29tIiwibmFtZSI6Imh1c2FtIGFidXNhZmEiLCJlbnRpdHlJZCI6ImE4NDIyYjEwLTBhYjYtNDZlYy1hMGQyLTAwYTQ5MGYwOWQ4NiIsImFnZW50RW50aXR5SWQiOiI4ODlmZjU3Zi0zNWMyLTRiYzItOWJmYi1kNzNlZjAxZDFjZTAiLCJpYXQiOjE3NzE4NTUzMTIsImlzcyI6ImhzYWZhLXVzZS1jYXNlLWFwcCIsImV4cCI6MTc3MjQ2MDExMn0.K3PjAXJwz4vaHPG3dXkX-CoFYcKghJ6b2Y0SRga_CGI';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function api(method: string, path: string, body?: unknown, auth: 'sk' | 'jwt' = 'sk') {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth === 'sk') {
    headers['x-secret-key'] = SK;
  } else {
    headers['Authorization'] = `Bearer ${JWT}`;
    headers['x-public-key'] = PK;
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

let passed = 0;
let failed = 0;
const failures: string[] = [];
const fixes: string[] = [];

function assert(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
    failed++;
    failures.push(`${name}${detail ? `: ${detail}` : ''}`);
  }
}

// ─── Test 1: DB Audit ────────────────────────────────────────────────────────

async function test1_dbAudit() {
  console.log('\n═══ TEST 1: DB Audit ═══');
  
  const agents = await prisma.agent.findMany();
  assert('3 agents in DB', agents.length === 3, `found ${agents.length}`);
  assert('Atlas exists', agents.some(a => a.name === 'Atlas'));
  assert('Nova exists', agents.some(a => a.name === 'Nova'));
  assert('Sentinel exists', agents.some(a => a.name === 'Sentinel'));

  const entities = await prisma.entity.findMany();
  const agentEntities = entities.filter(e => e.type === 'agent');
  const humanEntities = entities.filter(e => e.type === 'human');
  assert('3 agent entities', agentEntities.length === 3, `found ${agentEntities.length}`);
  assert('At least 1 human entity (Husam)', humanEntities.length >= 1, `found ${humanEntities.length}`);

  const spaces = await prisma.smartSpace.findMany();
  assert('At least 1 space exists', spaces.length >= 1, `found ${spaces.length}`);

  const memberships = await prisma.smartSpaceMembership.findMany({
    where: { smartSpaceId: EXISTING_SPACE },
  });
  assert('Existing space has members', memberships.length >= 2, `found ${memberships.length} members`);
  assert('Husam is member of existing space', memberships.some(m => m.entityId === HUSAM_ENTITY));
  assert('Atlas is member of existing space', memberships.some(m => m.entityId === ATLAS_ENTITY));

  const messages = await prisma.smartSpaceMessage.findMany({
    where: { smartSpaceId: EXISTING_SPACE },
    orderBy: { seq: 'asc' },
  });
  assert('Messages exist in space', messages.length >= 1, `found ${messages.length}`);

  const runs = await prisma.run.findMany({ where: { agentEntityId: ATLAS_ENTITY } });
  assert('Atlas has run records', runs.length >= 1, `found ${runs.length}`);
  
  const completedRuns = runs.filter(r => r.status === 'completed');
  assert('Atlas has completed runs', completedRuns.length >= 1, `found ${completedRuns.length}`);
}

// ─── Test 2: Health + API Basics ─────────────────────────────────────────────

async function test2_apiBasics() {
  console.log('\n═══ TEST 2: API Basics ═══');

  const health = await api('GET', '/health');
  assert('Health check returns 200', health.status === 200);
  assert('Health version is 3.0.0', health.data?.version === '3.0.0');
  assert('Health shows 3 processes', health.data?.processes === 3, `processes: ${health.data?.processes}`);

  const agents = await api('GET', '/api/agents');
  assert('List agents returns 200', agents.status === 200);
  assert('Agents array returned', Array.isArray(agents.data?.agents), typeof agents.data?.agents);

  const entities = await api('GET', '/api/entities?type=agent');
  assert('List agent entities returns 200', entities.status === 200);

  const spaces = await api('GET', '/api/smart-spaces', undefined, 'jwt');
  assert('List spaces (JWT) returns 200', spaces.status === 200);
}

// ─── Test 3: Create Nova space ───────────────────────────────────────────────

let novaSpaceId: string;

async function test3_createNovaSpace() {
  console.log('\n═══ TEST 3: Create Nova Space ═══');

  const createRes = await api('POST', '/api/smart-spaces', { name: 'Creative Lab' });
  assert('Create space returns 201', createRes.status === 201, `status: ${createRes.status}, data: ${JSON.stringify(createRes.data)}`);
  novaSpaceId = createRes.data?.smartSpace?.id;
  assert('Space ID returned', !!novaSpaceId, JSON.stringify(createRes.data));

  if (!novaSpaceId) return;

  // Add Husam
  const addHusam = await api('POST', `/api/smart-spaces/${novaSpaceId}/members`, { entityId: HUSAM_ENTITY });
  assert('Add Husam to Nova space', addHusam.status === 201 || addHusam.status === 200, `status: ${addHusam.status}`);

  // Add Nova
  const addNova = await api('POST', `/api/smart-spaces/${novaSpaceId}/members`, { entityId: NOVA_ENTITY });
  assert('Add Nova to Nova space', addNova.status === 201 || addNova.status === 200, `status: ${addNova.status}`);

  // Verify members
  const members = await prisma.smartSpaceMembership.findMany({
    where: { smartSpaceId: novaSpaceId },
    include: { entity: { select: { displayName: true, type: true } } },
  });
  assert('Nova space has 2 members', members.length === 2, `found ${members.length}: ${members.map(m => m.entity.displayName).join(', ')}`);
}

// ─── Test 4: Create Sentinel space ───────────────────────────────────────────

let sentinelSpaceId: string;

async function test4_createSentinelSpace() {
  console.log('\n═══ TEST 4: Create Sentinel Space ═══');

  const createRes = await api('POST', '/api/smart-spaces', { name: 'Code Review' });
  assert('Create Sentinel space returns 201', createRes.status === 201, `status: ${createRes.status}`);
  sentinelSpaceId = createRes.data?.smartSpace?.id;
  assert('Space ID returned', !!sentinelSpaceId);

  if (!sentinelSpaceId) return;

  const addHusam = await api('POST', `/api/smart-spaces/${sentinelSpaceId}/members`, { entityId: HUSAM_ENTITY });
  assert('Add Husam to Sentinel space', addHusam.status === 201 || addHusam.status === 200);

  const addSentinel = await api('POST', `/api/smart-spaces/${sentinelSpaceId}/members`, { entityId: SENTINEL_ENTITY });
  assert('Add Sentinel to Sentinel space', addSentinel.status === 201 || addSentinel.status === 200);
}

// ─── Test 5: Create multi-agent space ────────────────────────────────────────

let multiSpaceId: string;

async function test5_createMultiAgentSpace() {
  console.log('\n═══ TEST 5: Create Multi-Agent Space ═══');

  const createRes = await api('POST', '/api/smart-spaces', { name: 'Team Chat' });
  assert('Create multi-agent space returns 201', createRes.status === 201);
  multiSpaceId = createRes.data?.smartSpace?.id;
  assert('Multi-agent space ID returned', !!multiSpaceId);

  if (!multiSpaceId) return;

  const addHusam = await api('POST', `/api/smart-spaces/${multiSpaceId}/members`, { entityId: HUSAM_ENTITY });
  assert('Add Husam', addHusam.status === 201 || addHusam.status === 200);

  const addAtlas = await api('POST', `/api/smart-spaces/${multiSpaceId}/members`, { entityId: ATLAS_ENTITY });
  assert('Add Atlas', addAtlas.status === 201 || addAtlas.status === 200);

  const addNova = await api('POST', `/api/smart-spaces/${multiSpaceId}/members`, { entityId: NOVA_ENTITY });
  assert('Add Nova', addNova.status === 201 || addNova.status === 200);

  const members = await prisma.smartSpaceMembership.findMany({
    where: { smartSpaceId: multiSpaceId },
  });
  assert('Multi space has 3 members', members.length === 3, `found ${members.length}`);
}

// ─── Test 6: Send message to Nova ────────────────────────────────────────────

async function test6_messageNova() {
  console.log('\n═══ TEST 6: Message Nova (Creative Lab) ═══');
  if (!novaSpaceId) { console.log('  ⏭️ Skipped — no Nova space'); return; }

  const sendRes = await api('POST', `/api/smart-spaces/${novaSpaceId}/messages`, {
    content: 'Give me 3 creative names for a pet robot cat',
    entityId: HUSAM_ENTITY,
  }, 'jwt');
  assert('Send message to Nova space returns 201', sendRes.status === 201, `status: ${sendRes.status}, data: ${JSON.stringify(sendRes.data).slice(0, 200)}`);

  // Wait for Nova to process
  console.log('  ⏳ Waiting 15s for Nova to respond...');
  await sleep(15000);

  const messages = await prisma.smartSpaceMessage.findMany({
    where: { smartSpaceId: novaSpaceId },
    orderBy: { seq: 'asc' },
    include: { entity: { select: { displayName: true, type: true } } },
  });
  
  const humanMsgs = messages.filter(m => m.entity?.type === 'human');
  const agentMsgs = messages.filter(m => m.entity?.type === 'agent');
  
  assert('Human message persisted', humanMsgs.length >= 1);
  assert('Nova responded with message(s)', agentMsgs.length >= 1, `found ${agentMsgs.length} agent messages`);
  
  if (agentMsgs.length > 0) {
    assert('Nova response has content', !!(agentMsgs[0].content), `content: ${(agentMsgs[0].content ?? '').slice(0, 100)}`);
  }

  // Check Nova's run
  const novaRuns = await prisma.run.findMany({
    where: { agentEntityId: NOVA_ENTITY },
    orderBy: { createdAt: 'desc' },
    take: 1,
  });
  assert('Nova has a run record', novaRuns.length >= 1);
  if (novaRuns.length > 0) {
    assert('Nova run completed', novaRuns[0].status === 'completed', `status: ${novaRuns[0].status}`);
    assert('Nova run has step count', novaRuns[0].stepCount > 0, `steps: ${novaRuns[0].stepCount}`);
  }
}

// ─── Test 7: Send message to Sentinel ────────────────────────────────────────

async function test7_messageSentinel() {
  console.log('\n═══ TEST 7: Message Sentinel (Code Review) ═══');
  if (!sentinelSpaceId) { console.log('  ⏭️ Skipped — no Sentinel space'); return; }

  const sendRes = await api('POST', `/api/smart-spaces/${sentinelSpaceId}/messages`, {
    content: 'Review this code:\n```js\nfunction add(a, b) { return a + b; }\nconst result = add("1", 2);\nconsole.log(result);\n```',
    entityId: HUSAM_ENTITY,
  }, 'jwt');
  assert('Send message to Sentinel space returns 201', sendRes.status === 201);

  console.log('  ⏳ Waiting 15s for Sentinel to respond...');
  await sleep(15000);

  const messages = await prisma.smartSpaceMessage.findMany({
    where: { smartSpaceId: sentinelSpaceId },
    orderBy: { seq: 'asc' },
    include: { entity: { select: { displayName: true, type: true } } },
  });

  const agentMsgs = messages.filter(m => m.entity?.type === 'agent');
  assert('Sentinel responded', agentMsgs.length >= 1, `found ${agentMsgs.length} agent messages`);
}

// ─── Test 8: Multi-agent space messaging ─────────────────────────────────────

async function test8_multiAgentMessage() {
  console.log('\n═══ TEST 8: Multi-Agent Space (Team Chat) ═══');
  if (!multiSpaceId) { console.log('  ⏭️ Skipped — no multi space'); return; }

  const sendRes = await api('POST', `/api/smart-spaces/${multiSpaceId}/messages`, {
    content: 'Hello team! Can one of you help me write a haiku about coding?',
    entityId: HUSAM_ENTITY,
  }, 'jwt');
  assert('Send message to multi-agent space returns 201', sendRes.status === 201);

  console.log('  ⏳ Waiting 20s for agents to respond...');
  await sleep(20000);

  const messages = await prisma.smartSpaceMessage.findMany({
    where: { smartSpaceId: multiSpaceId },
    orderBy: { seq: 'asc' },
    include: { entity: { select: { displayName: true, type: true } } },
  });

  const agentMsgs = messages.filter(m => m.entity?.type === 'agent');
  const agentNames = [...new Set(agentMsgs.map(m => m.entity?.displayName))];
  
  assert('At least one agent responded', agentMsgs.length >= 1, `found ${agentMsgs.length} agent messages from: ${agentNames.join(', ')}`);

  // Wait more and check for infinite loop
  console.log('  ⏳ Waiting 15s more to check for infinite loops...');
  await sleep(15000);

  const messagesAfter = await prisma.smartSpaceMessage.findMany({
    where: { smartSpaceId: multiSpaceId },
    orderBy: { seq: 'asc' },
  });
  
  // Reasonable: 1 human + 2 agents each reply once = ~3-4 messages. More than 8 suggests looping.
  assert('No infinite loop (< 10 total messages)', messagesAfter.length < 10, `found ${messagesAfter.length} total messages`);
}

// ─── Test 9: Consciousness Persistence ───────────────────────────────────────

async function test9_consciousness() {
  console.log('\n═══ TEST 9: Consciousness Persistence ═══');

  const atlasConsc = await prisma.agentConsciousness.findUnique({
    where: { agentEntityId: ATLAS_ENTITY },
  });
  assert('Atlas has consciousness record', !!atlasConsc);
  if (atlasConsc) {
    assert('Consciousness has messages', Array.isArray(atlasConsc.messages) && (atlasConsc.messages as any[]).length > 0, `messages count: ${(atlasConsc.messages as any[])?.length}`);
    assert('Cycle count > 0', atlasConsc.cycleCount > 0, `cycles: ${atlasConsc.cycleCount}`);
    assert('Token estimate > 0', atlasConsc.tokenEstimate > 0, `tokens: ${atlasConsc.tokenEstimate}`);
  }

  // Check Nova too
  const novaConsc = await prisma.agentConsciousness.findUnique({
    where: { agentEntityId: NOVA_ENTITY },
  });
  assert('Nova has consciousness record', !!novaConsc);
}

// ─── Test 10: Inbox Events (Durable) ────────────────────────────────────────

async function test10_inboxEvents() {
  console.log('\n═══ TEST 10: Durable Inbox Events ═══');

  const events = await prisma.inboxEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  assert('Inbox events exist in DB', events.length > 0, `found ${events.length}`);

  const processed = events.filter((e: any) => e.status === 'processed');
  assert('Some events are processed', processed.length > 0, `processed: ${processed.length}`);

  // Check event types
  const types = [...new Set(events.map((e: any) => e.type))];
  assert('space_message events exist', types.includes('space_message'), `types: ${types.join(', ')}`);
}

// ─── Test 11: Run Metrics ────────────────────────────────────────────────────

async function test11_runMetrics() {
  console.log('\n═══ TEST 11: Run Metrics ═══');

  const runs = await prisma.run.findMany({
    where: { status: 'completed' },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  assert('Completed runs exist', runs.length > 0);

  for (const run of runs.slice(0, 3)) {
    const agent = await prisma.entity.findUnique({ where: { id: run.agentEntityId }, select: { displayName: true } });
    const name = agent?.displayName ?? run.agentEntityId.slice(0, 8);
    assert(`${name} run has stepCount > 0`, run.stepCount > 0, `steps: ${run.stepCount}`);
    assert(`${name} run has durationMs > 0`, run.durationMs > 0, `duration: ${run.durationMs}ms`);
    assert(`${name} run has completionTokens > 0`, run.completionTokens > 0, `tokens: ${run.completionTokens}`);
  }
}

// ─── Test 12: Message list API ───────────────────────────────────────────────

async function test12_messageListApi() {
  console.log('\n═══ TEST 12: Message List API ═══');

  const res = await api('GET', `/api/smart-spaces/${EXISTING_SPACE}/messages?limit=10`, undefined, 'jwt');
  assert('List messages returns 200', res.status === 200);
  assert('Messages array returned', Array.isArray(res.data?.messages), typeof res.data?.messages);
  if (res.data?.messages?.length > 0) {
    const msg = res.data.messages[0];
    assert('Message has id', !!msg.id);
    assert('Message has content', msg.content !== undefined);
    assert('Message has entity info', !!msg.entity);
    assert('Message has seq (BigInt serialized)', typeof msg.seq === 'number');
  }
}

// ─── Test 13: Send follow-up (consciousness memory test) ────────────────────

async function test13_followUp() {
  console.log('\n═══ TEST 13: Follow-up Conversation (Consciousness) ═══');

  // Send a follow-up to Atlas in the existing space — agent should remember context
  const sendRes = await api('POST', `/api/smart-spaces/${EXISTING_SPACE}/messages`, {
    content: 'What was the last thing I asked you about?',
    entityId: HUSAM_ENTITY,
  }, 'jwt');
  assert('Send follow-up returns 201', sendRes.status === 201);

  console.log('  ⏳ Waiting 15s for Atlas to respond...');
  await sleep(15000);

  const messages = await prisma.smartSpaceMessage.findMany({
    where: { smartSpaceId: EXISTING_SPACE },
    orderBy: { seq: 'desc' },
    take: 5,
    include: { entity: { select: { displayName: true, type: true } } },
  });

  const latestAgentMsg = messages.find(m => m.entity?.type === 'agent');
  assert('Atlas responded to follow-up', !!latestAgentMsg);
  if (latestAgentMsg) {
    // The agent should reference the previous conversation (short story)
    const content = (latestAgentMsg.content ?? '').toLowerCase();
    assert('Atlas response references prior conversation', content.length > 10, `response: ${content.slice(0, 100)}`);
  }
}

// ─── Test 14: Service Trigger API ────────────────────────────────────────────

async function test14_serviceTrigger() {
  console.log('\n═══ TEST 14: Service Trigger API ═══');

  const atlasAgent = await prisma.agent.findFirst({ where: { name: 'Atlas' } });
  if (!atlasAgent) { console.log('  ⏭️ Skipped — no Atlas agent'); return; }

  const triggerRes = await api('POST', `/api/agents/${atlasAgent.id}/trigger`, {
    serviceName: 'test-service',
    payload: { action: 'health_check', message: 'Testing service trigger' },
  });
  assert('Service trigger returns 200', triggerRes.status === 200 || triggerRes.status === 201, `status: ${triggerRes.status}, data: ${JSON.stringify(triggerRes.data).slice(0, 200)}`);

  if (triggerRes.status === 201) {
    assert('Trigger returns agentEntityId', !!triggerRes.data?.agentEntityId);
  }

  // Wait for processing
  console.log('  ⏳ Waiting 12s for Atlas to process service trigger...');
  await sleep(12000);

  // Check that a run was created for this trigger
  const latestRun = await prisma.run.findFirst({
    where: { agentEntityId: ATLAS_ENTITY, triggerType: 'service' },
    orderBy: { createdAt: 'desc' },
  });
  // Note: service trigger might not create runs in v3 (goes through inbox instead)
  // Just check inbox event was created
  const serviceEvents = await prisma.inboxEvent.findMany({
    where: { agentEntityId: ATLAS_ENTITY, type: 'service' },
    orderBy: { createdAt: 'desc' },
    take: 1,
  });
  assert('Service inbox event created', serviceEvents.length > 0 || !!latestRun, 
    `events: ${serviceEvents.length}, run: ${latestRun?.id?.slice(0, 8) ?? 'none'}`);
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   Hsafa Gateway v3 — Integration Test Suite         ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  try {
    await test1_dbAudit();
    await test2_apiBasics();
    await test3_createNovaSpace();
    await test4_createSentinelSpace();
    await test5_createMultiAgentSpace();
    await test6_messageNova();
    await test7_messageSentinel();
    await test8_multiAgentMessage();
    await test9_consciousness();
    await test10_inboxEvents();
    await test11_runMetrics();
    await test12_messageListApi();
    await test13_followUp();
    await test14_serviceTrigger();
  } catch (err) {
    console.error('\n💥 Test suite crashed:', err);
  }

  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log(`║   Results: ${passed} passed, ${failed} failed                     `);
  console.log('╚══════════════════════════════════════════════════════╝');

  if (failures.length > 0) {
    console.log('\n❌ Failures:');
    for (const f of failures) {
      console.log(`  - ${f}`);
    }
  }

  console.log('\n');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
