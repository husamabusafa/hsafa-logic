// =============================================================================
// Test Service for Hsafa Core v5
//
// Exercises the full v5 surface area:
//   - Tool registration (PUT scope tools)
//   - Event pushing (POST events)
//   - Action consumption (Redis Streams XREADGROUP)
//   - Action result submission (POST action result)
//   - Profile management (PATCH profile)
//   - Tool upsert + delete + scope delete
//   - SSE stream verification
//   - All 3 tool modes: sync, fire_and_forget, async
// =============================================================================

const CORE_URL = process.env.CORE_URL || 'http://localhost:3001';
const API_KEY = process.env.HSAFA_API_KEY || '';
const HASEEF_ID = process.env.HASEEF_ID || '';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const SCOPE = 'test';

if (!API_KEY) throw new Error('HSAFA_API_KEY is required');
if (!HASEEF_ID) throw new Error('HASEEF_ID is required');

// ── Stats ────────────────────────────────────────────────────────────────────
const stats = {
  startedAt: new Date().toISOString(),
  actionsHandled: 0,
  eventsPushed: 0,
};

// ── HTTP helpers ─────────────────────────────────────────────────────────────

async function api(method: string, path: string, body?: unknown) {
  const url = `${CORE_URL}${path}`;
  const res = await fetch(url, {
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
  if (!res.ok) {
    throw new Error(`API ${method} ${path} → ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function pushEvent(event: Record<string, unknown>) {
  const result = await api('POST', `/api/haseefs/${HASEEF_ID}/events`, event);
  stats.eventsPushed++;
  return result;
}

// ── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'echo',
    description: 'Echoes back the input message. Use this to test communication.',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'The message to echo back' },
      },
      required: ['message'],
    },
    mode: 'sync',
    timeout: 10000,
  },
  {
    name: 'add_numbers',
    description: 'Adds two numbers and returns the sum.',
    inputSchema: {
      type: 'object',
      properties: {
        a: { type: 'number', description: 'First number' },
        b: { type: 'number', description: 'Second number' },
      },
      required: ['a', 'b'],
    },
    mode: 'sync',
    timeout: 5000,
  },
  {
    name: 'log_event',
    description: 'Logs a message to the service console. No result returned.',
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
    description: 'Starts a slow background task. The result will arrive as a future event in your inbox.',
    inputSchema: {
      type: 'object',
      properties: {
        taskName: { type: 'string', description: 'Name of the task to run' },
        delaySeconds: { type: 'number', description: 'How many seconds the task takes' },
      },
      required: ['taskName'],
    },
    mode: 'async',
  },
  {
    name: 'get_status',
    description: 'Returns the current status of the test service: uptime, actions handled, events pushed.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    mode: 'sync',
    timeout: 5000,
  },
];

// ── Action handlers ──────────────────────────────────────────────────────────

async function handleAction(action: {
  messageId: string;
  actionId: string;
  name: string;
  args: Record<string, unknown>;
  mode: string;
}) {
  console.log(`[action] ${action.name} (${action.mode}) args=${JSON.stringify(action.args)}`);
  stats.actionsHandled++;

  switch (action.name) {
    case 'echo': {
      const result = { echo: action.args.message, timestamp: new Date().toISOString() };
      await api('POST', `/api/haseefs/${HASEEF_ID}/actions/${action.actionId}/result`, result);
      console.log(`  → echo result sent`);
      break;
    }

    case 'add_numbers': {
      const a = Number(action.args.a);
      const b = Number(action.args.b);
      const result = { sum: a + b };
      await api('POST', `/api/haseefs/${HASEEF_ID}/actions/${action.actionId}/result`, result);
      console.log(`  → add result: ${a} + ${b} = ${a + b}`);
      break;
    }

    case 'log_event': {
      const level = action.args.level as string;
      const message = action.args.message as string;
      console.log(`  → [${level.toUpperCase()}] ${message}`);
      // fire_and_forget — no result to send
      break;
    }

    case 'slow_task': {
      const taskName = action.args.taskName as string;
      const delaySeconds = Number(action.args.delaySeconds ?? 5);
      console.log(`  → starting slow task "${taskName}" (${delaySeconds}s delay)`);

      // Run in background — send result as future event
      setTimeout(async () => {
        try {
          await pushEvent({
            eventId: `task-complete-${action.actionId}`,
            scope: SCOPE,
            type: 'task_completed',
            data: {
              taskName,
              actionId: action.actionId,
              result: `Task "${taskName}" completed successfully`,
              duration: delaySeconds,
            },
          });
          console.log(`  → slow task "${taskName}" completed, event pushed`);
        } catch (err) {
          console.error(`  → slow task "${taskName}" failed to push event:`, err);
        }
      }, delaySeconds * 1000);
      break;
    }

    case 'get_status': {
      const uptime = (Date.now() - new Date(stats.startedAt).getTime()) / 1000;
      const result = { uptime, ...stats };
      await api('POST', `/api/haseefs/${HASEEF_ID}/actions/${action.actionId}/result`, result);
      console.log(`  → status result sent`);
      break;
    }

    default:
      console.warn(`  → unknown action: ${action.name}`);
  }
}

// ── Action consumer (Redis Streams via SSE) ─────────────────────────────────

async function consumeActionsSSE(signal: AbortSignal) {
  const url = `${CORE_URL}/api/haseefs/${HASEEF_ID}/scopes/${SCOPE}/actions/stream`;
  console.log(`[consumer] Connecting to action stream via SSE...`);

  while (!signal.aborted) {
    try {
      const res = await fetch(url, {
        headers: { 'x-api-key': API_KEY },
        signal,
      });

      if (!res.ok) {
        throw new Error(`SSE connect failed: ${res.status}`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (!signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const action = JSON.parse(line.slice(6));
              await handleAction(action);
            } catch (err) {
              console.error('[consumer] Failed to parse action:', err);
            }
          }
        }
      }
    } catch (err: any) {
      if (signal.aborted) break;
      console.error('[consumer] SSE error:', err.message);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Hsafa Core v5 Test Service ===');
  console.log(`Core: ${CORE_URL}`);
  console.log(`Haseef: ${HASEEF_ID}`);
  console.log(`Scope: ${SCOPE}`);
  console.log();

  // Phase 1: Setup
  console.log('── Phase 1: Setup ──');

  // 1. Set profile
  console.log('[setup] Setting profile...');
  const profileResult = await api('PATCH', `/api/haseefs/${HASEEF_ID}/profile`, {
    phone: '+1234567890',
    location: 'Test Lab',
    role: 'test-subject',
  });
  console.log('  Profile set:', JSON.stringify(profileResult.profile));

  // 2. Register tools
  console.log('[setup] Registering tools...');
  const toolResult = await api('PUT', `/api/haseefs/${HASEEF_ID}/scopes/${SCOPE}/tools`, {
    tools: TOOLS,
  });
  console.log(`  Registered ${toolResult.count} tools`);

  // 3. Verify tools
  const verifyResult = await api('GET', `/api/haseefs/${HASEEF_ID}/scopes/${SCOPE}/tools`);
  console.log(`  Verified: ${verifyResult.tools.length} tools in scope "${SCOPE}"`);
  for (const t of verifyResult.tools) {
    console.log(`    - ${t.name} (${t.mode})`);
  }

  // 4. Start action consumer
  const ac = new AbortController();
  consumeActionsSSE(ac.signal);

  // Give SSE a moment to connect
  await new Promise((r) => setTimeout(r, 1000));

  console.log();
  console.log('── Phase 2: Basic Event Round-Trip ──');

  // 6. Push test_ping
  console.log('[test] Pushing test_ping event...');
  await pushEvent({
    eventId: `ping-${crypto.randomUUID()}`,
    scope: SCOPE,
    type: 'ping',
    data: { message: 'Hello from test service', counter: 1 },
  });
  console.log('  Event pushed. Waiting for Haseef to process...');

  // Wait for the cycle to process
  await new Promise((r) => setTimeout(r, 15000));

  console.log();
  console.log('── Phase 3: Data Update Event ──');

  // Push data_update
  console.log('[test] Pushing data_update event...');
  await pushEvent({
    eventId: `data-${crypto.randomUUID()}`,
    scope: SCOPE,
    type: 'data_update',
    data: {
      key: 'temperature',
      value: 22.5,
      unit: 'celsius',
      source: 'sensor-001',
    },
  });
  console.log('  Data update pushed.');

  await new Promise((r) => setTimeout(r, 15000));

  console.log();
  console.log('── Phase 4: Multimodal Event ──');

  // Push image event
  console.log('[test] Pushing image_event...');
  await pushEvent({
    eventId: `img-${crypto.randomUUID()}`,
    scope: SCOPE,
    type: 'image_received',
    data: { source: 'camera-1', description: 'Test image' },
    attachments: [
      {
        type: 'image',
        mimeType: 'image/png',
        url: 'https://via.placeholder.com/100x100.png',
      },
    ],
  });
  console.log('  Image event pushed.');

  await new Promise((r) => setTimeout(r, 15000));

  console.log();
  console.log('── Phase 5: Tool Management ──');

  // Upsert tool
  console.log('[test] Upserting echo tool with new description...');
  const upsertResult = await api(
    'PUT',
    `/api/haseefs/${HASEEF_ID}/scopes/${SCOPE}/tools/echo`,
    {
      description: 'Echoes back the input message (UPDATED description).',
      inputSchema: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'The message to echo back' },
        },
        required: ['message'],
      },
      mode: 'sync',
      timeout: 10000,
    },
  );
  console.log('  Upserted:', upsertResult.tool.name, '-', upsertResult.tool.description);

  // Delete single tool
  console.log('[test] Deleting log_event tool...');
  await api('DELETE', `/api/haseefs/${HASEEF_ID}/scopes/${SCOPE}/tools/log_event`);
  console.log('  Deleted log_event');

  // Verify
  const afterDelete = await api('GET', `/api/haseefs/${HASEEF_ID}/scopes/${SCOPE}/tools`);
  console.log(`  Tools remaining: ${afterDelete.tools.length}`);
  for (const t of afterDelete.tools) {
    console.log(`    - ${t.name}`);
  }

  // Delete entire scope
  console.log('[test] Deleting entire test scope...');
  const scopeDeleteResult = await api('DELETE', `/api/haseefs/${HASEEF_ID}/scopes/${SCOPE}`);
  console.log(`  Scope deleted: ${scopeDeleteResult.deleted} tools removed`);

  // Verify scope is empty
  const afterScopeDelete = await api('GET', `/api/haseefs/${HASEEF_ID}/scopes/${SCOPE}/tools`);
  console.log(`  Tools in scope after delete: ${afterScopeDelete.tools.length}`);

  console.log();
  console.log('── Phase 6: Status & Summary ──');

  console.log(`  Actions handled: ${stats.actionsHandled}`);
  console.log(`  Events pushed: ${stats.eventsPushed}`);
  console.log(`  Uptime: ${(Date.now() - new Date(stats.startedAt).getTime()) / 1000}s`);

  // Check snapshots
  try {
    const snapshots = await api('GET', `/api/haseefs/${HASEEF_ID}/snapshots`);
    console.log(`  Snapshots: ${snapshots.snapshots.length}`);
  } catch {
    console.log('  Snapshots: (none or error)');
  }

  console.log();
  console.log('=== Test Service Complete ===');

  // Cleanup
  ac.abort();
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
