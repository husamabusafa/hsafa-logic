#!/usr/bin/env tsx
// =============================================================================
// Hsafa Core v5 — End-to-End Run Test (GPT-5.2)
//
// Creates a Haseef with Claude Sonnet, registers tools, pushes events,
// handles tool calls via SSE, and verifies full round-trip through
// the think cycle.
//
// Usage: tsx --env-file=.env scripts/test-e2e-run.ts
// =============================================================================

import { randomUUID } from 'crypto';
import Redis from 'ioredis';

const CORE_URL = process.env.CORE_URL || `http://localhost:${process.env.PORT || 3001}`;
const API_KEY = process.env.HSAFA_API_KEY || '';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const SCOPE = 'e2e-test';

if (!API_KEY) {
  console.error('HSAFA_API_KEY is required');
  process.exit(1);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function api(method: string, path: string, body?: unknown): Promise<{ status: number; data: any }> {
  const res = await fetch(`${CORE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

async function apiOk(method: string, path: string, body?: unknown): Promise<any> {
  const { status, data } = await api(method, path, body);
  if (status >= 400) throw new Error(`API ${method} ${path} → ${status}: ${JSON.stringify(data)}`);
  return data;
}

function log(tag: string, ...args: unknown[]) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] [${tag}]`, ...args);
}

// ── State ────────────────────────────────────────────────────────────────────

let haseefId: string;
let haseefName: string;
const toolCallsHandled: Array<{ name: string; args: any; result: any }> = [];
const streamEvents: Array<{ type: string; [k: string]: unknown }> = [];
let actionConsumerAbort: AbortController;
let streamAbort: AbortController;

// ── Tool handlers ────────────────────────────────────────────────────────────

async function handleAction(action: { actionId: string; name: string; args: any; mode: string }) {
  log('tool-call', `${action.name}(${JSON.stringify(action.args)}) [${action.mode}]`);

  let result: any;

  switch (action.name) {
    case 'echo':
      result = { echo: action.args.message, timestamp: new Date().toISOString() };
      break;

    case 'add_numbers':
      result = { sum: Number(action.args.a) + Number(action.args.b) };
      break;

    case 'get_weather':
      result = {
        city: action.args.city,
        temperature: 24,
        unit: 'celsius',
        condition: 'sunny',
        humidity: 45,
      };
      break;

    case 'log_event':
      log('fire-forget', `[${action.args.level}] ${action.args.message}`);
      result = null; // fire_and_forget — no result needed
      break;

    default:
      result = { error: `Unknown tool: ${action.name}` };
  }

  const record = { name: action.name, args: action.args, result };
  toolCallsHandled.push(record);

  // Submit result (skip for fire_and_forget)
  if (action.mode !== 'fire_and_forget' && result !== null) {
    await apiOk('POST', `/api/haseefs/${haseefId}/actions/${action.actionId}/result`, result);
    log('tool-result', `${action.name} → ${JSON.stringify(result)}`);
  }
}

// ── SSE consumers ────────────────────────────────────────────────────────────

async function startActionConsumer(signal: AbortSignal) {
  const url = `${CORE_URL}/api/haseefs/${haseefId}/scopes/${SCOPE}/actions/stream`;
  log('consumer', 'Connecting to action stream...');

  while (!signal.aborted) {
    try {
      const res = await fetch(url, { headers: { 'x-api-key': API_KEY }, signal });
      if (!res.ok) throw new Error(`SSE ${res.status}`);

      log('consumer', 'Connected ✓');
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
            } catch (err: any) {
              log('consumer', 'Parse error:', err.message);
            }
          }
        }
      }
    } catch (err: any) {
      if (signal.aborted) break;
      log('consumer', 'Error:', err.message, '— reconnecting in 1s');
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

async function startThinkingStreamListener(signal: AbortSignal) {
  const url = `${CORE_URL}/api/haseefs/${haseefId}/stream`;
  log('stream', 'Connecting to thinking stream...');

  try {
    const res = await fetch(url, { headers: { 'x-api-key': API_KEY }, signal });
    if (!res.ok) throw new Error(`SSE ${res.status}`);

    log('stream', 'Connected ✓');
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
            const event = JSON.parse(line.slice(6));
            streamEvents.push(event);

            switch (event.type) {
              case 'run.started':
                log('stream', `Run started (cycle #${event.cycleNumber})`);
                break;
              case 'tool.started':
                log('stream', `Tool started: ${event.toolName}`);
                break;
              case 'tool.done':
                log('stream', `Tool done: ${event.toolName} → ${JSON.stringify(event.result)?.slice(0, 80)}`);
                break;
              case 'text.delta':
                // Don't log every delta — too noisy
                break;
              case 'step.finish':
                log('stream', `Step finished (reason: ${event.finishReason})`);
                break;
              case 'run.finished':
                log('stream', `Run finished (${event.durationMs}ms, ${event.stepCount} tool calls)`);
                break;
              default:
                log('stream', `Event: ${event.type}`);
            }
          } catch {}
        }
      }
    }
  } catch (err: any) {
    if (!signal.aborted) log('stream', 'Error:', err.message);
  }
}

