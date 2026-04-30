# @hsafa/sdk

The official Node.js / TypeScript SDK for **Hsafa Core v7**. Connect any service to a Haseef brain — register tools, handle tool calls over a single SSE connection, push events, and read/write the haseef's memory and profile.

## Install

```bash
pnpm add @hsafa/sdk
```

## Quick Start

```typescript
import { HsafaSDK } from '@hsafa/sdk';

const hsafa = new HsafaSDK({
  coreUrl: 'http://localhost:3001',
  apiKey:  process.env.HSAFA_CORE_KEY!,
  skill:   'weather',
});

// 1. Register the tools this skill provides
await hsafa.registerTools([
  {
    name: 'get_weather',
    description: 'Get current weather for a city',
    input: { city: 'string', units: 'string?' },
  },
]);

// 2. Handle tool calls from any haseef that has the "weather" skill
hsafa.onToolCall('get_weather', async (args, ctx) => {
  console.log(`${ctx.haseef.name} wants weather for ${args.city}`);
  return { temperature: 72, conditions: 'sunny', city: args.city };
});

// 3. Open the SSE stream (auto-reconnects with exponential backoff)
hsafa.connect();
```

## Concepts

A **skill** is a named channel a service registers under (e.g. `"weather"`, `"whatsapp"`, `"spaces"`). Many haseefs can have the same skill in their `skills[]` array. When any of them invokes a tool from that skill, Core dispatches the call to your service over the open SSE stream.

The SDK does four things:

1. **Register** tools with Core (`registerTools`)
2. **Handle** incoming tool calls (`onToolCall`)
3. **Push** sense events into haseefs (`pushEvent`)
4. **Listen** to lifecycle events on the SSE stream (`on` / `connect`)

It also exposes typed namespaces for everything else a skill might need:

- `hsafa.memory.*` — read/write the 4 memory types of a haseef
- `hsafa.haseef.*` — CRUD haseefs, read/write profile, attach/detach skills
- `hsafa.runs.*` — list/get past runs

## Configuration

```typescript
new HsafaSDK({
  coreUrl: string,   // e.g. "http://localhost:3001"
  apiKey:  string,   // Core's SECRET_KEY (sent as x-api-key)
  skill:   string,   // unique skill name for this service
})
```

The same `apiKey` is used for every request the SDK makes (skill registration, tool result submission, memory/haseef/runs APIs).

---

## 1. Register Tools

Tools can be defined with shorthand types or raw JSON Schema.

**Shorthand**: `"string" | "number" | "boolean" | "object" | "string[]" | "number[]" | "boolean[]"`. Append `?` for optional fields.

```typescript
await hsafa.registerTools([
  {
    name: 'send_message',
    description: 'Send a message to a channel',
    input: {
      channel:  'string',
      text:     'string',
      priority: 'number?',
    },
  },
]);
```

**Raw JSON Schema** for complex inputs:

```typescript
await hsafa.registerTools([
  {
    name: 'create_task',
    description: 'Create a task with subtasks',
    inputSchema: {
      type: 'object',
      properties: {
        title:    { type: 'string' },
        subtasks: {
          type: 'array',
          items: { type: 'object', properties: { name: { type: 'string' } } },
        },
      },
      required: ['title'],
    },
  },
]);
```

Calling `registerTools` again overwrites the previous registration for this skill — Core does a full replace.

## 2. Handle Tool Calls

```typescript
hsafa.onToolCall('get_weather', async (args, ctx) => {
  // args:        the tool's input object
  // ctx.actionId: unique ID for this call
  // ctx.haseef:   { id, name, profile } — the haseef that invoked the tool
  return { temperature: 72, conditions: 'sunny' };
});
```

The return value becomes the tool result sent back to Core. If the handler throws, the error message is sent back instead.

## 3. Push Events

A skill pushes events when something happens in the outside world that should trigger or inform a haseef.

```typescript
// Target a specific haseef directly:
await hsafa.pushEvent({
  type:     'new_order',
  data:     { orderId: '12345', total: 99.99 },
  haseefId: 'haseef_abc',
});

// Or route by profile field — Core finds the matching haseef:
await hsafa.pushEvent({
  type:   'whatsapp_message',
  data:   { text: 'Hello!' },
  target: { phone: '+15555551234' },
});

// With attachments:
await hsafa.pushEvent({
  type: 'document_uploaded',
  data: { filename: 'report.pdf' },
  attachments: [
    { type: 'file',  mimeType: 'application/pdf', url: 'https://...' },
    { type: 'image', mimeType: 'image/png', base64: 'iVBORw0K...' },
  ],
});
```

