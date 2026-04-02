// =============================================================================
// Postgres Scope — Init
//
// Self-contained scope template using @hsafa/sdk:
//   - Creates its own SDK instance
//   - Registers tools (conditionally: execute only if not readOnly)
//   - Handles tool calls via sdk.onToolCall()
//   - Pushes watch_triggered sense events via sdk.pushEvent()
//   - Starts LISTEN/NOTIFY listener for each connected database
//   - Registers dynamic instruction provider for YOUR DATABASE / YOUR WATCHES
//
// The service layer only needs to call initPostgresScope(config).
// =============================================================================

import { HsafaSDK } from "@hsafa/sdk";
import type { ToolCallContext } from "@hsafa/sdk";
import { syncTools } from "../../service/core-api.js";
import { registerInstructionProvider } from "../instruction-providers.js";
import { POSTGRES_TOOLS } from "./tools.js";
import {
  addPool,
  getInstanceForHaseef,
  runQuery,
  runExecute,
  listTables,
  describeTable,
  createWatch,
  deleteWatch,
  getActiveWatches,
  getWatchById,
  loadInstanceConfig,
  closeAllPools,
} from "./service.js";
import {
  setNotifyCallback,
  startListener,
  stopAllListeners,
} from "./listener.js";
import { prisma } from "../../db.js";

let sdk: HsafaSDK | null = null;

// =============================================================================
// Lifecycle
// =============================================================================

export async function initPostgresScope(config: {
  coreUrl: string;
  apiKey: string;
}): Promise<void> {
  // Find all postgres scope instances from DB
  const instances = await prisma.scopeInstance.findMany({
    where: { scopeName: "postgres", active: true },
  });

  if (instances.length === 0) {
    console.log("[postgres] No active postgres instances — skipping init");
    return;
  }

  // Load config + create pools for each instance
  let anyConnected = false;
  for (const inst of instances) {
    const pgConfig = await loadInstanceConfig(inst.id);
    if (!pgConfig) {
      console.warn(`[postgres] Instance ${inst.id.slice(0, 8)} has no connectionString — skipping`);
      continue;
    }
    addPool(inst.id, pgConfig);
    anyConnected = true;
  }

  if (!anyConnected) {
    console.log("[postgres] No instances with valid config — skipping init");
    return;
  }

  // Create SDK
  sdk = new HsafaSDK({
    coreUrl: config.coreUrl,
    apiKey: config.apiKey,
    scope: "postgres",
  });

  // Register tools
  await sdk.registerTools(POSTGRES_TOOLS);

  // Wire handlers
  sdk.onToolCall("query", handleQuery);
  sdk.onToolCall("execute", handleExecute);
  sdk.onToolCall("list_tables", handleListTables);
  sdk.onToolCall("describe_table", handleDescribeTable);
  sdk.onToolCall("create_watch", handleCreateWatch);
  sdk.onToolCall("delete_watch", handleDeleteWatch);

  // Connect SSE
  sdk.connect();

  // Set up LISTEN/NOTIFY for watch triggers
  setNotifyCallback(handleWatchNotification);
  for (const inst of instances) {
    const pgConfig = await loadInstanceConfig(inst.id);
    if (pgConfig) {
      await startListener(inst.id, pgConfig.connectionString);
    }
  }

  // Register dynamic instruction provider
  registerInstructionProvider(buildPostgresInstructions);

  console.log(`[postgres] Initialized — ${instances.length} instance(s), SDK connected`);
}

export async function stopPostgresScope(): Promise<void> {
  await stopAllListeners();
  await closeAllPools();
  sdk?.disconnect();
  sdk = null;
  console.log("[postgres] Stopped");
}

// =============================================================================
// Tool Handlers
// =============================================================================

async function handleQuery(
  args: Record<string, unknown>,
  ctx: ToolCallContext,
): Promise<unknown> {
  const inst = getInstanceForHaseef(ctx.haseef.id);
  if (!inst) return { error: "No database connected for this haseef" };

  const sql = args.sql as string;
  if (!sql) return { error: "sql is required" };

  try {
    const result = await runQuery(inst.instanceId, sql);
    return { rows: result.rows, rowCount: result.rowCount };
  } catch (err: any) {
    return { error: err.message };
  }
}

async function handleExecute(
  args: Record<string, unknown>,
  ctx: ToolCallContext,
): Promise<unknown> {
  const inst = getInstanceForHaseef(ctx.haseef.id);
  if (!inst) return { error: "No database connected for this haseef" };

  const sql = args.sql as string;
  if (!sql) return { error: "sql is required" };

  try {
    const result = await runExecute(inst.instanceId, sql);
    return { success: true, rowCount: result.rowCount };
  } catch (err: any) {
    return { error: err.message };
  }
}

async function handleListTables(
  _args: Record<string, unknown>,
  ctx: ToolCallContext,
): Promise<unknown> {
  const inst = getInstanceForHaseef(ctx.haseef.id);
  if (!inst) return { error: "No database connected for this haseef" };

  try {
    const tables = await listTables(inst.instanceId);
    return { tables };
  } catch (err: any) {
    return { error: err.message };
  }
}

