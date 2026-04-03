// =============================================================================
// Postgres Scope — ScopePlugin implementation
//
// Query databases, inspect schemas, set up reactive watches.
// Pools + CRUD in service.ts, LISTEN/NOTIFY in listener.ts, tools in tools.ts.
// =============================================================================

import type { HsafaSDK } from "@hsafa/sdk";
import type { ScopePlugin, ToolCallContext } from "../../service/scope-plugin.js";
import { syncInstructions } from "../../service/core-api.js";
import { prisma } from "../../db.js";
import { POSTGRES_TOOLS, POSTGRES_INSTRUCTIONS } from "./tools.js";
import {
  addPool, getInstanceForHaseef, runQuery, runExecute, listTables,
  describeTable, createWatch, deleteWatch, getActiveWatches, getWatchById,
  loadInstanceConfig, closeAllPools,
} from "./service.js";
import { setNotifyCallback, startListener, stopAllListeners } from "./listener.js";

export { POSTGRES_TOOLS, POSTGRES_INSTRUCTIONS };

let sdk: HsafaSDK | null = null;

export const postgresPlugin: ScopePlugin = {
  name: "postgres",
  tools: POSTGRES_TOOLS,
  staticInstructions: POSTGRES_INSTRUCTIONS,

  async shouldLoad() {
    return (await prisma.scopeInstance.count({ where: { scopeName: "postgres", active: true } })) > 0;
  },

  async init(s) {
    sdk = s;
    const instances = await prisma.scopeInstance.findMany({ where: { scopeName: "postgres", active: true } });
    for (const inst of instances) {
      const cfg = await loadInstanceConfig(inst.id);
      if (!cfg) continue;
      addPool(inst.id, cfg);
      await startListener(inst.id, cfg.connectionString);
    }
    setNotifyCallback(onWatchNotify);
    console.log(`[postgres] Initialized — ${instances.length} instance(s)`);
  },

  async stop() {
    await stopAllListeners();
    await closeAllPools();
    sdk = null;
  },

  async handleToolCall(name, args, ctx) {
    const inst = getInstanceForHaseef(ctx.haseef.id);
    if (!inst) return { error: "No database connected" };

    try {
      switch (name) {
        case "query": {
          const r = await runQuery(inst.instanceId, args.sql as string);
          return { rows: r.rows, rowCount: r.rowCount };
        }
        case "execute": {
          const r = await runExecute(inst.instanceId, args.sql as string);
          return { success: true, rowCount: r.rowCount };
        }
        case "list_tables": return { tables: await listTables(inst.instanceId) };
        case "describe_table": return await describeTable(inst.instanceId, args.table as string);
        case "create_watch": {
          const w = await createWatch({
            haseefId: ctx.haseef.id, instanceId: inst.instanceId,
            description: args.description as string, table: args.table as string,
            operation: args.operation as string, whereCondition: args.whereCondition as string | undefined,
          });
          syncInstructions(ctx.haseef.id).catch(() => {});
          return { success: true, watch: w };
        }
        case "delete_watch": {
          const r = await deleteWatch(args.watchId as string, ctx.haseef.id);
          if (!r.success) return { error: r.error };
          syncInstructions(ctx.haseef.id).catch(() => {});
          return { success: true };
        }
        default: return { error: `Unknown postgres tool: ${name}` };
      }
    } catch (err: any) { return { error: err.message }; }
  },

  async getDynamicInstructions(haseefId) {
    const inst = getInstanceForHaseef(haseefId);
    if (!inst) return null;
    const parts: string[] = [];

    try {
      const tables = await listTables(inst.instanceId);
      const mode = inst.config.readOnly ? "read-only" : "read-write";
      const list = tables.length > 0
        ? tables.map(t => `  - ${t.table} (~${t.estimatedRows} rows)`).join("\n")
        : "  (no tables)";
      parts.push(`YOUR DATABASE (${mode}, schema: ${inst.config.schema}):\n${list}`);
    } catch { parts.push("YOUR DATABASE:\n  (connection error)"); }

    try {
      const watches = await getActiveWatches(haseefId);
      if (watches.length > 0) {
        const lines = watches.map(w => {
          const cond = w.whereCondition ? `, where: ${w.whereCondition}` : "";
          return `  - "${w.description}" (id:${w.id}, table:${w.tableName}, on:${w.operation}${cond})`;
        });
        parts.push("YOUR WATCHES:\n  To remove: postgres_delete_watch with watchId.\n" + lines.join("\n"));
      } else { parts.push("YOUR WATCHES:\n  (none active)"); }
    } catch { /* non-fatal */ }

    return parts.join("\n\n");
  },
};

// ── Watch notification handler ───────────────────────────────────────────────
async function onWatchNotify(
  _instanceId: string,
  payload: { watchId: string; table: string; op: string; row: Record<string, unknown> },
) {
  if (!sdk) return;
  const watch = await getWatchById(payload.watchId);
  if (!watch?.active) return;

  await sdk.pushEvent({
    type: "watch_triggered", haseefId: watch.haseefId,
    data: {
      watchId: watch.id, description: watch.description,
      table: payload.table, operation: payload.op, row: payload.row,
      formattedContext: [
        `[DATABASE WATCH TRIGGERED]`,
        `Watch: "${watch.description}" (watchId: ${watch.id})`,
        `Table: ${watch.tableName}, Operation: ${payload.op}`,
        `Row: ${JSON.stringify(payload.row, null, 2)}`,
        ``, `>>> Decide what to do.`,
      ].join("\n"),
    },
  }).catch(err => console.error(`[postgres] Watch event failed:`, err));
}
