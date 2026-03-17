#!/usr/bin/env npx tsx
/**
 * Test script: End-to-end flow for spaces_get_spaces tool
 *
 * Tests:
 * 1. Send a message that triggers the haseef to call get_spaces
 * 2. Monitor if the haseef responds (doesn't hang)
 * 3. Check SSE stream for agent activity
 *
 * Usage: npx tsx scripts/test-get-spaces-flow.ts
 */

const SPACES_URL = "http://localhost:5180";
const SPACE_ID = "dacf3361-e209-4ece-b7ec-f5fa55ae784f";
const AUTH_TOKEN =
  "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJjbW1vZ2VmM24wMDAwbXZxZ3RkeWg5bWE4IiwiZW1haWwiOiJodXNhbS5paGFiLmFidXNhZmFAZ21haWwuY29tIiwibmFtZSI6Ikh1c2FtIGFidXNhZmEiLCJlbnRpdHlJZCI6ImM3MzZkYzJjLTJjOTItNGI5Ny05MTQ1LWQ0MjEzMzJkYjlmMyIsImlhdCI6MTc3MzcxNTk3MywiaXNzIjoiaHNhZmEtc3BhY2VzIiwiZXhwIjoxNzc0MzIwNzczfQ.lFbAYoVD67Ov2C3dRuKEdQlP7Z3QECrkYCMVTw9Rkaw";
const ENTITY_ID = "c736dc2c-2c92-4b97-9145-d421332db9f3";

// Core API for checking runs
const CORE_URL = "http://localhost:3001";
const CORE_API_KEY = "hsafa_-55X5Cb6vM5dDqQ8AGwdyugNcv19nZs0dNF6n7ycvsw";

