#!/usr/bin/env tsx
// =============================================================================
// Test Script — Interactive Messages (Respond, Upsert, SSE, Broadcast)
//
// Tests the full flow:
//   1. Create a confirmation message (broadcast)
//   2. Respond to it (first response)
//   3. Respond again (upsert — updates existing response)
//   4. Second entity responds
//   5. List responses
//   6. Create a vote message
//   7. Vote on it
//   8. Change vote (upsert)
//   9. Close the vote
//
// Usage:
//   SPACE_ID=<id> ENTITY_ID_1=<id> ENTITY_ID_2=<id> TOKEN=<jwt> tsx scripts/test-interactive-messages.ts
//
// Or set BASE_URL (default: http://localhost:5180)
// =============================================================================

const BASE_URL = process.env.BASE_URL || "http://localhost:5180";
const SPACE_ID = process.env.SPACE_ID;
const ENTITY_ID_1 = process.env.ENTITY_ID_1;
const ENTITY_ID_2 = process.env.ENTITY_ID_2;
const TOKEN = process.env.TOKEN;

if (!SPACE_ID || !ENTITY_ID_1 || !TOKEN) {
  console.error("Required env vars: SPACE_ID, ENTITY_ID_1, TOKEN");
  console.error("Optional: ENTITY_ID_2, BASE_URL");
  process.exit(1);
}