The skill name is added automatically — you don't pass it. Either `haseefId` or `target` is required.

## 4. Listen to Lifecycle Events

Subscribe to type-safe events on the SSE stream:

```typescript
hsafa.on('run.started', (e) => {
  console.log(`Run ${e.runId} started for ${e.haseef.name}`);
  console.log(`Trigger: ${e.triggerType} from ${e.triggerSkill}`);
});

hsafa.on('tool.input.start', (e) => { /* tool input streaming started */ });
hsafa.on('tool.input.delta', (e) => { /* partial args (e.partialArgs) */ });
hsafa.on('tool.call',        (e) => { /* tool dispatched with final args */ });
hsafa.on('tool.result',      (e) => { /* result, includes durationMs */ });
hsafa.on('tool.error',       (e) => { /* error message */ });

hsafa.on('run.completed', (e) => {
  console.log(`Run ${e.runId} done in ${e.durationMs}ms`);
  if (e.summary) console.log('Summary:', e.summary);
});

// Remove a listener:
const onResult = (e) => { /* … */ };
hsafa.on('tool.result', onResult);
hsafa.off('tool.result', onResult);
```

## Connection Lifecycle

```typescript
hsafa.connect();    // open SSE stream
hsafa.disconnect(); // close it
```

The SSE connection auto-reconnects with exponential backoff (2s → 4s → 8s → … → 30s max). After a successful reconnect the delay resets.

---

## `hsafa.memory` — Read/Write Haseef Memory

A haseef has four kinds of memory: **semantic** (key/value facts), **episodic** (run summaries), **social** (person models), and **procedural** (learned patterns).

```typescript
// Inside a tool handler — uses ctx.haseef.id
hsafa.onToolCall('summarize_my_day', async (args, ctx) => {
  const today = await hsafa.memory.search(ctx.haseef.id, 'today', 10);
  return { summary: today.map(m => m.value).join('\n') };
});
```

| Method | Returns | Description |
|---|---|---|
| `memory.list(haseefId)` | `SemanticMemory[]` | All semantic memories for the haseef |
| `memory.search(haseefId, query, limit?)` | `SemanticMemory[]` | Keyword search (limit defaults to 20) |
| `memory.set(haseefId, [{ key, value, importance? }])` | `{ stored: number }` | Upsert one or many semantic memories |
| `memory.delete(haseefId, keys)` | `{ deleted: number }` | Delete by keys |
| `memory.episodes(haseefId, limit?)` | `EpisodicMemory[]` | Recent episodic memories (run summaries) |
| `memory.searchEpisodes(haseefId, query, limit?)` | `EpisodicMemory[]` | Keyword search across episodes |
| `memory.social(haseefId)` | `SocialMemory[]` | Person models the haseef has built up |
| `memory.procedural(haseefId)` | `ProceduralMemory[]` | Learned patterns / procedures |
| `memory.stats(haseefId)` | `MemoryStats` | Per-type counts + total |

Examples:

```typescript
// Store a fact
await hsafa.memory.set(ctx.haseef.id, [
  { key: 'favorite_color',  value: 'blue', importance: 7 },
  { key: 'preferred_units', value: 'metric' },
]);

// Search facts
const results = await hsafa.memory.search(ctx.haseef.id, 'preferences');

// Delete by key
await hsafa.memory.delete(ctx.haseef.id, ['favorite_color']);

// Inspect counts
const stats = await hsafa.memory.stats(ctx.haseef.id);
// { haseefId, counts: { semantic, episodic, social, procedural }, total }
```

## `hsafa.haseef` — Manage Haseefs

| Method | Returns | Description |
|---|---|---|
| `haseef.list()` | `Haseef[]` | All haseefs in Core |
| `haseef.get(id)` | `Haseef` | Full haseef record |
| `haseef.create(input)` | `Haseef` | Create a new haseef |
| `haseef.update(id, patch)` | `Haseef` | Patch any of: `name`, `description`, `configJson`, `profileJson`, `skills` |
| `haseef.delete(id)` | `void` | Delete a haseef |
| `haseef.getProfile(id)` | `Record<string, unknown>` | Just the profile JSON |
| `haseef.updateProfile(id, patch)` | `Record<string, unknown>` | Patch profile fields |
| `haseef.addSkill(id, skillName)` | `Haseef` | Append a skill to `skills[]` (no-op if already there) |
| `haseef.removeSkill(id, skillName)` | `Haseef` | Remove a skill from `skills[]` |
| `haseef.status(id)` | `{ running, activeRunId }` | Is the haseef currently in a run? |

