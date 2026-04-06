// =============================================================================
// Postgres Scope — Standalone Service Entry Point
//
// A self-contained Docker service that connects to Core via @hsafa/sdk.
// Reads config from environment variables, manages its own pg pool,
// and stores watch metadata in the target DB itself.
//
// ENV:
//   SCOPE_NAME       — scope name registered in Core (default: "postgres")
//   CORE_URL         — Core API base URL (default: "http://localhost:3001")
//   SCOPE_KEY        — API key for this scope (provisioned by Spaces server)
//   CONNECTION_STRING — target PostgreSQL connection string
//   SCHEMA           — schema name (default: "public")
//   READ_ONLY        — "true"/"false" (default: "true")
//   MAX_ROWS         — max rows per query (default: 100)
//   QUERY_TIMEOUT_MS — query timeout in ms (default: 10000)
//   MAX_WATCHES      — max watches per haseef (default: 10)
// =============================================================================

import { HsafaSDK } from "@hsafa/sdk";
import { POSTGRES_TOOLS, POSTGRES_INSTRUCTIONS } from "./tools.js";
import {
  loadConfigFromEnv,
  initPool,
  closePool,
  ensureWatchesTable,
  runQuery,
  runExecute,
  listTables,
  describeTable,
  createWatch,
  deleteWatch,
  getActiveWatches,
  getWatchById,
} from "./service.js";
import { setNotifyCallback, startListener, stopListener } from "./listener.js";

// ── Config ──────────────────────────────────────────────────────────────────

const SCOPE_NAME = process.env.SCOPE_NAME || "postgres";
const CORE_URL = process.env.CORE_URL || "http://localhost:3001";
const SCOPE_KEY = process.env.SCOPE_KEY || "";

if (!SCOPE_KEY) {
  console.error("[postgres-scope] SCOPE_KEY env var is required");
  process.exit(1);
}

// ── Init ────────────────────────────────────────────────────────────────────

const config = loadConfigFromEnv();
initPool(config);

// Retry helper — exponential backoff for transient DB outages
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  label: string,
  { maxRetries = Infinity, baseDelayMs = 3_000, maxDelayMs = 60_000 } = {},
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt >= maxRetries) throw err;
      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      console.warn(`[postgres] ${label} failed (attempt ${attempt}), retrying in ${(delay / 1000).toFixed(0)}s...`, (err as Error).message);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

// Ensure watch metadata table exists in the target DB (with retry)
await retryWithBackoff(() => ensureWatchesTable(), "ensureWatchesTable");

// Start LISTEN/NOTIFY listener (with retry)
await retryWithBackoff(() => startListener(config.connectionString), "startListener");

// ── SDK Setup ───────────────────────────────────────────────────────────────

const sdk = new HsafaSDK({
  coreUrl: CORE_URL,
  apiKey: SCOPE_KEY,
  scope: SCOPE_NAME,
});

// Register tools with instructions
await sdk.registerTools(
  POSTGRES_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
);
console.log(`[${SCOPE_NAME}] Registered ${POSTGRES_TOOLS.length} tools`);

// ── Tool Handlers ───────────────────────────────────────────────────────────

sdk.onToolCall("query", async (args) => {
  const r = await runQuery(args.sql as string);
  return { rows: r.rows, rowCount: r.rowCount };
});

sdk.onToolCall("execute", async (args) => {
  const r = await runExecute(args.sql as string);
  return { success: true, rowCount: r.rowCount };
});

sdk.onToolCall("list_tables", async () => {
  return { tables: await listTables() };
});

sdk.onToolCall("describe_table", async (args) => {
  return await describeTable(args.table as string);
});

sdk.onToolCall("create_watch", async (args, ctx) => {
  const w = await createWatch({
    haseefId: ctx.haseef.id,
    description: args.description as string,
    table: args.table as string,
    operation: args.operation as string,
    whereCondition: args.whereCondition as string | undefined,
  });
  return { success: true, watch: { id: w.id, description: w.description, table: w.table_name, operation: w.operation } };
});

sdk.onToolCall("delete_watch", async (args, ctx) => {
  const r = await deleteWatch(args.watchId as string, ctx.haseef.id);
  if (!r.success) return { error: r.error };
  return { success: true };
});

// ── Watch Notifications → Sense Events ──────────────────────────────────────

setNotifyCallback(async (payload) => {
  const watch = await getWatchById(payload.watchId);
  if (!watch?.active) return;

  await sdk.pushEvent({
    type: "watch_triggered",
    haseefId: watch.haseef_id,
    data: {
      watchId: watch.id,
      description: watch.description,
      table: payload.table,
      operation: payload.op,
      row: payload.row,
      formattedContext: [
        `[DATABASE WATCH TRIGGERED]`,
        `Watch: "${watch.description}" (watchId: ${watch.id})`,
        `Table: ${watch.table_name}, Operation: ${payload.op}`,
        `Row: ${JSON.stringify(payload.row, null, 2)}`,
        ``,
        `>>> Decide what to do.`,
      ].join("\n"),
    },
  }).catch((err) => console.error(`[${SCOPE_NAME}] Watch event failed:`, err));
});

// ── Connect SSE ─────────────────────────────────────────────────────────────

sdk.connect();
console.log(`[${SCOPE_NAME}] Connected to Core at ${CORE_URL} — ready for tool calls`);

// ── Graceful Shutdown ───────────────────────────────────────────────────────

async function shutdown() {
  console.log(`[${SCOPE_NAME}] Shutting down...`);
  sdk.disconnect();
  await stopListener();
  await closePool();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
