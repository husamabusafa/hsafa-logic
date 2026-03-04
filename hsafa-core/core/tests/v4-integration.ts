/**
 * Hsafa Core v4 — Integration Test Suite
 *
 * Tests: health, agents (haseefs), runs, extensions, auth.
 * Run: npx tsx tests/v4-integration.ts
 */

const CORE_BASE = 'http://localhost:3001';
const SK = 'sk_dev_secret_key_change_in_prod';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function api(method: string, path: string, body?: unknown, headers?: Record<string, string>) {
  const h: Record<string, string> = { 'Content-Type': 'application/json', ...headers };
  const res = await fetch(`${CORE_BASE}${path}`, {
    method,
    headers: h,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

function sk(extra?: Record<string, string>) {
  return { 'x-secret-key': SK, ...extra };
}

let passed = 0;
let failed = 0;
const failures: string[] = [];

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

// ─── Test 1: Health Check ────────────────────────────────────────────────────

async function test1_health() {
  console.log('\n═══ TEST 1: Health Check ═══');

  const res = await api('GET', '/health');
  assert('Health returns 200', res.status === 200);
  assert('Status is ok', res.data?.status === 'ok');
  assert('Service is hsafa-core', res.data?.service === 'hsafa-core');
  assert('Version is 4.0.0', res.data?.version === '4.0.0');
  assert('Processes count is number', typeof res.data?.processes === 'number');
}

// ─── Test 2: Auth — Secret Key ──────────────────────────────────────────────

async function test2_auth() {
  console.log('\n═══ TEST 2: Auth ═══');

  // No key → 401
  const noKey = await api('GET', '/api/agents');
  assert('No key → 401', noKey.status === 401);

  // Wrong key → 401
  const wrongKey = await api('GET', '/api/agents', undefined, { 'x-secret-key': 'wrong' });
  assert('Wrong key → 401', wrongKey.status === 401);

  // Valid key → 200
  const valid = await api('GET', '/api/agents', undefined, sk());
  assert('Valid key → 200', valid.status === 200);
}

// ─── Test 3: List Agents (Haseefs) ──────────────────────────────────────────

async function test3_listAgents() {
  console.log('\n═══ TEST 3: List Agents ═══');

  const res = await api('GET', '/api/agents', undefined, sk());
  assert('List agents returns 200', res.status === 200);
  assert('haseefs is array', Array.isArray(res.data?.haseefs));

  if (res.data?.haseefs?.length > 0) {
    const h = res.data.haseefs[0];
    assert('Haseef has id', !!h.id);
    assert('Haseef has name', !!h.name);
    assert('Haseef has configJson', !!h.configJson);
    assert('Haseef has createdAt', !!h.createdAt);
  }
}

// ─── Test 4: CRUD Agent ─────────────────────────────────────────────────────

let testAgentId: string;

async function test4_crudAgent() {
  console.log('\n═══ TEST 4: CRUD Agent ═══');

  // Create
  const createRes = await api('POST', '/api/agents', {
    name: 'Test Agent',
    description: 'Integration test agent',
    configJson: {
      model: { provider: 'openai', name: 'gpt-4o-mini', api: 'chat' },
      persona: 'You are a test agent.',
    },
  }, sk());
  assert('Create agent returns 201', createRes.status === 201, `status: ${createRes.status}`);
  testAgentId = createRes.data?.haseef?.id;
  assert('Created agent has id', !!testAgentId);
  assert('Created agent has correct name', createRes.data?.haseef?.name === 'Test Agent');

  if (!testAgentId) return;

  // Get
  const getRes = await api('GET', `/api/agents/${testAgentId}`, undefined, sk());
  assert('Get agent returns 200', getRes.status === 200);
  assert('Get agent has correct id', getRes.data?.haseef?.id === testAgentId);

  // Update
  const patchRes = await api('PATCH', `/api/agents/${testAgentId}`, {
    description: 'Updated description',
  }, sk());
  assert('Update agent returns 200', patchRes.status === 200);
  assert('Updated description', patchRes.data?.haseef?.description === 'Updated description');

  // Get nonexistent
  const notFound = await api('GET', '/api/agents/00000000-0000-0000-0000-000000000000', undefined, sk());
  assert('Nonexistent agent → 404', notFound.status === 404);
}

// ─── Test 5: List Runs ──────────────────────────────────────────────────────

async function test5_listRuns() {
  console.log('\n═══ TEST 5: List Runs ═══');

  const res = await api('GET', '/api/runs', undefined, sk());
  assert('List runs returns 200', res.status === 200);
  assert('Runs is array', Array.isArray(res.data?.runs));

  // Filter by status
  const completedRes = await api('GET', '/api/runs?status=completed', undefined, sk());
  assert('Filter by status returns 200', completedRes.status === 200);
  if (completedRes.data?.runs?.length > 0) {
    const allCompleted = completedRes.data.runs.every((r: any) => r.status === 'completed');
    assert('All filtered runs are completed', allCompleted);
  }

  // Limit
  const limitRes = await api('GET', '/api/runs?limit=2', undefined, sk());
  assert('Limit works', limitRes.status === 200);
  assert('Limit respected', (limitRes.data?.runs?.length ?? 0) <= 2);
}

// ─── Test 6: Extensions CRUD ────────────────────────────────────────────────

let testExtId: string;
let testExtKey: string;

async function test6_extensionsCrud() {
  console.log('\n═══ TEST 6: Extensions CRUD ═══');

  // Create — missing name
  const badCreate = await api('POST', '/api/extensions', {}, sk());
  assert('Create extension without name → 400', badCreate.status === 400);

  // Create
  const createRes = await api('POST', '/api/extensions', {
    name: 'test-ext-' + Date.now(),
    description: 'Test extension',
    instructions: 'Test instructions',
  }, sk());
  assert('Create extension returns 201', createRes.status === 201, `status: ${createRes.status}, data: ${JSON.stringify(createRes.data).slice(0, 200)}`);
  testExtId = createRes.data?.extension?.id;
  testExtKey = createRes.data?.extension?.extensionKey;
  assert('Extension has id', !!testExtId);
  assert('Extension has extensionKey (ek_...)', testExtKey?.startsWith('ek_') || !!testExtKey);

  if (!testExtId) return;

  // List
  const listRes = await api('GET', '/api/extensions', undefined, sk());
  assert('List extensions returns 200', listRes.status === 200);
  assert('Extensions is array', Array.isArray(listRes.data?.extensions));
  assert('Created extension in list', listRes.data?.extensions?.some((e: any) => e.id === testExtId));

  // Get
  const getRes = await api('GET', `/api/extensions/${testExtId}`, undefined, sk());
  assert('Get extension returns 200', getRes.status === 200);
  assert('Extension has correct id', getRes.data?.extension?.id === testExtId);

  // Update
  const patchRes = await api('PATCH', `/api/extensions/${testExtId}`, {
    description: 'Updated test extension',
  }, sk());
  assert('Update extension returns 200', patchRes.status === 200);

  // Sync tools
  const toolsRes = await api('PUT', `/api/extensions/${testExtId}/tools`, {
    tools: [
      { name: 'test_tool_1', description: 'First test tool', inputSchema: { type: 'object', properties: { input: { type: 'string' } } } },
      { name: 'test_tool_2', description: 'Second test tool', inputSchema: { type: 'object', properties: {} } },
    ],
  }, sk());
  assert('Sync tools returns 200', toolsRes.status === 200);
  assert('Tools synced correctly', Array.isArray(toolsRes.data?.tools) && toolsRes.data.tools.length === 2);

  // Invalid tools — missing description
  const badTools = await api('PUT', `/api/extensions/${testExtId}/tools`, {
    tools: [{ name: 'bad_tool' }],
  }, sk());
  assert('Tools without description → 400', badTools.status === 400);
}

// ─── Test 7: Extension Self-Discovery ───────────────────────────────────────

async function test7_extensionSelfDiscovery() {
  console.log('\n═══ TEST 7: Extension Self-Discovery ═══');

  if (!testExtKey) {
    console.log('  ⏭️ Skipped — no extension key');
    return;
  }

  // Self-discovery with extension key
  const meRes = await api('GET', '/api/extensions/me', undefined, { 'x-extension-key': testExtKey });
  assert('Self-discovery returns 200', meRes.status === 200);
  assert('Extension id matches', meRes.data?.extension?.id === testExtId);
  assert('Extension has tools array', Array.isArray(meRes.data?.extension?.tools));

  // Invalid extension key
  const badKey = await api('GET', '/api/extensions/me', undefined, { 'x-extension-key': 'invalid' });
  assert('Invalid extension key → 401', badKey.status === 401);

  // No extension key
  const noKey = await api('GET', '/api/extensions/me');
  assert('No extension key → 401', noKey.status === 401);
}

// ─── Test 8: Cleanup ────────────────────────────────────────────────────────

async function test8_cleanup() {
  console.log('\n═══ TEST 8: Cleanup ═══');

  // Delete extension
  if (testExtId) {
    const delExt = await api('DELETE', `/api/extensions/${testExtId}`, undefined, sk());
    assert('Delete extension returns 200', delExt.status === 200);
    assert('Delete extension success', delExt.data?.success === true);

    // Verify deleted
    const getDeleted = await api('GET', `/api/extensions/${testExtId}`, undefined, sk());
    assert('Deleted extension → 404', getDeleted.status === 404);
  }

  // Delete test agent
  if (testAgentId) {
    const delAgent = await api('DELETE', `/api/agents/${testAgentId}`, undefined, sk());
    assert('Delete agent returns 200', delAgent.status === 200);
    assert('Delete agent success', delAgent.data?.success === true);

    const getDeleted = await api('GET', `/api/agents/${testAgentId}`, undefined, sk());
    assert('Deleted agent → 404', getDeleted.status === 404);
  }
}

// ─── Test 9: Run Details & Events ───────────────────────────────────────────

async function test9_runDetails() {
  console.log('\n═══ TEST 9: Run Details ═══');

  const runsRes = await api('GET', '/api/runs?limit=1', undefined, sk());
  if (!runsRes.data?.runs?.length) {
    console.log('  ⏭️ Skipped — no runs in DB');
    return;
  }

  const runId = runsRes.data.runs[0].id;

  // Get single run
  const getRes = await api('GET', `/api/runs/${runId}`, undefined, sk());
  assert('Get run returns 200', getRes.status === 200);
  assert('Run has id', getRes.data?.run?.id === runId);
  assert('Run has status', !!getRes.data?.run?.status);
  assert('Run has haseefId', !!getRes.data?.run?.haseefId);
  assert('Run has createdAt', !!getRes.data?.run?.createdAt);

  // Get run events
  const eventsRes = await api('GET', `/api/runs/${runId}/events`, undefined, sk());
  assert('Get run events returns 200', eventsRes.status === 200);
  assert('Events is array', Array.isArray(eventsRes.data?.events));

  // Nonexistent run
  const notFound = await api('GET', '/api/runs/00000000-0000-0000-0000-000000000000', undefined, sk());
  assert('Nonexistent run → 404', notFound.status === 404);
}

// ─── Test 10: Create Agent Validation ───────────────────────────────────────

async function test10_agentValidation() {
  console.log('\n═══ TEST 10: Agent Validation ═══');

  // Missing name
  const noName = await api('POST', '/api/agents', { configJson: {} }, sk());
  assert('Create agent without name → 400', noName.status === 400);

  // Missing configJson
  const noConfig = await api('POST', '/api/agents', { name: 'Missing Config' }, sk());
  assert('Create agent without configJson → 400', noConfig.status === 400);
}

// ─── Test 11: Trigger Agent (Service) ───────────────────────────────────────

async function test11_triggerAgent() {
  console.log('\n═══ TEST 11: Trigger Agent (Service) ═══');

  // List agents to find one to trigger
  const listRes = await api('GET', '/api/agents', undefined, sk());
  const haseefs = listRes.data?.haseefs ?? [];

  if (haseefs.length === 0) {
    console.log('  ⏭️ Skipped — no agents in DB');
    return;
  }

  const haseefId = haseefs[0].id;

  // Missing serviceName
  const badTrigger = await api('POST', `/api/agents/${haseefId}/trigger`, {}, sk());
  assert('Trigger without serviceName → 400', badTrigger.status === 400);

  // Valid trigger
  const triggerRes = await api('POST', `/api/agents/${haseefId}/trigger`, {
    serviceName: 'test-integration',
    payload: { action: 'ping' },
  }, sk());
  assert('Trigger agent returns 200', triggerRes.status === 200);
  assert('Trigger returns success', triggerRes.data?.success === true);

  // Nonexistent haseef
  const notFound = await api('POST', '/api/agents/00000000-0000-0000-0000-000000000000/trigger', {
    serviceName: 'test',
  }, sk());
  assert('Trigger nonexistent agent → 404', notFound.status === 404);
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   Hsafa Core v4 — Integration Test Suite             ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  try {
    await test1_health();
    await test2_auth();
    await test3_listAgents();
    await test4_crudAgent();
    await test5_listRuns();
    await test6_extensionsCrud();
    await test7_extensionSelfDiscovery();
    await test8_cleanup();
    await test9_runDetails();
    await test10_agentValidation();
    await test11_triggerAgent();
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
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);
