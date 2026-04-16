// =============================================================================
// Database Skill Template
//
// Allows haseefs to query SQL databases (PostgreSQL).
// Each instance connects to a different database with its own config.
// =============================================================================

import pg from "pg";
import type { SkillTemplateDefinition, SkillHandler, ToolCallContext } from "../types.js";

const { Pool } = pg;

export const databaseTemplate: SkillTemplateDefinition = {
  name: "database",
  displayName: "Database",
  description: "Connect to a PostgreSQL database. Run queries, describe tables, and explore schema.",
  category: "data",
  configSchema: {
    type: "object",
    properties: {
      connectionString: {
        type: "string",
        description: "PostgreSQL connection string (e.g. postgresql://user:pass@host:5432/dbname)",
      },
      readOnly: {
        type: "boolean",
        description: "If true, only SELECT queries are allowed (default: true)",
        default: true,
      },
      maxRows: {
        type: "number",
        description: "Maximum rows returned per query (default: 100)",
        default: 100,
      },
    },
    required: ["connectionString"],
  },
  tools: [
    {
      name: "query",
      description:
        "Run a SQL query against the database. Returns rows as JSON. For read-only instances, only SELECT/WITH/EXPLAIN queries are allowed.",
      inputSchema: {
        type: "object",
        properties: {
          sql: { type: "string", description: "SQL query to execute." },
          params: {
            type: "array",
            items: {},
            description: "Optional parameterized query values ($1, $2, ...).",
          },
        },
        required: ["sql"],
      },
      mode: "sync" as const,
    },
    {
      name: "list_tables",
      description: "List all tables in the database with their row counts and sizes.",
      inputSchema: {
        type: "object",
        properties: {},
      },
      mode: "sync" as const,
    },
    {
      name: "describe_table",
      description: "Show the schema of a specific table: columns, types, constraints, and indexes.",
      inputSchema: {
        type: "object",
        properties: {
          table: { type: "string", description: "Table name to describe." },
          schema: { type: "string", description: "Schema name (default: public)." },
        },
        required: ["table"],
      },
      mode: "sync" as const,
    },
    {
      name: "execute",
      description:
        "Execute a write statement (INSERT, UPDATE, DELETE, CREATE, ALTER, DROP). Only available on non-read-only instances. Returns affected row count.",
      inputSchema: {
        type: "object",
        properties: {
          sql: { type: "string", description: "SQL statement to execute." },
          params: {
            type: "array",
            items: {},
            description: "Optional parameterized values ($1, $2, ...).",
          },
        },
        required: ["sql"],
      },
      mode: "sync" as const,
    },
  ],
  instructions: `You have access to a PostgreSQL database through this skill.

USAGE:
  Use query to read data (SELECT). Use execute to modify data (INSERT/UPDATE/DELETE).
  Use list_tables to see what's in the database and describe_table to understand schema.
  Always check the schema before writing complex queries.

SAFETY:
  If the instance is read-only, execute will be rejected.
  Always use parameterized queries ($1, $2) for user-provided values to prevent SQL injection.
  Be careful with DELETE/DROP — confirm with the user first if the operation seems destructive.

FORMATTING:
  When returning query results, format them as readable tables or summaries.
  For large result sets, summarize key findings rather than dumping all rows.`,

  createHandler: (config: Record<string, unknown>): SkillHandler => {
    return createDatabaseHandler(config);
  },
};

// =============================================================================
// Handler Implementation
// =============================================================================

const READ_ONLY_PATTERN = /^\s*(SELECT|WITH|EXPLAIN|SHOW|SET\s+search_path)\b/i;
const WRITE_PATTERN = /^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE)\b/i;

