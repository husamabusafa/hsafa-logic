#!/usr/bin/env npx ts-node
/**
 * Streaming Flow Test Script
 *
 * Tests the full sendSpaceMessage streaming pipeline:
 *   1. Connects to a space's SSE stream
 *   2. Sends a human message via API (triggers agent)
 *   3. Verifies the expected event sequence arrives:
 *      text-start → text-delta (1+) → text-end → finish → smartSpace.message
 *   4. Verifies each event has correct fields (streamId, entityId, etc.)
 *   5. Verifies the persisted message matches the streamed text
 *
 * Usage:
 *   npx ts-node scripts/test-streaming-flow.ts <smartSpaceId> <entityId> [message]
 *
 * Prerequisites:
 *   - Gateway running on localhost:4000
 *   - A smart space with an admin agent configured
 *   - A human entity that is a member of the space
 *
 * Environment:
 *   GATEWAY_URL  (default: http://localhost:4000)
 *   SECRET_KEY   (default: test-secret-key)
 */

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:4000';
const SECRET_KEY = process.env.SECRET_KEY || 'test-secret-key';

// ─── Colors ─────────────────────────────────────────────────────────────────

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function ok(msg: string) { console.log(`  ${C.green}✓${C.reset} ${msg}`); }
function fail(msg: string) { console.log(`  ${C.red}✗${C.reset} ${msg}`); }
function info(msg: string) { console.log(`  ${C.dim}${msg}${C.reset}`); }
function header(msg: string) { console.log(`\n${C.bold}${C.cyan}${msg}${C.reset}`); }

// ─── SSE Client ─────────────────────────────────────────────────────────────

interface SSEEvent {
  type: string;
  data: Record<string, unknown>;
  runId?: string;
  entityId?: string;
  streamId?: string;
}

function connectSSE(smartSpaceId: string): {
  events: SSEEvent[];
  close: () => void;
  waitForEvent: (type: string, timeoutMs?: number) => Promise<SSEEvent>;
  waitForEvents: (types: string[], timeoutMs?: number) => Promise<SSEEvent[]>;
} {
  const events: SSEEvent[] = [];
  const listeners: Array<{ type: string; resolve: (e: SSEEvent) => void }> = [];
  const controller = new AbortController();

  const url = `${GATEWAY_URL}/api/smart-spaces/${smartSpaceId}/stream`;

  (async () => {
    try {
      const res = await fetch(url, {
        headers: {
          'x-secret-key': SECRET_KEY,
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        console.error(`SSE connection failed: ${res.status}`);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentData: string[] = [];

        for (const line of lines) {
          if (line.startsWith(':')) continue; // comment
          if (line === '') {
            if (currentData.length > 0) {
              try {
                const parsed = JSON.parse(currentData.join('\n'));
                // Unwrap envelope
                const outer = parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data)
                  ? parsed.data : {};
                const hasEnvelope = 'data' in outer && typeof outer.data === 'object' && outer.data !== null;
                const eventData = hasEnvelope ? outer.data : (parsed.data ?? parsed);

                const event: SSEEvent = {
                  type: parsed.type || 'unknown',
                  data: eventData,
                  runId: outer.runId || eventData?.runId,
                  entityId: outer.entityId || eventData?.entityId,
                };

                events.push(event);

                // Notify listeners
                for (let i = listeners.length - 1; i >= 0; i--) {
                  if (listeners[i].type === event.type) {
                    listeners[i].resolve(event);
                    listeners.splice(i, 1);
                  }
                }
              } catch {
                // ignore parse errors
              }
            }
            currentData = [];
            continue;
          }

          const colonIdx = line.indexOf(':');
          if (colonIdx === -1) continue;
          const field = line.slice(0, colonIdx);
          const value2 = line.slice(colonIdx + 1).trimStart();
          if (field === 'data') currentData.push(value2);
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('SSE error:', err.message);
      }
    }
  })();

  return {
    events,
    close: () => controller.abort(),
    waitForEvent: (type, timeoutMs = 30000) => {
      // Check if already received
      const existing = events.find((e) => e.type === type);
      if (existing) return Promise.resolve(existing);

      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`Timeout waiting for event: ${type}`));
        }, timeoutMs);

        listeners.push({
          type,
          resolve: (e) => {
            clearTimeout(timer);
            resolve(e);
          },
        });
      });
    },
    waitForEvents: async (types, timeoutMs = 60000) => {
      const results: SSEEvent[] = [];
      const deadline = Date.now() + timeoutMs;

      for (const type of types) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new Error(`Timeout waiting for events`);

        // Wait by polling (simpler than complex listener logic for ordered waits)
        while (Date.now() < deadline) {
          const found = events.find(
            (e) => e.type === type && !results.some((r) => r === e)
          );
          if (found) {
            results.push(found);
            break;
          }
          await new Promise((r) => setTimeout(r, 100));
        }
      }

      return results;
    },
  };
}

