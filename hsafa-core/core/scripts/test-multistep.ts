#!/usr/bin/env tsx
// =============================================================================
// Hsafa Core v5 — Multi-Step & Text Delta Test
//
// Tests against running Atlas instance:
//   1. Registers 3 tool types (sync, fire_and_forget, async)
//   2. Asks Atlas to call a tool TWICE in one cycle
//   3. Asks Atlas to produce text deltas before, between, and after tool calls
//   4. Logs all stream events for debugging
//
// Usage: tsx --env-file=.env scripts/test-multistep.ts
// =============================================================================

import { randomUUID } from 'crypto';
import Redis from 'ioredis';

const CORE_URL = process.env.CORE_URL || `http://localhost:${process.env.PORT || 3001}`;
const API_KEY = process.env.HSAFA_API_KEY || '';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const SCOPE = 'multistep-test';

// Atlas ID from the running instance
const ATLAS_ID = '949f6425-a813-485c-9f37-b100e0cfd371';

if (!API_KEY) {
  console.error('HSAFA_API_KEY is required. Set it in .env');
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

const toolCallsHandled: Array<{ name: string; args: any; result: any }> = [];
const streamEvents: Array<{ type: string; [k: string]: unknown }> = [];
const textDeltas: string[] = [];
let actionConsumerAbort: AbortController;
let streamAbort: AbortController;

// ── Tool handlers ────────────────────────────────────────────────────────────

async function handleAction(action: { actionId: string; name: string; args: any; mode: string }) {
  log('action', `${action.name}(${JSON.stringify(action.args)}) [${action.mode}]`);

  let result: any;

  switch (action.name) {
    case 'greet':
      result = { greeting: `Hello, ${action.args.name || 'friend'}!`, timestamp: new Date().toISOString() };
      break;

    case 'calculate':
      const a = Number(action.args.a);
      const b = Number(action.args.b);
      const op = action.args.operation || 'add';
      const ops: Record<string, number> = { add: a + b, subtract: a - b, multiply: a * b, divide: b !== 0 ? a / b : NaN };
      result = { result: ops[op] ?? a + b, operation: op, a, b };
      break;

    case 'notify':
      log('fire-forget', `NOTIFICATION: [${action.args.level}] ${action.args.message}`);
      result = null; // fire_and_forget — no result
      break;

    case 'fetch_data':
      // Simulate async — return pending, then submit result after delay
      result = null; // handled separately
      setTimeout(async () => {
        const asyncResult = { data: { query: action.args.query, results: ['item1', 'item2', 'item3'], total: 3 } };
        await apiOk('POST', `/api/haseefs/${ATLAS_ID}/actions/${action.actionId}/result`, asyncResult);
        log('async-result', `fetch_data → ${JSON.stringify(asyncResult)}`);
      }, 500);
      return; // Don't submit result — it's async

    default:
      result = { ok: true, echo: action.args };
  }

  toolCallsHandled.push({ name: action.name, args: action.args, result });

  // Submit result for sync tools
  if (action.mode === 'sync' && result !== null) {
    await apiOk('POST', `/api/haseefs/${ATLAS_ID}/actions/${action.actionId}/result`, result);
    log('result', `${action.name} → ${JSON.stringify(result)}`);
  }
}

// ── SSE consumers ────────────────────────────────────────────────────────────

async function startActionConsumer(signal: AbortSignal) {
  const url = `${CORE_URL}/api/haseefs/${ATLAS_ID}/scopes/${SCOPE}/actions/stream`;
  log('consumer', `Connecting to action stream for scope "${SCOPE}"...`);

  while (!signal.aborted) {
    try {
      const res = await fetch(url, { headers: { 'x-api-key': API_KEY }, signal });
      if (!res.ok) throw new Error(`SSE ${res.status}: ${await res.text()}`);

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

async function startStreamListener(signal: AbortSignal) {
  const url = `${CORE_URL}/api/haseefs/${ATLAS_ID}/stream`;
  log('stream', 'Connecting to haseef stream...');

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
                log('stream', `\n${'─'.repeat(50)}`);
                log('stream', `RUN STARTED (cycle #${event.cycleNumber})`);
                log('stream', `${'─'.repeat(50)}`);
                break;
              case 'text.delta':
                textDeltas.push(event.text);
                process.stdout.write(`\x1b[36m${event.text}\x1b[0m`); // cyan text
                break;
              case 'tool.started':
                process.stdout.write('\n'); // newline after text deltas
                log('stream', `🔧 TOOL STARTED: ${event.toolName}`);
                break;
              case 'tool.ready':
                log('stream', `🔧 TOOL READY: ${event.toolName}(${JSON.stringify(event.args)?.slice(0, 100)})`);
                break;
              case 'tool.done':
                log('stream', `🔧 TOOL DONE: ${event.toolName} → ${JSON.stringify(event.result)?.slice(0, 100)}`);
                break;
              case 'step.finish':
                log('stream', `📍 STEP FINISH: reason=${event.finishReason}`);
                break;
              case 'run.finished':
                log('stream', `\n✅ RUN FINISHED (${event.durationMs}ms, ${event.stepCount} tool calls)`);
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

// ── Wait helper ──────────────────────────────────────────────────────────────

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
        log('wait', '⏰ Timeout waiting for run to complete');
        resolve();
        return;
      }
      setTimeout(check, 500);
    };
    check();
  });
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  console.log('');
  console.log('═'.repeat(60));
  console.log('  Hsafa Core v5 — Multi-Step & Text Delta Test');
  console.log('  Testing against Atlas (' + ATLAS_ID.slice(0, 8) + '...)');
  console.log('═'.repeat(60));
  console.log('');

  try {
    // ── Phase 1: Register 3 tool types ─────────────────────────────────────

    log('setup', 'Registering 3 tool types (sync, fire_and_forget, async)...');
    const toolsRes = await apiOk('PUT', `/api/haseefs/${ATLAS_ID}/scopes/${SCOPE}/tools`, {
      tools: [
        {
          name: 'greet',
          description: 'Greets a person by name. Returns a greeting message. Use this when asked to greet someone.',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Name of the person to greet' },
            },
            required: ['name'],
          },
          mode: 'sync',
          timeout: 15000,
        },
        {
          name: 'calculate',
          description: 'Performs a math calculation on two numbers. Returns the result.',
          inputSchema: {
            type: 'object',
            properties: {
              a: { type: 'number', description: 'First number' },
              b: { type: 'number', description: 'Second number' },
              operation: { type: 'string', enum: ['add', 'subtract', 'multiply', 'divide'], description: 'Math operation' },
            },
            required: ['a', 'b', 'operation'],
          },
          mode: 'sync',
          timeout: 10000,
        },
        {
          name: 'notify',
          description: 'Sends a notification to the external logging system. Fire and forget — no response returned.',
          inputSchema: {
            type: 'object',
            properties: {
              level: { type: 'string', enum: ['info', 'warn', 'error'], description: 'Notification level' },
              message: { type: 'string', description: 'Notification message' },
            },
            required: ['level', 'message'],
          },
          mode: 'fire_and_forget',
        },
      ],
    });
    log('setup', `Registered ${toolsRes.count} tools: ${toolsRes.tools.map((t: any) => `${t.name} (${t.mode})`).join(', ')}`);

    // ── Phase 2: Start SSE listeners ────────────────────────────────────────

    actionConsumerAbort = new AbortController();
    streamAbort = new AbortController();

    startActionConsumer(actionConsumerAbort.signal);
    startStreamListener(streamAbort.signal);

    // Give SSE time to connect
    await new Promise((r) => setTimeout(r, 2000));

    // ── TEST 1: Call tool twice ─────────────────────────────────────────────

    console.log('');
    console.log('═'.repeat(60));
    console.log('  TEST 1: Call greet tool TWICE');
    console.log('═'.repeat(60));

    const prevToolCalls1 = toolCallsHandled.length;
    const prevTextDeltas1 = textDeltas.length;

    await apiOk('POST', `/api/haseefs/${ATLAS_ID}/events`, {
      eventId: `test1-${randomUUID()}`,
      scope: SCOPE,
      type: 'request',
      data: {
        instruction: 'Please call the greet tool exactly TWO times: once for "Alice" and once for "Bob". Do both greetings.',
      },
    });
    log('test-1', 'Event pushed — waiting for cycle...');

    await waitForRunComplete(45_000);

    const test1ToolCalls = toolCallsHandled.slice(prevToolCalls1);
    const test1Greets = test1ToolCalls.filter(tc => tc.name === 'greet');
    console.log('');
    log('test-1', `Tool calls: ${test1ToolCalls.length} (greet: ${test1Greets.length})`);
    for (const tc of test1ToolCalls) {
      log('test-1', `  ${tc.name}(${JSON.stringify(tc.args)}) → ${JSON.stringify(tc.result)}`);
    }
    log('test-1', `Text deltas: ${textDeltas.length - prevTextDeltas1} tokens`);
    log('test-1', test1Greets.length >= 2 ? '✅ PASS — greet called 2+ times' : '❌ FAIL — greet called < 2 times');

    // ── TEST 2: Text deltas before, between, and after tool calls ────────

    console.log('');
    console.log('═'.repeat(60));
    console.log('  TEST 2: Text deltas + tool calls mixed');
    console.log('═'.repeat(60));

    // Reset tracking
    const prevEvents2 = streamEvents.length;
    const prevTextDeltas2 = textDeltas.length;
    const prevToolCalls2 = toolCallsHandled.length;

    await apiOk('POST', `/api/haseefs/${ATLAS_ID}/events`, {
      eventId: `test2-${randomUUID()}`,
      scope: SCOPE,
      type: 'request',
      data: {
        instruction: [
          'I want you to do the following in order:',
          '1. First, write a short sentence (text output) saying what you are about to do',
          '2. Then call the calculate tool with a=10, b=5, operation="multiply"',
          '3. Then write another short sentence (text output) about the result',
          '4. Then call the notify tool with level="info" and a message about the calculation',
          '5. Then write a final short sentence (text output) saying you are done',
          '',
          'IMPORTANT: You MUST produce text output between the tool calls. Do not skip the text parts.',
        ].join('\n'),
      },
    });
    log('test-2', 'Event pushed — waiting for cycle...');

    await waitForRunComplete(45_000);

    const test2Events = streamEvents.slice(prevEvents2);
    const test2ToolCalls = toolCallsHandled.slice(prevToolCalls2);
    const test2TextCount = textDeltas.length - prevTextDeltas2;

    // Analyze event ordering
    const eventOrder: string[] = [];
    let lastType = '';
    for (const ev of test2Events) {
      if (ev.type === 'text.delta' && lastType !== 'text.delta') {
        eventOrder.push('TEXT');
        lastType = 'text.delta';
      } else if (ev.type === 'tool.started') {
        eventOrder.push(`TOOL:${ev.toolName}`);
        lastType = ev.type;
      } else if (ev.type === 'step.finish') {
        eventOrder.push(`STEP:${ev.finishReason}`);
        lastType = ev.type;
      } else if (ev.type !== 'text.delta') {
        lastType = ev.type;
      }
    }

    console.log('');
    log('test-2', `Tool calls: ${test2ToolCalls.length}`);
    for (const tc of test2ToolCalls) {
      log('test-2', `  ${tc.name}(${JSON.stringify(tc.args)}) → ${JSON.stringify(tc.result)}`);
    }
    log('test-2', `Text delta tokens: ${test2TextCount}`);
    log('test-2', `Event order: ${eventOrder.join(' → ')}`);
    log('test-2', test2TextCount > 0 ? '✅ Text deltas received' : '❌ No text deltas');
    log('test-2', test2ToolCalls.length >= 2 ? '✅ Multiple tool calls' : '❌ Less than 2 tool calls');

    // ── TEST 3: Different tool types in one cycle ─────────────────────────

    console.log('');
    console.log('═'.repeat(60));
    console.log('  TEST 3: Mixed tool types (sync + fire_and_forget)');
    console.log('═'.repeat(60));

    const prevToolCalls3 = toolCallsHandled.length;

    await apiOk('POST', `/api/haseefs/${ATLAS_ID}/events`, {
      eventId: `test3-${randomUUID()}`,
      scope: SCOPE,
      type: 'request',
      data: {
        instruction: [
          'Please do these three things:',
          '1. Call calculate with a=100, b=7, operation="add" to get the sum',
          '2. Call greet for "Charlie"',
          '3. Call notify with level="info" and message="All tasks completed"',
        ].join('\n'),
      },
    });
    log('test-3', 'Event pushed — waiting for cycle...');

    await waitForRunComplete(45_000);

    const test3ToolCalls = toolCallsHandled.slice(prevToolCalls3);
    console.log('');
    log('test-3', `Tool calls: ${test3ToolCalls.length}`);
    for (const tc of test3ToolCalls) {
      log('test-3', `  ${tc.name}(${JSON.stringify(tc.args)}) → ${JSON.stringify(tc.result)}`);
    }

    const hasCalc = test3ToolCalls.some(tc => tc.name === 'calculate');
    const hasGreet = test3ToolCalls.some(tc => tc.name === 'greet');
    const hasNotify = test3ToolCalls.some(tc => tc.name === 'notify');
    log('test-3', hasCalc ? '✅ calculate called' : '❌ calculate not called');
    log('test-3', hasGreet ? '✅ greet called' : '❌ greet not called');
    log('test-3', hasNotify ? '✅ notify called' : '❌ notify not called');

    // ── Summary ──────────────────────────────────────────────────────────

    console.log('');
    console.log('═'.repeat(60));
    console.log('  SUMMARY');
    console.log('═'.repeat(60));

    const allEventTypes = [...new Set(streamEvents.map(e => e.type))];
    log('summary', `Total stream events: ${streamEvents.length}`);
    log('summary', `Event types: ${allEventTypes.join(', ')}`);
    log('summary', `Total text delta tokens: ${textDeltas.length}`);
    log('summary', `Total tool calls handled: ${toolCallsHandled.length}`);
    log('summary', `Full accumulated text: "${textDeltas.join('')}"`);

    // ── Cleanup ──────────────────────────────────────────────────────────

    console.log('');
    log('cleanup', 'Removing test tools...');
    await api('DELETE', `/api/haseefs/${ATLAS_ID}/scopes/${SCOPE}`);
    log('cleanup', 'Done ✓');

  } catch (err) {
    console.error('\n💥 Fatal error:', err);
  } finally {
    actionConsumerAbort?.abort();
    streamAbort?.abort();
    // Give SSE connections time to close
    await new Promise((r) => setTimeout(r, 500));
    process.exit(0);
  }
}

main();