function createDatabaseHandler(config: Record<string, unknown>): SkillHandler {
  const connectionString = config.connectionString as string;
  const readOnly = config.readOnly !== false; // default true
  const maxRows = (config.maxRows as number) || 100;

  const pool = new Pool({
    connectionString,
    max: 3,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  return {
    async execute(toolName: string, args: Record<string, unknown>, _ctx: ToolCallContext): Promise<unknown> {
      switch (toolName) {
        case "query":
          return handleQuery(pool, args, readOnly, maxRows);
        case "list_tables":
          return handleListTables(pool);
        case "describe_table":
          return handleDescribeTable(pool, args);
        case "execute":
          return handleExecute(pool, args, readOnly);
        default:
          return { error: `Unknown tool: ${toolName}` };
      }
    },
    async destroy() {
      await pool.end();
    },
  };
}

async function handleQuery(
  pool: pg.Pool,
  args: Record<string, unknown>,
  readOnly: boolean,
  maxRows: number,
): Promise<unknown> {
  const sql = args.sql as string;
  const params = (args.params as unknown[]) ?? [];

  if (!sql) return { error: "sql is required" };

  if (readOnly && !READ_ONLY_PATTERN.test(sql)) {
    return { error: "This database instance is read-only. Only SELECT, WITH, and EXPLAIN queries are allowed." };
  }

  try {
    const result = await pool.query(`${sql} LIMIT ${maxRows}`, params);
    return {
      rows: result.rows,
      rowCount: result.rows.length,
      fields: result.fields.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })),
    };
  } catch (err: any) {
    return { error: err.message };
  }
}

async function handleListTables(pool: pg.Pool): Promise<unknown> {
  try {
    const result = await pool.query(`
      SELECT
        schemaname AS schema,
        tablename AS table,
        pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) AS size,
        (SELECT reltuples::bigint FROM pg_class WHERE relname = tablename) AS approx_rows
      FROM pg_tables
      WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
      ORDER BY schemaname, tablename
    `);
    return { tables: result.rows };
  } catch (err: any) {
    return { error: err.message };
  }
}

async function handleDescribeTable(pool: pg.Pool, args: Record<string, unknown>): Promise<unknown> {
  const table = args.table as string;
  const schema = (args.schema as string) || "public";

  if (!table) return { error: "table is required" };

  try {
    // Columns
    const columns = await pool.query(
      `SELECT column_name, data_type, is_nullable, column_default, character_maximum_length
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2
       ORDER BY ordinal_position`,
      [schema, table],
    );

    // Constraints (PK, FK, UNIQUE)
    const constraints = await pool.query(
      `SELECT
         tc.constraint_name, tc.constraint_type,
         kcu.column_name,
         ccu.table_name AS foreign_table, ccu.column_name AS foreign_column
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
       LEFT JOIN information_schema.constraint_column_usage ccu
         ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
       WHERE tc.table_schema = $1 AND tc.table_name = $2
       ORDER BY tc.constraint_type, tc.constraint_name`,
      [schema, table],
    );

    // Indexes
    const indexes = await pool.query(
      `SELECT indexname, indexdef
       FROM pg_indexes
       WHERE schemaname = $1 AND tablename = $2`,
      [schema, table],
    );

    return {
      table: `${schema}.${table}`,
      columns: columns.rows,
      constraints: constraints.rows,
      indexes: indexes.rows,
    };
  } catch (err: any) {
    return { error: err.message };
  }
}

async function handleExecute(
  pool: pg.Pool,
  args: Record<string, unknown>,
  readOnly: boolean,
): Promise<unknown> {
  if (readOnly) {
    return { error: "This database instance is read-only. Use a non-read-only instance for write operations." };
  }

  const sql = args.sql as string;
  const params = (args.params as unknown[]) ?? [];

  if (!sql) return { error: "sql is required" };

  if (!WRITE_PATTERN.test(sql) && !READ_ONLY_PATTERN.test(sql)) {
    return { error: "Unrecognized SQL statement type." };
  }

  try {
    const result = await pool.query(sql, params);
    return {
      success: true,
      rowCount: result.rowCount,
      command: result.command,
    };
  } catch (err: any) {
    return { error: err.message };
  }
}

export default databaseTemplate;