// ─── API Helpers ────────────────────────────────────────────────────────────

async function sendMessage(smartSpaceId: string, entityId: string, content: string) {
  const res = await fetch(`${GATEWAY_URL}/api/smart-spaces/${smartSpaceId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-secret-key': SECRET_KEY,
    },
    body: JSON.stringify({ content, entityId }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to send message: ${res.status} ${text}`);
  }

  return res.json();
}

async function getMessages(smartSpaceId: string, limit = 10) {
  const res = await fetch(
    `${GATEWAY_URL}/api/smart-spaces/${smartSpaceId}/messages?limit=${limit}`,
    {
      headers: { 'x-secret-key': SECRET_KEY },
    }
  );
  if (!res.ok) throw new Error(`Failed to get messages: ${res.status}`);
  return res.json();
}

// ─── Test ───────────────────────────────────────────────────────────────────

async function runTest(smartSpaceId: string, entityId: string, message: string) {
  header('1. Connect to space SSE stream');
  const sse = connectSSE(smartSpaceId);
  // Give SSE a moment to connect
  await new Promise((r) => setTimeout(r, 1500));
  ok('SSE connected');

  header('2. Send human message');
  info(`Sending: "${message}"`);
  const sendResult = await sendMessage(smartSpaceId, entityId, message);
  ok(`Message sent (id: ${sendResult.message?.id || 'unknown'})`);

  header('3. Wait for streaming events');
  info('Waiting up to 60s for the agent to respond...');

  const deadline = Date.now() + 60000;
  let gotTextStart = false;
  let gotTextDelta = false;
  let gotTextEnd = false;
  let gotFinish = false;
  let gotSmartSpaceMessage = false;
  let streamedText = '';
  let streamId: string | null = null;
  let persistedMessageId: string | null = null;
  let finishStreamId: string | null = null;
  let messageStreamId: string | null = null;
  let textDeltaCount = 0;
  let lastCheckedIndex = 0;

  while (Date.now() < deadline) {
    // Process new events
    for (let i = lastCheckedIndex; i < sse.events.length; i++) {
      const e = sse.events[i];

      if (e.type === 'text-start') {
        gotTextStart = true;
        streamId = (e.data?.id as string) || null;
        info(`text-start  streamId=${streamId}`);
      }
      if (e.type === 'text-delta') {
        gotTextDelta = true;
        textDeltaCount++;
        const delta = (e.data?.delta as string) || '';
        streamedText += delta;
        if (textDeltaCount <= 3) {
          info(`text-delta  "${delta.slice(0, 50)}${delta.length > 50 ? '...' : ''}"`);
        } else if (textDeltaCount === 4) {
          info(`text-delta  ... (more deltas arriving)`);
        }
      }
      if (e.type === 'text-end') {
        gotTextEnd = true;
        info(`text-end    streamId=${(e.data?.id as string) || ''}`);
      }
      if (e.type === 'finish') {
        gotFinish = true;
        finishStreamId = (e.data?.streamId as string) || null;
        info(`finish      streamId=${finishStreamId}`);
      }
      if (e.type === 'smartSpace.message') {
        const msg = e.data?.message as Record<string, unknown> | undefined;
        if (msg && (msg.role === 'assistant')) {
          gotSmartSpaceMessage = true;
          persistedMessageId = (msg.id as string) || null;
          messageStreamId = (e.data?.streamId as string) || null;
          info(`smartSpace.message  id=${persistedMessageId}  streamId=${messageStreamId}`);
        }
      }
    }
    lastCheckedIndex = sse.events.length;

    // Check if we have all expected events
    if (gotSmartSpaceMessage) break;

    await new Promise((r) => setTimeout(r, 200));
  }

  // ── Report results ──
  header('4. Results');

  console.log(`\n  ${C.bold}Event Sequence:${C.reset}`);
  gotTextStart ? ok('text-start received') : fail('text-start MISSING');
  gotTextDelta ? ok(`text-delta received (${textDeltaCount} deltas)`) : fail('text-delta MISSING — no streaming happened');
  gotTextEnd ? ok('text-end received') : fail('text-end MISSING');
  gotFinish ? ok('finish received') : fail('finish MISSING');
  gotSmartSpaceMessage ? ok('smartSpace.message received') : fail('smartSpace.message MISSING — message not persisted?');

  console.log(`\n  ${C.bold}Stream ID Linking:${C.reset}`);
  if (streamId && finishStreamId === streamId) {
    ok(`finish.streamId matches text-start.id (${streamId})`);
  } else if (streamId && finishStreamId) {
    fail(`finish.streamId (${finishStreamId}) != text-start.id (${streamId})`);
  } else {
    info('Could not verify streamId linking (missing events)');
  }

  if (streamId && messageStreamId === streamId) {
    ok(`smartSpace.message.streamId matches text-start.id (${streamId})`);
  } else if (streamId && messageStreamId) {
    fail(`smartSpace.message.streamId (${messageStreamId}) != text-start.id (${streamId})`);
  } else {
    info('Could not verify message streamId linking (missing events)');
  }

  console.log(`\n  ${C.bold}Streamed Text:${C.reset}`);
  if (streamedText) {
    ok(`Streamed ${streamedText.length} chars`);
    info(`"${streamedText.slice(0, 100)}${streamedText.length > 100 ? '...' : ''}"`);
  } else {
    fail('No text was streamed');
  }

  // ── Verify persistence ──
  header('5. Verify persisted messages');
  const { messages } = await getMessages(smartSpaceId, 5);
  const lastAssistant = (messages as any[])
    .filter((m: any) => m.role === 'assistant')
    .pop();

  if (lastAssistant) {
    ok(`Found persisted assistant message (id: ${lastAssistant.id})`);
    const persistedText = lastAssistant.content || '';
    if (persistedText === streamedText) {
      ok('Persisted text matches streamed text exactly');
    } else if (streamedText && persistedText.includes(streamedText.slice(0, 20))) {
      ok('Persisted text partially matches streamed text');
      info(`Persisted: "${persistedText.slice(0, 80)}..."`);
      info(`Streamed:  "${streamedText.slice(0, 80)}..."`);
    } else if (streamedText) {
      fail('Persisted text does NOT match streamed text');
      info(`Persisted: "${persistedText.slice(0, 80)}"`);
      info(`Streamed:  "${streamedText.slice(0, 80)}"`);
    }

    // Check metadata for streamId
    const meta = lastAssistant.metadata as Record<string, unknown> | null;
    if (meta?.streamId) {
      ok(`Message metadata has streamId: ${meta.streamId}`);
      if (meta.streamId === streamId) {
        ok('Metadata streamId matches streaming streamId');
      }
    } else {
      info('Message metadata has no streamId (may be from a non-streaming path)');
    }
  } else {
    fail('No assistant message found in recent messages');
  }

  // ── Summary ──
  header('6. Summary');
  const allPassed = gotTextStart && gotTextDelta && gotTextEnd && gotFinish && gotSmartSpaceMessage;
  if (allPassed) {
    console.log(`\n  ${C.green}${C.bold}ALL CHECKS PASSED ✓${C.reset}\n`);
  } else {
    console.log(`\n  ${C.yellow}${C.bold}SOME CHECKS FAILED — review above${C.reset}\n`);
    if (!gotTextStart && !gotTextDelta) {
      info('No streaming events at all. Possible causes:');
      info('  - Model output text before spaceId in JSON (streaming delayed)');
      info('  - Very short message (entire text in one burst)');
      info('  - Agent did not call sendSpaceMessage');
    }
  }

  sse.close();
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const [, , smartSpaceId, entityId, ...rest] = process.argv;
  const message = rest.join(' ') || 'Send 2 messages to this space';

  if (!smartSpaceId || !entityId) {
    console.log(`
${C.bold}Streaming Flow Test${C.reset}

${C.cyan}Usage:${C.reset}
  npx ts-node scripts/test-streaming-flow.ts <smartSpaceId> <entityId> [message]

${C.cyan}Arguments:${C.reset}
  ${C.green}smartSpaceId${C.reset}  - The smart space ID to test in
  ${C.green}entityId${C.reset}     - Your human entity ID (must be a member)
  ${C.green}message${C.reset}      - Optional message to send (default: "Send 2 messages to this space")

${C.cyan}Environment:${C.reset}
  GATEWAY_URL  - Gateway URL (default: http://localhost:4000)
  SECRET_KEY   - Secret key (default: test-secret-key)

${C.cyan}Example:${C.reset}
  npx ts-node scripts/test-streaming-flow.ts abc123 def456 "Hello, send me a greeting"

${C.cyan}What it tests:${C.reset}
  1. Connects to space SSE stream
  2. Sends a human message (triggers admin agent)
  3. Verifies streaming events arrive in order:
     text-start → text-delta (1+) → text-end → finish → smartSpace.message
  4. Verifies streamId links streaming to persisted message
  5. Verifies persisted text matches streamed text
`);
    process.exit(1);
  }

  try {
    await runTest(smartSpaceId, entityId, message);
  } catch (err) {
    console.error(`${C.red}Test failed:${C.reset}`, err);
    process.exit(1);
  }
}

main();
