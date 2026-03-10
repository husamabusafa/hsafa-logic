#!/usr/bin/env tsx
// =============================================================================
// Hsafa Core v5 — Speaker (Nova) Test
//
// Verifies the text-delta streaming pipeline for the Speaker use case:
//   1. Starts Nova's process
//   2. Connects to her stream
//   3. Sends a user message via event
//   4. Verifies text deltas stream back (the "speech" output)
//   5. Sends a follow-up to test multi-turn conversation
//
// Usage: tsx --env-file=.env scripts/test-speaker.ts
// =============================================================================

const CORE_URL = process.env.CORE_URL || `http://localhost:${process.env.PORT || 3001}`;
const API_KEY = process.env.HSAFA_API_KEY || '';
const NOVA_ID = 'd48c1574-9951-4040-9fee-1384ab76df1d';
const SCOPE = 'speaker';

if (!API_KEY) {
  console.error('HSAFA_API_KEY is required');
  process.exit(1);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`${CORE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  if (res.status >= 400) throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

function log(tag: string, ...args: unknown[]) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] [${tag}]`, ...args);
}

// ── State ────────────────────────────────────────────────────────────────────

interface StreamEvent { type: string; text?: string; toolName?: string; args?: unknown; [k: string]: unknown }

const streamEvents: StreamEvent[] = [];
const textDeltas: string[] = [];
let streamAbort: AbortController;

// ── SSE listener ─────────────────────────────────────────────────────────────

async function startStreamListener(signal: AbortSignal) {
  const url = `${CORE_URL}/api/haseefs/${NOVA_ID}/stream`;

  try {
    const res = await fetch(url, { headers: { 'x-api-key': API_KEY }, signal });
    if (!res.ok) throw new Error(`SSE ${res.status}`);

    log('stream', 'Connected to Nova stream ✓');
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
            const event: StreamEvent = JSON.parse(line.slice(6));
            streamEvents.push(event);

            switch (event.type) {
              case 'run.started':
                log('nova', '── Run started ──');
                break;
              case 'text.delta':
                if (event.text) {
                  textDeltas.push(event.text);
                  process.stdout.write(`\x1b[35m${event.text}\x1b[0m`);
                }
                break;
              case 'tool.ready':
                process.stdout.write('\n');
                log('nova', `🔧 ${event.toolName}(${JSON.stringify(event.args)?.slice(0, 80)})`);
                break;
              case 'tool.done':
                log('nova', `✓ ${event.toolName}`);
                break;
              case 'step.finish':
                log('nova', `Step done (${event.finishReason})`);
                break;
              case 'run.finished':
                process.stdout.write('\n');
                log('nova', `── Run finished (${event.durationMs}ms) ──`);
                break;
            }
          } catch {}
        }
      }
    }
  } catch (err: any) {
    if (!signal.aborted) log('stream', 'Error:', err.message);
  }
}