Example — a skill that auto-attaches itself to a newly-created haseef:

```typescript
const haseef = await hsafa.haseef.create({
  name: 'Atlas',
  configJson: { model: 'claude-sonnet-4', instructions: 'Be helpful.' },
  profileJson: { phone: '+15555551234' },
  skills: ['spaces'],
});

await hsafa.haseef.addSkill(haseef.id, 'whatsapp');
```

Example — a body skill learning the haseef's name:

```typescript
hsafa.onToolCall('introduce_myself', async (args, ctx) => {
  await hsafa.haseef.updateProfile(ctx.haseef.id, { displayName: args.name });
  return { ok: true };
});
```

## `hsafa.runs` — Inspect Run History

| Method | Returns | Description |
|---|---|---|
| `runs.list({ haseefId?, status?, limit? })` | `Run[]` | List recent runs, filterable |
| `runs.get(runId)` | `Run` | Full run record |

```typescript
// Last 10 completed runs for a haseef
const recent = await hsafa.runs.list({
  haseefId: ctx.haseef.id,
  status:   'completed',
  limit:    10,
});
```

---

## Full Example — A CRM Skill

```typescript
import { HsafaSDK } from '@hsafa/sdk';

const hsafa = new HsafaSDK({
  coreUrl: process.env.HSAFA_CORE_URL!,
  apiKey:  process.env.HSAFA_CORE_KEY!,
  skill:   'crm',
});

// Register the tools this skill provides
await hsafa.registerTools([
  {
    name: 'lookup_customer',
    description: 'Look up a customer by email',
    input: { email: 'string' },
  },
  {
    name: 'create_ticket',
    description: 'Create a support ticket',
    input: { subject: 'string', body: 'string', priority: 'number?' },
  },
]);

// Handle tool calls
hsafa.onToolCall('lookup_customer', async (args, ctx) => {
  const customer = await db.customers.findByEmail(args.email as string);
  if (!customer) return { error: 'Customer not found' };

  // Remember this customer for the haseef
  await hsafa.memory.set(ctx.haseef.id, [
    { key: `customer:${customer.id}`, value: JSON.stringify(customer), importance: 6 },
  ]);

  return customer;
});

hsafa.onToolCall('create_ticket', async (args, ctx) => {
  const ticket = await db.tickets.create({
    subject:   args.subject  as string,
    body:      args.body     as string,
    priority:  (args.priority as number) ?? 3,
    createdBy: ctx.haseef.name,
  });
  return { ticketId: ticket.id, url: ticket.url };
});

// Listen to lifecycle events
hsafa.on('run.started',   (e) => console.log(`[${e.haseef.name}] Run started`));
hsafa.on('tool.error',    (e) => console.error(`[${e.toolName}] ${e.error}`));
hsafa.on('run.completed', (e) => console.log(`Run done in ${e.durationMs}ms`));

// Connect (long-lived SSE stream)
hsafa.connect();
console.log(`[${hsafa.skill}] connected`);

// Push outside-world events into a haseef
await hsafa.pushEvent({
  type:   'ticket_status_changed',
  data:   { ticketId: 't_42', status: 'resolved' },
  target: { email: 'alice@example.com' },
});

// Graceful shutdown
process.on('SIGINT', () => {
  hsafa.disconnect();
  process.exit(0);
});
```

---

## API Reference

### `HsafaSDK`

| Method | Signature | Description |
|---|---|---|
| `registerTools` | `(tools: ToolDefinition[]) => Promise<void>` | `PUT /api/skills/:skill/tools` |
| `onToolCall` | `(name: string, handler: ToolHandler) => void` | Register a local tool handler |
| `pushEvent` | `(event: PushEventPayload) => Promise<void>` | `POST /api/events` |
| `on` | `(event, listener) => void` | Subscribe to a lifecycle event |
| `off` | `(event, listener) => void` | Unsubscribe |
| `connect` | `() => void` | Open the SSE stream (auto-reconnects) |
| `disconnect` | `() => void` | Close the SSE stream |
| `memory.*` | _see Memory section_ | Read/write the 4 memory types |
| `haseef.*` | _see Haseef section_ | CRUD haseefs and their profile/skills |
| `runs.*` | _see Runs section_ | Inspect run history |

