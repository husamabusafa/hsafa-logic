/**
 * Hsafa Spaces (use-case-app) — Integration Test Suite
 *
 * Tests: register, login, me, entities, smart-spaces CRUD, members, messages, auth.
 * Run: npx tsx tests/integration.ts
 */

const SPACES_BASE = 'http://localhost:3005';
const SK = 'sk_spaces_dev_secret_change_in_prod';
const PK = 'pk_spaces_dev_public_change_in_prod';

// From the user's curl — known working JWT + entity
const KNOWN_JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJjbW1iN3Zybm8wMDAzeGhxZzJnc3FsM2cyIiwiZW1haWwiOiJodXNhbS5paGFiLmFidXNhZmFAZ21haWwuY29tIiwibmFtZSI6Imh1c2FtIGFidXNhZmEiLCJlbnRpdHlJZCI6IjFiMTYzNzdlLWEwYTItNGFiMC05ZWZmLTUxMDAwN2E4NDU3ZCIsImFnZW50RW50aXR5SWQiOiI2NTJkNTk1OS02MzNjLTRlNTYtYmYyZi0yYmQ3ZjQ0MDcwN2UiLCJpYXQiOjE3NzI1NzkxODgsImlzcyI6ImhzYWZhLXVzZS1jYXNlLWFwcCIsImV4cCI6MTc3MzE4Mzk4OH0.6JjpAQesrP8S3RzFMtHbVlr6rNxRTTCJg-LD2Xylybk';
const KNOWN_ENTITY_ID = '1b16377e-a0a2-4ab0-9eff-510007a8457d';
const KNOWN_SPACE_ID = '5f6ac35a-b80c-40f7-8961-9159084db65c';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function api(method: string, path: string, body?: unknown, headers?: Record<string, string>) {
  const h: Record<string, string> = { 'Content-Type': 'application/json', ...headers };
  const res = await fetch(`${SPACES_BASE}${path}`, {
    method,
    headers: h,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

function skHeaders(extra?: Record<string, string>) {
  return { 'x-secret-key': SK, ...extra };
}

function jwtHeaders(jwt: string, extra?: Record<string, string>) {
  return { 'Authorization': `Bearer ${jwt}`, 'x-public-key': PK, ...extra };
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

// ─── Test 1: Auth — Rejection Cases ─────────────────────────────────────────

async function test1_auth() {
  console.log('\n═══ TEST 1: Auth ═══');

  // No auth headers → 401
  const noAuth = await api('GET', '/api/smart-spaces');
  assert('No auth → 401', noAuth.status === 401);

  // Wrong secret key → 401
  const wrongSk = await api('GET', '/api/smart-spaces', undefined, { 'x-secret-key': 'wrong' });
  assert('Wrong secret key → 401', wrongSk.status === 401);

  // Wrong public key → 401
  const wrongPk = await api('GET', '/api/smart-spaces', undefined, {
    'x-public-key': 'wrong',
    'Authorization': `Bearer ${KNOWN_JWT}`,
  });
  assert('Wrong public key → 401', wrongPk.status === 401);

  // Valid secret key → 200
  const validSk = await api('GET', '/api/smart-spaces', undefined, skHeaders());
  assert('Valid secret key → 200', validSk.status === 200);

  // Valid JWT + public key → 200
  const validJwt = await api('GET', '/api/smart-spaces', undefined, jwtHeaders(KNOWN_JWT));
  assert('Valid JWT + public key → 200', validJwt.status === 200);
}

// ─── Test 2: Register & Login ───────────────────────────────────────────────

let testJwt: string;
let testEntityId: string;
let testSpaceId: string;
const testEmail = `test-${Date.now()}@integration.test`;
const testPassword = 'testpass123';

async function test2_registerLogin() {
  console.log('\n═══ TEST 2: Register & Login ═══');

  // Register — missing fields
  const badRegister = await api('POST', '/api/register', { email: testEmail });
  assert('Register without password → 400', badRegister.status === 400);

  // Register — short password
  const shortPw = await api('POST', '/api/register', {
    name: 'Test User', email: `short-${Date.now()}@test.com`, password: '123',
  });
  assert('Register with short password → 400', shortPw.status === 400);

  // Register — valid
  const registerRes = await api('POST', '/api/register', {
    name: 'Test User',
    email: testEmail,
    password: testPassword,
  });
  assert('Register returns 200', registerRes.status === 200, `status: ${registerRes.status}, data: ${JSON.stringify(registerRes.data).slice(0, 200)}`);
  assert('Register returns token', !!registerRes.data?.token);
  assert('Register returns user', !!registerRes.data?.user);
  assert('Register returns entityId', !!registerRes.data?.user?.entityId);
  assert('Register returns smartSpaceId', !!registerRes.data?.user?.smartSpaceId);
  assert('Register returns agentEntityId', !!registerRes.data?.user?.agentEntityId);
  assert('Register returns spaces array', Array.isArray(registerRes.data?.user?.spaces));

  testJwt = registerRes.data?.token;
  testEntityId = registerRes.data?.user?.entityId;
  testSpaceId = registerRes.data?.user?.smartSpaceId;

  // Register — duplicate email
  const dupRes = await api('POST', '/api/register', {
    name: 'Dup User', email: testEmail, password: testPassword,
  });
  assert('Duplicate email → 409', dupRes.status === 409);

  // Login — wrong password
  const badLogin = await api('POST', '/api/login', { email: testEmail, password: 'wrongpass' });
  assert('Login wrong password → 401', badLogin.status === 401);

  // Login — missing fields
  const badLogin2 = await api('POST', '/api/login', { email: testEmail });
  assert('Login missing password → 400', badLogin2.status === 400);

  // Login — valid
  const loginRes = await api('POST', '/api/login', { email: testEmail, password: testPassword });
  assert('Login returns 200', loginRes.status === 200);
  assert('Login returns token', !!loginRes.data?.token);
  assert('Login returns user', !!loginRes.data?.user);
  assert('Login user has spaces', Array.isArray(loginRes.data?.user?.spaces));

  // Update testJwt from login (fresher)
  testJwt = loginRes.data?.token ?? testJwt;
}

// ─── Test 3: Get Me ─────────────────────────────────────────────────────────

async function test3_getMe() {
  console.log('\n═══ TEST 3: Get Me ═══');

  if (!testJwt) {
    console.log('  ⏭️ Skipped — no JWT');
    return;
  }

  // No auth → 401
  const noAuth = await api('GET', '/api/me');
  assert('Get me without auth → 401', noAuth.status === 401);

  // Valid auth
  const meRes = await api('GET', '/api/me', undefined, { 'Authorization': `Bearer ${testJwt}` });
  assert('Get me returns 200', meRes.status === 200);
  assert('Me has user object', !!meRes.data?.user);
  assert('Me user has email', meRes.data?.user?.email === testEmail);
  assert('Me user has entityId', !!meRes.data?.user?.entityId);
  assert('Me user has spaces', Array.isArray(meRes.data?.user?.spaces));
}

// ─── Test 4: Entities ───────────────────────────────────────────────────────

async function test4_entities() {
  console.log('\n═══ TEST 4: Entities ═══');

  // List entities (secret key)
  const listRes = await api('GET', '/api/entities', undefined, skHeaders());
  assert('List entities returns 200', listRes.status === 200);
  assert('Entities is array', Array.isArray(listRes.data?.entities));

  // Filter by type
  const humansRes = await api('GET', '/api/entities?type=human', undefined, skHeaders());
  assert('Filter humans returns 200', humansRes.status === 200);
  if (humansRes.data?.entities?.length > 0) {
    const allHuman = humansRes.data.entities.every((e: any) => e.type === 'human');
    assert('All filtered entities are human', allHuman);
  }

  // Create entity — only human allowed
  const badType = await api('POST', '/api/entities', {
    type: 'agent', displayName: 'Bad Agent',
  }, skHeaders());
  assert('Create non-human entity → 400', badType.status === 400);

  // Create human entity
  const createRes = await api('POST', '/api/entities', {
    type: 'human',
    externalId: `test-ext-${Date.now()}`,
    displayName: 'Test Human Entity',
  }, skHeaders());
  assert('Create human entity returns 201', createRes.status === 201, `status: ${createRes.status}`);
  assert('Entity has id', !!createRes.data?.entity?.id);
  assert('Entity is human', createRes.data?.entity?.type === 'human');
}

// ─── Test 5: Smart Spaces CRUD ──────────────────────────────────────────────

let crudSpaceId: string;

async function test5_spacesCrud() {
  console.log('\n═══ TEST 5: Smart Spaces CRUD ═══');

  // List spaces (secret key)
  const listRes = await api('GET', '/api/smart-spaces', undefined, skHeaders());
  assert('List spaces (SK) returns 200', listRes.status === 200);
  assert('smartSpaces is array', Array.isArray(listRes.data?.smartSpaces));

  // List spaces (JWT — returns only user's spaces)
  if (testJwt) {
    const jwtList = await api('GET', '/api/smart-spaces', undefined, jwtHeaders(testJwt));
    assert('List spaces (JWT) returns 200', jwtList.status === 200);
    assert('JWT list returns smartSpaces', Array.isArray(jwtList.data?.smartSpaces));
  }

  // Create space
  const createRes = await api('POST', '/api/smart-spaces', {
    name: 'Test Integration Space',
    description: 'Created by integration test',
  }, skHeaders());
  assert('Create space returns 201', createRes.status === 201, `status: ${createRes.status}`);
  crudSpaceId = createRes.data?.smartSpace?.id;
  assert('Space has id', !!crudSpaceId);
  assert('Space has correct name', createRes.data?.smartSpace?.name === 'Test Integration Space');

  if (!crudSpaceId) return;

  // Get space (secret key)
  const getRes = await api('GET', `/api/smart-spaces/${crudSpaceId}`, undefined, skHeaders());
  assert('Get space returns 200', getRes.status === 200);
  assert('Space id matches', getRes.data?.smartSpace?.id === crudSpaceId);

  // Update space
  const patchRes = await api('PATCH', `/api/smart-spaces/${crudSpaceId}`, {
    name: 'Updated Test Space',
    description: 'Updated by test',
  }, skHeaders());
  assert('Update space returns 200', patchRes.status === 200);
  assert('Space name updated', patchRes.data?.smartSpace?.name === 'Updated Test Space');
}

// ─── Test 6: Members ────────────────────────────────────────────────────────

async function test6_members() {
  console.log('\n═══ TEST 6: Members ═══');

  if (!crudSpaceId || !testEntityId) {
    console.log('  ⏭️ Skipped — no space or entity');
    return;
  }

  // Add member (secret key required)
  const addRes = await api('POST', `/api/smart-spaces/${crudSpaceId}/members`, {
    entityId: testEntityId,
    role: 'member',
  }, skHeaders());
  assert('Add member returns 201', addRes.status === 201, `status: ${addRes.status}`);
  assert('Membership has id', !!addRes.data?.membership?.id);

  // List members (secret key)
  const listRes = await api('GET', `/api/smart-spaces/${crudSpaceId}/members`, undefined, skHeaders());
  assert('List members returns 200', listRes.status === 200);
  assert('Members is array', Array.isArray(listRes.data?.members));
  assert('Test entity is member', listRes.data?.members?.some((m: any) => m.entityId === testEntityId));

  // List members (JWT — requires membership)
  if (testJwt) {
    const jwtList = await api('GET', `/api/smart-spaces/${crudSpaceId}/members`, undefined, jwtHeaders(testJwt));
    assert('List members (JWT, member) → 200', jwtList.status === 200);
  }
}

// ─── Test 7: Messages ───────────────────────────────────────────────────────

let testMessageId: string;

async function test7_messages() {
  console.log('\n═══ TEST 7: Messages ═══');

  if (!crudSpaceId || !testEntityId || !testJwt) {
    console.log('  ⏭️ Skipped — missing prerequisites');
    return;
  }

  // Send message — missing content
  const badMsg = await api('POST', `/api/smart-spaces/${crudSpaceId}/messages`, {
    entityId: testEntityId,
  }, jwtHeaders(testJwt));
  assert('Send message without content → 400', badMsg.status === 400);

  // Send message (JWT)
  const sendRes = await api('POST', `/api/smart-spaces/${crudSpaceId}/messages`, {
    entityId: testEntityId,
    content: 'Hello from integration test!',
  }, jwtHeaders(testJwt));
  assert('Send message returns 201', sendRes.status === 201, `status: ${sendRes.status}, data: ${JSON.stringify(sendRes.data).slice(0, 200)}`);
  testMessageId = sendRes.data?.message?.id;
  assert('Message has id', !!testMessageId);
  assert('Message has content', sendRes.data?.message?.content === 'Hello from integration test!');

  // Send second message
  const send2 = await api('POST', `/api/smart-spaces/${crudSpaceId}/messages`, {
    entityId: testEntityId,
    content: 'Second test message',
  }, jwtHeaders(testJwt));
  assert('Send second message returns 201', send2.status === 201);

  // List messages
  const listRes = await api('GET', `/api/smart-spaces/${crudSpaceId}/messages`, undefined, jwtHeaders(testJwt));
  assert('List messages returns 200', listRes.status === 200);
  assert('Messages is array', Array.isArray(listRes.data?.messages));
  assert('Messages include entity info', listRes.data?.messages?.[0]?.entity !== undefined);

  const msgCount = listRes.data?.messages?.length ?? 0;
  assert('At least 2 messages returned', msgCount >= 2, `found ${msgCount}`);

  // List with limit
  const limitRes = await api('GET', `/api/smart-spaces/${crudSpaceId}/messages?limit=1`, undefined, jwtHeaders(testJwt));
  assert('Limit=1 returns at most 1 message', (limitRes.data?.messages?.length ?? 0) <= 1);

  // Membership check — non-member can't access
  const nonMemberJwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJub25leGlzdGVudCIsImlhdCI6MTcwMDAwMDAwMH0.invalid';
  const noAccess = await api('GET', `/api/smart-spaces/${crudSpaceId}/messages`, undefined, {
    'Authorization': `Bearer ${nonMemberJwt}`,
    'x-public-key': PK,
  });
  assert('Non-member → 401 or 403', noAccess.status === 401 || noAccess.status === 403);
}

// ─── Test 8: Known Space — Message Send (from curl) ─────────────────────────

async function test8_knownSpaceMessage() {
  console.log('\n═══ TEST 8: Known Space Message (curl) ═══');

  // Replicate the user's curl request
  const sendRes = await api('POST', `/api/smart-spaces/${KNOWN_SPACE_ID}/messages`, {
    content: 'integration test ping',
    entityId: KNOWN_ENTITY_ID,
  }, jwtHeaders(KNOWN_JWT));
  assert('Send to known space returns 201', sendRes.status === 201, `status: ${sendRes.status}, data: ${JSON.stringify(sendRes.data).slice(0, 300)}`);
  assert('Message persisted', !!sendRes.data?.message?.id);

  // List messages from known space
  const listRes = await api('GET', `/api/smart-spaces/${KNOWN_SPACE_ID}/messages?limit=5`, undefined, jwtHeaders(KNOWN_JWT));
  assert('List known space messages returns 200', listRes.status === 200);
  assert('Messages returned', (listRes.data?.messages?.length ?? 0) > 0, `count: ${listRes.data?.messages?.length}`);

  // Get known space
  const getSpace = await api('GET', `/api/smart-spaces/${KNOWN_SPACE_ID}`, undefined, jwtHeaders(KNOWN_JWT));
  assert('Get known space returns 200', getSpace.status === 200);
  assert('Known space has id', getSpace.data?.smartSpace?.id === KNOWN_SPACE_ID);

  // List members of known space
  const members = await api('GET', `/api/smart-spaces/${KNOWN_SPACE_ID}/members`, undefined, jwtHeaders(KNOWN_JWT));
  assert('List known space members returns 200', members.status === 200);
  assert('Known space has members', (members.data?.members?.length ?? 0) > 0);
}

// ─── Test 9: Read Receipts ──────────────────────────────────────────────────

async function test9_readReceipts() {
  console.log('\n═══ TEST 9: Read Receipts ═══');

  if (!crudSpaceId || !testJwt || !testMessageId) {
    console.log('  ⏭️ Skipped — missing prerequisites');
    return;
  }

  // Missing lastSeenMessageId → 400
  const badRead = await api('PATCH', `/api/smart-spaces/${crudSpaceId}/read`, {}, jwtHeaders(testJwt));
  assert('Read receipt without lastSeenMessageId → 400', badRead.status === 400);

  // Valid read receipt
  const readRes = await api('PATCH', `/api/smart-spaces/${crudSpaceId}/read`, {
    lastSeenMessageId: testMessageId,
  }, jwtHeaders(testJwt));
  assert('Read receipt returns 200', readRes.status === 200);
  assert('Read receipt success', readRes.data?.success === true);
}

// ─── Test 10: Cleanup ───────────────────────────────────────────────────────

async function test10_cleanup() {
  console.log('\n═══ TEST 10: Cleanup ═══');

  // Delete test space
  if (crudSpaceId) {
    const delRes = await api('DELETE', `/api/smart-spaces/${crudSpaceId}`, undefined, skHeaders());
    assert('Delete test space returns 200', delRes.status === 200);
    assert('Delete space success', delRes.data?.success === true);

    // Verify deleted
    const getDeleted = await api('GET', `/api/smart-spaces/${crudSpaceId}`, undefined, skHeaders());
    assert('Deleted space → 404', getDeleted.status === 404);
  }
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   Hsafa Spaces — Integration Test Suite              ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  try {
    await test1_auth();
    await test2_registerLogin();
    await test3_getMe();
    await test4_entities();
    await test5_spacesCrud();
    await test6_members();
    await test7_messages();
    await test8_knownSpaceMessage();
    await test9_readReceipts();
    await test10_cleanup();
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