async function handleDescribeTable(
  args: Record<string, unknown>,
  ctx: ToolCallContext,
): Promise<unknown> {
  const inst = getInstanceForHaseef(ctx.haseef.id);
  if (!inst) return { error: "No database connected for this haseef" };

  const table = args.table as string;
  if (!table) return { error: "table is required" };

  try {
    const schema = await describeTable(inst.instanceId, table);
    return schema;
  } catch (err: any) {
    return { error: err.message };
  }
}

async function handleCreateWatch(
  args: Record<string, unknown>,
  ctx: ToolCallContext,
): Promise<unknown> {
  const inst = getInstanceForHaseef(ctx.haseef.id);
  if (!inst) return { error: "No database connected for this haseef" };

  const description = args.description as string;
  const table = args.table as string;
  const operation = args.operation as string;
  if (!description || !table || !operation)
    return { error: "description, table, and operation are required" };

  try {
    const watch = await createWatch({
      haseefId: ctx.haseef.id,
      instanceId: inst.instanceId,
      description,
      table,
      operation,
      whereCondition: args.whereCondition as string | undefined,
    });

    // Re-sync prompt to show the new watch
    syncTools(ctx.haseef.id).catch((err) =>
      console.error(`[postgres] Re-sync failed:`, err),
    );

    console.log(
      `[postgres] Created watch "${description}" on ${table} (${watch.id.slice(0, 8)}) for ${ctx.haseef.name}`,
    );
    return { success: true, watch };
  } catch (err: any) {
    return { error: err.message };
  }
}

async function handleDeleteWatch(
  args: Record<string, unknown>,
  ctx: ToolCallContext,
): Promise<unknown> {
  const watchId = args.watchId as string;
  if (!watchId) return { error: "watchId is required" };

  const result = await deleteWatch(watchId, ctx.haseef.id);
  if (!result.success) return { error: result.error };

  // Re-sync prompt to remove the watch
  syncTools(ctx.haseef.id).catch((err) =>
    console.error(`[postgres] Re-sync failed:`, err),
  );

  console.log(`[postgres] Deleted watch ${watchId.slice(0, 8)} for ${ctx.haseef.name}`);
  return { success: true };
}

// =============================================================================
// Watch Notification Handler — called by LISTEN/NOTIFY listener
// =============================================================================

async function handleWatchNotification(
  _instanceId: string,
  payload: { watchId: string; table: string; op: string; row: Record<string, unknown> },
): Promise<void> {
  if (!sdk) return;

  const watch = await getWatchById(payload.watchId);
  if (!watch || !watch.active) return;

  try {
    await sdk.pushEvent({
      type: "watch_triggered",
      haseefId: watch.haseefId,
      data: {
        watchId: watch.id,
        description: watch.description,
        table: payload.table,
        operation: payload.op,
        row: payload.row,
        formattedContext: buildWatchContext(watch, payload),
      },
    });
    console.log(`[postgres] Watch "${watch.description}" fired for ${watch.haseefId.slice(0, 8)}`);
  } catch (err) {
    console.error(`[postgres] Failed to push watch event:`, err);
  }
}

// =============================================================================
// Instruction Provider — YOUR DATABASE + YOUR WATCHES
// =============================================================================

async function buildPostgresInstructions(
  haseefId: string,
): Promise<string | null> {
  const inst = getInstanceForHaseef(haseefId);
  if (!inst) return null;

  const sections: string[] = [];

  // YOUR DATABASE
  try {
    const tables = await listTables(inst.instanceId);
    const mode = inst.config.readOnly ? "read-only" : "read-write";
    const tableList =
      tables.length > 0
        ? tables.map((t) => `  - ${t.table} (~${t.estimatedRows} rows)`).join("\n")
        : "  (no tables)";
    sections.push(
      `YOUR DATABASE (${mode}, schema: ${inst.config.schema}):\n${tableList}`,
    );
  } catch {
    sections.push("YOUR DATABASE:\n  (connection error)");
  }

  // YOUR WATCHES
  try {
    const watches = await getActiveWatches(haseefId);
    if (watches.length > 0) {
      const watchLines = watches.map((w) => {
        const cond = w.whereCondition ? `, where: ${w.whereCondition}` : "";
        return `  - "${w.description}" (watchId: ${w.id}, table: ${w.tableName}, on: ${w.operation}${cond})`;
      });
      sections.push(
        "YOUR WATCHES:\n" +
          "  To remove a watch, use postgres_delete_watch with the watchId.\n" +
          watchLines.join("\n"),
      );
    } else {
      sections.push("YOUR WATCHES:\n  (none active)");
    }
  } catch {
    // Non-fatal
  }

  return sections.join("\n\n");
}

// =============================================================================
// Formatted Context — injected into watch_triggered sense event
// =============================================================================

function buildWatchContext(
  watch: { id: string; description: string; tableName: string; operation: string },
  payload: { op: string; row: Record<string, unknown> },
): string {
  const lines: string[] = [];
  lines.push(`[DATABASE WATCH TRIGGERED]`);
  lines.push(`Watch: "${watch.description}" (watchId: ${watch.id})`);
  lines.push(`Table: ${watch.tableName}`);
  lines.push(`Operation: ${payload.op}`);
  lines.push(`Row: ${JSON.stringify(payload.row, null, 2)}`);
  lines.push(``);
  lines.push(`>>> A row matching your watch condition was detected. Decide what to do.`);
  return lines.join("\n");
}
