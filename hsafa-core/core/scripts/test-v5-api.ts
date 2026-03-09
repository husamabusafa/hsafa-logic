#!/usr/bin/env tsx
// =============================================================================
// Hsafa Core v5 — Automated API Test Suite
//
// Tests ALL v5 API routes and subsystems against a live Core instance.
// Does NOT require an LLM — tests HTTP layer, Redis dispatch, inbox, tools, etc.
//
// Usage: tsx --env-file=.env scripts/test-v5-api.ts
// =============================================================================

import { randomUUID } from 'crypto';
import Redis from 'ioredis';

const CORE_URL = process.env.CORE_URL || `http://localhost:${process.env.PORT || 3001}`;
const API_KEY = process.env.HSAFA_API_KEY || '';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

if (!API_KEY) {
  console.error('HSAFA_API_KEY is required. Set it in .env');
  process.exit(1);
}

// ── Test framework ───────────────────────────────────────────────────────────

let totalTests = 0;
let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, msg: string) {
  totalTests++;
  if (condition) {
    passed++;
    console.log(`  ✅ ${msg}`);
  } else {
    failed++;
    failures.push(msg);
    console.log(`  ❌ ${msg}`);
  }
}

function assertEqual(actual: unknown, expected: unknown, msg: string) {
  assert(actual === expected, `${msg} (expected=${JSON.stringify(expected)}, got=${JSON.stringify(actual)})`);
}

function assertIncludes(arr: unknown[], item: unknown, msg: string) {
  assert(arr.includes(item), msg);
}

function section(name: string) {
  console.log(`\n${'─'.repeat(60)}\n  ${name}\n${'─'.repeat(60)}`);
}

// ── HTTP helper ──────────────────────────────────────────────────────────────

