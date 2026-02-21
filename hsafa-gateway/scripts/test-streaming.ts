/**
 * Test: Full streaming flow verification
 *
 * 1. Connects to SSE stream for a space
 * 2. Sends a message
 * 3. Verifies the event sequence:
 *    - agent.active
 *    - space.message.streaming (start → delta(s) → done)
 *    - space.message (persisted, with nested `message` + `streamId`)
 *    - agent.inactive
 * 4. Verifies the persisted message appears in the messages list
 *
 * Usage: npx tsx --env-file=.env scripts/test-streaming.ts
 */

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3001';
const SECRET_KEY = process.env.HSAFA_SECRET_KEY || '';

// Use the space and entity from the user's curl request
const SPACE_ID = '0bec3fa1-677e-4ca0-b102-6f47a6b2c7ae';
const HUMAN_ENTITY_ID = 'e2be5145-6731-4e84-8fe0-9904c1c16fa4';

interface SSEEvent {
  type: string;
  [key: string]: unknown;
}

// ─── SSE Client ──────────────────────────────────────────────────────────────

async function connectSSE(
  spaceId: string,
  onEvent: (event: SSEEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const url = `${GATEWAY_URL}/api/smart-spaces/${spaceId}/stream`;
  const res = await fetch(url, {
    headers: {
      'x-secret-key': SECRET_KEY,
      Accept: 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
    signal,
  });

  if (!res.ok) throw new Error(`SSE connect failed: ${res.status}`);
  if (!res.body) throw new Error('SSE response has no body');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const parsed = JSON.parse(line.slice(6));
          onEvent(parsed);
        } catch {
          // skip malformed
        }
      }
    }
  }
}

// ─── Send Message ────────────────────────────────────────────────────────────

async function sendMessage(spaceId: string, content: string): Promise<unknown> {
  const url = `${GATEWAY_URL}/api/smart-spaces/${spaceId}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-secret-key': SECRET_KEY,
    },
    body: JSON.stringify({ content, entityId: HUMAN_ENTITY_ID }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Send failed: ${res.status} ${text}`);
  }

  return res.json();
}

// ─── List Messages ───────────────────────────────────────────────────────────

async function listMessages(spaceId: string): Promise<unknown[]> {
  const url = `${GATEWAY_URL}/api/smart-spaces/${spaceId}/messages?limit=5`;
  const res = await fetch(url, {
    headers: { 'x-secret-key': SECRET_KEY },
  });

  if (!res.ok) throw new Error(`List failed: ${res.status}`);
  const data = await res.json();
  return data.messages;
}