const headers = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${TOKEN}`,
};

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { status: res.status, data };
}

// =============================================================================
// Helpers
// =============================================================================

async function postMessage(content: string, metadata: Record<string, unknown>) {
  return api("POST", `/api/smart-spaces/${SPACE_ID}/messages`, {
    entityId: ENTITY_ID_1,
    content,
    type: metadata.type || "text",
    metadata,
  });
}

async function respond(messageId: string, value: unknown) {
  return api("POST", `/api/smart-spaces/${SPACE_ID}/messages/${messageId}/respond`, { value });
}

async function listResponses(messageId: string) {
  return api("GET", `/api/smart-spaces/${SPACE_ID}/messages/${messageId}/responses`);
}

async function closeMessage(messageId: string) {
  return api("POST", `/api/smart-spaces/${SPACE_ID}/messages/${messageId}/close`);
}

// =============================================================================
// Tests
// =============================================================================

async function main() {
  console.log("\n🧪 Interactive Messages — Test Suite\n");
  console.log(`  Base URL:   ${BASE_URL}`);
  console.log(`  Space ID:   ${SPACE_ID}`);
  console.log(`  Entity 1:   ${ENTITY_ID_1}`);
  console.log(`  Entity 2:   ${ENTITY_ID_2 || "(not set — skipping multi-entity tests)"}`);
  console.log();

  // ── Test 1: Create a confirmation message ──
  console.log("── Test 1: Create confirmation message (broadcast) ──");
  const confirmMsg = await postMessage("Deploy to production?", {
    type: "confirmation",
    audience: "broadcast",
    status: "open",
    responseSchema: { type: "enum", values: ["confirmed", "rejected"] },
    payload: {
      title: "Deploy to production?",
      message: "This will deploy v2.1 to all servers.",
      confirmLabel: "Deploy",
      rejectLabel: "Cancel",
    },
    responseSummary: { totalResponses: 0, responses: [] },
  });
  assert(confirmMsg.status === 201 || confirmMsg.status === 200, "Message created", `status=${confirmMsg.status}`);
  const confirmId = confirmMsg.data.messageId;
  assert(!!confirmId, "Got messageId", confirmId);

  // ── Test 2: First response — "confirmed" ──
  console.log("\n── Test 2: Respond to confirmation (first response) ──");
  const resp1 = await respond(confirmId, "confirmed");
  assert(resp1.status === 200, "Response accepted", `status=${resp1.status}`);
  assert(resp1.data.success === true, "success=true");
  assert(resp1.data.isUpdate === false, "isUpdate=false (first response)");
  assert(resp1.data.responseSummary?.totalResponses === 1, "totalResponses=1");

  // ── Test 3: Upsert — same entity changes to "rejected" ──
  console.log("\n── Test 3: Upsert — change response to 'rejected' ──");
  const resp2 = await respond(confirmId, "rejected");
  assert(resp2.status === 200, "Upsert accepted", `status=${resp2.status}`);
  assert(resp2.data.isUpdate === true, "isUpdate=true (upsert)");
  assert(resp2.data.responseSummary?.totalResponses === 1, "totalResponses still 1 (same entity)");
  const myResp = resp2.data.responseSummary?.responses?.[0];
  assert(myResp?.value === "rejected", "Value updated to 'rejected'", `got: ${myResp?.value}`);

  // ── Test 4: Upsert back to "confirmed" ──
  console.log("\n── Test 4: Upsert — change back to 'confirmed' ──");
  const resp3 = await respond(confirmId, "confirmed");
  assert(resp3.status === 200, "Upsert accepted again");
  assert(resp3.data.isUpdate === true, "isUpdate=true");
  assert(resp3.data.responseSummary?.responses?.[0]?.value === "confirmed", "Value back to 'confirmed'");

  // ── Test 5: List responses ──
  console.log("\n── Test 5: List responses ──");
  const respList = await listResponses(confirmId);
  assert(respList.status === 200, "List responses OK");
  assert(Array.isArray(respList.data.responses), "responses is array");
  assert(respList.data.responses.length === 1, `1 response (got ${respList.data.responses?.length})`);

  // ── Test 6: Invalid response value ──
  console.log("\n── Test 6: Invalid response value ──");
  const respBad = await respond(confirmId, "maybe");
  assert(respBad.status === 400, "Rejected invalid value", `status=${respBad.status}`);

  // ── Test 7: Create a vote message ──
  console.log("\n── Test 7: Create vote message ──");
  const counts: Record<string, number> = { Pizza: 0, Sushi: 0, Tacos: 0 };
  const voteMsg = await postMessage("What should we order?", {
    type: "vote",
    audience: "broadcast",
    status: "open",
    responseSchema: { type: "enum", values: ["Pizza", "Sushi", "Tacos"] },
    payload: {
      title: "What should we order?",
      options: ["Pizza", "Sushi", "Tacos"],
      allowMultiple: false,
    },
    responseSummary: { totalResponses: 0, counts, responses: [] },
  });
  assert(voteMsg.status === 201 || voteMsg.status === 200, "Vote created");
  const voteId = voteMsg.data.messageId;

  // ── Test 8: Vote ──
  console.log("\n── Test 8: Vote for Pizza ──");
  const vote1 = await respond(voteId, "Pizza");
  assert(vote1.status === 200, "Vote accepted");
  assert(vote1.data.responseSummary?.counts?.Pizza === 1, "Pizza count = 1");

  // ── Test 9: Change vote (upsert) ──
  console.log("\n── Test 9: Change vote to Sushi (upsert) ──");
  const vote2 = await respond(voteId, "Sushi");
  assert(vote2.status === 200, "Vote upsert accepted");
  assert(vote2.data.isUpdate === true, "isUpdate=true");
  assert(vote2.data.responseSummary?.counts?.Pizza === 0, "Pizza count = 0 (changed)");
  assert(vote2.data.responseSummary?.counts?.Sushi === 1, "Sushi count = 1");
  assert(vote2.data.responseSummary?.totalResponses === 1, "totalResponses still 1");

  // ── Test 10: Close the vote ──
  console.log("\n── Test 10: Close the vote ──");
  const closeRes = await closeMessage(voteId);
  assert(closeRes.status === 200, "Close accepted");
  assert(closeRes.data.success === true, "success=true");
  assert(closeRes.data.resolution?.outcome === "Sushi", `Outcome = Sushi (got: ${closeRes.data.resolution?.outcome})`);

  // ── Test 11: Cannot respond to closed message ──
  console.log("\n── Test 11: Cannot respond to closed message ──");
  const voteClosed = await respond(voteId, "Tacos");
  assert(voteClosed.status === 409, "Rejected (closed)", `status=${voteClosed.status}`);

  // ── Test 12: Cannot close already-closed message ──
  console.log("\n── Test 12: Cannot close again ──");
  const closeAgain = await closeMessage(voteId);
  assert(closeAgain.status === 409, "Rejected (already closed)", `status=${closeAgain.status}`);

  // ── Summary ──
  console.log("\n" + "═".repeat(50));
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log("═".repeat(50) + "\n");

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