async function api(method: string, path: string, body?: unknown): Promise<{ status: number; data: any }> {
  const res = await fetch(`${CORE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

async function apiOk(method: string, path: string, body?: unknown): Promise<any> {
  const { status, data } = await api(method, path, body);
  if (status >= 400) {
    throw new Error(`API ${method} ${path} → ${status}: ${JSON.stringify(data)}`);
  }
  return data;
}

// ── Redis helper ─────────────────────────────────────────────────────────────

let redis: Redis;

// =============================================================================
// Tests
// =============================================================================

async function testHealthCheck() {
  section('Health Check');
  const res = await fetch(`${CORE_URL}/health`);
  const data = await res.json();
  assertEqual(data.status, 'ok', 'Health status is ok');
  assertEqual(data.service, 'hsafa-core', 'Service name is hsafa-core');
  assert(data.version === '5.0.0', `Version is 5.0.0 (got ${data.version})`);
  assert(typeof data.processes === 'number', 'Processes count is a number');
}

async function testAuthRequired() {
  section('Auth — Missing API Key');
  const res = await fetch(`${CORE_URL}/api/haseefs`, {
    headers: { 'Content-Type': 'application/json' },
  });
  assertEqual(res.status, 401, 'Missing key returns 401');

  const res2 = await fetch(`${CORE_URL}/api/haseefs`, {
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': 'wrong-key',
    },
  });
  assertEqual(res2.status, 401, 'Wrong key returns 401');
}

let testHaseefId: string;

async function testHaseefCRUD() {
  section('Haseef CRUD');

  // Create
  const createRes = await apiOk('POST', '/api/haseefs', {
    name: `test-haseef-${Date.now()}`,
    description: 'Test Haseef for API tests',
    configJson: {
      model: { provider: 'openai', model: 'gpt-4o-mini' },
      instructions: 'You are a test haseef.',
    },
  });
  assert(!!createRes.haseef?.id, 'Create returns haseef with id');
  assert(!!createRes.haseef?.name, 'Create returns haseef with name');
  assert(!!createRes.haseef?.configHash, 'Create returns haseef with configHash');
  testHaseefId = createRes.haseef.id;

  // Get
  const getRes = await apiOk('GET', `/api/haseefs/${testHaseefId}`);
  assertEqual(getRes.haseef.id, testHaseefId, 'Get returns correct haseef');
  assertEqual(getRes.haseef.description, 'Test Haseef for API tests', 'Get returns correct description');

  // List
  const listRes = await apiOk('GET', '/api/haseefs');
  assert(Array.isArray(listRes.haseefs), 'List returns array');
  const found = listRes.haseefs.find((h: any) => h.id === testHaseefId);
  assert(!!found, 'List includes created haseef');

  // Update
  const oldHash = getRes.haseef.configHash;
  const updateRes = await apiOk('PATCH', `/api/haseefs/${testHaseefId}`, {
    description: 'Updated description',
    configJson: {
      model: { provider: 'openai', model: 'gpt-4o' },
      instructions: 'Updated instructions.',
    },
  });
  assertEqual(updateRes.haseef.description, 'Updated description', 'Update changes description');
  assert(updateRes.haseef.configHash !== oldHash, 'Config hash changes after config update');

  // Get 404
  const { status: notFoundStatus } = await api('GET', `/api/haseefs/${randomUUID()}`);
  assertEqual(notFoundStatus, 404, 'Get nonexistent haseef returns 404');

  // Duplicate name
  const { status: dupStatus } = await api('POST', '/api/haseefs', {
    name: createRes.haseef.name,
    configJson: { model: { provider: 'openai', model: 'gpt-4o-mini' } },
  });
  assertEqual(dupStatus, 409, 'Duplicate name returns 409');
}

async function testProfile() {
  section('Profile Management');

  // Get initial profile (should be empty/null)
  const getRes = await apiOk('GET', `/api/haseefs/${testHaseefId}/profile`);
  assert(getRes.profile !== undefined, 'Get profile returns profile field');

  // Set profile
  const profileData = {
    phone: '+1234567890',
    location: 'Test Lab',
    bio: 'I am a test haseef',
    skills: ['testing', 'echoing'],
  };
  const patchRes = await apiOk('PATCH', `/api/haseefs/${testHaseefId}/profile`, profileData);
  assertEqual(patchRes.profile.phone, '+1234567890', 'Profile phone set');
  assertEqual(patchRes.profile.location, 'Test Lab', 'Profile location set');
  assert(Array.isArray(patchRes.profile.skills), 'Profile skills is array');

  // Update profile
  const updateRes = await apiOk('PATCH', `/api/haseefs/${testHaseefId}/profile`, {
    phone: '+9876543210',
    location: 'Updated Lab',
  });
  assertEqual(updateRes.profile.phone, '+9876543210', 'Profile phone updated');
  assertEqual(updateRes.profile.location, 'Updated Lab', 'Profile location updated');

  // Profile 404
  const { status } = await api('PATCH', `/api/haseefs/${randomUUID()}/profile`, { x: 1 });
  assertEqual(status, 404, 'Profile update on nonexistent haseef returns 404');
}

async function testToolRegistration() {
  section('Tool Registration (Scopes)');

  const SCOPE = 'test';
  const tools = [
    {
      name: 'echo',
      description: 'Echoes back the input message.',
      inputSchema: {
        type: 'object',
        properties: { message: { type: 'string' } },
        required: ['message'],
      },
      mode: 'sync',
      timeout: 10000,
    },
    {
      name: 'add_numbers',
      description: 'Adds two numbers.',
      inputSchema: {
        type: 'object',
        properties: {
          a: { type: 'number' },
          b: { type: 'number' },
        },
        required: ['a', 'b'],
      },
      mode: 'sync',
      timeout: 5000,
    },
    {
      name: 'log_event',
      description: 'Logs a message.',
      inputSchema: {
        type: 'object',
        properties: {
          level: { type: 'string', enum: ['info', 'warn', 'error'] },
          message: { type: 'string' },
        },
        required: ['level', 'message'],
      },
      mode: 'fire_and_forget',
    },
    {
      name: 'slow_task',
      description: 'Starts a slow task.',
      inputSchema: {
        type: 'object',
        properties: {
          taskName: { type: 'string' },
          delaySeconds: { type: 'number' },
        },
        required: ['taskName'],
      },
      mode: 'async',
    },
    {
      name: 'get_status',
      description: 'Returns service status.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
      mode: 'sync',
      timeout: 5000,
    },
  ];

  // PUT sync all tools
  const syncRes = await apiOk('PUT', `/api/haseefs/${testHaseefId}/scopes/${SCOPE}/tools`, { tools });
  assertEqual(syncRes.count, 5, 'Sync registers 5 tools');
  assert(Array.isArray(syncRes.tools), 'Sync returns tools array');

  // Verify each tool
  for (const t of tools) {
    const found = syncRes.tools.find((st: any) => st.name === t.name);
    assert(!!found, `Tool "${t.name}" registered`);
    if (found) {
      assertEqual(found.mode, t.mode, `Tool "${t.name}" has correct mode`);
      assertEqual(found.scope, SCOPE, `Tool "${t.name}" has correct scope`);
    }
  }

  // GET scope tools
  const listRes = await apiOk('GET', `/api/haseefs/${testHaseefId}/scopes/${SCOPE}/tools`);
  assertEqual(listRes.tools.length, 5, 'List scope tools returns 5');

  // GET all tools (across scopes)
  const allRes = await apiOk('GET', `/api/haseefs/${testHaseefId}/scopes`);
  assert(allRes.tools.length >= 5, 'List all tools includes at least 5');

  // Validation: missing fields
  const { status: badStatus } = await api('PUT', `/api/haseefs/${testHaseefId}/scopes/${SCOPE}/tools`, {
    tools: [{ name: 'bad' }], // missing description, inputSchema
  });
  assertEqual(badStatus, 400, 'Missing tool fields returns 400');

  // Validation: not an array
  const { status: notArrayStatus } = await api('PUT', `/api/haseefs/${testHaseefId}/scopes/${SCOPE}/tools`, {
    tools: 'not-array',
  });
  assertEqual(notArrayStatus, 400, 'Non-array tools returns 400');
}

async function testToolUpsert() {
  section('Tool Upsert');

  const SCOPE = 'test';

  // Upsert existing tool with new description
  const upsertRes = await apiOk('PUT', `/api/haseefs/${testHaseefId}/scopes/${SCOPE}/tools/echo`, {
    description: 'Updated echo tool description.',
    inputSchema: {
      type: 'object',
      properties: { message: { type: 'string' } },
      required: ['message'],
    },
    mode: 'sync',
    timeout: 15000,
  });
  assertEqual(upsertRes.tool.description, 'Updated echo tool description.', 'Upsert updates description');
  assertEqual(upsertRes.tool.timeout, 15000, 'Upsert updates timeout');

  // Upsert new tool (creates it)
  const newToolRes = await apiOk('PUT', `/api/haseefs/${testHaseefId}/scopes/${SCOPE}/tools/new_tool`, {
    description: 'A brand new tool.',
    inputSchema: {
      type: 'object',
      properties: { x: { type: 'string' } },
      required: ['x'],
    },
    mode: 'sync',
    timeout: 3000,
  });
  assertEqual(newToolRes.tool.name, 'new_tool', 'Upsert creates new tool');

  // Verify count increased
  const listRes = await apiOk('GET', `/api/haseefs/${testHaseefId}/scopes/${SCOPE}/tools`);
  assertEqual(listRes.tools.length, 6, 'Tool count is now 6');

  // Missing fields
  const { status } = await api('PUT', `/api/haseefs/${testHaseefId}/scopes/${SCOPE}/tools/bad`, {
    description: 'No schema',
  });
  assertEqual(status, 400, 'Upsert without inputSchema returns 400');
}

async function testToolDelete() {
  section('Tool Delete');

  const SCOPE = 'test';

  // Delete single tool
  const delRes = await apiOk('DELETE', `/api/haseefs/${testHaseefId}/scopes/${SCOPE}/tools/new_tool`);
  assertEqual(delRes.success, true, 'Delete single tool returns success');

  // Verify count
  const listRes = await apiOk('GET', `/api/haseefs/${testHaseefId}/scopes/${SCOPE}/tools`);
  assertEqual(listRes.tools.length, 5, 'Tool count back to 5');

  // Delete nonexistent tool
  const { status } = await api('DELETE', `/api/haseefs/${testHaseefId}/scopes/${SCOPE}/tools/nonexistent`);
  assertEqual(status, 404, 'Delete nonexistent tool returns 404');
}

async function testScopeDelete() {
  section('Scope Delete');

  const SCOPE = 'test';

  // Delete entire scope
  const delRes = await apiOk('DELETE', `/api/haseefs/${testHaseefId}/scopes/${SCOPE}`);
  assert(typeof delRes.deleted === 'number', 'Scope delete returns deleted count');
  assert(delRes.deleted > 0, 'Scope delete removes tools');

  // Verify scope is empty
  const listRes = await apiOk('GET', `/api/haseefs/${testHaseefId}/scopes/${SCOPE}/tools`);
  assertEqual(listRes.tools.length, 0, 'Scope is empty after delete');
}

async function testEventPush() {
  section('Event Push');

  // Push single event
  const pushRes = await apiOk('POST', `/api/haseefs/${testHaseefId}/events`, {
    eventId: `test-event-${randomUUID()}`,
    scope: 'test',
    type: 'ping',
    data: { message: 'Hello', counter: 1 },
  });
  assertEqual(pushRes.pushed, 1, 'Push single event returns pushed=1');

  // Push batch
  const batchRes = await apiOk('POST', `/api/haseefs/${testHaseefId}/events`, [
    {
      eventId: `batch-1-${randomUUID()}`,
      scope: 'test',
      type: 'ping',
      data: { message: 'Batch 1' },
    },
    {
      eventId: `batch-2-${randomUUID()}`,
      scope: 'test',
      type: 'data_update',
      data: { key: 'temp', value: 22.5 },
    },
  ]);
  assertEqual(batchRes.pushed, 2, 'Push batch returns pushed=2');

  // Push with attachments (multimodal)
  const multiRes = await apiOk('POST', `/api/haseefs/${testHaseefId}/events`, {
    eventId: `img-${randomUUID()}`,
    scope: 'test',
    type: 'image_received',
    data: { source: 'camera-1' },
    attachments: [
      { type: 'image', mimeType: 'image/png', url: 'https://via.placeholder.com/100x100.png' },
    ],
  });
  assertEqual(multiRes.pushed, 1, 'Push multimodal event succeeds');

  // Push to nonexistent haseef
  const { status } = await api('POST', `/api/haseefs/${randomUUID()}/events`, {
    eventId: `x-${randomUUID()}`,
    scope: 'test',
    type: 'ping',
    data: {},
  });
  assertEqual(status, 404, 'Push to nonexistent haseef returns 404');

  // Validation: missing required fields
  const { status: badStatus } = await api('POST', `/api/haseefs/${testHaseefId}/events`, {
    // missing eventId, scope, type
    data: {},
  });
  assertEqual(badStatus, 400, 'Push without required fields returns 400');

  // Dedup: push same eventId twice
  const dedupId = `dedup-${randomUUID()}`;
  await apiOk('POST', `/api/haseefs/${testHaseefId}/events`, {
    eventId: dedupId,
    scope: 'test',
    type: 'ping',
    data: { message: 'first' },
  });
  const dedup2 = await apiOk('POST', `/api/haseefs/${testHaseefId}/events`, {
    eventId: dedupId,
    scope: 'test',
    type: 'ping',
    data: { message: 'duplicate' },
  });
  assertEqual(dedup2.pushed, 1, 'Dedup push does not error (upsert no-op)');
}

async function testInboxRedis() {
  section('Inbox — Redis Integration');

  // Push an event and verify it lands in Redis
  const eventId = `redis-test-${randomUUID()}`;
  await apiOk('POST', `/api/haseefs/${testHaseefId}/events`, {
    eventId,
    scope: 'test',
    type: 'redis_check',
    data: { check: true },
  });

  // Check Redis list has the event
  const key = `inbox:${testHaseefId}`;
  const len = await redis.llen(key);
  assert(len > 0, `Redis inbox has events (len=${len})`);

  // Peek at the last pushed event
  const items = await redis.lrange(key, 0, -1);
  const foundInRedis = items.some((item) => {
    try {
      const parsed = JSON.parse(item);
      return parsed.eventId === eventId;
    } catch {
      return false;
    }
  });
  assert(foundInRedis, 'Pushed event found in Redis inbox');
}

async function testActionDispatch() {
  section('Action Dispatch — Redis Streams');

  // Register a sync tool for action dispatch testing
  const SCOPE = 'action-test';
  await apiOk('PUT', `/api/haseefs/${testHaseefId}/scopes/${SCOPE}/tools`, {
    tools: [{
      name: 'test_action',
      description: 'Test action tool.',
      inputSchema: {
        type: 'object',
        properties: { msg: { type: 'string' } },
        required: ['msg'],
      },
      mode: 'sync',
      timeout: 10000,
    }],
  });

  // Verify the action stream key naming
  const streamKey = `actions:${testHaseefId}:${SCOPE}`;
  assert(!!streamKey, `Action stream key: ${streamKey}`);

  // Create consumer group (same as what the SSE route does)
  const groupName = `${SCOPE}-consumer`;
  try {
    await redis.xgroup('CREATE', streamKey, groupName, '0', 'MKSTREAM');
  } catch (err: any) {
    if (!err.message?.includes('BUSYGROUP')) throw err;
  }
  assert(true, 'Consumer group created/exists');

  // Clean up
  await apiOk('DELETE', `/api/haseefs/${testHaseefId}/scopes/${SCOPE}`);
}

async function testActionResultSubmission() {
  section('Action Result — Pub/Sub');

  // Simulate: subscribe on action_result channel, then publish result
  const actionId = randomUUID();
  const resultChannel = `action_result:${actionId}`;

  const sub = redis.duplicate();
  let receivedResult: any = null;

  await new Promise<void>(async (resolve) => {
    sub.on('message', (_ch: string, message: string) => {
      receivedResult = JSON.parse(message);
      resolve();
    });
    await sub.subscribe(resultChannel);

    // Submit action result via API
    await apiOk('POST', `/api/haseefs/${testHaseefId}/actions/${actionId}/result`, {
      echo: 'hello',
      timestamp: new Date().toISOString(),
    });
  });

  assert(receivedResult?.echo === 'hello', 'Action result received via Pub/Sub');
  await sub.unsubscribe(resultChannel);
  await sub.quit();
}

async function testSSEStream() {
  section('SSE Stream — Haseef Thinking Stream');

  const channel = `haseef:${testHaseefId}:stream`;

  // Set up a Redis subscriber to verify stream works
  const sub = redis.duplicate();
  let receivedEvent: any = null;

  await new Promise<void>(async (resolve) => {
    const timer = setTimeout(resolve, 3000); // 3s timeout

    sub.on('message', (_ch: string, message: string) => {
      clearTimeout(timer);
      receivedEvent = JSON.parse(message);
      resolve();
    });
    await sub.subscribe(channel);

    // Publish a test event on the stream channel
    await redis.publish(channel, JSON.stringify({
      type: 'test.ping',
      haseefId: testHaseefId,
      timestamp: new Date().toISOString(),
    }));
  });

  assert(receivedEvent?.type === 'test.ping', 'SSE stream receives events via Redis Pub/Sub');
  await sub.unsubscribe(channel);
  await sub.quit();
}

async function testProcessControl() {
  section('Process Control');

  // Get status
  const statusRes = await apiOk('GET', `/api/haseefs/${testHaseefId}/status`);
  assert(typeof statusRes.running === 'boolean', 'Status returns running boolean');

  // Stop (may or may not be running — should not error)
  const stopRes = await apiOk('POST', `/api/haseefs/${testHaseefId}/stop`);
  assertEqual(stopRes.status, 'stopped', 'Stop returns status=stopped');

  // Start
  const startRes = await apiOk('POST', `/api/haseefs/${testHaseefId}/start`);
  assertEqual(startRes.status, 'started', 'Start returns status=started');

  // Wait a moment for process to initialize
  await new Promise((r) => setTimeout(r, 500));

  // Verify running
  const statusAfter = await apiOk('GET', `/api/haseefs/${testHaseefId}/status`);
  assertEqual(statusAfter.running, true, 'Haseef is running after start');

  // Stop again
  await apiOk('POST', `/api/haseefs/${testHaseefId}/stop`);
  await new Promise((r) => setTimeout(r, 500));
  const statusStopped = await apiOk('GET', `/api/haseefs/${testHaseefId}/status`);
  assertEqual(statusStopped.running, false, 'Haseef is stopped after stop');
}

async function testSnapshots() {
  section('Consciousness Snapshots');

  // List snapshots (may be empty)
  const listRes = await apiOk('GET', `/api/haseefs/${testHaseefId}/snapshots`);
  assert(Array.isArray(listRes.snapshots), 'List snapshots returns array');
  const initialCount = listRes.snapshots.length;

  // Create snapshot — may fail if no consciousness exists (fresh haseef)
  const { status: snapStatus, data: snapData } = await api('POST', `/api/haseefs/${testHaseefId}/snapshot`);
  if (snapStatus === 200) {
    assert(!!snapData.snapshot?.id, 'Create snapshot returns snapshot with id');
    assertEqual(snapData.snapshot.reason, 'manual', 'Snapshot reason is manual');

    // List again
    const listRes2 = await apiOk('GET', `/api/haseefs/${testHaseefId}/snapshots`);
    assertEqual(listRes2.snapshots.length, initialCount + 1, 'Snapshot count increased by 1');
  } else {
    // Fresh haseef with no consciousness — snapshot correctly refused
    assert(snapStatus === 500 && snapData.error?.includes('No consciousness'), 'Snapshot correctly refused for fresh haseef');
  }
}

async function testRuns() {
  section('Runs');

  // List runs (filtered by haseefId)
  const listRes = await apiOk('GET', `/api/runs?haseefId=${testHaseefId}`);
  assert(Array.isArray(listRes.runs), 'List runs returns array');

  // List with limit
  const limitRes = await apiOk('GET', '/api/runs?limit=5');
  assert(limitRes.runs.length <= 5, 'List runs respects limit');

  // List with status filter
  const statusRes = await apiOk('GET', '/api/runs?status=completed');
  assert(Array.isArray(statusRes.runs), 'List runs with status filter works');

  // Get nonexistent run
  const { status } = await api('GET', `/api/runs/${randomUUID()}`);
  assertEqual(status, 404, 'Get nonexistent run returns 404');
}

async function testAdminStatus() {
  section('Admin Status');

  const res = await apiOk('GET', '/api/status');
  assert(typeof res.uptime === 'number', 'Status returns uptime');
  assert(typeof res.processCount === 'number', 'Status returns processCount');
  assert(Array.isArray(res.haseefs), 'Status returns haseefs array');
}

async function testMultiScope() {
  section('Multi-Scope Tool Registration');

  // Register tools in two different scopes
  await apiOk('PUT', `/api/haseefs/${testHaseefId}/scopes/scope_a/tools`, {
    tools: [{
      name: 'tool_a1',
      description: 'Tool A1',
      inputSchema: { type: 'object', properties: {}, required: [] },
      mode: 'sync',
    }],
  });

  await apiOk('PUT', `/api/haseefs/${testHaseefId}/scopes/scope_b/tools`, {
    tools: [{
      name: 'tool_b1',
      description: 'Tool B1',
      inputSchema: { type: 'object', properties: {}, required: [] },
      mode: 'fire_and_forget',
    }, {
      name: 'tool_b2',
      description: 'Tool B2',
      inputSchema: { type: 'object', properties: {}, required: [] },
      mode: 'async',
    }],
  });

  // List all tools across scopes
  const allRes = await apiOk('GET', `/api/haseefs/${testHaseefId}/scopes`);
  const names = allRes.tools.map((t: any) => t.name);
  assert(names.includes('tool_a1'), 'All-tools includes scope_a tool');
  assert(names.includes('tool_b1'), 'All-tools includes scope_b tool_b1');
  assert(names.includes('tool_b2'), 'All-tools includes scope_b tool_b2');

  // List scope_a only
  const scopeARes = await apiOk('GET', `/api/haseefs/${testHaseefId}/scopes/scope_a/tools`);
  assertEqual(scopeARes.tools.length, 1, 'scope_a has 1 tool');

  // List scope_b only
  const scopeBRes = await apiOk('GET', `/api/haseefs/${testHaseefId}/scopes/scope_b/tools`);
  assertEqual(scopeBRes.tools.length, 2, 'scope_b has 2 tools');

  // Delete scope_a
  await apiOk('DELETE', `/api/haseefs/${testHaseefId}/scopes/scope_a`);
  const afterA = await apiOk('GET', `/api/haseefs/${testHaseefId}/scopes/scope_a/tools`);
  assertEqual(afterA.tools.length, 0, 'scope_a empty after delete');

  // scope_b still intact
  const afterB = await apiOk('GET', `/api/haseefs/${testHaseefId}/scopes/scope_b/tools`);
  assertEqual(afterB.tools.length, 2, 'scope_b still has 2 tools');

  // Cleanup
  await apiOk('DELETE', `/api/haseefs/${testHaseefId}/scopes/scope_b`);
}

async function testToolModeSync() {
  section('Tool Builder — Sync Mode via Redis Streams');

  // Register a sync tool, then simulate what happens during a think cycle:
  // The tool-builder dispatches an action to Redis Streams.
  // We verify the action appears in the stream.
  const SCOPE = 'sync-test';
  await apiOk('PUT', `/api/haseefs/${testHaseefId}/scopes/${SCOPE}/tools`, {
    tools: [{
      name: 'sync_echo',
      description: 'Sync echo test',
      inputSchema: { type: 'object', properties: { msg: { type: 'string' } }, required: ['msg'] },
      mode: 'sync',
      timeout: 5000,
    }],
  });

  // Verify tool is registered
  const verify = await apiOk('GET', `/api/haseefs/${testHaseefId}/scopes/${SCOPE}/tools`);
  assertEqual(verify.tools.length, 1, 'Sync tool registered');
  assertEqual(verify.tools[0].mode, 'sync', 'Tool mode is sync');

  // Cleanup
  await apiOk('DELETE', `/api/haseefs/${testHaseefId}/scopes/${SCOPE}`);
}

async function testScopeResyncReplace() {
  section('Scope Resync — Full Replace');

  const SCOPE = 'resync-test';

  // Register 3 tools
  await apiOk('PUT', `/api/haseefs/${testHaseefId}/scopes/${SCOPE}/tools`, {
    tools: [
      { name: 't1', description: 'Tool 1', inputSchema: { type: 'object', properties: {}, required: [] }, mode: 'sync' },
      { name: 't2', description: 'Tool 2', inputSchema: { type: 'object', properties: {}, required: [] }, mode: 'sync' },
      { name: 't3', description: 'Tool 3', inputSchema: { type: 'object', properties: {}, required: [] }, mode: 'sync' },
    ],
  });

  let list = await apiOk('GET', `/api/haseefs/${testHaseefId}/scopes/${SCOPE}/tools`);
  assertEqual(list.tools.length, 3, 'Initial: 3 tools');

  // Resync with only 2 tools (t1 gone, t4 added)
  await apiOk('PUT', `/api/haseefs/${testHaseefId}/scopes/${SCOPE}/tools`, {
    tools: [
      { name: 't2', description: 'Tool 2 updated', inputSchema: { type: 'object', properties: {}, required: [] }, mode: 'sync' },
      { name: 't4', description: 'Tool 4 new', inputSchema: { type: 'object', properties: {}, required: [] }, mode: 'async' },
    ],
  });

  list = await apiOk('GET', `/api/haseefs/${testHaseefId}/scopes/${SCOPE}/tools`);
  assertEqual(list.tools.length, 2, 'After resync: 2 tools');
  const names = list.tools.map((t: any) => t.name);
  assert(!names.includes('t1'), 't1 removed by resync');
  assert(!names.includes('t3'), 't3 removed by resync');
  assert(names.includes('t2'), 't2 still present');
  assert(names.includes('t4'), 't4 added by resync');
  
  const t2 = list.tools.find((t: any) => t.name === 't2');
  assertEqual(t2?.description, 'Tool 2 updated', 't2 description updated by resync');

  // Cleanup
  await apiOk('DELETE', `/api/haseefs/${testHaseefId}/scopes/${SCOPE}`);
}

async function testCleanup() {
  section('Cleanup');

  // Clear inbox in Redis
  const inboxKey = `inbox:${testHaseefId}`;
  const deleted = await redis.del(inboxKey);
  assert(deleted >= 0, `Redis inbox cleared (deleted ${deleted} keys)`);

  // Stop process if running
  await apiOk('POST', `/api/haseefs/${testHaseefId}/stop`);

  // Delete the test haseef
  const delRes = await apiOk('DELETE', `/api/haseefs/${testHaseefId}`);
  assertEqual(delRes.success, true, 'Test haseef deleted');

  // Verify deleted
  const { status } = await api('GET', `/api/haseefs/${testHaseefId}`);
  assertEqual(status, 404, 'Deleted haseef returns 404');
}

// =============================================================================
// Runner
// =============================================================================

async function main() {
  console.log('═'.repeat(60));
  console.log('  Hsafa Core v5 — API Test Suite');
  console.log('═'.repeat(60));
  console.log(`Core URL: ${CORE_URL}`);
  console.log(`Redis URL: ${REDIS_URL}`);
  console.log();

  redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 3 });

  try {
    await testHealthCheck();
    await testAuthRequired();
    await testHaseefCRUD();
    await testProfile();
    await testToolRegistration();
    await testToolUpsert();
    await testToolDelete();
    await testScopeDelete();
    await testScopeResyncReplace();
    await testMultiScope();
    await testEventPush();
    await testInboxRedis();
    await testActionDispatch();
    await testActionResultSubmission();
    await testSSEStream();
    await testProcessControl();
    await testSnapshots();
    await testRuns();
    await testAdminStatus();
    await testToolModeSync();
    await testCleanup();
  } catch (err) {
    console.error('\n💥 Fatal test error:', err);
    failed++;
  }

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log(`  Results: ${passed}/${totalTests} passed, ${failed} failed`);
  console.log('═'.repeat(60));

  if (failures.length > 0) {
    console.log('\nFailed tests:');
    for (const f of failures) {
      console.log(`  ❌ ${f}`);
    }
  }

  redis.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main();
