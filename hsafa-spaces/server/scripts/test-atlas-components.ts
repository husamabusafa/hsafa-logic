/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Test Script: Atlas Component Send & Response
 *
 * 1. Sends a message asking Atlas to create a chart (triggers send_chart tool)
 * 2. Sends a confirmation message, then asks Atlas to respond to it (triggers respond_to_message tool)
 *
 * Usage:
 *   npx tsx scripts/test-atlas-components.ts
 *
 * Requires: server running on PORT=3005, a user account, and Atlas connected to a shared space.
 */

declare const process: any;
declare function setTimeout(fn: () => void, ms: number): any;

const BASE_URL = process.env.BASE_URL || "http://localhost:3005";

// ── Helpers ──────────────────────────────────────────────────────────────────

async function api(path: string, opts: RequestInit = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...((opts.headers as Record<string, string>) || {}),
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    console.error(`❌ ${opts.method || "GET"} ${path} → ${res.status}`, body);
    throw new Error(`API error: ${res.status}`);
  }
  return body;
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Atlas Component Test ===\n");

  // 1. Login (use existing user or create one)
  const email = process.env.TEST_EMAIL || "husam@hsafa.com";
  const password = process.env.TEST_PASSWORD || "test1234";

  let token = "";
  try {
    const loginRes = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    token = loginRes.token;
    console.log(`✅ Logged in as ${email}`);
  } catch {
    console.error("Could not login. Set TEST_EMAIL and TEST_PASSWORD env vars.");
    process.exit(1);
  }

  // 2. Get user info
  const me = await api("/api/me", { headers: authHeaders(token) });
  const entityId = me.user.entityId;
  console.log(`   Entity: ${entityId}`);

  // 3. Find a space where Atlas is a member
  const spacesRes = await api("/api/smart-spaces", { headers: authHeaders(token) });
  const spaces = spacesRes.spaces || spacesRes;

  let targetSpace: { id: string; name: string } | null = null;

  for (const space of spaces) {
    const membersRes = await api(`/api/smart-spaces/${space.id}/members`, {
      headers: authHeaders(token),
    });
    const members = membersRes.members || membersRes;
    const hasAtlas = members.some(
      (m: any) => m.entity?.type === "agent" || m.type === "agent"
    );
    if (hasAtlas) {
      targetSpace = { id: space.id, name: space.name };
      break;
    }
  }

  if (!targetSpace) {
    console.error("❌ No space found with an agent member. Add Atlas to a space first.");
    process.exit(1);
    return; // unreachable but narrows type
  }
  console.log(`✅ Target space: "${targetSpace.name}" (${targetSpace.id})\n`);

  // ── Test 1: Ask Atlas to send a chart ──────────────────────────────────────

  console.log("--- Test 1: Ask Atlas to send a chart ---");
  const chartMsg = await api(`/api/smart-spaces/${targetSpace.id}/messages`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      entityId,
      content:
        "Hey Atlas, can you send a bar chart showing the top 5 programming languages by popularity? Use send_chart tool with realistic data.",
    }),
  });
  console.log(`✅ Sent message: ${chartMsg.messageId}`);
  console.log("   Waiting for Atlas to respond with a chart...\n");

  // Wait a bit for Atlas to process
  await sleep(8000);

  // Check recent messages for a chart
  const msgs1 = await api(
    `/api/smart-spaces/${targetSpace.id}/messages?limit=10`,
    { headers: authHeaders(token) }
  );
  const chartMessages = (msgs1.messages || []).filter(
    (m: any) => m.metadata?.type === "chart"
  );
  if (chartMessages.length > 0) {
    const cm = chartMessages[chartMessages.length - 1];
    console.log(`✅ Atlas sent a chart! Message ID: ${cm.id}`);
    console.log(`   Title: ${cm.metadata?.payload?.title}`);
    console.log(`   Data points: ${(cm.metadata?.payload?.data as any[])?.length || 0}`);
  } else {
    console.log("⏳ No chart message found yet — Atlas may still be processing.");
    console.log("   Check the space manually or wait longer.");
  }

  console.log();

  // ── Test 2: Send a confirmation and ask Atlas to respond ───────────────────

  console.log("--- Test 2: Send confirmation, ask Atlas to respond ---");

  // First, send a confirmation message from the user
  const confirmMsg = await api(`/api/smart-spaces/${targetSpace.id}/messages`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      entityId,
      content: "Should we deploy to production?",
      type: "confirmation",
      metadata: {
        type: "confirmation",
        audience: "broadcast",
        status: "open",
        responseSchema: { type: "enum", values: ["confirmed", "rejected"] },
        responseSummary: { totalResponses: 0, responses: [] },
        payload: {
          title: "Production Deployment",
          message: "Should we deploy the latest changes to production?",
          confirmLabel: "Deploy",
          rejectLabel: "Cancel",
        },
      },
    }),
  });
  console.log(`✅ Sent confirmation: ${confirmMsg.messageId}`);

  // Now ask Atlas to respond to it
  const askMsg = await api(`/api/smart-spaces/${targetSpace.id}/messages`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      entityId,
      content: `Atlas, please respond to the confirmation message ${confirmMsg.messageId} with "confirmed". Use the respond_to_message tool.`,
    }),
  });
  console.log(`✅ Sent follow-up: ${askMsg.messageId}`);
  console.log("   Waiting for Atlas to respond to the confirmation...\n");

  await sleep(8000);

  // Check if the confirmation was responded to
  const msgs2 = await api(
    `/api/smart-spaces/${targetSpace.id}/messages?limit=10`,
    { headers: authHeaders(token) }
  );
  const recentTexts = (msgs2.messages || [])
    .filter((m: any) => m.entityId !== entityId)
    .slice(-3)
    .map((m: any) => `  [${m.metadata?.type || "text"}] ${(m.content || "").slice(0, 80)}`);

  console.log("Recent agent messages:");
  recentTexts.forEach((t: string) => console.log(t));

  // Check if the confirmation message was updated
  const confirmCheck = (msgs2.messages || []).find(
    (m: any) => m.id === confirmMsg.messageId
  );
  if (confirmCheck?.metadata?.responseSummary?.totalResponses > 0) {
    console.log(
      `\n✅ Confirmation responded to! Responses: ${confirmCheck.metadata.responseSummary.totalResponses}`
    );
  } else {
    console.log("\n⏳ Confirmation not yet responded to — Atlas may still be processing.");
  }

  console.log("\n=== Test Complete ===");
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
