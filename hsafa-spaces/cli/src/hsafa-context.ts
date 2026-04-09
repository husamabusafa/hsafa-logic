// =============================================================================
// .hsafa/ context folder content — embedded as strings for CLI distribution.
// These files are written into every scaffolded scope project so AI tools
// (Cursor, Windsurf, Copilot, etc.) have full context about Hsafa.
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
    content: `# Hsafa Scope — AI Instructions

> **This file is for AI assistants (Cursor, Windsurf, Copilot, etc.).** Read all \`.md\` files in this \`.hsafa/\` folder to understand the Hsafa platform and how to write scopes correctly.

## Context Files

Read these files in order for full context:

1. **\`what-is-hsafa.md\`** — What Hsafa is, the Core + Services architecture, key concepts
2. **\`sdk-reference.md\`** — Full \`@hsafa/sdk\` API reference (constructor, registerTools, onToolCall, pushEvent, events, connect)
3. **\`cli-reference.md\`** — All CLI commands for managing scopes
4. **\`scope-development-guide.md\`** — Best practices, patterns, anti-patterns, project structure
5. **\`examples.md\`** — Real code examples (API wrapper, database, webhooks, monitoring)

## Rules for AI

When generating code for this Hsafa scope project:

1. **Always use \`@hsafa/sdk\`** — import \`HsafaSDK\` from \`@hsafa/sdk\`
2. **Follow the 4-step pattern** — create SDK → register tools → handle tool calls → connect
3. **Use \`snake_case\` for tool names** — e.g. \`get_weather\`, \`send_email\`
4. **Add descriptions to every tool and every input field** — the Haseef reads these
5. **Return structured JSON from handlers** — not strings, not raw HTML
6. **Load config from environment variables** — SCOPE_NAME, SCOPE_KEY, CORE_URL + your own
7. **Handle errors gracefully** — return \`{ error: "message" }\` or throw
8. **Include graceful shutdown** — disconnect SDK on SIGINT/SIGTERM
9. **Use \`formattedContext\` in sense events** — human-readable summary for the Haseef's inbox
10. **Keep tools focused** — one tool = one action, split complex workflows

## This Project

This is a Hsafa scope service. It connects to Hsafa Core and provides tools to Haseefs (autonomous AI agents). The Haseef decides when to call tools — your job is to define what tools are available and implement their execution logic.
`,
  },
  {
    name: "what-is-hsafa.md",
    content: `# What is Hsafa

> This file provides AI assistants (Cursor, Windsurf, Copilot, etc.) with context about the Hsafa platform so they can generate correct, idiomatic code for Hsafa scopes.

## Overview

**Hsafa** (from Arabic — intelligence and wisdom) is a runtime for autonomous AI agents called **Haseefs**.

A **Haseef** is NOT a chatbot. It is a long-lived AI agent with:
- **Identity** — persistent name, personality, profile
- **Memory** — episodic, semantic, social, procedural memory systems
- **Consciousness** — compressed history of past cycles for continuity across sessions
- **Inbox** — queue of incoming sense events from the world
- **Tools** — actions it can take, provided by connected services (scopes)
- **Goals & Plans** — autonomous objectives and scheduled actions
- **Autonomy** — it decides when to act, what to do, and when to stay silent

## Architecture: Core + Services

Hsafa follows a strict **Core + Services** separation:

### Hsafa Core
The agent's **mind**. It runs the think loop, manages memory, consciousness, inbox, tool execution, and MCP integration. Core has **zero domain-specific logic** — it doesn't know about chat, databases, emails, or any specific use case.

- **API**: REST + SSE at \`http://localhost:3001\` (default)
- **Auth**: API keys (\`hsk_service_*\`, \`hsk_haseef_*\`, \`hsk_scope_*\`)
- **Think Loop**: \`SLEEP → DRAIN INBOX → BUILD PROMPT → THINK → SAVE\`

### Services (Scopes)
Independent systems that connect to Core and give Haseefs capabilities. Each service operates under a **scope** — a named channel that identifies it.

Examples: \`spaces\` (chat), \`postgres\` (database), \`scheduler\` (cron), \`whatsapp\`, \`jira\`, \`slack\`, etc.

A service does three things:
1. **Register tools** — tells Core what actions the Haseef can take via this service
2. **Handle tool calls** — executes actions when the Haseef invokes a tool
3. **Push sense events** — sends incoming data (messages, notifications, webhooks) into the Haseef's inbox

## Key Concepts

| Concept | Description |
|---------|-------------|
| **Haseef** | A long-lived AI agent with identity, memory, and autonomy |
| **Scope** | A named channel identifying a service (e.g. \`postgres\`, \`weather\`) |
| **Scope Key** | API key (\`hsk_scope_*\`) that authenticates a scope service with Core |
| **Tool** | An action a Haseef can take (defined by a scope, executed by the service) |
| **Sense Event** | Incoming data pushed from a service into a Haseef's inbox |
| **Inbox** | Queue of sense events waiting to be processed in the next think cycle |
| **SmartSpace** | A shared chat workspace where humans and Haseefs collaborate |
| **Run** | A single think cycle — triggered by an inbox event, produces tool calls and messages |
| **Consciousness** | Compressed history of past runs for long-term continuity |

## How a Scope Works (End-to-End)

\`\`\`
1. Scope service starts → connects to Core via @hsafa/sdk
2. Registers tools (e.g. "query", "send_email") → Core now knows the Haseef has these capabilities
3. Scope is attached to a Haseef → Haseef can now use the tools
4. Something happens externally → scope pushes a sense event → lands in Haseef's inbox
5. Haseef wakes up → reads inbox → decides to call a tool → Core dispatches the action via SSE
6. Scope handler executes the tool → returns result to Core → Haseef continues thinking
\`\`\`

## This Project is a Scope

This project is a **Hsafa scope** — a service that connects to Hsafa Core and provides tools to Haseefs. When building this scope:

- Use \`@hsafa/sdk\` to connect to Core
- Define tools with clear names, descriptions, and JSON Schema inputs
- Implement handlers that execute tool calls and return structured results
- Optionally push sense events when external things happen
- Keep tool handlers focused and deterministic — the Haseef decides *when* to call them
`,
  },
  {
    name: "sdk-reference.md",
    content: `# @hsafa/sdk Reference

> Complete API reference for the Hsafa SDK used to build scope services.

## Install

\`\`\`bash
npm install @hsafa/sdk
\`\`\`

## Quick Start

\`\`\`typescript
import { HsafaSDK } from '@hsafa/sdk';

const sdk = new HsafaSDK({
  coreUrl: process.env.CORE_URL || 'http://localhost:3001',
  apiKey: process.env.SCOPE_KEY || '',
  scope: process.env.SCOPE_NAME || 'my-scope',
});

// 1. Register tools
await sdk.registerTools([
  {
    name: 'get_weather',
    description: 'Get current weather for a city',
    input: { city: 'string', units: 'string?' },
  },
]);

// 2. Handle tool calls
sdk.onToolCall('get_weather', async (args, ctx) => {
  const weather = await fetchWeather(args.city as string);
  return { temperature: weather.temp, conditions: weather.desc };
});

// 3. Connect (opens SSE stream, auto-reconnects)
sdk.connect();
\`\`\`

## Constructor

\`\`\`typescript
new HsafaSDK(options: SdkOptions)
\`\`\`

| Field | Type | Description |
|-------|------|-------------|
| \`coreUrl\` | \`string\` | Core API base URL (e.g. \`http://localhost:3001\`) |
| \`apiKey\` | \`string\` | Scope key for authentication (\`hsk_scope_*\`) |
| \`scope\` | \`string\` | Scope name identifying this service |

## Registering Tools

\`\`\`typescript
await sdk.registerTools(tools: ToolDefinition[])
\`\`\`

Sends a PUT request to Core to register all tools for this scope. Call this once at startup. Calling it again replaces all previous tools.

### ToolDefinition

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`name\` | \`string\` | Yes | Tool name (snake_case recommended) |
| \`description\` | \`string\` | Yes | What the tool does — the Haseef reads this to decide when to use it |
| \`input\` | \`Record<string, string>\` | No | Shorthand type map (see below) |
| \`inputSchema\` | \`object\` | No | Raw JSON Schema (overrides \`input\` if both provided) |

### Input Shorthand

For simple tools, use the shorthand type strings:

\`\`\`typescript
input: {
  city: 'string',        // required string
  units: 'string?',      // optional string
  limit: 'number',       // required number
  verbose: 'boolean?',   // optional boolean
  tags: 'string[]',      // required string array
  counts: 'number[]',    // required number array
  metadata: 'object',    // required object (any shape)
}
\`\`\`

Append \`?\` to make a field optional.

### Raw JSON Schema

For complex inputs (nested objects, enums, etc.), use \`inputSchema\` directly:

\`\`\`typescript
{
  name: 'create_task',
  description: 'Create a task with subtasks',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Task title' },
      priority: { type: 'string', enum: ['low', 'medium', 'high'] },
      subtasks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            done: { type: 'boolean' },
          },
          required: ['name'],
        },
      },
    },
    required: ['title'],
  },
}
\`\`\`

### Schema Helper

Convert shorthand to JSON Schema manually:

\`\`\`typescript
import { inputToJsonSchema } from '@hsafa/sdk';

const schema = inputToJsonSchema({ city: 'string', units: 'string?' });
// → { type: 'object', properties: { city: { type: 'string' }, units: { type: 'string' } }, required: ['city'] }
\`\`\`

## Handling Tool Calls

\`\`\`typescript
sdk.onToolCall(toolName: string, handler: ToolHandler)
\`\`\`

Register a handler for a specific tool. When a Haseef invokes this tool, the handler runs and its return value is sent back as the tool result.

\`\`\`typescript
type ToolHandler = (
  args: Record<string, unknown>,
  ctx: ToolCallContext,
) => Promise<unknown>;
\`\`\`

### ToolCallContext

| Field | Type | Description |
|-------|------|-------------|
| \`actionId\` | \`string\` | Unique ID for this tool call action |
| \`haseef\` | \`HaseefContext\` | The Haseef that invoked the tool |

### HaseefContext

| Field | Type | Description |
|-------|------|-------------|
| \`id\` | \`string\` | Haseef UUID |
| \`name\` | \`string\` | Haseef display name |
| \`profile\` | \`Record<string, unknown>\` | Haseef profile data |

### Handler Patterns

\`\`\`typescript
// Simple handler
sdk.onToolCall('ping', async () => {
  return { pong: true, timestamp: Date.now() };
});

// Handler with args and context
sdk.onToolCall('send_email', async (args, ctx) => {
  console.log(\\\`Haseef \\\${ctx.haseef.name} wants to send an email\\\`);
  await emailService.send({
    to: args.to as string,
    subject: args.subject as string,
    body: args.body as string,
  });
  return { sent: true };
});

// Error handling — thrown errors are sent back as { error: "message" }
sdk.onToolCall('risky_action', async (args) => {
  if (!args.confirmed) {
    throw new Error('Action requires confirmation');
  }
  return await doRiskyThing();
});
\`\`\`

## Pushing Events

\`\`\`typescript
await sdk.pushEvent(event: PushEventPayload)
\`\`\`

Push a sense event into a Haseef's inbox. This is how your service tells the Haseef that something happened.

### PushEventPayload

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`type\` | \`string\` | Yes | Event type (e.g. \`new_order\`, \`alert\`) |
| \`data\` | \`Record<string, unknown>\` | Yes | Event payload |
| \`haseefId\` | \`string\` | No | Target a specific Haseef |
| \`target\` | \`Record<string, string>\` | No | Routing metadata |
| \`attachments\` | \`Attachment[]\` | No | File/image/audio attachments |

### Attachment

| Field | Type | Description |
|-------|------|-------------|
| \`type\` | \`'image' \\| 'audio' \\| 'file'\` | Attachment type |
| \`mimeType\` | \`string\` | MIME type |
| \`url\` | \`string\` | URL to the file (use this OR base64) |
| \`base64\` | \`string\` | Base64-encoded content (use this OR url) |
| \`name\` | \`string\` | Optional filename |

### Examples

\`\`\`typescript
// Simple event
await sdk.pushEvent({
  type: 'new_order',
  data: { orderId: '12345', total: 99.99, customer: 'Alice' },
  haseefId: 'haseef-uuid',
});

// Event with formatted context (recommended)
await sdk.pushEvent({
  type: 'alert',
  data: {
    severity: 'high',
    message: 'Server CPU at 95%',
    formattedContext: [
      '[SERVER ALERT]',
      'Server: prod-api-1',
      'CPU: 95% (threshold: 80%)',
      '',
      '>>> Decide what to do.',
    ].join('\\n'),
  },
  haseefId: 'haseef-uuid',
});
\`\`\`

## Listening to Events

Subscribe to real-time lifecycle events via the SSE stream:

\`\`\`typescript
sdk.on(event: SdkEventType, listener: (data) => void)
sdk.off(event: SdkEventType, listener: (data) => void)
\`\`\`

### Available Events

| Event | Payload | Description |
|-------|---------|-------------|
| \`run.started\` | \`{ runId, haseef, triggerScope, triggerType }\` | A Haseef think cycle began |
| \`tool.input.start\` | \`{ actionId, toolName, haseef }\` | Tool input streaming started |
| \`tool.input.delta\` | \`{ actionId, toolName, delta, partialArgs, haseef }\` | Partial tool args received |
| \`tool.call\` | \`{ actionId, toolName, args, haseef }\` | Tool call dispatched with final args |
| \`tool.result\` | \`{ actionId, toolName, args, result, durationMs, haseef }\` | Tool returned a result |
| \`tool.error\` | \`{ actionId, toolName, error, haseef }\` | Tool call failed |
| \`run.completed\` | \`{ runId, haseef, summary, durationMs }\` | Think cycle finished |

\`\`\`typescript
sdk.on('run.started', (event) => {
  console.log(\\\`Run \\\${event.runId} started for \\\${event.haseef.name}\\\`);
});

sdk.on('tool.error', (event) => {
  console.error(\\\`\\\${event.toolName} failed:\\\`, event.error);
});
\`\`\`

## Connection

\`\`\`typescript
sdk.connect()    // Open SSE stream (auto-reconnects with backoff 2s → 30s)
sdk.disconnect() // Close SSE stream
\`\`\`

## Environment Variables

| Variable | Description | Source |
|----------|-------------|--------|
| \`SCOPE_NAME\` | Scope name (matches what's registered in Core) | Set by user or platform |
| \`SCOPE_KEY\` | API key for Core auth (\`hsk_scope_*\`) | Generated by \`hsafa scope create\` or platform |
| \`CORE_URL\` | Core API base URL | \`http://localhost:3001\` (local) or platform URL |

## Graceful Shutdown

\`\`\`typescript
process.on('SIGINT', () => {
  sdk.disconnect();
  process.exit(0);
});
\`\`\`
`,
  },
  {
    name: "cli-reference.md",
    content: `# Hsafa CLI Reference

> All CLI commands for managing scopes.

## Install

\`\`\`bash
npm install -g @hsafa/cli
\`\`\`

## Authentication

\`\`\`bash
hsafa auth login          # Interactive login
hsafa auth login --token <token>         # Auth with token
hsafa auth login --email e --password p  # Non-interactive (CI)
hsafa auth logout         # Clear credentials
hsafa auth whoami         # Show current user
\`\`\`

## Scope Commands

### Scaffold a New Scope

\`\`\`bash
hsafa scope init <name> [--lang typescript|javascript|python] [--starter blank|api|database|webhook]
\`\`\`

### Register a Scope (No Deploy)

\`\`\`bash
hsafa scope create <name> [--deployment platform|external]
\`\`\`

Outputs a **scope key** (\`hsk_scope_*\`). Save it — shown once.

### Deploy to Platform

\`\`\`bash
hsafa scope deploy [--image <url>]
\`\`\`

Run from project directory. Builds Docker image, pushes, and launches.

### List / Logs / Lifecycle

\`\`\`bash
hsafa scope list
hsafa scope logs <name> [--instance <name>] [--tail <n>]
hsafa scope start|stop|restart <name> [--instance <name>]
hsafa scope delete <name> [-y]
\`\`\`

### Attach / Detach from Haseef

\`\`\`bash
hsafa scope attach <name> --haseef <haseef-id>
hsafa scope detach <name> --haseef <haseef-id>
\`\`\`

### Instance Management

\`\`\`bash
hsafa scope instance create <template> --name <n> --config KEY=VALUE
hsafa scope instance delete <name> [-y]
\`\`\`

## Local Development Workflow

\`\`\`bash
hsafa scope init my-scope --lang typescript
cd my-scope && npm install
hsafa scope create my-scope        # get scope key
# add SCOPE_KEY to .env
npm run dev                         # registers tools, connects SSE
hsafa scope attach my-scope --haseef <id>
# chat with haseef — tools are live
hsafa scope deploy                  # when ready
\`\`\`
`,
  },
  {
    name: "scope-development-guide.md",
    content: `# Scope Development Guide

> How to build a high-quality Hsafa scope — best practices, patterns, and anti-patterns.

## Project Structure

\`\`\`
my-scope/
├── .hsafa/                # AI context (this folder)
├── src/
│   ├── index.ts           # SDK setup, connect, register tools
│   ├── tools.ts           # Tool definitions (name, schema, description)
│   └── handler.ts         # Tool call handlers (your logic)
├── .env                   # SCOPE_KEY, CORE_URL, SCOPE_NAME
├── package.json
└── README.md
\`\`\`

## The 4-Step Pattern

Every scope follows the same pattern:

\`\`\`typescript
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
  return { success: true, data: result };
});

// 4. CONNECT
sdk.connect();
\`\`\`

## Writing Good Tools

### Naming
- Use \`snake_case\`: \`get_weather\`, \`send_email\`, \`list_tables\`
- Be specific: \`search_customers\` not \`search\`
- Prefix with a verb: \`get_\`, \`list_\`, \`create_\`, \`update_\`, \`delete_\`, \`send_\`, \`run_\`

### Descriptions
The Haseef reads the description to decide when to use a tool. Be clear and specific:

\`\`\`typescript
// GOOD
{ description: 'Run a read-only SQL query (SELECT only). Returns rows as JSON. LIMIT is enforced automatically.' }

// BAD
{ description: 'Query the database.' }
\`\`\`

### Input Schemas
Always add \`description\` to every field:

\`\`\`typescript
inputSchema: {
  type: 'object',
  properties: {
    table: { type: 'string', description: 'Table name to watch (e.g. "orders")' },
    operation: { type: 'string', enum: ['INSERT', 'UPDATE', 'DELETE'], description: 'Which operation to watch' },
  },
  required: ['table', 'operation'],
}
\`\`\`

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
sdk.onToolCall('query', async (args) => {
  try {
    const result = await db.query(args.sql as string);
    return { rows: result.rows, rowCount: result.rowCount };
  } catch (err) {
    return { error: err.message, hint: 'Check your SQL syntax' };
  }
});
\`\`\`

### Keep handlers focused
Each handler does ONE thing. Split complex workflows into multiple tools.

## Pushing Sense Events

Use \`formattedContext\` for human-readable inbox context:

\`\`\`typescript
await sdk.pushEvent({
  type: 'new_order',
  haseefId: targetHaseefId,
  data: {
    orderId: order.id,
    total: order.total,
    formattedContext: [
      '[NEW ORDER RECEIVED]',
      \\\`Order #\\\${order.id} — $\\\${order.total}\\\`,
      '',
      '>>> Decide what to do.',
    ].join('\\n'),
  },
});
\`\`\`

## Environment Variables

### Required (every scope)
\`\`\`
SCOPE_NAME=my-scope
SCOPE_KEY=hsk_scope_...
CORE_URL=http://localhost:3001
\`\`\`

### Scope-specific
Add your own for API keys, database URLs, etc. When deployed, user config is injected as env vars.

## Anti-Patterns

- **Don't make tools too broad** — one tool = one action
- **Don't return raw HTML or large blobs** — return structured JSON
- **Don't hold state between tool calls** — each call is independent
- **Don't use generic tool names** — \`run\`, \`do\`, \`action\` tell the Haseef nothing
- **Don't forget input validation** — always validate and sanitize
- **Don't skip graceful shutdown** — always disconnect SDK on SIGINT/SIGTERM
`,
  },
  {
    name: "examples.md",
    content: `# Hsafa Scope Examples

> Code examples for common scope patterns.

## REST API Wrapper

\`\`\`typescript
import { HsafaSDK } from '@hsafa/sdk';

const sdk = new HsafaSDK({
  coreUrl: process.env.CORE_URL!,
  apiKey: process.env.SCOPE_KEY!,
  scope: process.env.SCOPE_NAME!,
});

await sdk.registerTools([
  {
    name: 'get_weather',
    description: 'Get current weather for a city. Returns temperature, conditions, humidity.',
    inputSchema: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City name (e.g. "Tokyo")' },
        units: { type: 'string', enum: ['metric', 'imperial'], description: 'Temperature units' },
      },
      required: ['city'],
    },
  },
]);

sdk.onToolCall('get_weather', async (args) => {
  const API_KEY = process.env.WEATHER_API_KEY!;
  const units = (args.units as string) || 'metric';
  const res = await fetch(
    \\\`https://api.openweathermap.org/data/2.5/weather?q=\\\${encodeURIComponent(args.city as string)}&units=\\\${units}&appid=\\\${API_KEY}\\\`
  );
  if (!res.ok) return { error: \\\`City "\\\${args.city}" not found\\\` };
  const data = await res.json();
  return {
    city: data.name,
    temperature: data.main.temp,
    conditions: data.weather[0].description,
    humidity: data.main.humidity,
    windSpeed: data.wind.speed,
  };
});

sdk.connect();
\`\`\`

## Database Scope

\`\`\`typescript
import { HsafaSDK } from '@hsafa/sdk';
import pg from 'pg';

const sdk = new HsafaSDK({
  coreUrl: process.env.CORE_URL!,
  apiKey: process.env.SCOPE_KEY!,
  scope: process.env.SCOPE_NAME!,
});

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

await sdk.registerTools([
  {
    name: 'query',
    description: 'Run a read-only SQL query (SELECT only). Returns rows as JSON.',
    inputSchema: {
      type: 'object',
      properties: { sql: { type: 'string', description: 'SELECT query to run' } },
      required: ['sql'],
    },
  },
  {
    name: 'list_tables',
    description: 'List all tables in the database with row counts.',
    inputSchema: { type: 'object', properties: {} },
  },
]);

sdk.onToolCall('query', async (args) => {
  const sql = (args.sql as string).trim();
  if (!sql.toUpperCase().startsWith('SELECT')) {
    return { error: 'Only SELECT queries are allowed' };
  }
  const result = await pool.query(sql);
  return { rows: result.rows, rowCount: result.rowCount };
});

sdk.onToolCall('list_tables', async () => {
  const result = await pool.query(
    'SELECT tablename, n_live_tup AS approx_rows FROM pg_stat_user_tables ORDER BY tablename'
  );
  return { tables: result.rows };
});

sdk.connect();

process.on('SIGINT', async () => {
  sdk.disconnect();
  await pool.end();
  process.exit(0);
});
\`\`\`

## Webhook Listener + Sense Events

\`\`\`typescript
import { HsafaSDK } from '@hsafa/sdk';
import express from 'express';

const sdk = new HsafaSDK({
  coreUrl: process.env.CORE_URL!,
  apiKey: process.env.SCOPE_KEY!,
  scope: process.env.SCOPE_NAME!,
});

const HASEEF_ID = process.env.HASEEF_ID!;

await sdk.registerTools([
  {
    name: 'list_events',
    description: 'List recent webhook events.',
    input: { limit: 'number?', type: 'string?' },
  },
]);

const events: any[] = [];

sdk.onToolCall('list_events', async (args) => {
  let filtered = events;
  if (args.type) filtered = filtered.filter(e => e.type === args.type);
  return { events: filtered.slice(-(args.limit as number || 10)) };
});

sdk.connect();

const app = express();
app.use(express.json());

app.post('/webhook', async (req, res) => {
  const event = { type: req.body.type || 'unknown', data: req.body, receivedAt: new Date().toISOString() };
  events.push(event);

  await sdk.pushEvent({
    type: \\\`webhook_\\\${event.type}\\\`,
    haseefId: HASEEF_ID,
    data: {
      ...event.data,
      formattedContext: \\\`[WEBHOOK: \\\${event.type}]\\\\n\\\${JSON.stringify(event.data, null, 2)}\\\\n\\\\n>>> Process this.\\\`,
    },
  }).catch(err => console.error('Push failed:', err));

  res.json({ received: true });
});

app.listen(3100);
\`\`\`

## Monitoring + Alerts

\`\`\`typescript
import { HsafaSDK } from '@hsafa/sdk';

const sdk = new HsafaSDK({
  coreUrl: process.env.CORE_URL!,
  apiKey: process.env.SCOPE_KEY!,
  scope: 'monitoring',
});

await sdk.registerTools([
  {
    name: 'get_system_status',
    description: 'Get current system health metrics (CPU, memory, disk).',
    inputSchema: { type: 'object', properties: {} },
  },
]);

sdk.onToolCall('get_system_status', async () => {
  return {
    cpu: { usage: 45, cores: 8 },
    memory: { usedGb: 12.3, totalGb: 32, percent: 38 },
    disk: { usedGb: 180, totalGb: 500, percent: 36 },
    uptime: '14d 6h',
  };
});

sdk.connect();

// Poll and push alerts
setInterval(async () => {
  const cpu = await getCpuUsage();
  if (cpu > 80) {
    await sdk.pushEvent({
      type: 'cpu_alert',
      haseefId: process.env.HASEEF_ID!,
      data: {
        severity: cpu > 95 ? 'critical' : 'warning',
        cpuUsage: cpu,
        formattedContext: \\\`[CPU ALERT] Usage: \\\${cpu}% (threshold: 80%)\\\\n>>> Decide what to do.\\\`,
      },
    });
  }
}, 60_000);
\`\`\`

## Common Patterns

### Retry with Backoff
\`\`\`typescript
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try { return await fn(); }
    catch (err) {
      if (i === maxRetries - 1) throw err;
      await new Promise(r => setTimeout(r, 1000 * 2 ** i));
    }
  }
  throw new Error('Unreachable');
}
\`\`\`

### Config from Environment
\`\`\`typescript
const config = {
  apiKey: process.env.API_KEY || '',
  region: process.env.REGION || 'us-east-1',
  maxResults: parseInt(process.env.MAX_RESULTS || '100'),
};
if (!config.apiKey) { console.error('API_KEY required'); process.exit(1); }
\`\`\`

### Event Logging
\`\`\`typescript
sdk.on('run.started', (e) => console.log(\\\`Run \\\${e.runId} started\\\`));
sdk.on('tool.error', (e) => console.error(\\\`\\\${e.toolName} error:\\\`, e.error));
sdk.on('run.completed', (e) => console.log(\\\`Run done in \\\${e.durationMs}ms\\\`));
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
