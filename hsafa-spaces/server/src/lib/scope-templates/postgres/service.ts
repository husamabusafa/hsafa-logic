// =============================================================================
// Postgres Scope — Service
//
// Manages pg client pools per scope instance, query execution, schema
// introspection, and watch (trigger) CRUD.
// =============================================================================

import pg from "pg";
import { prisma } from "../../db.js";
import { decrypt } from "../../encryption.js";

// =============================================================================
// Pool Management — one pool per scope instance (connectionString)
// =============================================================================

export interface PgConfig {
  connectionString: string;
  schema: string;
  readOnly: boolean;
  maxRows: number;
  queryTimeoutMs: number;
  maxWatches: number;
}

const pools = new Map<string, pg.Pool>();
const configs = new Map<string, PgConfig>();

/** Create a pool for a scope instance. Call once during init. */
export function addPool(instanceId: string, config: PgConfig): void {
  const pool = new pg.Pool({
    connectionString: config.connectionString,
    max: 5,
    statement_timeout: config.queryTimeoutMs,
  });
  pools.set(instanceId, pool);
  configs.set(instanceId, config);
}

/** Get the pool for a scope instance. */
export function getPool(instanceId: string): pg.Pool | undefined {
  return pools.get(instanceId);
}

/** Get config for a scope instance. */
export function getConfig(instanceId: string): PgConfig | undefined {
  return configs.get(instanceId);
}

/** Shut down all pools. */
export async function closeAllPools(): Promise<void> {
  for (const [id, pool] of pools) {
    try {
      await pool.end();
    } catch {
      /* ignore */
    }
    pools.delete(id);
    configs.delete(id);
  }
}

// =============================================================================
// Resolve which instance a haseef uses
// =============================================================================

/** Find the postgres scope instance attached to a haseef (via Core scopes). */
export function getInstanceForHaseef(
  _haseefId: string,
): { instanceId: string; config: PgConfig } | null {
  // For now: return the first available instance.
  // When multi-instance support is needed, look up via haseef → scopes → instance mapping.
  for (const [instanceId, config] of configs) {
    return { instanceId, config };
  }
  return null;
}

// =============================================================================
// Query Execution
// =============================================================================

const DDL_PATTERN = /^\s*(CREATE|DROP|ALTER|TRUNCATE)\s/i;
const SELECT_PATTERN = /^\s*SELECT\s/i;

export async function runQuery(
  instanceId: string,
  sql: string,
): Promise<{ rows: Record<string, unknown>[]; rowCount: number }> {
  const pool = pools.get(instanceId);
  const config = configs.get(instanceId);
  if (!pool || !config) throw new Error("Database not connected");

  if (!SELECT_PATTERN.test(sql)) {
    throw new Error("query tool only accepts SELECT statements. Use execute for writes.");
  }

  // Auto-add LIMIT if missing
  const hasLimit = /\bLIMIT\s+\d+/i.test(sql);
  const safeSql = hasLimit ? sql : `${sql.replace(/;\s*$/, "")} LIMIT ${config.maxRows}`;

  const result = await pool.query(safeSql);
  return {
    rows: result.rows.slice(0, config.maxRows),
    rowCount: result.rows.length,
  };
}

export async function runExecute(
  instanceId: string,
  sql: string,
): Promise<{ rowCount: number }> {
  const pool = pools.get(instanceId);
  const config = configs.get(instanceId);
  if (!pool || !config) throw new Error("Database not connected");

  if (config.readOnly) {
    throw new Error("Database is in read-only mode. Write operations are disabled.");
  }
  if (DDL_PATTERN.test(sql)) {
    throw new Error("DDL statements (CREATE, DROP, ALTER, TRUNCATE) are not allowed.");
  }
  if (SELECT_PATTERN.test(sql)) {
    throw new Error("Use the query tool for SELECT statements.");
  }

  const result = await pool.query(sql);
  return { rowCount: result.rowCount ?? 0 };
}

// =============================================================================
// Schema Introspection
// =============================================================================

export async function listTables(
  instanceId: string,
): Promise<Array<{ table: string; estimatedRows: number }>> {
  const pool = pools.get(instanceId);
  const config = configs.get(instanceId);
  if (!pool || !config) throw new Error("Database not connected");

  const result = await pool.query(
    `SELECT tablename AS table,
            (SELECT reltuples::bigint FROM pg_class WHERE relname = tablename) AS estimated_rows
     FROM pg_tables
     WHERE schemaname = $1
     ORDER BY tablename`,
    [config.schema],
  );

  return result.rows.map((r: any) => ({
    table: r.table,
    estimatedRows: Number(r.estimated_rows) || 0,
  }));
}

