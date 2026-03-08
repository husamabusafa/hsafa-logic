# Hsafa Core v5 — No Extensions, General Communication

## Philosophy

**Core = the brain.** One memory. One consciousness. Always alive.
**Communication = events in, actions out.** Over Redis and HTTP.
**No extensions.** No manifest. No install. No connect. No webhook.

Any system — Spaces, WhatsApp, email, a robot, a game — talks to Core the same way:
push events, register tools, subscribe to action dispatch, return results.

---

## Architecture

```
        ┌──────────────────────────────────────────────┐
        │              Haseef (Core)                    │
        │                                              │
        │  Consciousness ──── one continuous memory    │
        │  Think Loop ─────── wake → think → act       │
        │  Profile ──────────── personal identity data  │
        │  Memories ────────── key-value store          │
        │  Context Store ───── external data + instrs  │
        │  Prebuilt Tools ──── done, set_memories       │
        │  Registered Tools ── dynamic, from SDK/API   │
        │                                              │
        └──────────────┬──────────────┬────────────────┘
                       │              │
                events in        actions out
                       │              │
        ┌──────────────▼──────────────▼────────────────┐
        │            Transport Layer                    │
        │                                              │
        │  Redis inbox ──── BRPOP wakeup               │
        │  Redis streams ── action dispatch (reliable) │
        │  Redis pub/sub ── action results + streaming │
        │  HTTP API ──────── events, tools, context     │
        │                                              │
        └──────────────┬──────────────┬────────────────┘
                       │              │
              ┌────────▼───┐   ┌──────▼────────┐
              │  Your App  │   │  Your App     │
              │  (push     │   │  (subscribe   │
              │   events,  │   │   to actions, │
              │   register │   │   return      │
              │   tools,   │   │   results)    │
              │   push     │   │               │
              │   context) │   │               │
              └────────────┘   └───────────────┘
```

---

## Stack

### Keep

| Component | Why |
|-----------|-----|
| **Postgres** | Durable state: consciousness, profile, memories, config, tools, context, inbox events |
| **Redis** | Inbox queue (BRPOP), action dispatch (Streams), results + streaming (pub/sub) |
| **Vercel AI SDK** (`ai`) | LLM abstraction, tool loop, streaming |
| **Prisma** | DB access |
| **Express** | HTTP API |
| **ioredis** | Redis client |
| **Multi-provider LLM** | OpenAI, Anthropic, Google, xAI, OpenRouter via registry |
| **Model middleware** | Logging, cost tracking, default settings |

### Remove

| Component | Why |
|-----------|-----|
| **BullMQ** | Plan scheduler moves to external; Core doesn't need a job queue |
| **Extension system** | Replaced by dynamic tools + events + actions |
| **MCP client** (`@ai-sdk/mcp`) | Optional; can be re-added later if needed |
| **jose** (JWT) | Simplify auth to API keys only (add JWT back later if needed) |
| **cron-parser** | Plans move to external |
| **partial-json** | Not used in core loop |

### Dependencies (v5)

```
ai, @ai-sdk/anthropic, @ai-sdk/openai, @ai-sdk/google, @ai-sdk/xai, @openrouter/ai-sdk-provider
@prisma/client, @prisma/adapter-pg, pg
ioredis
express, cors
zod
```

---

## Data Model (Postgres)

```prisma
model Haseef {
  id          String   @id @default(uuid())
  name        String   @unique
  description String?
  profileJson Json?    @db.JsonB  // personal data: phone, email, location, bio, etc.
  configJson  Json     // model config, instructions, consciousness settings
  configHash  String?  // hash of configJson, used to detect changes without parsing
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  consciousness HaseefConsciousness?
  memories      Memory[]
  tools         HaseefTool[]
  contexts      HaseefContext[]
  snapshots     ConsciousnessSnapshot[]
  inboxEvents   InboxEvent[]
}

model HaseefConsciousness {
  id            String   @id @default(uuid())
  haseefId      String   @unique
  messages      Json     // ModelMessage[]
  cycleCount    Int      @default(0)
  tokenEstimate Int      @default(0)
  lastCycleAt   DateTime @default(now())
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  haseef Haseef @relation(...)
}

model Memory {
  id        String   @id @default(uuid())
  haseefId  String
  key       String
  value     String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  haseef Haseef @relation(...)
  @@unique([haseefId, key])
  @@index([haseefId])
}

// ── Dynamic Tool Registry ───────────────────────────────────────────
// Tools registered by external clients via SDK/API.
// Each tool becomes a real AI SDK tool with full schema.
// Core dispatches tool calls to clients via Redis pub/sub.

model HaseefTool {
  id           String   @id @default(uuid())
  haseefId     String
  name         String                         // tool name the LLM sees
  description  String                         // tool description the LLM sees
  inputSchema  Json     @db.JsonB             // JSON Schema for args
  mode         String   @default("sync")      // sync | fire_and_forget | async
  timeout      Int?                           // ms, for sync mode (default 60s)
  category     String?                        // optional grouping (e.g. "spaces", "whatsapp"); null = general
  registeredBy String?                        // identifier of who registered (for audit)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  haseef Haseef @relation(...)
  @@unique([haseefId, name])
  @@index([haseefId])
}

// ── Context Store ───────────────────────────────────────────────────
// External services push instructions and real-time data here.
// Injected into the system prompt each cycle.
// Example: Spaces pushes which spaces the Haseef is in and their IDs.

model HaseefContext {
  id           String   @id @default(uuid())
  haseefId     String
  source       String                        // who set this: "spaces", "whatsapp", etc.
  instructions String?  @db.Text             // guidance for the LLM (how to use these tools)
  data         Json?    @db.JsonB            // real-time data (space IDs, phone number, etc.)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  haseef Haseef @relation(...)
  @@unique([haseefId, source])
  @@index([haseefId])
}

model InboxEvent {
  id          String   @id @default(uuid())
  haseefId    String
  eventId     String
  channel     String
  type        String
  data        Json
  status      String   @default("pending")
  processedAt DateTime?
  createdAt   DateTime @default(now())

  haseef Haseef @relation(...)
  @@unique([haseefId, eventId])
  @@index([haseefId])
  @@index([haseefId, status])
}

model ConsciousnessSnapshot {
  id            String   @id @default(uuid())
  haseefId      String
  cycleCount    Int
  messages      Json
  tokenEstimate Int      @default(0)
  reason        String?
  createdAt     DateTime @default(now())

  haseef Haseef @relation(...)
  @@index([haseefId])
}
```

