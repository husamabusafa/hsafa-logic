// =============================================================================
// .hsafa/ context folder content — embedded as strings for CLI distribution.
// These files are written into every scaffolded skill project so AI tools
// (Cursor, Windsurf, Copilot, etc.) have full v7 context.
// =============================================================================

import fs from "node:fs";
import path from "node:path";

export interface ContextFile {
  name: string;
  content: string;
}

export const HSAFA_CONTEXT_FILES: ContextFile[] = [
  {
    name: "instructions.md",
    content: `# Hsafa Skill — AI Instructions

> **This file is for AI assistants (Cursor, Windsurf, Copilot, etc.).** Read all \`.md\` files in this \`.hsafa/\` folder to understand the Hsafa platform (v7) and how to write skills correctly.

## Context Files

Read these files in order for full context:

1. **\`what-is-hsafa.md\`** — What Hsafa is, the Core + Services architecture
2. **\`sdk-reference.md\`** — Pointer to the canonical SDK reference
3. **\`cli-reference.md\`** — All CLI commands
4. **\`skill-development-guide.md\`** — Best practices, patterns, anti-patterns
5. **\`examples.md\`** — Real code examples (API wrapper, database, webhooks, monitoring)

## Rules for AI

When generating code for this Hsafa skill project:

1. **Always use \`@hsafa/sdk\`** — \`import { HsafaSDK } from "@hsafa/sdk"\`.
2. **Constructor uses \`skill\`, not \`scope\`** — \`new HsafaSDK({ coreUrl, apiKey, skill })\`.
3. **Authenticate with the single Core key** — env var \`HSAFA_CORE_KEY\` (Core's \`SECRET_KEY\`). There is no per-skill key in v7.
4. **Use \`snake_case\` for tool names** — e.g. \`get_weather\`, \`send_email\`.
5. **Add descriptions to every tool and every input field** — the haseef reads them to choose tools.
6. **Return structured JSON from handlers** — not strings, not raw HTML.
7. **Use \`hsafa.memory.*\`, \`hsafa.haseef.*\`, \`hsafa.runs.*\`** for state beyond tool calls.
8. **Handle errors gracefully** — return \`{ error: "message" }\` or throw.
9. **Include graceful shutdown** — \`hsafa.disconnect()\` on \`SIGINT\` / \`SIGTERM\`.
10. **Keep tools focused** — one tool = one action; split complex workflows into multiple tools.

## This Project

This is a Hsafa skill service. It connects to Hsafa Core and provides tools to haseefs (autonomous AI agents). The haseef decides when to call tools — your job is to define what tools are available and implement the handler logic.
`,
  },
  {
    name: "what-is-hsafa.md",
    content: `# What is Hsafa (v7)

> Context for AI assistants generating code in this Hsafa skill project.

## Overview

**Hsafa** is a runtime for autonomous AI agents called **haseefs**. A haseef is not a chatbot — it is a long-lived agent with:

- **Identity** — name, description, profile (phone, email, robotId, …)
- **4 memory types** — semantic (key/value facts), episodic (run summaries), social (people), procedural (learned patterns)
- **Skills** — named groups of tools, registered by services
- **Trigger-based execution** — events trigger runs; no continuous loop, no consciousness

## Architecture: Core + Services

Hsafa follows a strict **Core + Services** separation.

### Hsafa Core
The agent's **brain**. Stateless trigger-driven runs (\`coordinator → invoker → reflect\`). Owns the haseef profile, the 4 memory types, the skill/tool registry, and event routing.

- **API**: REST + SSE at \`http://localhost:3001\` (default)
- **Auth**: a single shared \`SECRET_KEY\` sent as \`x-api-key\` (or \`?api_key=\` for SSE)
- **Stateless**: every run builds a fresh prompt; there is no persistent conversation log

### Services (one per skill)
Independent processes that connect to Core and provide tools to haseefs. Each service registers under a **skill** — a named channel.

Examples: \`spaces\`, \`scheduler\`, \`whatsapp\`, \`postgres\`, \`weather\`. One service per skill — if you need two WhatsApp providers, use \`whatsapp_twilio\` and \`whatsapp_meta\`.

A service does four things via \`@hsafa/sdk\`:

1. \`registerTools([...])\` — declare tools to Core
2. \`onToolCall(name, handler)\` — handle tool calls when they arrive
3. \`pushEvent({...})\` — push outside-world events into haseefs
4. \`connect()\` — open the long-lived SSE stream

The SDK also exposes \`hsafa.memory.*\`, \`hsafa.haseef.*\`, and \`hsafa.runs.*\` for everything else a skill might need.

## Key Concepts

| Concept | Description |
|---------|-------------|
| **Haseef** | A long-lived AI agent with identity, memory, and skills |
| **Skill** | A named channel identifying a service (e.g. \`weather\`, \`spaces\`) |
| **Tool** | An action a haseef can take, defined and executed by a skill's service |
| **Event** | Outside-world signal pushed into a haseef; triggers a run if one isn't already running |
| **Run** | A single trigger → think → act → done execution |
| **Memory (4 types)** | semantic / episodic / social / procedural — read/write via \`hsafa.memory.*\` |

## End-to-end Flow

\`\`\`
1. Skill service starts → connects to Core via @hsafa/sdk
2. Registers tools → Core stores them under the skill name
3. Skill is added to a haseef's skills[] array → haseef can use the tools
4. External event happens → service calls hsafa.pushEvent({ haseefId or target, … })
5. Core triggers a run → builds prompt → LLM picks tools → tool calls fan out via SSE
6. Service handler runs → returns result → Core continues thinking → run finishes
\`\`\`

## This Project is a Skill

This project is a Hsafa skill — a service that connects to Hsafa Core via \`@hsafa/sdk\`. When generating code, follow the patterns in \`examples.md\` and the rules in \`instructions.md\`.
`,
  },
  {
    name: "sdk-reference.md",
    content: `# @hsafa/sdk Reference

The full, authoritative SDK reference lives in the SDK package itself:

→ **[\`sdks/hsafa-sdk/README.md\`](https://www.npmjs.com/package/@hsafa/sdk)** (or in the monorepo: \`sdks/hsafa-sdk/README.md\`)

It covers:

- The 4 core methods: \`registerTools\`, \`onToolCall\`, \`pushEvent\`, \`connect\` / \`on\`
- The \`hsafa.memory.*\` namespace — read/write all 4 memory types
- The \`hsafa.haseef.*\` namespace — CRUD haseefs, profile, skills
- The \`hsafa.runs.*\` namespace — list/get past runs
- All exported types

This file is intentionally a pointer so there is exactly one source of truth for the SDK API.

## TL;DR

\`\`\`typescript
import { HsafaSDK } from "@hsafa/sdk";

const hsafa = new HsafaSDK({
  coreUrl: process.env.HSAFA_CORE_URL!,  // "http://localhost:3001"
  apiKey:  process.env.HSAFA_CORE_KEY!,  // Core's SECRET_KEY
  skill:   process.env.SKILL_NAME!,      // unique skill name
});

await hsafa.registerTools([
  { name: "ping", description: "Reply with pong", input: {} },
]);

hsafa.onToolCall("ping", async (args, ctx) => {
  // ctx.haseef = { id, name, profile }
  // ctx.actionId = unique action ID
  return { pong: true };
});

hsafa.connect(); // SSE stream, auto-reconnects 2s → 30s
\`\`\`

## Reading haseef memory inside a handler

\`\`\`typescript
hsafa.onToolCall("summarize_my_day", async (args, ctx) => {
  const recent = await hsafa.memory.search(ctx.haseef.id, "today", 10);
  return { summary: recent.map(m => m.value).join("\\n") };
});
\`\`\`
`,
  },
  {
    name: "cli-reference.md",
    content: `# Hsafa CLI Reference

> All CLI commands for managing skills (v7).

## Install

\`\`\`bash
npm install -g @hsafa/cli
\`\`\`

## Configuration

\`\`\`bash
hsafa config set-server <url>      # e.g. https://spaces.hsafa.com or http://localhost:3005
hsafa config show
hsafa config reset
\`\`\`

## Authentication (against the Spaces server)

\`\`\`bash
hsafa auth login                              # Interactive (browser)
hsafa auth login --token <token>              # With existing token
hsafa auth login --email e --password p       # Non-interactive (CI)
hsafa auth whoami                             # Show current user
hsafa auth logout                             # Clear credentials
\`\`\`

## Building a Custom Skill (with @hsafa/sdk)

\`\`\`bash
# 1. Scaffold a project
hsafa skill init my-weather --lang typescript --starter blank

# 2. Configure environment
cd my-weather
# Edit .env: set HSAFA_CORE_KEY to your Core SECRET_KEY
npm install

# 3. Run it
hsafa skill dev   # delegates to: npm run dev
\`\`\`

A scaffolded project uses these env vars:

| Var | Purpose |
|------|--------|
| \`SKILL_NAME\` | Skill name registered with Core |
| \`HSAFA_CORE_URL\` | Core URL (default \`http://localhost:3001\`) |
| \`HSAFA_CORE_KEY\` | Core's \`SECRET_KEY\` — the single shared API key |

## Managing Skill Instances (Spaces server)

These commands talk to the Spaces server, where users create configured **instances** of skill **templates**.

\`\`\`bash
# Browse what templates exist
hsafa skill templates

# Create an instance from a template
hsafa skill create my_db --template database --display "My Postgres"

# List your instances
hsafa skill list

# Delete an instance
hsafa skill delete my_db -y

# Attach / detach an instance to/from a haseef
hsafa skill attach my_db --haseef atlas
hsafa skill detach my_db --haseef atlas

# Show all skills attached to a haseef
hsafa skill show --haseef atlas
\`\`\`

Haseefs can be referenced by **name** (case-insensitive) or **UUID**.

## Removed Commands (v6 → v7)

| Old command | Why it's gone |
|-------------|---------------|
| \`hsafa skill register --key hsk_scope_*\` | v7 uses a single Core \`SECRET_KEY\`; there are no per-skill keys |
| \`hsafa skill publish\` | Marketplace publish API isn't part of v7 yet |
| \`hsafa skill install <slug>\` | No marketplace install in v7 yet |
`,
  },
  {
    name: "skill-development-guide.md",
    content: `# Skill Development Guide (v7)

> How to build a high-quality Hsafa skill — best practices, patterns, anti-patterns.

## Project Structure

\`\`\`
my-skill/
├── .hsafa/                # AI context (this folder)
├── src/
│   ├── index.ts           # SDK setup, register tools, connect
│   ├── tools.ts           # Tool definitions (name, schema, description)
│   └── handler.ts         # Tool call handlers (your logic)
├── .env                   # SKILL_NAME, HSAFA_CORE_URL, HSAFA_CORE_KEY
├── package.json
└── README.md
\`\`\`

## The 4-Step Pattern

\`\`\`typescript
import { HsafaSDK } from "@hsafa/sdk";

// 1. CREATE SDK INSTANCE
const hsafa = new HsafaSDK({
  coreUrl: process.env.HSAFA_CORE_URL!,
  apiKey:  process.env.HSAFA_CORE_KEY!,
  skill:   process.env.SKILL_NAME!,
});

// 2. REGISTER TOOLS
await hsafa.registerTools(tools);

// 3. HANDLE TOOL CALLS
hsafa.onToolCall("tool_name", async (args, ctx) => {
  return { success: true };
});

// 4. CONNECT
hsafa.connect();
\`\`\`

## Writing Good Tools

### Naming
- Use \`snake_case\`: \`get_weather\`, \`send_email\`, \`list_tables\`
- Be specific: \`search_customers\` not \`search\`
- Verb-prefix: \`get_\`, \`list_\`, \`create_\`, \`update_\`, \`delete_\`, \`send_\`, \`run_\`

### Descriptions
The haseef reads the description to decide when to use a tool.

\`\`\`typescript
// GOOD
{ description: "Run a read-only SQL query (SELECT only). Returns rows as JSON. LIMIT enforced automatically." }

// BAD
{ description: "Query the database." }
\`\`\`

### Input Schemas
Add \`description\` to every field. Prefer the shorthand for simple types:

\`\`\`typescript
{
  name: "get_weather",
  description: "Get current weather for a city",
  input: { city: "string", units: "string?" },  // ? = optional
}
\`\`\`

For complex inputs use raw JSON Schema via \`inputSchema\`.

## Reading / Writing Memory

A handler always has \`ctx.haseef.id\` — use it with the memory namespace:

\`\`\`typescript
hsafa.onToolCall("remember_preference", async (args, ctx) => {
  await hsafa.memory.set(ctx.haseef.id, [
    { key: "preferred_units", value: args.units, importance: 6 },
  ]);
  return { saved: true };
});

hsafa.onToolCall("recall_preferences", async (args, ctx) => {
  const facts = await hsafa.memory.search(ctx.haseef.id, "preference");
  return { facts };
});
\`\`\`

The 4 memory types:

| Namespace call | Type | Use it for |
|---|---|---|
| \`memory.list / search / set / delete\` | semantic | key/value facts the haseef should remember |
| \`memory.episodes / searchEpisodes\` | episodic | summaries of past runs |
| \`memory.social\` | social | what the haseef knows about specific people |
| \`memory.procedural\` | procedural | learned patterns / "how to" knowledge |

## Pushing Events

Use \`pushEvent\` when something external happens that should reach a haseef.

\`\`\`typescript
// Direct routing by haseef ID:
await hsafa.pushEvent({
  type: "new_order",
  data: { orderId, total },
  haseefId: targetHaseefId,
});

// Or route by profile field — Core finds the matching haseef:
await hsafa.pushEvent({
  type: "whatsapp_message",
  data: { text },
  target: { phone: "+15555551234" },
});
\`\`\`

The skill name is added automatically — don't pass it.

## Handler Best Practices

### Return structured data
\`\`\`typescript
// GOOD
return { customers: [...], totalCount: 42, hasMore: true };
// BAD
return "Found 42 customers";
\`\`\`

### Handle errors gracefully
\`\`\`typescript
hsafa.onToolCall("query", async (args) => {
  try {
    return { rows: await db.query(args.sql) };
  } catch (err) {
    return { error: (err as Error).message, hint: "Check your SQL syntax" };
  }
});
\`\`\`

### Keep handlers focused
One tool = one action. Split complex workflows into multiple tools.

## Anti-Patterns

- ❌ Tools too broad — one tool = one action.
- ❌ Returning raw HTML or huge blobs — return structured JSON.
- ❌ Holding state between tool calls — each call is independent. Use memory for state.
- ❌ Generic tool names — \`run\`, \`do\`, \`action\` tell the haseef nothing.
- ❌ Skipping graceful shutdown — call \`hsafa.disconnect()\` on \`SIGINT\` / \`SIGTERM\`.
- ❌ Hardcoding Core's URL or key — read \`HSAFA_CORE_URL\` and \`HSAFA_CORE_KEY\`.
`,
  },
  {
    name: "examples.md",
    content: `# Hsafa Skill Examples (v7)

> Code examples for common skill patterns. All use \`@hsafa/sdk\`.

## REST API Wrapper

\`\`\`typescript
import { HsafaSDK } from "@hsafa/sdk";

const hsafa = new HsafaSDK({
  coreUrl: process.env.HSAFA_CORE_URL!,
  apiKey:  process.env.HSAFA_CORE_KEY!,
  skill:   process.env.SKILL_NAME!,
});

await hsafa.registerTools([
  {
    name: "get_weather",
    description: "Get current weather for a city. Returns temperature, conditions, humidity.",
    inputSchema: {
      type: "object",
      properties: {
        city:  { type: "string", description: "City name (e.g. \\"Tokyo\\")" },
        units: { type: "string", enum: ["metric", "imperial"], description: "Temperature units" },
      },
      required: ["city"],
    },
  },
]);

hsafa.onToolCall("get_weather", async (args) => {
  const API_KEY = process.env.WEATHER_API_KEY!;
  const units   = (args.units as string) || "metric";
  const res = await fetch(
    \`https://api.openweathermap.org/data/2.5/weather?q=\${encodeURIComponent(args.city as string)}&units=\${units}&appid=\${API_KEY}\`
  );
  if (!res.ok) return { error: \`City "\${args.city}" not found\` };
  const data = await res.json();
  return {
    city:        data.name,
    temperature: data.main.temp,
    conditions:  data.weather[0].description,
    humidity:    data.main.humidity,
  };
});

hsafa.connect();
\`\`\`

## Database Skill (with memory)

\`\`\`typescript
import { HsafaSDK } from "@hsafa/sdk";
import pg from "pg";

const hsafa = new HsafaSDK({
  coreUrl: process.env.HSAFA_CORE_URL!,
  apiKey:  process.env.HSAFA_CORE_KEY!,
  skill:   process.env.SKILL_NAME!,
});

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

await hsafa.registerTools([
  {
    name: "query",
    description: "Run a read-only SQL query (SELECT only). Returns rows as JSON.",
    inputSchema: {
      type: "object",
      properties: { sql: { type: "string", description: "SELECT query" } },
      required: ["sql"],
    },
  },
  {
    name: "list_tables",
    description: "List all tables in the database.",
    input: {},
  },
]);

hsafa.onToolCall("query", async (args, ctx) => {
  const sql = (args.sql as string).trim();
  if (!sql.toUpperCase().startsWith("SELECT")) {
    return { error: "Only SELECT queries are allowed" };
  }
  const result = await pool.query(sql);

  // Remember the last query for this haseef
  await hsafa.memory.set(ctx.haseef.id, [
    { key: "last_query", value: sql, importance: 4 },
  ]);

  return { rows: result.rows, rowCount: result.rowCount };
});

hsafa.onToolCall("list_tables", async () => {
  const result = await pool.query(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"
  );
  return { tables: result.rows.map((r) => r.tablename) };
});

hsafa.connect();

process.on("SIGINT", async () => {
  hsafa.disconnect();
  await pool.end();
  process.exit(0);
});
\`\`\`

## Webhook Listener + Push Events

\`\`\`typescript
import { HsafaSDK } from "@hsafa/sdk";
import express from "express";

const hsafa = new HsafaSDK({
  coreUrl: process.env.HSAFA_CORE_URL!,
  apiKey:  process.env.HSAFA_CORE_KEY!,
  skill:   process.env.SKILL_NAME!,
});

await hsafa.registerTools([
  {
    name: "list_events",
    description: "List recent webhook events.",
    input: { limit: "number?" },
  },
]);

const events: Array<{ type: string; data: unknown; receivedAt: string }> = [];

hsafa.onToolCall("list_events", async (args) => {
  const limit = (args.limit as number) || 10;
  return { events: events.slice(-limit) };
});

hsafa.connect();

const app = express();
app.use(express.json());

app.post("/webhook", async (req, res) => {
  const event = { type: req.body.type ?? "unknown", data: req.body, receivedAt: new Date().toISOString() };
  events.push(event);

  // Forward to a haseef as a sense event — route by phone in this example
  await hsafa.pushEvent({
    type:   \`webhook_\${event.type}\`,
    data:   event.data as Record<string, unknown>,
    target: { phone: req.body.phone },
  }).catch((err) => console.error("Push failed:", err));

  res.json({ received: true });
});

app.listen(3100);
\`\`\`

## Monitoring + Alerts

\`\`\`typescript
import { HsafaSDK } from "@hsafa/sdk";

const hsafa = new HsafaSDK({
  coreUrl: process.env.HSAFA_CORE_URL!,
  apiKey:  process.env.HSAFA_CORE_KEY!,
  skill:   "monitoring",
});

await hsafa.registerTools([
  {
    name: "get_system_status",
    description: "Get current system health metrics (CPU, memory, disk).",
    input: {},
  },
]);

hsafa.onToolCall("get_system_status", async () => ({
  cpu:    { usage: 45 },
  memory: { percent: 38 },
  disk:   { percent: 36 },
}));

hsafa.connect();

// Poll and push alerts to all haseefs that have this skill
setInterval(async () => {
  const cpu = await getCpuUsage();
  if (cpu < 80) return;

  const haseefs = await hsafa.haseef.list();
  for (const h of haseefs) {
    if (!h.skills?.includes("monitoring")) continue;
    await hsafa.pushEvent({
      type: "cpu_alert",
      data: { severity: cpu > 95 ? "critical" : "warning", cpuUsage: cpu },
      haseefId: h.id,
    });
  }
}, 60_000);

declare function getCpuUsage(): Promise<number>;
\`\`\`

## Common Patterns

### Retry with backoff
\`\`\`typescript
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try { return await fn(); }
    catch (err) {
      if (i === maxRetries - 1) throw err;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
  throw new Error("unreachable");
}
\`\`\`

### Event logging
\`\`\`typescript
hsafa.on("run.started",   (e) => console.log(\`[\${e.haseef.name}] run started\`));
hsafa.on("tool.error",    (e) => console.error(\`[\${e.toolName}] \${e.error}\`));
hsafa.on("run.completed", (e) => console.log(\`run done in \${e.durationMs}ms\`));
\`\`\`
`,
  },
];

/**
 * Write all .hsafa/ context files into the given project directory.
 */
export function writeHsafaContext(projectDir: string): void {
  const hsafaDir = path.join(projectDir, ".hsafa");
  fs.mkdirSync(hsafaDir, { recursive: true });

  for (const file of HSAFA_CONTEXT_FILES) {
    fs.writeFileSync(path.join(hsafaDir, file.name), file.content, "utf-8");
  }
}
