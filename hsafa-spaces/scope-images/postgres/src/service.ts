// =============================================================================
// Postgres Scope — Service (standalone)
//
// Manages pg client pool, query execution, schema introspection, and watch
// CRUD. Watches are stored in the target DB itself (_hsafa_watches table)
// so this service is fully self-contained — no Spaces DB dependency.
// =============================================================================

import pg from "pg";
import { randomUUID } from "crypto";

// =============================================================================
// Config — from environment variables
// =============================================================================

export interface PgConfig {
  connectionString: string;
  schema: string;
  readOnly: boolean;
  maxRows: number;
  queryTimeoutMs: number;
  maxWatches: number;
}

export function loadConfigFromEnv(): PgConfig {
  const connectionString = process.env.CONNECTION_STRING;
  if (!connectionString) throw new Error("CONNECTION_STRING env var is required");

  return {
    connectionString,
    schema: process.env.SCHEMA || "public",
    readOnly: process.env.READ_ONLY !== "false", // default true
    maxRows: parseInt(process.env.MAX_ROWS || "100", 10),
    queryTimeoutMs: parseInt(process.env.QUERY_TIMEOUT_MS || "10000", 10),
    maxWatches: parseInt(process.env.MAX_WATCHES || "10", 10),
  };
}

// =============================================================================
// Pool Management
// =============================================================================

let pool: pg.Pool | null = null;
let config: PgConfig | null = null;

export function initPool(cfg: PgConfig): void {
  config = cfg;
  pool = new pg.Pool({
    connectionString: cfg.connectionString,
    max: 5,
    statement_timeout: cfg.queryTimeoutMs,
  });
}

export function getPool(): pg.Pool {
  if (!pool) throw new Error("Database not connected");
  return pool;
}

export function getConfig(): PgConfig {
  if (!config) throw new Error("Config not loaded");
  return config;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end().catch(() => {});
    pool = null;
    config = null;
  }
}

// =============================================================================
// Query Execution
// =============================================================================

const DDL_PATTERN = /^\s*(CREATE|DROP|ALTER|TRUNCATE)\s/i;
const SELECT_PATTERN = /^\s*SELECT\s/i;

export async function runQuery(
  sql: string,
): Promise<{ rows: Record<string, unknown>[]; rowCount: number }> {
  const p = getPool();
  const cfg = getConfig();

  if (!SELECT_PATTERN.test(sql)) {
    throw new Error("query tool only accepts SELECT statements. Use execute for writes.");
  }

  const hasLimit = /\bLIMIT\s+\d+/i.test(sql);
  const safeSql = hasLimit ? sql : `${sql.replace(/;\s*$/, "")} LIMIT ${cfg.maxRows}`;

  const result = await p.query(safeSql);
  return {
    rows: result.rows.slice(0, cfg.maxRows),
    rowCount: result.rows.length,
  };
}

export async function runExecute(
  sql: string,
): Promise<{ rowCount: number }> {
  const p = getPool();
  const cfg = getConfig();

  if (cfg.readOnly) {
    throw new Error("Database is in read-only mode. Write operations are disabled.");
  }
  if (DDL_PATTERN.test(sql)) {
    throw new Error("DDL statements (CREATE, DROP, ALTER, TRUNCATE) are not allowed.");
  }
  if (SELECT_PATTERN.test(sql)) {
    throw new Error("Use the query tool for SELECT statements.");
  }

  const result = await p.query(sql);
  return { rowCount: result.rowCount ?? 0 };
}

// =============================================================================
// Schema Introspection
// =============================================================================

export async function listTables(): Promise<Array<{ table: string; estimatedRows: number }>> {
  const p = getPool();
  const cfg = getConfig();

  const result = await p.query(
    `SELECT tablename AS table,
            (SELECT reltuples::bigint FROM pg_class WHERE relname = tablename) AS estimated_rows
     FROM pg_tables
     WHERE schemaname = $1 AND tablename != '_hsafa_watches'
     ORDER BY tablename`,
    [cfg.schema],
  );

  return result.rows.map((r: any) => ({
    table: r.table,
    estimatedRows: Number(r.estimated_rows) || 0,
  }));
}

export async function describeTable(table: string): Promise<{
  columns: Array<{ name: string; type: string; nullable: boolean; default: string | null }>;
  constraints: Array<{ name: string; type: string; definition: string }>;
}> {
  const p = getPool();
  const cfg = getConfig();

  const colResult = await p.query(
    `SELECT column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2
     ORDER BY ordinal_position`,
    [cfg.schema, table],
  );

  const conResult = await p.query(
    `SELECT conname AS name, contype AS type,
            pg_get_constraintdef(oid) AS definition
     FROM pg_constraint
     WHERE conrelid = ($1 || '.' || $2)::regclass`,
    [cfg.schema, table],
  );

  return {
    columns: colResult.rows.map((r: any) => ({
      name: r.column_name,
      type: r.data_type,
      nullable: r.is_nullable === "YES",
      default: r.column_default ?? null,
    })),
    constraints: conResult.rows.map((r: any) => ({
      name: r.name,
      type: r.type === "p" ? "PRIMARY KEY" : r.type === "f" ? "FOREIGN KEY" : r.type === "u" ? "UNIQUE" : r.type,
      definition: r.definition,
    })),
  };
}

// =============================================================================
// Watch CRUD — stored in target DB's _hsafa_watches table
// =============================================================================

const NOTIFY_CHANNEL = "hsafa_watches";

export interface Watch {
  id: string;
  haseef_id: string;
  description: string;
  table_name: string;
  operation: string;
  where_condition: string | null;
  trigger_name: string;
  active: boolean;
  created_at: Date;
}