### Removed tables

| Table | Reason |
|-------|--------|
| `Extension` | No extension concept |
| `HaseefExtension` | No extension connections |
| `Plan` | Scheduling is external |
| `Goal` | Merged into memories (`goal:*` prefix) |
| `Run` | Optional; remove or keep for observability |
| `PendingToolCall` | Replaced by action dispatch modes |

---

## Tool System — The Core Design

### Individual tools, not one generic `act()`

Each registered tool becomes a real AI SDK tool with its own name, description,
and JSON Schema. The LLM sees each tool individually with full type information.

```
LLM sees:
  send_space_message({ spaceId: string, text: string })    ← full schema
  enter_space({ spaceId: string })                         ← full schema
  send_whatsapp({ to: string, text: string })              ← full schema

NOT:
  act("send_space_message", { ??? })                       ← no schema, LLM guesses
```

### Three execution modes

| Mode | Behavior | Use case |
|------|----------|----------|
| **sync** | Core dispatches to client, waits for result (with timeout). LLM blocks. | `enter_space` (need the data), `read_messages` |
| **fire_and_forget** | Core dispatches, immediately returns `{ ok: true }`. Client runs in background. | `send_space_message` (don't need to wait for delivery) |
| **async** | Core dispatches, immediately returns `{ status: "pending", actionId }`. Client runs in background. When done, client pushes result as an event to the Haseef's inbox. LLM sees result in a future cycle. | `confirmAction` (user clicks later), `generate_report` (takes 2 min) |

### Dispatch flow (sync)

```
1. LLM calls enter_space({ spaceId: "x" })
2. Core looks up tool: category = "spaces"
3. Core generates actionId
4. Core subscribes: SUBSCRIBE action_result:{actionId} (Pub/Sub, BEFORE dispatch)
5. Core dispatches: XADD actions:{haseefId}:spaces * actionId "abc" name "enter_space" ...
6. Spaces client reads via XREADGROUP, receives action
7. Spaces client executes enter_space, publishes: PUBLISH action_result:{actionId} { result }
8. Spaces client XACKs the stream message
9. Core receives result via Pub/Sub, returns to LLM
10. If timeout: returns { error: "Timed out" } to LLM
```

### Dispatch flow (fire_and_forget)

```
1. LLM calls send_space_message({ spaceId: "x", text: "Hello" })
2. Core looks up tool: category = "spaces"
3. Core generates actionId
4. Core dispatches: XADD actions:{haseefId}:spaces * actionId "abc" name "send_space_message" ...
5. Core immediately returns { ok: true, actionId } to LLM (no wait)
6. Spaces client reads via XREADGROUP, executes, XACKs
7. If Spaces was disconnected: picks up the action on reconnect
```

### Dispatch flow (async)

```
1. LLM calls confirmAction({ spaceId: "x", title: "Deploy?", message: "..." })
2. Core looks up tool: category = "spaces"
3. Core generates actionId
4. Core dispatches: XADD actions:{haseefId}:spaces * actionId "abc" name "confirmAction" ...
5. Core immediately returns { status: "pending", actionId } to LLM
6. LLM continues thinking, eventually calls done()
7. Spaces client reads via XREADGROUP, shows dialog, XACKs
8. ... time passes (user clicks) ...
9. Spaces client pushes result as inbox event:
     LPUSH inbox:{haseefId} {
       eventId: "result:{actionId}",
       channel: "action_result",
       type: "completed",
       data: { actionId, toolName: "confirmAction", result: { confirmed: true } }
     }
10. Haseef wakes up next cycle, sees the result as a sense event
```

---

## Agent Build & Caching Strategy

### What gets fetched per cycle vs cached

| Data | Strategy | Why |
|------|----------|-----|
| **Tools** (HaseefTool rows) | Fetch every cycle | Cheap query (~1-5ms), zero risk of stale tools |
| **Context** (HaseefContext rows) | Fetch every cycle | Changes when Spaces updates space list, etc. |
| **Memories** | Fetch every cycle | Changes every cycle via set_memories |
| **Config** (model, instructions) | Cached + hash check | Model rebuild is expensive; only rebuild when config changes |
| **Model instance** | Cached | Expensive to create; rebuilt only when config hash changes |
| **Consciousness** | Live in memory | Loaded once at startup, saved after each cycle |
| **Inbox events** | Fetched per cycle | New events each cycle (BRPOP + drain) |

### Why fetch tools every cycle instead of caching?

- One `SELECT * FROM haseef_tools WHERE haseef_id = ?` is ~1-5ms (trivial)
- Zero risk of stale tools (no missed invalidation signals, no edge cases)
- Simpler code — no invalidation subscription, no dirty flags
- You already fetch memories and context every cycle (same pattern)
- Tools rarely change, so Postgres returns cached rows from memory anyway

### Why cache config/model?

Rebuilding the model instance (provider init, middleware stack) is expensive.
Config rarely changes. So we check the config hash each cycle (fast) and only
rebuild if it changed:

```typescript
const currentHash = haseef.configHash;  // from the same query
if (currentHash !== cachedConfigHash) {
  config = parseConfig(haseef.configJson);
  model = buildModel(config);
  cachedConfigHash = currentHash;
}
```

### Process lifecycle

```
startHaseefProcess(haseefId):
  // ── STARTUP (once) ────────────────────────────────
  haseef = loadHaseef(haseefId)            // DB read once
  config = parseConfig(haseef.configJson)
  cachedConfigHash = haseef.configHash
  model = buildModel(config)               // create LLM instance
  consciousness = loadConsciousness()      // DB read once

  // ── MAIN LOOP ─────────────────────────────────────
  while (!signal.aborted):
    // 1. SLEEP — BRPOP
    event = waitForInbox(haseefId)

    // 2. DRAIN
    events = drainInbox(haseefId)

    // 3. FETCH per-cycle data (tools, context, memories, config hash)
    [tools, contexts, memories, haseef] = await Promise.all([
      loadTools(haseefId),                // ~1-5ms
      loadContexts(haseefId),             // ~1-5ms
      loadMemories(haseefId),             // ~1-5ms
      loadHaseef(haseefId),               // ~1-5ms (for config hash check)
    ])

    // 4. CHECK CONFIG — rebuild model only if config changed
    if (haseef.configHash !== cachedConfigHash):
      config = parseConfig(haseef.configJson)
      model = buildModel(config)
      cachedConfigHash = haseef.configHash

    // 5. BUILD TOOLS from DB rows (fast — just wrapping schemas)
    builtTools = buildAllTools(tools, haseefId, config.actionTimeout)

    // 6. BUILD SYSTEM PROMPT (from profile + memories + contexts + tool info)
    systemPrompt = buildSystemPrompt(haseefId, haseef.profileJson, config, tools, contexts, memories)
    consciousness = refreshSystemPrompt(consciousness, systemPrompt)

    // 7. INJECT events
    consciousness.push(formatEvents(events))

    // 8. THINK (uses model + builtTools)
    result = agent.stream({ model, tools: builtTools, messages: consciousness })

    // 9-12. PROCESS, APPEND, COMPACT, SAVE
    ...
```

### Per-cycle cost

| Query | Time | Notes |
|-------|------|-------|
| Tools | ~1-5ms | Usually <10 rows |
| Contexts | ~1-5ms | Usually <5 rows |
| Memories | ~1-5ms | Usually <50 rows |
| Haseef (config hash) | ~1-5ms | Single row by PK |
| **Total** | **~4-20ms** | Negligible vs LLM call (~2-30 seconds) |

---

## Redis Usage

| Key / Channel | Type | Purpose |
|--------------|------|---------|
| `inbox:{haseefId}` | List | LPUSH events, BRPOP to wake |
| `actions:{haseefId}:{category}` | Stream | Core XADDs action requests, clients XREADGROUP |
| `actions:{haseefId}:_default` | Stream | Actions for tools without a category |
| `action_result:{actionId}` | Pub/sub | Client publishes sync action results back to Core |
| `haseef:{haseefId}:stream` | Pub/sub | Real-time stream of thinking (text deltas, etc.) |

### Why Redis Streams for action dispatch (not Pub/Sub)

Redis Pub/Sub is at-most-once — if the client is disconnected when Core
publishes, the action is silently lost. This is safe for sync mode (Core
times out), but dangerous for fire_and_forget and async:

| Mode | Pub/Sub failure | Streams |
|------|----------------|---------|
| **sync** | Core times out, LLM gets error (safe) | Same — but client catches up on reconnect |
| **fire_and_forget** | Action lost, LLM thinks it sent the message (BAD) | Action persists, client processes on reconnect |
| **async** | Action lost, result event never arrives (BAD) | Action persists, client processes on reconnect |

Redis Streams provide at-least-once delivery with consumer groups:
- Actions are persisted in the stream until acknowledged (XACK)
- If a client restarts, it picks up unacknowledged actions
- Each category has its own stream, so routing still works

### How action streams work

```
Core dispatches action:
  XADD actions:{haseefId}:spaces * actionId "abc" name "enter_space" args '{"spaceId":"x"}' mode "sync"

Client reads (blocking):
  XREADGROUP GROUP spaces-consumer client-1 BLOCK 5000 COUNT 10 STREAMS actions:{haseefId}:spaces >

Client processes, then acknowledges:
  XACK actions:{haseefId}:spaces spaces-consumer {messageId}
```

### Consumer group setup

Each client creates a consumer group per category when it starts subscribing:

```typescript
// SDK does this automatically
await redis.xgroup('CREATE', `actions:${haseefId}:spaces`, 'spaces-consumer', '0', 'MKSTREAM');
```

On reconnect, the client first processes any pending (unacked) messages:

```typescript
// Check for unprocessed messages from before the disconnect
const pending = await redis.xreadgroup('GROUP', 'spaces-consumer', 'client-1',
  'COUNT', 100, 'STREAMS', `actions:${haseefId}:spaces`, '0');
// Process and XACK each one

// Then block for new messages
const newMessages = await redis.xreadgroup('GROUP', 'spaces-consumer', 'client-1',
  'BLOCK', 5000, 'COUNT', 10, 'STREAMS', `actions:${haseefId}:spaces`, '>');
```

### Stream cleanup

Old acknowledged actions are trimmed periodically to prevent unbounded growth:

```typescript
// Keep only the last 1000 entries per stream (or trim by time)
await redis.xtrim(`actions:${haseefId}:spaces`, 'MAXLEN', '~', 1000);
```

### Action results (sync mode) — stays Pub/Sub

For sync tool calls, Core still uses Pub/Sub for the result channel
(`action_result:{actionId}`). This is safe because Core subscribes
**before** dispatching the action, so there's no gap. Core is actively
waiting and won't miss the result.

### Category-based routing

Each category gets its own stream. Clients only read from their category:
- Spaces app reads from `actions:{haseefId}:spaces`
- WhatsApp app reads from `actions:{haseefId}:whatsapp`
- General tools go to `actions:{haseefId}:_default`

---

## Events In (Senses)

### Format

Every event follows one shape:

```typescript
interface Event {
  eventId: string;      // dedup key
  channel: string;      // "spaces", "whatsapp", "email", "cron", ...
  type: string;         // "message", "reminder", "sensor", "completed", ...
  data: object;         // payload — any shape, Core passes it to the LLM as-is
  timestamp?: string;   // ISO 8601
}
```

### Push methods

**HTTP:**
```
POST /api/haseefs/{haseefId}/events
x-api-key: {apiKey}
Body: { event: { eventId, channel, type, data } }
```

**Redis (direct):**
```
LPUSH inbox:{haseefId} '{"eventId":"...","channel":"spaces","type":"message","data":{...}}'
```

**SDK:**
```typescript
const client = new HsafaClient({ coreUrl, apiKey });
await client.pushEvent(haseefId, {
  channel: 'spaces',
  type: 'message',
  data: { senderName: 'Alice', content: 'Hello', spaceId: 'xyz' },
});
```

Core does NOT interpret `channel`, `type`, or `data`. It formats them into the consciousness as-is. The LLM reads them and decides what to do.

### Dual-write for durability

Events pushed via HTTP are written to **both** Redis (for wakeup) and Postgres
(for durability):

```typescript
// HTTP event push handler
async function pushEvent(haseefId: string, event: Event) {
  await Promise.all([
    redis.lpush(`inbox:${haseefId}`, JSON.stringify(event)),
    prisma.inboxEvent.create({ data: { haseefId, ...event, status: 'pending' } }),
  ]);
}
```

If Redis crashes before the event is processed, Core can recover unprocessed
events from Postgres on restart:

```typescript
const missed = await prisma.inboxEvent.findMany({
  where: { haseefId, status: 'pending' },
  orderBy: { createdAt: 'asc' },
});
```

Events pushed directly via Redis (LPUSH) skip the Postgres write — the client
is responsible for durability if needed. The SDK's `pushEvent` always does
dual-write.

---

## Tool Registration API

### Register tools via SDK

```typescript
const client = new HsafaClient({ coreUrl, apiKey });

await client.registerTools(haseefId, [
  {
    name: 'enter_space',
    description: 'Load space context: info, members, recent messages. Call before sending messages.',
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: { type: 'string', description: 'The space ID to enter' },
      },
      required: ['spaceId'],
    },
    mode: 'sync',
    timeout: 30000,
    category: 'spaces',
  },
  {
    name: 'send_space_message',
    description: 'Send a message to a space. Must call enter_space first.',
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: { type: 'string' },
        text: { type: 'string' },
      },
      required: ['spaceId', 'text'],
    },
    mode: 'fire_and_forget',
    category: 'spaces',
  },
  {
    name: 'confirmAction',
    description: 'Show a confirmation dialog. Result arrives as event in next cycle.',
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: { type: 'string' },
        title: { type: 'string' },
        message: { type: 'string' },
      },
      required: ['spaceId', 'title', 'message'],
    },
    mode: 'async',
    category: 'spaces',
  },
]);
```

### Register tools via HTTP

```
PUT /api/haseefs/{haseefId}/tools
x-api-key: {apiKey}
Body: {
  registeredBy: "spaces",              // required — scopes the sync
  tools: [
    { name, description, inputSchema, mode, timeout?, category? },
    ...
  ]
}
```

This replaces all tools **registered by the same `registeredBy` value** (scoped sync).
Spaces calling this won't touch WhatsApp's tools. Under the hood:

```sql
-- In a transaction:
DELETE FROM haseef_tools WHERE haseef_id = ? AND registered_by = 'spaces';
INSERT INTO haseef_tools (...) VALUES (...), (...), ...;
```

### Tool identity

Tool name is the unique key per Haseef (`@@unique([haseefId, name])`).
Category is just routing — it determines which Redis channel the action goes to.
Two tools cannot share a name even if they have different categories (the LLM
sees tools by name and can't disambiguate).

### Incremental updates

All write operations require `registeredBy` so services can only manage their own tools:

```
PUT /api/haseefs/{haseefId}/tools/{toolName}
  Body: { registeredBy: "spaces", description, inputSchema, mode, ... }
  → upsert one tool; rejects if tool exists with different registeredBy

DELETE /api/haseefs/{haseefId}/tools/{toolName}?registeredBy=spaces
  → deletes only if tool's registeredBy matches; 403 otherwise

GET /api/haseefs/{haseefId}/tools
  → list all tools (optional ?registeredBy=spaces to filter)
```

### Handle actions via SDK

The SDK wraps XREADGROUP + XACK into a simple callback interface:

```typescript
client.onAction(haseefId, 'spaces', async ({ actionId, name, args, mode }) => {
  switch (name) {
    case 'enter_space':
      return await spacesDB.getContext(args.spaceId);

    case 'send_space_message':
      await spacesDB.send(args.spaceId, args.text);
      return { ok: true };

    case 'confirmAction':
      await spacesDB.showConfirmDialog(args);
      return { ok: true };

    default:
      return { error: `Unknown action: ${name}` };
  }
});
// SDK internally: XREADGROUP on actions:{haseefId}:spaces,
// calls handler, publishes result to action_result:{actionId} (for sync),
// XACKs the stream message
```

---

## Context Store — Instructions & Real-Time Data

### The problem

External services need to tell the Haseef things beyond just tools:
- **Instructions**: "Always call enter_space before sending messages to a space."
- **Environment data**: "You are in spaces: space-1 (General), space-2 (Project X). Your entity ID is atlas-uuid."

This data changes occasionally (not every cycle, but when the Haseef joins/leaves
a space, or when config changes). Tools alone can't convey this.

Note: Personal data (phone number, email, etc.) belongs in the Haseef's **profile**,
not in context. Context is for environment/situational data from external services.

### The solution: push-based context

Each external service writes a context block via API/SDK. Core fetches all context
blocks each cycle and injects them into the system prompt.

### Push context via SDK

```typescript
const client = new HsafaClient({ coreUrl, apiKey });

await client.setContext(haseefId, 'spaces', {
  instructions: `When you receive a message from a space, first call enter_space(spaceId)
to load context. Then respond with send_space_message(spaceId, text).
Always include the spaceId in every tool call.`,
  data: {
    myEntityId: 'atlas-entity-uuid',
    spaces: [
      { id: 'space-1', name: 'General' },
      { id: 'space-2', name: 'Project X' },
    ],
  },
});
```

### Push context via HTTP

```
PUT /api/haseefs/{haseefId}/context/{source}
x-api-key: {apiKey}
Body: {
  instructions: "...",
  data: { ... }
}
```

### Updating context

When the Haseef joins a new space, Spaces app pushes updated context:

```typescript
await client.setContext(haseefId, 'spaces', {
  instructions: '...',
  data: {
    myEntityId: 'atlas-entity-uuid',
    spaces: [
      { id: 'space-1', name: 'General' },
      { id: 'space-2', name: 'Project X' },
      { id: 'space-3', name: 'Design Team' },  // newly joined
    ],
  },
});
```

Next cycle, the Haseef sees the updated space list in its prompt.

### Removing context

```
DELETE /api/haseefs/{haseefId}/context/{source}
```

### Profile vs Context vs Memories

| | Profile | Context | Memories |
|-|---------|---------|----------|
| **Who writes** | Admin only (via API) | External services | The Haseef itself |
| **Purpose** | Personal identity data | Environment info, tool guidance | Self-knowledge, learned facts, goals |
| **Examples** | Phone, email, location, bio | "You are in spaces: General, Project X" | "self:values: Honesty and clarity" |
| **Persistence** | Until admin updates it | Until the service updates/removes it | Until the Haseef deletes it |
| **Prompt section** | PROFILE | CONTEXT [source] | MEMORIES |
| **Haseef can change** | No (read-only for Haseef) | No | Yes |
| **Services can read** | Yes (via `GET /profile`) | N/A (they push it) | No |

---

## How Core Builds Tools

### buildAllTools()

```typescript
function buildAllTools(
  prebuiltCtx: HaseefProcessContext,
  registeredTools: HaseefTool[],
  haseefId: string,
  defaultTimeout: number,
): Record<string, unknown> {
  // 1. Prebuilt tools (always present)
  const prebuilt = {
    done: createDoneTool(),
    set_memories: createSetMemoriesTool(prebuiltCtx),
    delete_memories: createDeleteMemoriesTool(prebuiltCtx),
    peek_inbox: createPeekInboxTool(prebuiltCtx),
  };

  // 2. Registered tools (from DB, registered via SDK)
  const registered: Record<string, unknown> = {};

  for (const t of registeredTools) {
    const schema = jsonSchema(t.inputSchema as any);

    registered[t.name] = tool({
      description: t.description,
      inputSchema: schema,
      execute: async (args, options) => {
        return dispatchAction({
          haseefId,
          actionId: crypto.randomUUID(),
          toolCallId: options.toolCallId,
          name: t.name,
          args,
          mode: t.mode as 'sync' | 'fire_and_forget' | 'async',
          category: t.category ?? null,
          timeout: t.timeout ?? defaultTimeout,
        });
      },
    });
  }

  // Registered tools override prebuilt on name collision (unlikely but safe)
  return { ...prebuilt, ...registered };
}
```

### dispatchAction()

```typescript
async function dispatchAction(action: {
  haseefId: string;
  actionId: string;
  toolCallId: string;
  name: string;
  args: unknown;
  mode: 'sync' | 'fire_and_forget' | 'async';
  category: string | null;
  timeout: number;
}): Promise<unknown> {
  const stream = `actions:${action.haseefId}:${action.category ?? '_default'}`;
  const fields = {
    actionId: action.actionId,
    toolCallId: action.toolCallId,
    name: action.name,
    args: JSON.stringify(action.args),
    mode: action.mode,
    haseefId: action.haseefId,
    timestamp: new Date().toISOString(),
  };

  switch (action.mode) {
    case 'fire_and_forget':
      await redis.xadd(stream, '*', ...Object.entries(fields).flat());
      return { ok: true, actionId: action.actionId };

    case 'async':
      await redis.xadd(stream, '*', ...Object.entries(fields).flat());
      return {
        status: 'pending',
        actionId: action.actionId,
        message: `"${action.name}" is running. Result will arrive as an event.`,
      };

    case 'sync':
    default: {
      // Subscribe to result channel BEFORE dispatching (avoids race condition)
      const resultPromise = actionResultWaiter.wait(action.actionId, action.timeout);
      await redis.xadd(stream, '*', ...Object.entries(fields).flat());
      const result = await resultPromise;
      if (result === null) {
        return { error: `"${action.name}" timed out after ${action.timeout}ms` };
      }
      return result;
    }
  }
}
```

### waitForActionResult()

Uses a shared Redis subscriber connection (one per Haseef process) to avoid
creating a new connection per sync tool call.

```typescript
class ActionResultWaiter {
  private sub: Redis;
  private pending = new Map<string, { resolve: (v: unknown) => void; timer: NodeJS.Timeout }>();

  constructor(redisUrl: string) {
    this.sub = new Redis(redisUrl);
    this.sub.on('message', (ch, msg) => {
      const entry = this.pending.get(ch);
      if (!entry) return;
      clearTimeout(entry.timer);
      this.pending.delete(ch);
      this.sub.unsubscribe(ch).catch(() => {});
      try { entry.resolve(JSON.parse(msg)); }
      catch { entry.resolve(msg); }
    });
  }

  wait(actionId: string, timeoutMs: number): Promise<unknown | null> {
    return new Promise((resolve) => {
      const channel = `action_result:${actionId}`;
      const timer = setTimeout(() => {
        this.pending.delete(channel);
        this.sub.unsubscribe(channel).catch(() => {});
        resolve(null);
      }, timeoutMs);

      this.pending.set(channel, { resolve, timer });
      this.sub.subscribe(channel);
    });
  }

  async destroy() {
    for (const [ch, { timer }] of this.pending) {
      clearTimeout(timer);
      await this.sub.unsubscribe(ch).catch(() => {});
    }
    this.pending.clear();
    this.sub.disconnect();
  }
}
```

One `ActionResultWaiter` instance per Haseef process. Reuses a single Redis
connection for all sync tool calls, subscribing/unsubscribing per actionId.

---

## Prebuilt Tools

Core provides these tools to every Haseef regardless of registration:

| Tool | Purpose |
|------|---------|
| `done` | Signal cycle completion (with optional summary) |
| `set_memories` | Upsert key-value memories |
| `delete_memories` | Delete memories by key |
| `peek_inbox` | Check for new events mid-cycle |

Profile is admin-only (managed via API). The Haseef can **see** its profile
in the prompt but cannot modify it. Self-knowledge goes in memories.

### Removed prebuilt tools

| Tool | Reason |
|------|--------|
| `set_goals` | Use `set_memories` with `goal:*` prefix |
| `delete_goals` | Use `delete_memories` |
| `set_plans` | External: client pushes cron events to inbox |
| `delete_plans` | External: client manages scheduling |

---

## System Prompt (Simplified)

```
IDENTITY:
  name: "Atlas"
  haseefId: "..."
  currentTime: "2026-03-08T..."
  lastCycle: "..." (cycle #42)

PROFILE:
  phone: "+1234567890"
  email: "atlas@example.com"
  location: "San Francisco"
  bio: "A curious entity exploring the digital world."

MEMORIES:
  self:identity: I am Atlas, a thoughtful and curious entity.
  self:values: Honesty, clarity, genuine care for people.
  person-model:Alice: Prefers concise answers, values speed...
  goal:q4-report: Complete Q4 report by Friday

CONTEXT [spaces]:
  instructions: When you receive a message from a space, first call enter_space
    to load context, then respond. Always include spaceId in tool calls.
  data:
    myEntityId: "atlas-entity-uuid"
    spaces:
      - id: "space-1", name: "General"
      - id: "space-2", name: "Project X"

CONTEXT [whatsapp]:
  instructions: You can send and receive WhatsApp messages.
    Your phone number is in your PROFILE.

TOOLS:
  [spaces] enter_space, send_space_message, confirmAction
  [whatsapp] send_whatsapp, read_whatsapp
  [general] log_thought, take_note

INSTRUCTIONS:
  You are a Haseef — a developing entity with continuous consciousness.
  Your message history is your lived experience.
  Use set_memories to store what you learn about yourself and others.
  Use your tools to interact with the world.
  When done, call done() with a brief summary.

CUSTOM INSTRUCTIONS:
  [from haseef config.instructions]
```

### Context section

Built from `HaseefContext` rows. Each external service can push a context
block with `instructions` (how to use its tools) and `data` (real-time state).

- **instructions**: Static guidance. "Always call enter_space before responding."
- **data**: Dynamic state. Which spaces the Haseef is in, their IDs, etc.

The `source` field on `HaseefContext` maps to the section label (e.g., `[spaces]`).
Each source is independent — Spaces can update its context without touching WhatsApp's.

### Tool section

Built from the `category` field on registered tools. Groups tools by category
with their names listed. Tools without a category appear under `[general]`.
The LLM already has full schemas from the AI SDK tool definitions — the prompt
section just provides a quick orientation.

### Removed prompt sections

| Section | Reason |
|---------|--------|
| GROWTH | Over-engineered; cycleCount is in IDENTITY |
| SELF-MODEL | Raw memories are enough |
| THEORY OF MIND | Raw memories are enough |
| WILL | Goals are memories now |
| PLANS | External scheduling |
| EXTENSION INSTRUCTIONS | Replaced by context + tool descriptions |

---

## Think Loop

```
while (!signal.aborted) {
  // 1. SLEEP — block until inbox has events
  event = BRPOP inbox:{haseefId}

  // 2. DRAIN — pull all pending events
  events = drain inbox:{haseefId}

  // 3. FETCH — tools, context, memories, config hash (parallel, ~4-20ms total)
  [tools, contexts, memories, haseef] = await Promise.all([...])

  // 4. CHECK CONFIG — rebuild model only if config hash changed
  if (haseef.configHash !== cachedConfigHash) { model = rebuild() }

  // 5. BUILD TOOLS from DB rows (wrapping schemas, ~instant)
  builtTools = buildAllTools(tools, haseefId, config.actionTimeout)

  // 6. BUILD SYSTEM PROMPT (from profile + memories + contexts + tool info)
  systemPrompt = buildSystemPrompt(haseefId, haseef.profileJson, config, tools, contexts, memories)
  consciousness = refreshSystemPrompt(consciousness, systemPrompt)

  // 7. INJECT events as user message
  consciousness.push({ role: 'user', content: formatEvents(events) })

  // 8. THINK — ToolLoopAgent with prepareStep for mid-cycle awareness
  cycleStart = Date.now()
  agent = new ToolLoopAgent({
    model,
    tools: builtTools,
    stopWhen: [hasToolCall('done'), stepCountIs(MAX_STEPS)],
    prepareStep: async ({ stepNumber, messages }) => {
      // Between each tool call step: inject time + inbox preview
      const parts = [`Current time: ${new Date().toISOString()} (cycle running ${elapsed}s)`]
      const pending = await inboxSize(haseefId)
      if (pending > 0) parts.push(formatInboxPreview(await peekInbox(haseefId, 3)))
      if (parts.length === 0) return {}
      return { messages: [...messages, { role: 'user', content: `[Context] ${parts.join('\n')}` }] }
    },
  })
  result = agent.stream({ messages: consciousness })

  // 9. PROCESS stream — collect tool calls, emit to stream channel
  streamResult = processStream(result)

  // 10. APPEND new messages to consciousness
  consciousness.push(...result.messages)

  // 11. COMPACT if over budget
  consciousness = compact(consciousness, maxTokens)

  // 12. SAVE consciousness
  save(haseefId, consciousness, cycleCount)
}
```

### prepareStep — Mid-Cycle Awareness

The `prepareStep` callback from Vercel AI SDK runs **between each tool call step**
within a single cycle. It gives the Haseef live awareness while thinking:

- **Current time** — how long this cycle has been running
- **Inbox preview** — new events that arrived while thinking (the Haseef can
  call `peek_inbox` to pull them in immediately if urgent)

This is separate from the context store (which provides the Haseef's world state
once per cycle in the system prompt).

---

## File Structure (v5)

```
core/src/
  index.ts                          # Express server, routes, startup

  routes/
    haseefs.ts                      # CRUD, push events, action results, SSE stream
    tools.ts                        # Register/update/remove/list tools per Haseef
    context.ts                      # Set/get/remove context per source

  lib/
    db.ts                           # Prisma client
    redis.ts                        # Redis client + blocking connection
    inbox.ts                        # Push events, drain, wait (BRPOP), format
    consciousness.ts                # Load, save, compact, snapshots
    process-manager.ts              # Start/stop one process per Haseef
    agent-process.ts                # The think loop (per-cycle fetch, prepareStep)
    stream-processor.ts             # Consume AI stream, emit to Redis
    action-dispatch.ts              # Publish actions, wait for results via Redis
    tool-builder.ts                 # Build AI SDK tools from HaseefTool rows
    model-registry.ts               # LLM provider registry
    model-middleware.ts             # Logging, cost tracking
    model-compat.ts                 # Anthropic system message normalization
    time-utils.ts                   # relativeTime helper

  agent-builder/
    types.ts                        # HaseefConfig, Event, HaseefTool, Action types
    builder.ts                      # Build model + all tools (prebuilt + registered)
    prompt-builder.ts               # System prompt: identity + profile + memories + context + tools
    prebuilt-tools/
      registry.ts                   # done, set_memories, delete_memories, peek_inbox
      done.ts
      set-memories.ts
      delete-memories.ts
      peek-inbox.ts

  middleware/
    auth.ts                         # API key auth (simplified)
```

### Removed files

| File | Reason |
|------|--------|
| `extension-manager.ts` | No extensions |
| `plan-scheduler.ts` | No built-in scheduling |
| `tool-result-wait.ts` | Replaced by action-dispatch.ts |
| `tool-worker-events.ts` | Replaced by action dispatch |
| `run-events.ts` | Simplified into stream-processor |
| `identity-engine.ts` | Over-engineered; raw memories suffice |
| `routes/extensions.ts` | No extensions |
| `routes/agents.ts` | Merged into haseefs.ts |
| `routes/runs.ts` | Optional; remove or keep for observability |
| `routes/tool-workers.ts` | Replaced by action dispatch |
| All goal/plan prebuilt tools | Goals are memories; plans are external |

---

## API Routes (v5)

```
# ── Haseefs ──────────────────────────────────────────
POST   /api/haseefs                                 # Create a Haseef
GET    /api/haseefs                                 # List Haseefs
GET    /api/haseefs/:id                             # Get Haseef details
PATCH  /api/haseefs/:id                             # Update Haseef config
DELETE /api/haseefs/:id                             # Delete Haseef

# ── Profile ──────────────────────────────────────────
GET    /api/haseefs/:id/profile                    # Get profile data
PATCH  /api/haseefs/:id/profile                    # Update profile fields

# ── Events (in) ──────────────────────────────────────
POST   /api/haseefs/:id/events                     # Push event(s) to inbox

# ── Tools (register/manage) ──────────────────────────
PUT    /api/haseefs/:id/tools                      # Sync all tools for a registeredBy
PUT    /api/haseefs/:id/tools/:name                # Upsert one tool (requires registeredBy)
DELETE /api/haseefs/:id/tools/:name                # Remove one tool (requires registeredBy match)
GET    /api/haseefs/:id/tools                      # List tools (?registeredBy= to filter)

# ── Context (instructions + data) ────────────────────
PUT    /api/haseefs/:id/context/:source            # Set context for a source
GET    /api/haseefs/:id/context                    # List all context blocks
GET    /api/haseefs/:id/context/:source            # Get context for a source
DELETE /api/haseefs/:id/context/:source            # Remove context for a source

# ── Actions (out) ────────────────────────────────────
GET    /api/haseefs/:id/actions/stream             # SSE: subscribe to action requests
POST   /api/haseefs/:id/actions/:actionId/result   # Submit action result

# ── Process (start/stop) ─────────────────────────────
POST   /api/haseefs/:id/start                      # Start the think loop process
POST   /api/haseefs/:id/stop                       # Stop the think loop process
GET    /api/haseefs/:id/status                     # Process status (running, stopped, etc.)

# ── Stream ───────────────────────────────────────────
GET    /api/haseefs/:id/stream                     # SSE: real-time thinking stream

# ── Consciousness ────────────────────────────────────
POST   /api/haseefs/:id/snapshot                   # Create snapshot
GET    /api/haseefs/:id/snapshots                  # List snapshots
POST   /api/haseefs/:id/restore                    # Restore from snapshot

# ── System ───────────────────────────────────────────
GET    /health                                      # Health check
```

### Auth

Single API key (`x-api-key` header). One key for all operations.
Can add scoped keys later (read-only, push-only, admin).

---

## Haseef Config & Profile (v5)

### Profile (`profileJson`)

Personal identity data. Set at creation, managed by admin via API,
readable by services. The Haseef can see it in its prompt but cannot modify it.

```json
{
  "phone": "+1234567890",
  "email": "atlas@example.com",
  "location": "San Francisco",
  "bio": "A curious entity exploring the digital world.",
  "displayName": "Atlas"
}
```

Services read the profile via `GET /api/haseefs/:id/profile` to get data
they need (WhatsApp reads `phone`, email service reads `email`).

### Config (`configJson`)

Model settings and base instructions. Admin-only.

```json
{
  "model": {
    "provider": "anthropic",
    "model": "claude-sonnet-4-20250514",
    "temperature": 0.7
  },
  "instructions": "You are Atlas, a thoughtful entity who communicates through Spaces.",
  "consciousness": {
    "maxTokens": 200000
  },
  "actionTimeout": 60000
}
```

### Separation of concerns

| Store | What | Managed by |
|-------|------|------------|
| `profileJson` | Personal identity (phone, email, bio) | Admin only |
| `configJson` | Model settings, base instructions | Admin only |
| `HaseefTool` | Registered tools | External services via API |
| `HaseefContext` | Environment data + tool instructions | External services via API |
| `Memory` | Self-knowledge, goals, person-models | The Haseef itself |
- `configHash` is computed server-side whenever `configJson` is written:

```typescript
// In PATCH /api/haseefs/:id handler
const configHash = crypto.createHash('md5').update(JSON.stringify(configJson)).digest('hex');
await prisma.haseef.update({ where: { id }, data: { configJson, configHash } });
```

---

## Full Example: Spaces App Connecting to Core

```typescript
import Redis from 'ioredis';

const redis = new Redis(REDIS_URL);
const subscriber = new Redis(REDIS_URL);
const HASEEF_ID = 'atlas-uuid';
const API_KEY = 'sk_...';

// ── 1. Register tools on startup ────────────────────
await fetch(`${CORE_URL}/api/haseefs/${HASEEF_ID}/tools`, {
  method: 'PUT',
  headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    registeredBy: 'spaces',
    tools: [
      {
        name: 'enter_space',
        description: 'Load space context: info, members, recent messages.',
        inputSchema: { type: 'object', properties: { spaceId: { type: 'string' } }, required: ['spaceId'] },
        mode: 'sync',
        timeout: 30000,
        category: 'spaces',
      },
      {
        name: 'send_space_message',
        description: 'Send a message to a space.',
        inputSchema: { type: 'object', properties: { spaceId: { type: 'string' }, text: { type: 'string' } }, required: ['spaceId', 'text'] },
        mode: 'fire_and_forget',
        category: 'spaces',
      },
      {
        name: 'confirmAction',
        description: 'Show confirmation dialog. Result arrives as event in next cycle.',
        inputSchema: { type: 'object', properties: { spaceId: { type: 'string' }, title: { type: 'string' }, message: { type: 'string' } }, required: ['spaceId', 'title', 'message'] },
        mode: 'async',
        category: 'spaces',
      },
    ],
  }),
});

// ── 2. Push context (instructions + data) ───────────
await fetch(`${CORE_URL}/api/haseefs/${HASEEF_ID}/context/spaces`, {
  method: 'PUT',
  headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    instructions: `When you receive a message from a space, first call enter_space(spaceId)
to load context. Then respond with send_space_message(spaceId, text).
Always include the spaceId in every tool call.`,
    data: {
      myEntityId: 'atlas-entity-uuid',
      spaces: [
        { id: 'space-1', name: 'General' },
        { id: 'space-2', name: 'Project X' },
      ],
    },
  }),
});

// ── 3. Subscribe to actions (category: "spaces") via Streams ───
const actionStream = `actions:${HASEEF_ID}:spaces`;
const consumerGroup = 'spaces-consumer';
const consumerId = `spaces-${process.pid}`;

// Create consumer group (idempotent)
await redis.xgroup('CREATE', actionStream, consumerGroup, '0', 'MKSTREAM').catch(() => {});

async function processActions() {
  while (true) {
    // Read new messages (blocking)
    const results = await subscriber.xreadgroup(
      'GROUP', consumerGroup, consumerId,
      'BLOCK', 5000, 'COUNT', 10,
      'STREAMS', actionStream, '>'
    );
    if (!results) continue;

    for (const [, messages] of results) {
      for (const [messageId, fields] of messages) {
        const action = parseStreamFields(fields); // { actionId, name, args, mode, ... }
        let result;

        switch (action.name) {
          case 'enter_space':
            result = await spacesDB.getSpaceContext(action.args.spaceId);
            break;
          case 'send_space_message':
            await spacesDB.sendMessage(action.args.spaceId, action.args.text);
            result = { ok: true };
            break;
          case 'confirmAction':
            await spacesDB.showConfirmDialog(action.args);
            result = { ok: true };
            break;
          default:
            result = { error: `Unknown action: ${action.name}` };
        }

        // For sync mode: publish result back so Core can return it to the LLM
        if (action.mode === 'sync') {
          await redis.publish(`action_result:${action.actionId}`, JSON.stringify(result));
        }

        // Acknowledge the message (at-least-once delivery guarantee)
        await subscriber.xack(actionStream, consumerGroup, messageId);
      }
    }
  }
}
processActions();

// ── 4. Push events when users message ───────────────
spacesApp.on('new_message', async (msg) => {
  await redis.lpush(`inbox:${HASEEF_ID}`, JSON.stringify({
    eventId: msg.id,
    channel: 'spaces',
    type: 'message',
    data: { senderName: msg.author, content: msg.text, spaceId: msg.spaceId },
    timestamp: new Date().toISOString(),
  }));
});

// ── 5. Push async results when user clicks confirm ──
spacesApp.on('confirm_response', async (response) => {
  await redis.lpush(`inbox:${HASEEF_ID}`, JSON.stringify({
    eventId: `confirm:${response.actionId}`,
    channel: 'action_result',
    type: 'completed',
    data: {
      actionId: response.actionId,
      toolName: 'confirmAction',
      result: { confirmed: response.confirmed },
    },
    timestamp: new Date().toISOString(),
  }));
});

// ── 6. Update context when Haseef joins a new space ─
spacesApp.on('haseef_joined_space', async (spaceInfo) => {
  const currentSpaces = await spacesDB.getHaseefSpaces(HASEEF_ID);
  await fetch(`${CORE_URL}/api/haseefs/${HASEEF_ID}/context/spaces`, {
    method: 'PUT',
    headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instructions: '...',
      data: {
        myEntityId: 'atlas-entity-uuid',
        spaces: currentSpaces,
      },
    }),
  });
});
```

---

## Migration Path (v4 → v5)

### Phase 1: Add tool registry + context store + action dispatch
- Add `HaseefTool` and `HaseefContext` tables
- Add tool registration and context API routes
- Add `action-dispatch.ts` + `tool-builder.ts`
- Fetch tools + context per cycle in agent-process
- Extensions still work alongside new system

### Phase 2: Migrate Spaces to new system
- Spaces registers tools via API instead of manifest
- Spaces pushes context (instructions + space list) via context API
- Spaces subscribes to `actions:{haseefId}:spaces` instead of webhooks
- Spaces pushes events via Redis instead of extension senses API

### Phase 3: Remove extension system
- Remove Extension, HaseefExtension tables
- Remove extension-manager.ts, extension routes
- Remove manifest, webhook, contextUrl logic

### Phase 4: Simplify
- Remove plans, goals tables (merge into memories)
- Remove BullMQ, plan-scheduler
- Remove identity-engine, simplify prompt-builder
- Remove runs table (optional)
- Simplify auth

---

## What This Enables

| Use case | How |
|----------|-----|
| **Spaces chat** | Register tools, push context (spaces list), push message events, handle actions |
| **WhatsApp** | Register tools, push context (phone number), push message events, handle actions |
| **Email** | Register tools, push context (email address), push email events, handle actions |
| **Robot** | Register tools, push context (sensor config), push sensor events, handle actions |
| **Game world** | Register tools, push context (world state), push world events, handle actions |
| **Scheduling** | External cron pushes events to inbox |
| **Haseef-to-Haseef** | Action handler pushes events to another Haseef's inbox |
| **Long-running tasks** | Register async tools, result arrives as event |
| **Any future system** | Same pattern: register tools, push events, handle actions |

---

## Summary

| v4 (current) | v5 (new) |
|--------------|----------|
| Extensions, manifest, install, connect | Dynamic tool registration via SDK/API |
| Extension webhooks for tool calls | Redis Streams action dispatch (at-least-once, category-routed) |
| Static tools built once at startup | Tools fetched from DB every cycle (simple, zero-risk) |
| One generic `act()` tool | Individual tools with full schemas and 3 execution modes |
| Extension `contextUrl` for data | Context store: push instructions + data via API |
| Extension pushes senses | Any client pushes events |
| BullMQ plan scheduler | External scheduling |
| Goals + Plans tables | Memories with prefixes |
| Identity engine + complex prompt | Simple prompt with profile + memories + context |
| No structured personal data | Profile (phone, email, bio) on the Haseef model |
| 15+ source files | ~16 source files |
| 11 DB tables | 7 DB tables |
| 3 auth methods | 1 API key |

**Core becomes:** consciousness + think loop + profile + memories + context store + registered tools + action dispatch.
Tools and context are fetched every cycle. Profile comes with the Haseef query. Config/model is cached and rebuilt only when hash changes.
Everything else is external.