function waitForRun(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const startCount = streamEvents.filter(e => e.type === 'run.finished').length;
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      if (streamEvents.filter(e => e.type === 'run.finished').length > startCount) return resolve();
      if (Date.now() > deadline) { log('wait', '⏰ Timeout'); return resolve(); }
      setTimeout(check, 300);
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
  console.log('  Nova Speaker Test');
  console.log('═'.repeat(60));
  console.log('');

  // ── 1. Ensure Nova is running ─────────────────────────────────────────

  const status = await api('GET', `/api/haseefs/${NOVA_ID}/status`);
  if (!status.running) {
    log('setup', 'Starting Nova...');
    await api('POST', `/api/haseefs/${NOVA_ID}/start`);
    await new Promise(r => setTimeout(r, 2000));
  }
  log('setup', 'Nova is running ✓');

  // ── 2. Connect stream ─────────────────────────────────────────────────

  streamAbort = new AbortController();
  startStreamListener(streamAbort.signal);
  await new Promise(r => setTimeout(r, 1500));

  // ── TEST 1: Simple greeting ───────────────────────────────────────────

  console.log('');
  console.log('─'.repeat(60));
  console.log('  TEST 1: Simple greeting → text deltas');
  console.log('─'.repeat(60));

  const prevDeltas1 = textDeltas.length;

  await api('POST', `/api/haseefs/${NOVA_ID}/events`, [{
    eventId: `speaker-test-${Date.now()}`,
    scope: SCOPE,
    type: 'message',
    data: { from: 'Husam', text: 'Hello Nova! How are you today?' },
    timestamp: new Date().toISOString(),
  }]);
  log('test-1', 'Message sent: "Hello Nova! How are you today?"');

  await waitForRun(30_000);

  const speech1 = textDeltas.slice(prevDeltas1).join('');
  console.log('');
  log('test-1', `Text delta tokens: ${textDeltas.length - prevDeltas1}`);
  log('test-1', `Full speech: "${speech1}"`);
  log('test-1', speech1.length > 0 ? '✅ Text deltas received (speech works)' : '❌ No text deltas');

  // ── TEST 2: Follow-up (multi-turn) ────────────────────────────────────

  console.log('');
  console.log('─'.repeat(60));
  console.log('  TEST 2: Follow-up conversation');
  console.log('─'.repeat(60));

  const prevDeltas2 = textDeltas.length;

  await api('POST', `/api/haseefs/${NOVA_ID}/events`, [{
    eventId: `speaker-test-${Date.now()}`,
    scope: SCOPE,
    type: 'message',
    data: { from: 'Husam', text: 'Tell me a fun fact about space in one sentence.' },
    timestamp: new Date().toISOString(),
  }]);
  log('test-2', 'Message sent: "Tell me a fun fact about space in one sentence."');

  await waitForRun(30_000);

  const speech2 = textDeltas.slice(prevDeltas2).join('');
  console.log('');
  log('test-2', `Text delta tokens: ${textDeltas.length - prevDeltas2}`);
  log('test-2', `Full speech: "${speech2}"`);
  log('test-2', speech2.length > 0 ? '✅ Text deltas received' : '❌ No text deltas');

  // Check speech quality — should NOT contain markdown
  const hasMarkdown = /[*#`\[\]]/.test(speech2);
  log('test-2', !hasMarkdown ? '✅ No markdown in speech (TTS-friendly)' : '⚠️  Speech contains markdown formatting');

  // ── TEST 3: Quick back-to-back (latency check) ────────────────────────

  console.log('');
  console.log('─'.repeat(60));
  console.log('  TEST 3: Quick message (latency)');
  console.log('─'.repeat(60));

  const prevDeltas3 = textDeltas.length;
  const sendTime = Date.now();

  await api('POST', `/api/haseefs/${NOVA_ID}/events`, [{
    eventId: `speaker-test-${Date.now()}`,
    scope: SCOPE,
    type: 'message',
    data: { from: 'Husam', text: 'Say just the word "yes".' },
    timestamp: new Date().toISOString(),
  }]);
  log('test-3', 'Message sent: "Say just the word yes."');

  await waitForRun(30_000);

  const speech3 = textDeltas.slice(prevDeltas3).join('');
  const latency = Date.now() - sendTime;
  console.log('');
  log('test-3', `Full speech: "${speech3}"`);
  log('test-3', `Total latency: ${latency}ms`);
  log('test-3', speech3.length > 0 ? '✅ Response received' : '❌ No response');

  // ── Summary ───────────────────────────────────────────────────────────

  console.log('');
  console.log('═'.repeat(60));
  console.log('  SUMMARY');
  console.log('═'.repeat(60));

  const allEventTypes = [...new Set(streamEvents.map(e => e.type))];
  log('summary', `Total stream events: ${streamEvents.length}`);
  log('summary', `Event types: ${allEventTypes.join(', ')}`);
  log('summary', `Total text delta tokens: ${textDeltas.length}`);
  log('summary', `Runs completed: ${streamEvents.filter(e => e.type === 'run.finished').length}`);

  const pass = [speech1.length > 0, speech2.length > 0, speech3.length > 0];
  log('summary', `Tests: ${pass.filter(Boolean).length}/${pass.length} passed`);

  console.log('');
  console.log('═'.repeat(60));

  streamAbort.abort();
  await new Promise(r => setTimeout(r, 500));
  process.exit(pass.every(Boolean) ? 0 : 1);
}

main().catch(err => {
  console.error('💥 Fatal:', err);
  streamAbort?.abort();
  process.exit(1);
});