// =============================================================================
// Main test flow
// =============================================================================

async function main() {
  console.log('');
  console.log('═'.repeat(60));
  console.log('  Hsafa Core v5 — End-to-End Run Test');
  console.log('═'.repeat(60));
  console.log('');

  const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 3 });

  try {
    // ── Phase 1: Create Haseef with Claude Sonnet ────────────────────────

    log('setup', 'Creating test Haseef with Claude Sonnet...');
    haseefName = `e2e-test-${Date.now()}`;
    const createRes = await apiOk('POST', '/api/haseefs', {
      name: haseefName,
      description: 'E2E test Haseef — Claude Sonnet',
      configJson: {
        model: { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
        instructions: [
          'You are a test Haseef. When you receive events, process them and use the available tools.',
          'For ping events: call the echo tool with a greeting.',
          'For math requests: call add_numbers with the numbers mentioned.',
          'For weather requests: call get_weather with the city mentioned.',
          'After using tools, store a memory about what you did using set_memories.',
          'Always call done when you are finished processing.',
        ].join('\n'),
      },
    });
    haseefId = createRes.haseef.id;
    log('setup', `Created: ${haseefName} (${haseefId})`);

    // Set profile
    await apiOk('PATCH', `/api/haseefs/${haseefId}/profile`, {
      role: 'test-agent',
      location: 'Test Lab',
    });
    log('setup', 'Profile set');

    // ── Phase 2: Register tools ───────────────────────────────────────────

    log('setup', 'Registering tools...');
    const toolsRes = await apiOk('PUT', `/api/haseefs/${haseefId}/scopes/${SCOPE}/tools`, {
      tools: [
        {
          name: 'echo',
          description: 'Echoes back a message. Use this to confirm you received and processed an event.',
          inputSchema: {
            type: 'object',
            properties: {
              message: { type: 'string', description: 'Message to echo back' },
            },
            required: ['message'],
          },
          mode: 'sync',
          timeout: 15000,
        },
        {
          name: 'add_numbers',
          description: 'Adds two numbers and returns their sum.',
          inputSchema: {
            type: 'object',
            properties: {
              a: { type: 'number', description: 'First number' },
              b: { type: 'number', description: 'Second number' },
            },
            required: ['a', 'b'],
          },
          mode: 'sync',
          timeout: 10000,
        },
        {
          name: 'get_weather',
          description: 'Gets the current weather for a city.',
          inputSchema: {
            type: 'object',
            properties: {
              city: { type: 'string', description: 'City name' },
            },
            required: ['city'],
          },
          mode: 'sync',
          timeout: 10000,
        },
        {
          name: 'log_event',
          description: 'Logs a message to the service console. No response returned — fire and forget.',
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
      ],
    });
    log('setup', `Registered ${toolsRes.count} tools: ${toolsRes.tools.map((t: any) => t.name).join(', ')}`);

    // ── Phase 3: Start consumers + Haseef process ─────────────────────────

    actionConsumerAbort = new AbortController();
    streamAbort = new AbortController();

    // Start SSE listeners (non-blocking)
    startActionConsumer(actionConsumerAbort.signal);
    startThinkingStreamListener(streamAbort.signal);

    // Give SSE connections time to establish
    await new Promise((r) => setTimeout(r, 1500));

    // Start the Haseef process
    log('setup', 'Starting Haseef process...');
    await apiOk('POST', `/api/haseefs/${haseefId}/start`);
    log('setup', 'Haseef process started ✓');

    // Give the process time to initialize
    await new Promise((r) => setTimeout(r, 1000));

    // ── Phase 4: Test 1 — Ping Event (triggers echo tool) ─────────────────

    console.log('');
    log('test-1', '── Ping Event → echo tool ──');
    await apiOk('POST', `/api/haseefs/${haseefId}/events`, {
      eventId: `ping-${randomUUID()}`,
      scope: SCOPE,
      type: 'ping',
      data: {
        message: 'Hello! This is a ping from the test service.',
        senderName: 'Test Runner',
        senderType: 'human',
      },
    });
    log('test-1', 'Ping event pushed — waiting for cycle...');

    // Wait for the cycle to complete
    await waitForRunComplete(30_000);
    log('test-1', `Cycle done. Tool calls handled: ${toolCallsHandled.length}`);

    // ── Phase 5: Test 2 — Math Request (triggers add_numbers) ─────────────

    console.log('');
    log('test-2', '── Math Request → add_numbers tool ──');
    await apiOk('POST', `/api/haseefs/${haseefId}/events`, {
      eventId: `math-${randomUUID()}`,
      scope: SCOPE,
      type: 'message',
      data: {
        content: 'What is 42 + 58?',
        senderName: 'Test Runner',
        senderType: 'human',
      },
    });
    log('test-2', 'Math event pushed — waiting for cycle...');

    await waitForRunComplete(30_000);
    log('test-2', `Cycle done. Total tool calls: ${toolCallsHandled.length}`);

    // ── Phase 6: Test 3 — Weather + Multi-tool (triggers get_weather) ──────

    console.log('');
    log('test-3', '── Weather + Log Request → get_weather + log_event tools ──');
    await apiOk('POST', `/api/haseefs/${haseefId}/events`, {
      eventId: `weather-${randomUUID()}`,
      scope: SCOPE,
      type: 'message',
      data: {
        content: 'What is the weather in Tokyo? Also please log that you checked the weather.',
        senderName: 'Test Runner',
        senderType: 'human',
      },
    });
    log('test-3', 'Weather event pushed — waiting for cycle...');

    await waitForRunComplete(30_000);
    log('test-3', `Cycle done. Total tool calls: ${toolCallsHandled.length}`);

    // ── Phase 7: Results ──────────────────────────────────────────────────

    console.log('');
    console.log('═'.repeat(60));
    console.log('  RESULTS');
    console.log('═'.repeat(60));

    // Check runs
    const runsRes = await apiOk('GET', `/api/runs?haseefId=${haseefId}`);
    const runs = runsRes.runs;
    log('results', `Runs: ${runs.length}`);
    for (const run of runs) {
      log('results', `  Run ${run.id.slice(0, 8)} — status=${run.status}, steps=${run.stepCount}, duration=${run.durationMs}ms, trigger=${run.triggerScope}:${run.triggerType}`);
    }

    // Check tool calls
    log('results', `Tool calls handled: ${toolCallsHandled.length}`);
    for (const tc of toolCallsHandled) {
      log('results', `  ${tc.name}(${JSON.stringify(tc.args)}) → ${JSON.stringify(tc.result)}`);
    }

    // Check stream events
    const eventTypes = [...new Set(streamEvents.map((e) => e.type))];
    log('results', `Stream event types: ${eventTypes.join(', ')}`);

    // Check memories
    try {
      const memoriesRes = await apiOk('GET', `/api/haseefs/${haseefId}/scopes`);
      log('results', `Tools still registered: ${memoriesRes.tools.length}`);
    } catch {}

    // Check consciousness
    const statusRes = await apiOk('GET', `/api/haseefs/${haseefId}/status`);
    log('results', `Process running: ${statusRes.running}`);

    // ── Assertions ────────────────────────────────────────────────────────

    console.log('');
    console.log('─'.repeat(60));
    console.log('  ASSERTIONS');
    console.log('─'.repeat(60));

    let passed = 0;
    let failed = 0;

    function check(condition: boolean, msg: string) {
      if (condition) {
        passed++;
        console.log(`  ✅ ${msg}`);
      } else {
        failed++;
        console.log(`  ❌ ${msg}`);
      }
    }

    // Runs created
    check(runs.length >= 3, `At least 3 runs created (got ${runs.length})`);
    check(runs.every((r: any) => r.status === 'completed'), 'All runs completed');

    // Tool calls happened
    const echoCall = toolCallsHandled.find((tc) => tc.name === 'echo');
    const addCall = toolCallsHandled.find((tc) => tc.name === 'add_numbers');
    const weatherCall = toolCallsHandled.find((tc) => tc.name === 'get_weather');

    check(!!echoCall, 'echo tool was called');
    check(!!addCall, 'add_numbers tool was called');
    check(!!weatherCall, 'get_weather tool was called');

    if (addCall) {
      check(addCall.result.sum === 100, `add_numbers returned correct sum (42+58=${addCall.result.sum})`);
    }

    if (weatherCall) {
      check(weatherCall.args.city?.toLowerCase().includes('tokyo'), `get_weather was called for Tokyo (got "${weatherCall.args.city}")`);
    }

    // Stream events
    check(streamEvents.some((e) => e.type === 'run.started'), 'run.started event received');
    check(streamEvents.some((e) => e.type === 'run.finished'), 'run.finished event received');
    check(streamEvents.some((e) => e.type === 'tool.started'), 'tool.started event received');
    check(streamEvents.some((e) => e.type === 'tool.done'), 'tool.done event received');

    // Prebuilt tool usage (done, set_memories)
    const doneEvents = streamEvents.filter((e) => e.type === 'tool.started' && e.toolName === 'done');
    check(doneEvents.length >= 1, `done tool called at least once (got ${doneEvents.length})`);

    const memoryEvents = streamEvents.filter((e) => e.type === 'tool.started' && e.toolName === 'set_memories');
    check(memoryEvents.length >= 1, `set_memories tool called at least once (got ${memoryEvents.length})`);

    console.log('');
    console.log(`  Results: ${passed}/${passed + failed} passed, ${failed} failed`);
    console.log('═'.repeat(60));

    // ── Cleanup ───────────────────────────────────────────────────────────

    console.log('');
    log('cleanup', 'Stopping process and cleaning up...');
    actionConsumerAbort.abort();
    streamAbort.abort();
    await apiOk('POST', `/api/haseefs/${haseefId}/stop`);
    await apiOk('DELETE', `/api/haseefs/${haseefId}/scopes/${SCOPE}`);
    await apiOk('DELETE', `/api/haseefs/${haseefId}`);
    log('cleanup', 'Done ✓');

    redis.disconnect();
    process.exit(failed > 0 ? 1 : 0);

  } catch (err) {
    console.error('\n💥 Fatal error:', err);

    // Attempt cleanup on failure
    try {
      actionConsumerAbort?.abort();
      streamAbort?.abort();
      if (haseefId) {
        await api('POST', `/api/haseefs/${haseefId}/stop`);
        await api('DELETE', `/api/haseefs/${haseefId}/scopes/${SCOPE}`);
        await api('DELETE', `/api/haseefs/${haseefId}`);
      }
    } catch {}

    redis.disconnect();
    process.exit(1);
  }
}

// ── Wait for run.finished event ──────────────────────────────────────────────

function waitForRunComplete(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const startCount = streamEvents.filter((e) => e.type === 'run.finished').length;
    const deadline = Date.now() + timeoutMs;

    const check = () => {
      const currentCount = streamEvents.filter((e) => e.type === 'run.finished').length;
      if (currentCount > startCount) {
        resolve();
        return;
      }
      if (Date.now() > deadline) {
        log('wait', 'Timeout waiting for run to complete');
        resolve();
        return;
      }
      setTimeout(check, 500);
    };
    check();
  });
}

main();
