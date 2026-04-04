// =============================================================================
// Postgres Scope — Tool Definitions + Instructions (standalone)
// =============================================================================

export const POSTGRES_INSTRUCTIONS = `You have access to a PostgreSQL database. Use these tools to query data, inspect schema, and set up reactive watches.

RULES:
  Use postgres_query for SELECT statements. Results are capped — use LIMIT when possible.
  Use postgres_execute for INSERT/UPDATE/DELETE (only if write access is enabled).
  NEVER run DDL (CREATE, DROP, ALTER, TRUNCATE) — it will be blocked.
  Always check the schema first with postgres_list_tables and postgres_describe_table before writing queries.
  When creating watches, use simple WHERE conditions (column = value, column > value, etc.).

WATCHES:
  Watches are Postgres triggers you create to get notified when rows change.
  Use postgres_create_watch to set one up. Use postgres_delete_watch to remove it.
  Your active watches are listed in the prompt — check before creating duplicates.`;

export const POSTGRES_TOOLS = [
  {
    name: "query",
    description:
      "Run a read-only SQL query (SELECT only). Returns rows as JSON. A LIMIT is enforced automatically if not provided.",
    inputSchema: {
      type: "object" as const,
      properties: {
        sql: {
          type: "string",
          description: "The SELECT query to run.",
        },
      },
      required: ["sql"],
    },
  },
  {
    name: "execute",
    description:
      "Run a write SQL statement (INSERT, UPDATE, DELETE). Returns affected row count. DDL (CREATE/DROP/ALTER/TRUNCATE) is blocked. Only available if the database is not in read-only mode.",
    inputSchema: {
      type: "object" as const,
      properties: {
        sql: {
          type: "string",
          description: "The write SQL statement to run.",
        },
      },
      required: ["sql"],
    },
  },
  {
    name: "list_tables",
    description:
      "List all tables in the connected schema with approximate row counts.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "describe_table",
    description:
      "Get the schema of a table: columns, types, nullable, defaults, and constraints.",
    inputSchema: {
      type: "object" as const,
      properties: {
        table: {
          type: "string",
          description: "Table name to describe.",
        },
      },
      required: ["table"],
    },
  },
  {
    name: "create_watch",
    description:
      "Create a database watch (Postgres trigger) that notifies you when rows matching a condition are inserted, updated, or deleted. Use this for reactive monitoring (e.g. 'alert me when a new order over $1000 is placed').",
    inputSchema: {
      type: "object" as const,
      properties: {
        description: {
          type: "string",
          description: "What this watch is for (e.g. 'Large orders over $1000').",
        },
        table: {
          type: "string",
          description: "Table to watch.",
        },
        operation: {
          type: "string",
          enum: ["INSERT", "UPDATE", "DELETE", "ALL"],
          description: "Which operation to watch for.",
        },
        whereCondition: {
          type: "string",
          description:
            "Optional SQL condition on the NEW row (e.g. \"NEW.total > 1000\"). Omit to watch all rows.",
        },
      },
      required: ["description", "table", "operation"],
    },
  },
  {
    name: "delete_watch",
    description:
      "Delete a database watch by ID. This drops the Postgres trigger and function.",
    inputSchema: {
      type: "object" as const,
      properties: {
        watchId: {
          type: "string",
          description: "The watch ID to delete.",
        },
      },
      required: ["watchId"],
    },
  },
];