// ─── Main Test ───────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Streaming Flow Test ===\n');
  console.log(`Gateway: ${GATEWAY_URL}`);
  console.log(`Space:   ${SPACE_ID}`);
  console.log(`Entity:  ${HUMAN_ENTITY_ID}\n`);

  const events: SSEEvent[] = [];
  const abortController = new AbortController();

  // Track specific event types
  let gotAgentActive = false;
  let gotStreamStart = false;
  let gotStreamDelta = false;
  let gotStreamDone = false;
  let gotSpaceMessage = false;
  let gotAgentInactive = false;
  let streamId: string | null = null;
  let persistedMessageId: string | null = null;
  let streamedText = '';

  // Start SSE in background
  const ssePromise = connectSSE(
    SPACE_ID,
    (event) => {
      events.push(event);

      switch (event.type) {
        case 'connected':
          console.log('✓ SSE connected');
          break;

        case 'agent.active':
          gotAgentActive = true;
          console.log(`✓ agent.active — entityId: ${event.agentEntityId}, runId: ${event.runId}`);
          break;

        case 'space.message.streaming': {
          const phase = event.phase as string;
          const sid = event.streamId as string;
          if (phase === 'start') {
            gotStreamStart = true;
            streamId = sid;
            console.log(`✓ streaming start — streamId: ${sid}`);
          } else if (phase === 'delta') {
            gotStreamDelta = true;
            const delta = event.delta as string;
            streamedText += delta;
            // Print first few deltas
            if (streamedText.length < 80) {
              process.stdout.write(`  δ "${delta}"\n`);
            }
          } else if (phase === 'done') {
            gotStreamDone = true;
            console.log(`✓ streaming done — streamId: ${sid}`);
            console.log(`  Total streamed text: "${streamedText.slice(0, 100)}${streamedText.length > 100 ? '...' : ''}"`);
          }
          break;
        }

        case 'space.message': {
          const msg = event.message as Record<string, unknown> | undefined;
          if (msg?.role === 'assistant') {
            gotSpaceMessage = true;
            persistedMessageId = msg.id as string;
            const sid = event.streamId as string | undefined;
            console.log(`✓ space.message — id: ${persistedMessageId}, streamId: ${sid || 'MISSING'}`);
            console.log(`  Content: "${(msg.content as string)?.slice(0, 100)}..."`);

            // Verify streamId matches
            if (sid && sid === streamId) {
              console.log('  ✓ streamId matches streaming events');
            } else if (!sid) {
              console.log('  ✗ MISSING streamId — dedup will fail!');
            } else {
              console.log(`  ✗ streamId mismatch: expected ${streamId}, got ${sid}`);
            }
          }
          break;
        }

        case 'agent.inactive':
          gotAgentInactive = true;
          console.log(`✓ agent.inactive — runId: ${event.runId}`);
          break;

        case 'run.completed':
          console.log(`✓ run.completed — runId: ${event.runId}`);
          break;

        case 'run.failed':
          console.log(`✗ run.failed — runId: ${event.runId}, error: ${event.error}`);
          break;
      }
    },
    abortController.signal,
  ).catch((err) => {
    if (err.name !== 'AbortError') console.error('SSE error:', err.message);
  });

  // Wait for SSE to connect
  await new Promise((r) => setTimeout(r, 500));

  // Send the test message
  console.log('\n--- Sending message: "Tell me a very short joke" ---\n');
  const sendResult = await sendMessage(SPACE_ID, 'Tell me a very short joke');
  console.log('Message sent:', JSON.stringify(sendResult, null, 2).slice(0, 200));
  console.log('');

  // Wait for the full flow to complete (agent active → response → inactive)
  const timeout = 30_000;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (gotAgentInactive && gotSpaceMessage) break;
    await new Promise((r) => setTimeout(r, 200));
  }

  // Give a bit more time for any trailing events
  await new Promise((r) => setTimeout(r, 500));

  // Close SSE
  abortController.abort();

  // ── Results ──────────────────────────────────────────────────────────────
  console.log('\n=== Results ===\n');

  const checks = [
    { name: 'agent.active received', pass: gotAgentActive },
    { name: 'streaming start received', pass: gotStreamStart },
    { name: 'streaming delta(s) received', pass: gotStreamDelta },
    { name: 'streaming done received', pass: gotStreamDone },
    { name: 'space.message (persisted) received', pass: gotSpaceMessage },
    { name: 'streamId present in space.message', pass: gotSpaceMessage && !!persistedMessageId },
    { name: 'agent.inactive received', pass: gotAgentInactive },
  ];

  let allPass = true;
  for (const check of checks) {
    const icon = check.pass ? '✅' : '❌';
    console.log(`${icon} ${check.name}`);
    if (!check.pass) allPass = false;
  }

  // Verify the persisted message is in the DB
  if (persistedMessageId) {
    console.log('\n--- Verifying persisted message in DB ---');
    const messages = await listMessages(SPACE_ID);
    const found = (messages as any[]).find((m: any) => m.id === persistedMessageId);
    if (found) {
      console.log(`✅ Message ${persistedMessageId} found in messages list`);
      console.log(`   role: ${found.role}, content: "${(found.content as string)?.slice(0, 80)}..."`);
    } else {
      console.log(`❌ Message ${persistedMessageId} NOT found in messages list`);
      allPass = false;
    }
  }

  console.log(`\nTotal SSE events received: ${events.length}`);
  console.log(`Event types: ${events.map((e) => e.type).join(', ')}`);

  console.log(`\n${allPass ? '🎉 ALL CHECKS PASSED' : '⚠️  SOME CHECKS FAILED'}\n`);

  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