/** Ensure the _hsafa_watches metadata table exists in the target DB. */
export async function ensureWatchesTable(): Promise<void> {
  const p = getPool();
  const cfg = getConfig();

  await p.query(`
    CREATE TABLE IF NOT EXISTS ${cfg.schema}._hsafa_watches (
      id TEXT PRIMARY KEY,
      haseef_id TEXT NOT NULL,
      description TEXT NOT NULL,
      table_name TEXT NOT NULL,
      operation TEXT NOT NULL,
      where_condition TEXT,
      trigger_name TEXT NOT NULL,
      active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

export interface CreateWatchParams {
  haseefId: string;
  description: string;
  table: string;
  operation: string;
  whereCondition?: string;
}

export async function createWatch(params: CreateWatchParams): Promise<Watch> {
  const p = getPool();
  const cfg = getConfig();

  if (cfg.readOnly) {
    throw new Error("Cannot create watches in read-only mode (triggers require write access).");
  }

  // Check max watches
  const countResult = await p.query(
    `SELECT COUNT(*) as count FROM ${cfg.schema}._hsafa_watches WHERE haseef_id = $1 AND active = TRUE`,
    [params.haseefId],
  );
  if (parseInt(countResult.rows[0].count, 10) >= cfg.maxWatches) {
    throw new Error(`Maximum watches reached (${cfg.maxWatches}). Delete one first.`);
  }

  const op = params.operation.toUpperCase();
  if (!["INSERT", "UPDATE", "DELETE", "ALL"].includes(op)) {
    throw new Error("operation must be INSERT, UPDATE, DELETE, or ALL");
  }

  const id = randomUUID();
  const triggerName = `hsafa_watch_${id.replace(/-/g, "")}`;
  const funcName = `${triggerName}_fn`;

  // Insert watch record
  await p.query(
    `INSERT INTO ${cfg.schema}._hsafa_watches (id, haseef_id, description, table_name, operation, where_condition, trigger_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, params.haseefId, params.description, params.table, op, params.whereCondition ?? null, triggerName],
  );

  // Build row variable
  const rowVar = op === "DELETE" ? "OLD" : "NEW";

  // Create function
  const funcSql = `
    CREATE OR REPLACE FUNCTION ${cfg.schema}.${funcName}() RETURNS trigger AS $$
    BEGIN
      PERFORM pg_notify('${NOTIFY_CHANNEL}', json_build_object(
        'watchId', '${id}',
        'table', TG_TABLE_NAME,
        'op', TG_OP,
        'row', row_to_json(${rowVar})
      )::text);
      RETURN ${rowVar};
    END;
    $$ LANGUAGE plpgsql;
  `;

  const triggerEvent = op === "ALL" ? "INSERT OR UPDATE OR DELETE" : op;
  let whenClause = "";
  if (params.whereCondition && op !== "DELETE") {
    whenClause = `WHEN (${params.whereCondition})`;
  }

  const triggerSql = `
    CREATE TRIGGER ${triggerName}
    AFTER ${triggerEvent} ON ${cfg.schema}.${params.table}
    FOR EACH ROW ${whenClause}
    EXECUTE FUNCTION ${cfg.schema}.${funcName}();
  `;

  try {
    await p.query(funcSql);
    await p.query(triggerSql);
  } catch (err) {
    // Cleanup record if SQL fails
    await p.query(`DELETE FROM ${cfg.schema}._hsafa_watches WHERE id = $1`, [id]);
    throw err;
  }

  return {
    id,
    haseef_id: params.haseefId,
    description: params.description,
    table_name: params.table,
    operation: op,
    where_condition: params.whereCondition ?? null,
    trigger_name: triggerName,
    active: true,
    created_at: new Date(),
  };
}

export async function deleteWatch(
  watchId: string,
  haseefId: string,
): Promise<{ success: boolean; error?: string }> {
  const p = getPool();
  const cfg = getConfig();

  const result = await p.query(
    `SELECT * FROM ${cfg.schema}._hsafa_watches WHERE id = $1`,
    [watchId],
  );
  const watch = result.rows[0] as Watch | undefined;
  if (!watch) return { success: false, error: "Watch not found" };
  if (watch.haseef_id !== haseefId) return { success: false, error: "Watch does not belong to this haseef" };

  const funcName = `${watch.trigger_name}_fn`;
  try {
    await p.query(`DROP TRIGGER IF EXISTS ${watch.trigger_name} ON ${cfg.schema}.${watch.table_name}`);
    await p.query(`DROP FUNCTION IF EXISTS ${cfg.schema}.${funcName}()`);
  } catch (err) {
    console.error(`[postgres] Failed to drop trigger ${watch.trigger_name}:`, err);
  }

  await p.query(`DELETE FROM ${cfg.schema}._hsafa_watches WHERE id = $1`, [watchId]);
  return { success: true };
}

export async function getActiveWatches(haseefId: string): Promise<Watch[]> {
  const p = getPool();
  const cfg = getConfig();

  const result = await p.query(
    `SELECT * FROM ${cfg.schema}._hsafa_watches WHERE haseef_id = $1 AND active = TRUE ORDER BY created_at ASC`,
    [haseefId],
  );
  return result.rows;
}

export async function getWatchById(watchId: string): Promise<Watch | null> {
  const p = getPool();
  const cfg = getConfig();

  const result = await p.query(
    `SELECT * FROM ${cfg.schema}._hsafa_watches WHERE id = $1`,
    [watchId],
  );
  return result.rows[0] ?? null;
}