### `SdkOptions`

| Field | Type | Description |
|---|---|---|
| `coreUrl` | `string` | Core API base URL (e.g. `http://localhost:3001`) |
| `apiKey` | `string` | Core's `SECRET_KEY`, sent as `x-api-key` |
| `skill` | `string` | Unique skill name for this service |

### `ToolDefinition`

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Tool name |
| `description` | `string` | What the tool does |
| `input` | `Record<string, string>` | Shorthand type map (e.g. `{ city: 'string' }`) |
| `inputSchema` | `unknown` | Raw JSON Schema (overrides `input` if both are provided) |

### `ToolCallContext` (passed to your handler)

| Field | Type | Description |
|---|---|---|
| `actionId` | `string` | Unique action ID |
| `haseef` | `HaseefContext` | `{ id, name, profile }` of the calling haseef |

### `PushEventPayload`

| Field | Type | Description |
|---|---|---|
| `type` | `string` | Event type |
| `data` | `Record<string, unknown>` | Event payload |
| `attachments` | `Attachment[]` | Optional file/image/audio attachments |
| `haseefId` | `string` | Optional target haseef (direct routing) |
| `target` | `Record<string, string>` | Optional routing metadata (e.g. `{ phone: '+1...' }`) |

### Lifecycle Events

| Event | Payload | Description |
|---|---|---|
| `run.started` | `RunStartedEvent` | A haseef run began (includes `triggerSkill`, `triggerType`) |
| `tool.input.start` | `ToolInputStartEvent` | Tool input streaming started |
| `tool.input.delta` | `ToolInputDeltaEvent` | Partial tool args received (includes `partialArgs`) |
| `tool.call` | `ToolCallEvent` | Tool call dispatched with final args |
| `tool.result` | `ToolResultEvent` | Tool returned a result (includes `durationMs`) |
| `tool.error` | `ToolErrorEvent` | Tool call failed |
| `run.completed` | `RunCompletedEvent` | Run finished (includes `durationMs`, optional `summary`) |

### Exported Types

```typescript
import type {
  // Config
  SdkOptions,
  // Tools
  ToolDefinition, ToolHandler, ToolCallContext, HaseefContext,
  // Events
  PushEventPayload, Attachment,
  SdkEventType, SdkEventMap,
  ToolInputStartEvent, ToolInputDeltaEvent,
  ToolCallEvent, ToolResultEvent, ToolErrorEvent,
  RunStartedEvent, RunCompletedEvent,
  // Haseefs
  Haseef, CreateHaseefInput, UpdateHaseefInput,
  // Memory
  SemanticMemory, SemanticMemoryInput,
  EpisodicMemory, SocialMemory, ProceduralMemory, MemoryStats,
  // Runs
  Run, ListRunsOptions,
} from '@hsafa/sdk';
```

Plus the helper:

```typescript
import { inputToJsonSchema } from '@hsafa/sdk';

inputToJsonSchema({ city: 'string', units: 'string?' });
// → { type: 'object', properties: { city: { type: 'string' }, units: { type: 'string' } }, required: ['city'] }
```

---

## How it talks to Core

Every method maps to one of these Core endpoints, all authenticated with `x-api-key`:

| SDK call | HTTP |
|---|---|
| `registerTools(...)` | `PUT  /api/skills/:skill/tools` |
| `pushEvent(...)` | `POST /api/events` |
| `connect()` | `GET  /api/skills/:skill/actions/stream` (SSE) |
| _(internal)_ tool result | `POST /api/actions/:actionId/result` |
| `haseef.list / get / create / update / delete` | `/api/haseefs[/:id]` |
| `haseef.getProfile / updateProfile` | `/api/haseefs/:id/profile` |
| `haseef.status` | `/api/haseefs/:id/status` |
| `memory.list / set / delete` | `/api/memory/:haseefId/semantic` |
| `memory.search` | `/api/memory/:haseefId/semantic/search` |
| `memory.episodes / searchEpisodes` | `/api/memory/:haseefId/episodic[…]` |
| `memory.social / procedural / stats` | `/api/memory/:haseefId/[…]` |
| `runs.list / get` | `/api/runs[/:runId]` |

For SSE the SDK uses `fetch()` + manual parsing (not `EventSource`) so it can send the `x-api-key` header.

## License

MIT
