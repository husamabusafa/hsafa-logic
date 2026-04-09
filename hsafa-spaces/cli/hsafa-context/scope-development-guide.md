# Scope Development Guide

> How to build a high-quality Hsafa scope — best practices, patterns, and anti-patterns.

## Project Structure

A scope project follows this structure:

```
my-scope/
├── .hsafa/                # AI context (this folder — don't delete)
├── src/
│   ├── index.ts           # SDK setup, connect, register tools
│   ├── tools.ts           # Tool definitions (name, schema, description)
│   └── handler.ts         # Tool call handlers (your logic)
├── .env                   # SCOPE_KEY, CORE_URL, SCOPE_NAME
├── package.json
└── README.md
```

## The 4-Step Pattern

Every scope follows the same pattern:

```typescript
import { HsafaSDK } from '@hsafa/sdk';

// 1. CREATE SDK INSTANCE
const sdk = new HsafaSDK({
  coreUrl: process.env.CORE_URL!,
  apiKey: process.env.SCOPE_KEY!,
  scope: process.env.SCOPE_NAME!,
});

// 2. REGISTER TOOLS
await sdk.registerTools(tools);

// 3. HANDLE TOOL CALLS
sdk.onToolCall('tool_name', async (args, ctx) => {
  // execute and return result
  return { success: true, data: result };
});

// 4. CONNECT
sdk.connect();
```

## Writing Good Tools

### Naming
- Use `snake_case` for tool names: `get_weather`, `send_email`, `list_tables`
- Be specific: `search_customers` not `search`, `create_ticket` not `create`
- Prefix with a verb: `get_`, `list_`, `create_`, `update_`, `delete_`, `send_`, `run_`

### Descriptions
The Haseef reads the description to decide when to use a tool. Write it like you're explaining to a smart colleague:

```typescript
// GOOD — clear, specific, mentions constraints
{
  name: 'query',
  description: 'Run a read-only SQL query (SELECT only). Returns rows as JSON. A LIMIT is enforced automatically if not provided.',
}

// BAD — vague, no context
{
  name: 'query',
  description: 'Query the database.',
}
```

### Input Schemas
Always add `description` to every field in your schema — the Haseef uses these to fill in values correctly:

```typescript
{
  name: 'create_watch',
  description: 'Create a database watch that notifies you when rows matching a condition change.',
  inputSchema: {
    type: 'object',
    properties: {
      table: {
        type: 'string',
        description: 'Table name to watch (e.g. "orders", "users")',
      },
      operation: {
        type: 'string',
        enum: ['INSERT', 'UPDATE', 'DELETE', 'ALL'],
        description: 'Which operation to watch for',
      },
      condition: {
        type: 'string',
        description: 'Optional SQL condition (e.g. "NEW.total > 1000"). Omit to watch all rows.',
      },
    },
    required: ['table', 'operation'],
  },
}
```

### Tool Handlers

#### Return structured data
Always return structured objects — the Haseef can read and reason about them:

```typescript
// GOOD
return { customers: [...], totalCount: 42, hasMore: true };

// BAD — raw string, Haseef can't extract fields
return "Found 42 customers";
```

#### Handle errors gracefully
Don't let handlers crash. Either throw (SDK sends error back) or return an error object:

```typescript
sdk.onToolCall('query', async (args) => {
  try {
    const result = await db.query(args.sql as string);
    return { rows: result.rows, rowCount: result.rowCount };
  } catch (err) {
    return { error: err.message, hint: 'Check your SQL syntax' };
  }
});
```

#### Keep handlers focused
Each handler should do ONE thing. If you need complex workflows, split into multiple tools:

```typescript
// GOOD — separate tools
'list_tables'    → returns table names
'describe_table' → returns column info for one table
'query'          → runs a SQL query

// BAD — one mega-tool
'database_action' → action: 'list' | 'describe' | 'query' | ...
```

## Pushing Sense Events

Use sense events to proactively inform the Haseef about things happening in your service.

### When to push events
- **Webhooks received** — external service calls your endpoint
- **Data changes** — database triggers, file system watchers
- **Scheduled checks** — periodic polling detects something
- **Alerts** — thresholds crossed, errors detected

### Formatting events
Include a `formattedContext` field with a human-readable summary — it goes directly into the Haseef's inbox:

```typescript
await sdk.pushEvent({
  type: 'new_order',
  haseefId: targetHaseefId,
  data: {
    orderId: order.id,
    total: order.total,
    customer: order.customerName,
    formattedContext: [
      '[NEW ORDER RECEIVED]',
      `Order #${order.id} from ${order.customerName}`,
      `Total: $${order.total}`,
      `Items: ${order.items.length}`,
      '',
      '>>> Decide what to do.',
    ].join('\n'),
  },
});
```

## Environment Variables

### Required (every scope)
```
SCOPE_NAME=my-scope           # Matches the scope registered in Core
SCOPE_KEY=hsk_scope_...       # API key from `hsafa scope create`
CORE_URL=http://localhost:3001 # Core API URL
```

### Scope-specific config
Add your own env vars for API keys, database URLs, etc:
```
API_KEY=sk-...
DATABASE_URL=postgres://...
WEBHOOK_SECRET=whsec_...
```

When deployed on the platform, user-defined config values are injected as env vars automatically.

## Dockerfile

If you don't include a Dockerfile, the CLI generates one. For custom needs:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
CMD ["node", "src/index.js"]
```

For TypeScript, build first:
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npx tsc

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY --from=builder /app/dist ./dist
CMD ["node", "dist/index.js"]
```

## Anti-Patterns

### Don't make tools that are too broad
The Haseef works best with focused, specific tools. Don't make a single tool that does everything.

### Don't return raw HTML or large blobs
Return structured JSON. The Haseef can't parse HTML meaningfully.

### Don't hold state between tool calls
Each tool call is independent. If you need persistent state, use a database or the Haseef's memory system (via sense events).

### Don't use generic tool names
`run`, `do`, `action`, `process` — these tell the Haseef nothing. Be specific.

### Don't forget to validate inputs
Always validate and sanitize tool inputs before executing. The Haseef generates the args, and they may not always be perfect:

```typescript
sdk.onToolCall('query', async (args) => {
  const sql = args.sql as string;
  if (!sql || typeof sql !== 'string') {
    return { error: 'sql parameter is required and must be a string' };
  }
  // ... execute
});
```

## Real-World Example: Postgres Scope

A production scope that connects Haseefs to PostgreSQL databases:

**Tools defined:**
- `query` — Run read-only SELECT queries
- `execute` — Run write statements (INSERT/UPDATE/DELETE)
- `list_tables` — List all tables with row counts
- `describe_table` — Get column types and constraints
- `create_watch` — Set up reactive triggers on data changes
- `delete_watch` — Remove a watch

**Sense events pushed:**
- `watch_triggered` — When a watched row changes, pushes the change into the Haseef's inbox

**Key patterns used:**
- Retry with exponential backoff for database connections
- Config loaded from environment variables
- Graceful shutdown (disconnect SDK, close pool)
- Structured error returns (not thrown exceptions)
- Formatted context in sense events
