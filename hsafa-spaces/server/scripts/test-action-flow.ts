#!/usr/bin/env npx tsx
/**
 * Direct test: dispatch an action to Redis stream and see if spaces service
 * processes it and submits the result back to Core.
 *
 * This bypasses the LLM entirely — tests the spaces service action pipeline only.
 */

import Redis from "ioredis";
import { randomUUID } from "crypto";

const CORE_REDIS_URL = "redis://:redis123@localhost:6379";
const HASEEF_ID = "df8f5f7c-4e66-45df-81c7-b25b2a616a10";
const SCOPE = "spaces";
const CORE_API_KEY = "hsafa_-55X5Cb6vM5dDqQ8AGwdyugNcv19nZs0dNF6n7ycvsw";
const CORE_URL = "http://localhost:3001";

const actionId = randomUUID();
const streamKey = `actions:${HASEEF_ID}:${SCOPE}`;
const resultChannel = `action_result:${actionId}`;

console.log("=== Direct Action Flow Test ===");
console.log(`Stream: ${streamKey}`);
console.log(`ActionId: ${actionId}`);
console.log(`ResultChannel: ${resultChannel}`);
console.log();

async function main() {
  const pub = new Redis(CORE_REDIS_URL, { maxRetriesPerRequest: null });
  const sub = new Redis(CORE_REDIS_URL, { maxRetriesPerRequest: null });

  let resultReceived = false;

  // 1. Subscribe to result channel (like Core does in syncDispatch)
  console.log(`[1] Subscribing to ${resultChannel}...`);
  await sub.subscribe(resultChannel);
  sub.on("message", (channel: string, message: string) => {
    if (channel === resultChannel) {
      console.log(`[✅] Got result on pub/sub: ${message.slice(0, 200)}`);
      resultReceived = true;
    }
  });

  // 2. Dispatch action to Redis stream (like Core does)
  console.log(`[2] Dispatching action to stream: get_spaces`);
  await pub.xadd(
    streamKey,
    "*",
    "actionId", actionId,
    "name", "get_spaces",
    "args", JSON.stringify({}),
    "mode", "sync",
  );
  console.log(`[2] Action dispatched.`);

  // 3. Wait for result (up to 30s)
  console.log(`[3] Waiting for result (30s timeout)...`);
  const startTime = Date.now();
  while (Date.now() - startTime < 30000) {
    if (resultReceived) break;
    await new Promise((r) => setTimeout(r, 500));
  }

  if (resultReceived) {
    console.log(`\n✅ SUCCESS — spaces service processed action and submitted result in ${Date.now() - startTime}ms`);
  } else {
    console.log(`\n❌ TIMEOUT — spaces service did NOT submit result within 30s`);

    // Check if the message was consumed from the stream
    const pending = await pub.xpending(streamKey, "spaces-consumer");
    console.log(`Stream pending info:`, JSON.stringify(pending));

    // Also try checking via Core's HTTP endpoint
    console.log(`\n[4] Testing direct HTTP submitActionResult to Core...`);
    const testActionId = randomUUID();
    const res = await fetch(`${CORE_URL}/api/haseefs/${HASEEF_ID}/actions/${testActionId}/result`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": CORE_API_KEY,
      },
      body: JSON.stringify({ test: true }),
    });
    console.log(`HTTP test: ${res.status} ${await res.text()}`);
  }

  await sub.unsubscribe();
  pub.disconnect();
  sub.disconnect();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
