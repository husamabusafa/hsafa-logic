#!/usr/bin/env npx tsx
/**
 * Test Atlas message flow — messages API → extension → Core inbox → Atlas responds
 *
 * Usage:
 *   pnpm exec tsx scripts/tools/test-atlas-response.ts [--jwt <token>] [--secret-key] [--space <id>] [--entity <id>]
 *
 * With JWT (from browser when logged in):
 *   pnpm exec tsx scripts/tools/test-atlas-response.ts --jwt "eyJhbGci..."
 *
 * With x-secret-key (for CI):
 *   SPACES_SECRET_KEY=sk_... pnpm exec tsx scripts/tools/test-atlas-response.ts --secret-key --entity 56010c80-416c-47be-943f-ea6c8ca5a9a5
 *
 * Prerequisites: Core (3001), use-case-app (3005), DB, Redis running.
 */

const SPACE_ID =
  process.env.SPACE_ID || "e46cc24f-bdb6-4ead-85ac-06f4b0d6997c";
const APP_URL = process.env.APP_URL || "http://localhost:3005";
const DEFAULT_ENTITY_ID = "56010c80-416c-47be-943f-ea6c8ca5a9a5";
const CONTENT = process.env.TEST_CONTENT || "hi";
const WAIT_MS = parseInt(process.env.TEST_WAIT_MS || "60000", 10);
const POLL_INTERVAL_MS = 2000;

function parseArgs(): {
  jwt?: string;
  secretKey: boolean;
  spaceId: string;
  entityId: string;
} {
  const args = process.argv.slice(2);
  let jwt: string | undefined;
  let secretKey = false;
  let spaceId = SPACE_ID;
  let entityId = DEFAULT_ENTITY_ID;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--jwt" && args[i + 1]) {
      jwt = args[++i];
    } else if (args[i] === "--secret-key") {
      secretKey = true;
    } else if (args[i] === "--space" && args[i + 1]) {
      spaceId = args[++i];
    } else if (args[i] === "--entity" && args[i + 1]) {
      entityId = args[++i];
    }
  }

  return { jwt, secretKey, spaceId, entityId };
}

async function sendMessage(
  spaceId: string,
  entityId: string,
  content: string,
  auth: { jwt?: string; secretKey?: string }
): Promise<{ messageId: string }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (auth.jwt) {
    headers["Authorization"] = `Bearer ${auth.jwt}`;
    headers["x-public-key"] = "pk_spaces_dev_public_change_in_prod";
  } else if (auth.secretKey) {
    headers["x-secret-key"] = auth.secretKey;
  } else {
    throw new Error("Provide --jwt or --secret-key (SPACES_SECRET_KEY env)");
  }

  const res = await fetch(`${APP_URL}/api/smart-spaces/${spaceId}/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({ content, entityId }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST messages failed ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { message?: { id: string }; error?: string };
  if (data.error) {
    throw new Error(data.error);
  }
  const messageId = data.message?.id;
  if (!messageId) {
    throw new Error("No message id in response");
  }
  return { messageId };
}

async function fetchMessages(
  spaceId: string,
  auth: { jwt?: string; secretKey?: string }
): Promise<Array<{ entity: { displayName: string }; role: string; content: string }>> {
  const headers: Record<string, string> = {};
  if (auth.jwt) {
    headers["Authorization"] = `Bearer ${auth.jwt}`;
    headers["x-public-key"] = "pk_spaces_dev_public_change_in_prod";
  } else if (auth.secretKey) {
    headers["x-secret-key"] = auth.secretKey;
  }

  const res = await fetch(
    `${APP_URL}/api/smart-spaces/${spaceId}/messages?limit=20`,
    { headers }
  );

  if (!res.ok) {
    throw new Error(`GET messages failed ${res.status}`);
  }

  const data = (await res.json()) as {
    messages?: Array<{
      entity: { displayName: string };
      role: string;
      content: string;
    }>;
  };
  return data.messages ?? [];
}

function hasAtlasResponse(
  messages: Array<{ entity: { displayName: string }; role: string }>
): boolean {
  return messages.some(
    (m) =>
      m.role === "assistant" &&
      m.entity.displayName?.toLowerCase().includes("atlas")
  );
}

async function main() {
  const { jwt, secretKey, spaceId, entityId } = parseArgs();

  const secretKeyVal = process.env.SPACES_SECRET_KEY;
  if (secretKey && !secretKeyVal) {
    console.error("--secret-key requires SPACES_SECRET_KEY env");
    process.exit(1);
  }

  const auth = jwt
    ? { jwt }
    : secretKey
      ? { secretKey: secretKeyVal }
      : null;

  if (!auth) {
    console.error("Provide --jwt <token> or --secret-key (with SPACES_SECRET_KEY env)");
    process.exit(1);
  }

  console.log(`Sending "${CONTENT}" to space ${spaceId} (entityId: ${entityId})...`);

  const { messageId } = await sendMessage(spaceId, entityId, CONTENT, auth);
  console.log(`Message sent (id: ${messageId}). Waiting up to ${WAIT_MS / 1000}s for Atlas...`);

  const deadline = Date.now() + WAIT_MS;
  let lastCount = 0;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const messages = await fetchMessages(spaceId, auth);
    if (messages.length !== lastCount) {
      lastCount = messages.length;
      const latest = messages[messages.length - 1];
      if (latest) {
        const preview = latest.content?.slice(0, 60) ?? "";
        console.log(
          `  [${latest.entity?.displayName ?? "?"}] ${latest.role}: ${preview}${preview.length >= 60 ? "..." : ""}`
        );
      }
    }

    if (hasAtlasResponse(messages)) {
      console.log("\n✅ PASS: Atlas responded in the space.");
      process.exit(0);
    }
  }

  console.log("\n❌ FAIL: No Atlas response within timeout.");
  console.log("  - Is Core running on 3001?");
  console.log("  - Is use-case-app running on 3005?");
  console.log("  - Is Atlas connected to this space?");
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