export async function describeTable(
  instanceId: string,
  table: string,
): Promise<{
  columns: Array<{ name: string; type: string; nullable: boolean; default: string | null }>;
  constraints: Array<{ name: string; type: string; definition: string }>;
}> {
  const pool = pools.get(instanceId);
  const config = configs.get(instanceId);
  if (!pool || !config) throw new Error("Database not connected");

  const colResult = await pool.query(
    `SELECT column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2
     ORDER BY ordinal_position`,
    [config.schema, table],
  );

  const conResult = await pool.query(
    `SELECT conname AS name, contype AS type,
            pg_get_constraintdef(oid) AS definition
     FROM pg_constraint
     WHERE conrelid = ($1 || '.' || $2)::regclass`,
    [config.schema, table],
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
// Watch CRUD — creates/deletes Postgres triggers + NOTIFY
// =============================================================================

const NOTIFY_CHANNEL = "hsafa_watches";

export interface CreateWatchParams {
  haseefId: string;
  instanceId: string;
  description: string;
  table: string;
  operation: string;
  whereCondition?: string;
}

export async function createWatch(params: CreateWatchParams): Promise<{
  id: string;
  triggerName: string;
  description: string;
  tableName: string;
  operation: string;
  whereCondition: string | null;
}> {
  const pool = pools.get(params.instanceId);
  const config = configs.get(params.instanceId);
  if (!pool || !config) throw new Error("Database not connected");

  if (config.readOnly) {
    throw new Error("Cannot create watches in read-only mode (triggers require write access).");
  }

  // Check max watches
  const count = await prisma.haseefWatch.count({
    where: { haseefId: params.haseefId, instanceId: params.instanceId, active: true },
  });
  if (count >= config.maxWatches) {
    throw new Error(`Maximum watches reached (${config.maxWatches}). Delete one first.`);
  }

  // Validate operation
  const op = params.operation.toUpperCase();
  if (!["INSERT", "UPDATE", "DELETE", "ALL"].includes(op)) {
    throw new Error("operation must be INSERT, UPDATE, DELETE, or ALL");
  }

  // Create the DB record first to get the ID
  const watch = await prisma.haseefWatch.create({
    data: {
      haseefId: params.haseefId,
      instanceId: params.instanceId,
      description: params.description,
      tableName: params.table,
      operation: op,
      whereCondition: params.whereCondition ?? null,
      triggerName: "", // placeholder
    },
  });

  const triggerName = `hsafa_watch_${watch.id.replace(/-/g, "")}`;
  const funcName = `${triggerName}_fn`;

  // Update with real trigger name
  await prisma.haseefWatch.update({
    where: { id: watch.id },
    data: { triggerName },
  });

  // Build the row variable — NEW for INSERT/UPDATE, OLD for DELETE
  const rowVar = op === "DELETE" ? "OLD" : "NEW";

  // Create function
  const funcSql = `
    CREATE OR REPLACE FUNCTION ${config.schema}.${funcName}() RETURNS trigger AS $$
    BEGIN
      PERFORM pg_notify('${NOTIFY_CHANNEL}', json_build_object(
        'watchId', '${watch.id}',
        'table', TG_TABLE_NAME,
        'op', TG_OP,
        'row', row_to_json(${rowVar})
      )::text);
      RETURN ${rowVar};
    END;
    $$ LANGUAGE plpgsql;
  `;

  // Build trigger event
  const triggerEvent = op === "ALL" ? "INSERT OR UPDATE OR DELETE" : op;

  // Build WHEN clause
  let whenClause = "";
  if (params.whereCondition && op !== "DELETE") {
    whenClause = `WHEN (${params.whereCondition})`;
  }

  const triggerSql = `
    CREATE TRIGGER ${triggerName}
    AFTER ${triggerEvent} ON ${config.schema}.${params.table}
    FOR EACH ROW ${whenClause}
    EXECUTE FUNCTION ${config.schema}.${funcName}();
  `;

  try {
    await pool.query(funcSql);
    await pool.query(triggerSql);
  } catch (err) {
    // Cleanup DB record if SQL fails
    await prisma.haseefWatch.delete({ where: { id: watch.id } });
    throw err;
  }

  return {
    id: watch.id,
    triggerName,
    description: params.description,
    tableName: params.table,
    operation: op,
    whereCondition: params.whereCondition ?? null,
  };
}

export async function deleteWatch(
  watchId: string,
  haseefId: string,
): Promise<{ success: boolean; error?: string }> {
  const watch = await prisma.haseefWatch.findUnique({ where: { id: watchId } });
  if (!watch) return { success: false, error: "Watch not found" };
  if (watch.haseefId !== haseefId) return { success: false, error: "Watch does not belong to this haseef" };

  const pool = pools.get(watch.instanceId);
  const config = configs.get(watch.instanceId);

  // Drop trigger + function from PG
  if (pool && config) {
    const funcName = `${watch.triggerName}_fn`;
    try {
      await pool.query(`DROP TRIGGER IF EXISTS ${watch.triggerName} ON ${config.schema}.${watch.tableName}`);
      await pool.query(`DROP FUNCTION IF EXISTS ${config.schema}.${funcName}()`);
    } catch (err) {
      console.error(`[postgres] Failed to drop trigger ${watch.triggerName}:`, err);
    }
  }

  await prisma.haseefWatch.delete({ where: { id: watchId } });
  return { success: true };
}

export async function getActiveWatches(haseefId: string): Promise<
  Array<{
    id: string;
    description: string;
    tableName: string;
    operation: string;
    whereCondition: string | null;
  }>
> {
  return prisma.haseefWatch.findMany({
    where: { haseefId, active: true },
    select: {
      id: true,
      description: true,
      tableName: true,
      operation: true,
      whereCondition: true,
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function getWatchById(watchId: string) {
  return prisma.haseefWatch.findUnique({ where: { id: watchId } });
}

// =============================================================================
// Config Loader — reads encrypted ScopeInstanceConfig from DB
// =============================================================================

export async function loadInstanceConfig(instanceId: string): Promise<PgConfig | null> {
  const rows = await prisma.scopeInstanceConfig.findMany({
    where: { instanceId },
  });

  const configMap = new Map<string, string>();
  for (const row of rows) {
    configMap.set(row.key, row.isSecret ? decrypt(row.value) : row.value);
  }

  const connectionString = configMap.get("connectionString");
  if (!connectionString) return null;

  return {
    connectionString,
    schema: configMap.get("schema") ?? "public",
    readOnly: configMap.get("readOnly") !== "false", // default true
    maxRows: parseInt(configMap.get("maxRows") ?? "100", 10),
    queryTimeoutMs: parseInt(configMap.get("queryTimeoutMs") ?? "10000", 10),
    maxWatches: parseInt(configMap.get("maxWatches") ?? "10", 10),
  };
}