function log(prefix: string, msg: string) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] [${prefix}] ${msg}`);
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Step 1: Start SSE stream to monitor space events ───────────────────────

async function startSSEMonitor(signal: AbortSignal): Promise<void> {
  const url = `${SPACES_URL}/api/smart-spaces/${SPACE_ID}/stream?token=${AUTH_TOKEN}`;
  log("SSE", `Connecting to ${url.slice(0, 80)}...`);

  try {
    const res = await fetch(url, {
      headers: { Accept: "text/event-stream" },
      signal,
    });

    if (!res.ok) {
      log("SSE", `Failed: ${res.status}`);
      return;
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("event: ")) {
          const eventType = line.slice(7).trim();
          log("SSE", `Event: ${eventType}`);
        } else if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "space.message") {
              const entity = data.entity || {};
              const content = data.content?.slice(0, 100) || "(no content)";
              log("SSE", `📨 Message from ${entity.displayName || "unknown"} (${entity.type || "?"}): ${content}`);
            } else if (data.type === "agent.active") {
              log("SSE", `🤖 Agent active: ${data.agentName || data.agentEntityId}`);
            } else if (data.type === "agent.inactive") {
              log("SSE", `😴 Agent inactive: ${data.agentName || data.agentEntityId}`);
            } else if (data.type === "tool.started") {
              log("SSE", `🔧 Tool started: ${data.toolName} (stream=${data.streamId?.slice(0, 8)})`);
            } else if (data.type === "tool.done") {
              const resultStr = JSON.stringify(data.result)?.slice(0, 150) || "?";
              log("SSE", `✅ Tool done: ${data.toolName} → ${resultStr}`);
            } else if (data.type === "tool.error") {
              log("SSE", `❌ Tool error: ${data.toolName} → ${data.error}`);
            } else {
              log("SSE", `Event data: ${JSON.stringify(data).slice(0, 120)}`);
            }
          } catch {
            // Not JSON, ignore
          }
        }
      }
    }
  } catch (err: any) {
    if (err.name !== "AbortError") {
      log("SSE", `Error: ${err.message}`);
    }
  }
}

// ─── Step 2: Send a test message ────────────────────────────────────────────

async function sendMessage(content: string): Promise<void> {
  log("SEND", `Sending: "${content}"`);

  const res = await fetch(`${SPACES_URL}/api/smart-spaces/${SPACE_ID}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AUTH_TOKEN}`,
    },
    body: JSON.stringify({
      entityId: ENTITY_ID,
      content,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    log("SEND", `❌ Failed: ${res.status} ${text}`);
    return;
  }

  const data = await res.json();
  log("SEND", `✅ Sent (messageId=${data.messageId}, seq=${data.seq})`);
}

// ─── Step 3: Check latest runs in Core ──────────────────────────────────────

async function checkCoreStatus(): Promise<void> {
  try {
    const res = await fetch(`${CORE_URL}/api/status`, {
      headers: { "x-api-key": CORE_API_KEY },
    });
    if (!res.ok) {
      log("CORE", `Status check failed: ${res.status}`);
      return;
    }
    const data = await res.json();
    for (const h of data.haseefs || []) {
      log(
        "CORE",
        `Haseef: ${h.name} | cycles=${h.cycleCount} | lastRun=${h.lastRunDurationMs ?? "?"}ms | inbox=${h.inboxDepth} | failed24h=${h.failedRuns24h}`,
      );
    }
  } catch (err: any) {
    log("CORE", `Status check error: ${err.message}`);
  }
}

// ─── Step 4: Poll for new messages in the space ─────────────────────────────

async function getRecentMessages(limit = 5): Promise<any[]> {
  const res = await fetch(
    `${SPACES_URL}/api/smart-spaces/${SPACE_ID}/messages?limit=${limit}&order=desc`,
    {
      headers: {
        Authorization: `Bearer ${AUTH_TOKEN}`,
      },
    },
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.messages || [];
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("=".repeat(70));
  console.log("  Test: spaces_get_spaces end-to-end flow");
  console.log("=".repeat(70));

  // Start SSE monitor in background
  const sseAbort = new AbortController();
  startSSEMonitor(sseAbort.signal);

  // Wait for SSE to connect
  await sleep(1000);

  // Check Core status before
  log("TEST", "--- Core status BEFORE ---");
  await checkCoreStatus();

  // Get messages before
  const messagesBefore = await getRecentMessages(3);
  log("TEST", `Messages before: ${messagesBefore.length}`);
  for (const m of messagesBefore) {
    const sender = m.entity?.displayName || m.entityId?.slice(0, 8) || "?";
    log("TEST", `  [${sender}] ${(m.content || "(no content)").slice(0, 80)}`);
  }

  // Send the test message
  log("TEST", "--- Sending test message ---");
  await sendMessage("can you start a conversation with nova then tell me what happend when you finish");

  // Wait and poll for response
  log("TEST", "--- Waiting for haseef response (120s timeout) ---");
  const startTime = Date.now();
  const timeout = 120_000;
  let responded = false;

  while (Date.now() - startTime < timeout) {
    await sleep(3000);

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const messages = await getRecentMessages(5);

    // Check if any agent message arrived after our send
    const agentMessages = messages.filter(
      (m: any) => m.entity?.type === "agent" && new Date(m.createdAt).getTime() > startTime,
    );

    if (agentMessages.length > 0) {
      log("TEST", `✅ Haseef responded after ${elapsed}s!`);
      for (const m of agentMessages) {
        const sender = m.entity?.displayName || "agent";
        log("TEST", `  [${sender}] ${(m.content || "(no content)").slice(0, 200)}`);
      }
      responded = true;
      break;
    }

    log("TEST", `  ... waiting (${elapsed}s elapsed, ${messages.length} messages in view)`);
  }

  if (!responded) {
    log("TEST", "❌ TIMEOUT: Haseef did not respond within 60s");
    log("TEST", "--- Core status AFTER ---");
    await checkCoreStatus();

    // Show latest messages
    const latestMessages = await getRecentMessages(5);
    log("TEST", "Latest messages:");
    for (const m of latestMessages) {
      const sender = m.entity?.displayName || m.entityId?.slice(0, 8) || "?";
      const type = m.entity?.type || "?";
      log("TEST", `  [${sender} (${type})] ${(m.content || "(no content)").slice(0, 150)}`);
    }
  }

  // Cleanup
  sseAbort.abort();
  await sleep(500);

  console.log("=".repeat(70));
  console.log(responded ? "  ✅ TEST PASSED" : "  ❌ TEST FAILED");
  console.log("=".repeat(70));

  process.exit(responded ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
