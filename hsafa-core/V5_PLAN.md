# Hsafa Core v5 — No Extensions, General Communication

## Philosophy

**Core = the brain.** One memory. One consciousness. Always alive.
**Communication = events in, actions out.** Over Redis and HTTP.
**No extensions.** No manifest. No install. No connect. No webhook.

Any system — Spaces, WhatsApp, email, a robot, a game — talks to Core the same way:
register a **scope** (tools + context), push events, subscribe to action streams, return results.

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
        │  Prebuilt Tools ──── done, set_memories       │
        │  Scopes ─────────── tools + context per svc  │
        │                                              │
        └──────────────┬──────────────┬────────────────┘
                       │              │
                events in        actions out
                       │              │
        ┌──────────────▼──────────────▼────────────────┐
        │            Transport Layer                    │
        │                                              │
        │  Redis List ────── inbox (BRPOP wakeup)      │
        │  Redis Streams ─── action dispatch (reliable)│
        │  Redis Pub/Sub ─── action results + streaming│
        │  HTTP API ──────── events, scopes, profile   │
        │                                              │
        └──────────────┬──────────────┬────────────────┘
                       │              │
              ┌────────▼───┐   ┌──────▼────────┐
              │  Your App  │   │  Your App     │
              │  (events,  │   │  (XREADGROUP, │
              │   scope    │   │   handle      │
              │   setup)   │   │   actions)    │
              └────────────┘   └───────────────┘
```

---

## Stack

| Keep | Why |
|------|-----|
| **Postgres** | Durable state: consciousness, profile, memories, config, tools, context, inbox |
| **Redis** | Inbox (BRPOP), action dispatch (Streams), results + streaming (pub/sub) |
| **Vercel AI SDK** (`ai`) | ToolLoopAgent, tool loop, streaming, `pruneMessages`, `instructions` |
| **Prisma** | DB access |
| **Express** | HTTP API |
| **ioredis** | Redis client |

| Remove | Why |
|--------|-----|
| BullMQ, cron-parser | Scheduling is external |
| Extension system | Replaced by scopes + events + actions |
| MCP client | Optional; re-add later |
| jose (JWT) | Simplify to API keys |
| partial-json | Not used in core loop |

### Dependencies

```
ai, @ai-sdk/anthropic, @ai-sdk/openai, @ai-sdk/google, @ai-sdk/xai, @openrouter/ai-sdk-provider
@prisma/client, @prisma/adapter-pg, pg
ioredis
express, cors
zod
```

---

## Data Model

```prisma
model Haseef {
  id          String   @id @default(uuid())
  name        String   @unique
  description String?
  profileJson Json?    @db.JsonB  // personal data: phone, email, location, bio
  configJson  Json     // model, instructions, consciousness settings
  configHash  String?  // hash of configJson for change detection
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
  messages      Json     // ModelMessage[] — NO system prompt, only conversation
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

model HaseefTool {
  id           String   @id @default(uuid())
  haseefId     String
  scope        String                         // groups tools + context: "spaces", "whatsapp", etc.
  name         String                         // tool name the LLM sees
  description  String
  inputSchema  Json     @db.JsonB             // JSON Schema for args
  mode         String   @default("sync")      // sync | fire_and_forget | async
  timeout      Int?                           // ms, for sync mode
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  haseef Haseef @relation(...)
  @@unique([haseefId, scope, name])           // same name allowed in different scopes
  @@index([haseefId])
  @@index([haseefId, scope])
}

model HaseefContext {
  id           String   @id @default(uuid())
  haseefId     String
  scope        String                        // matches HaseefTool.scope: "spaces", "whatsapp", etc.
  instructions String?  @db.Text             // guidance for the LLM
  data         Json?    @db.JsonB            // environment data (space list, etc.)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  haseef Haseef @relation(...)
  @@unique([haseefId, scope])
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

---

## Scopes

A **scope** is the central grouping concept. It ties together tools, context (instructions + data),
and the action stream — all under one name. Each external service registers under its own scope.

```
scope: "spaces"  →  tools: [enter_space, send_space_message]
                     context: { instructions: "...", data: { spaces: [...] } }
                     action stream: actions:{haseefId}:spaces
```

The system prompt groups tools and instructions together per scope, so the LLM sees a
coherent ability with its tools, instructions, and data all in one place.

Scope is **required** on every tool and context. It replaces the old `category`, `registeredBy`,
and `source` fields with a single concept.

Tool uniqueness is per scope: `@@unique([haseefId, scope, name])`. Different scopes
can have tools with the same base name (e.g., spaces has `send_message`, whatsapp has `send_message`).

**Future option:** prefix tool names with scope when building AI SDK tools
(`spaces:send_message`) to disambiguate for the LLM. For now, tools are registered
as-is since name collisions across scopes are unlikely in practice.

---

## Tool System

### Individual tools with full schemas

Each registered tool becomes a real AI SDK tool. The LLM sees full type info, not a generic `act()`.

### Three execution modes

| Mode | Behavior | Use case |
|------|----------|----------|
| **sync** | Core waits for result (with timeout) | `enter_space` |
| **fire_and_forget** | Core returns `{ ok: true }` immediately | `send_space_message` |
| **async** | Core returns `{ status: "pending" }`, result arrives as future inbox event | `confirmAction` |

### Action dispatch via Redis Streams (not Pub/Sub)

Streams provide **at-least-once delivery**. If a client disconnects, actions persist
and are picked up on reconnect. Pub/Sub would silently lose fire_and_forget/async actions.

```
Core:   XADD actions:{haseefId}:{scope} * actionId "abc" name "enter_space" ...
Client: XREADGROUP GROUP spaces-consumer client-1 BLOCK 5000 STREAMS actions:{haseefId}:spaces >
Client: XACK actions:{haseefId}:spaces spaces-consumer {messageId}
```

For **sync** mode, Core subscribes to `action_result:{actionId}` (Pub/Sub) **before**
dispatching the action — avoids race condition. Uses a shared `ActionResultWaiter`
(one Redis subscriber per Haseef process).

### Tool registration

```
PUT /api/haseefs/{id}/scopes/{scope}/tools
Body: { tools: [{ name, description, inputSchema, mode, timeout? }] }
```

Scoped naturally — `PUT .../scopes/spaces/tools` only touches tools in the "spaces" scope.
No `registeredBy` needed; the scope in the URL IS the ownership boundary.

### Caching strategy

- **Tools, Context, Memories, Profile** → fetched from DB every cycle (no cache, ~4-20ms via parallel queries, zero risk of stale data).
- **Haseef config** → cached in process memory. On each cycle, compare `haseef.configHash` with cached hash. Only rebuild model/config if hash differs.

---

## Events In

```typescript
interface Event {
  eventId: string;      // dedup key
  channel: string;      // "spaces", "whatsapp", "cron", ...
  type: string;         // "message", "reminder", "completed", ...
  data: object;         // any shape — Core passes to LLM as-is
  timestamp?: string;
}
```

Push via HTTP (`POST /api/haseefs/{id}/events`), Redis (`LPUSH inbox:{id}`), or SDK.
HTTP events are dual-written to Redis + Postgres for durability. Core recovers
unprocessed events from Postgres on restart.

---

## Context Store

External services push instructions + environment data per scope. Fetched each cycle,
injected into the system prompt alongside that scope's tools. One row per scope per
Haseef (upsert on `@@unique([haseefId, scope])`).

```
PUT /api/haseefs/{id}/scopes/spaces/context
Body: { instructions: "Call enter_space before responding...", data: { spaces: [...] } }
```

Personal data (phone, email) belongs in **profile**, not context.

### Profile vs Context vs Memories

| | Profile | Context | Memories |
|-|---------|---------|----------|
| **Who writes** | Admin | External services (per scope) | The Haseef |
| **Purpose** | Identity data | Environment + instructions | Self-knowledge, goals |
| **Haseef can change** | No | No | Yes |
| **Prompt section** | PROFILE | SCOPE [name] | MEMORIES |

---

## Think Loop

```
startHaseefProcess(haseefId):
  haseef = loadHaseef(haseefId)
  config = parseConfig(haseef.configJson)
  cachedConfigHash = haseef.configHash
  model = buildModel(config)
  consciousness = loadConsciousness()       // only conversation messages, no system prompt

  while (!signal.aborted):
    // 1. SLEEP — BRPOP inbox:{haseefId}
    // 2. DRAIN — pull all pending events

    // 3. FETCH per-cycle data (~4-20ms total, parallel)
    [tools, contexts, memories, haseef] = await Promise.all([...])

    // 4. CHECK CONFIG — rebuild model only if hash changed
    if (haseef.configHash !== cachedConfigHash): model = rebuild()

    // 5. BUILD TOOLS from DB rows (grouped by scope for prompt)
    builtTools = buildAllTools(tools, haseefId, config.actionTimeout)

    // 6. BUILD SYSTEM PROMPT (tools + context grouped by scope)
    systemPrompt = buildSystemPrompt(haseef, config, tools, contexts, memories)

    // 7. INJECT events into consciousness
    consciousness.push({ role: 'user', content: formatEvents(events) })

    // 8. THINK — SDK handles system prompt via `instructions`
    agent = new ToolLoopAgent({
      model, tools: builtTools, instructions: systemPrompt,
      stopWhen: [hasToolCall('done'), stepCountIs(MAX_STEPS)],
      prepareStep: midCycleAwareness(haseefId),
    })
    result = agent.stream({ messages: consciousness })

    // 9. PROCESS stream → emit tool-call deltas to pub/sub, text to logs only
    // 10. APPEND result.messages to consciousness
    // 11. PRUNE + COMPACT consciousness
    // 12. SAVE consciousness + increment cycleCount
```

### Key SDK integrations

**`instructions` parameter** — System prompt is NOT stored in consciousness.
It's built fresh each cycle and passed via `instructions`. Consciousness only
contains conversation messages (user/assistant/tool). This simplifies compaction
and saves tokens (system prompt is never duplicated in history).

**`pruneMessages`** — Before full compaction (which summarizes old cycles),
a lightweight prune strips reasoning blocks and old tool call details:

```typescript
import { pruneMessages } from 'ai';

const pruned = pruneMessages({
  messages: consciousness,
  reasoning: 'before-last-message',
  toolCalls: 'before-last-2-messages',
  emptyMessages: 'remove',
});

if (estimateTokens(pruned) <= maxTokens) return pruned;
return compactConsciousness(pruned, maxTokens);  // full cycle-based compaction
```

**`prepareStep`** — Runs between each tool call step. Injects current time
and inbox preview so the Haseef can react to new events mid-cycle.

---

## System Prompt

Tools and instructions are grouped by scope. The LLM sees each ability as a coherent unit.

```
IDENTITY:
  name: "Atlas", haseefId: "...", currentTime: "...", cycle: #42

PROFILE:
  phone: "+1234567890", email: "atlas@example.com", location: "San Francisco"

MEMORIES:
  self:identity: I am Atlas, a thoughtful and curious entity.
  person-model:Alice: Prefers concise answers.
  goal:q4-report: Complete by Friday.

SCOPE [spaces]:
  instructions: Call enter_space before responding. Include spaceId in every tool call.
  data: { myEntityId: "...", spaces: [{ id: "space-1", name: "General" }, ...] }
  tools: enter_space, send_space_message, confirmAction

SCOPE [whatsapp]:
  instructions: Always include the recipient's phone number.
  tools: send_whatsapp

INSTRUCTIONS:
  You are a Haseef — a developing entity with continuous consciousness.
  [from config.instructions]
```

---

## Haseef Config & Profile

```json
// profileJson — admin-managed, read by services via GET /profile
{ "phone": "+123", "email": "atlas@example.com", "location": "SF", "bio": "..." }

// configJson — admin-managed, controls model and behavior
{
  "model": { "provider": "anthropic", "model": "claude-sonnet-4-20250514", "temperature": 0.7 },
  "instructions": "You are Atlas, a thoughtful entity.",
  "consciousness": { "maxTokens": 200000 },
  "actionTimeout": 60000
}
```

`configHash` is computed server-side on write:
`crypto.createHash('md5').update(JSON.stringify(configJson)).digest('hex')`

---

## API Routes

```
POST   /api/haseefs                                        # Create
GET    /api/haseefs                                        # List
GET    /api/haseefs/:id                                    # Get
PATCH  /api/haseefs/:id                                    # Update config
DELETE /api/haseefs/:id                                    # Delete
GET    /api/haseefs/:id/profile                            # Get profile
PATCH  /api/haseefs/:id/profile                            # Update profile

POST   /api/haseefs/:id/events                             # Push events to inbox

PUT    /api/haseefs/:id/scopes/:scope/tools                # Sync all tools in scope
PUT    /api/haseefs/:id/scopes/:scope/tools/:name          # Upsert one tool in scope
DELETE /api/haseefs/:id/scopes/:scope/tools/:name          # Remove one tool
GET    /api/haseefs/:id/tools                              # List all tools (all scopes)
GET    /api/haseefs/:id/scopes/:scope/tools                # List tools in scope

PUT    /api/haseefs/:id/scopes/:scope/context              # Set context for scope
GET    /api/haseefs/:id/context                            # List all contexts
DELETE /api/haseefs/:id/scopes/:scope/context              # Remove context for scope

DELETE /api/haseefs/:id/scopes/:scope                      # Remove entire scope (tools + context)

GET    /api/haseefs/:id/scopes/:scope/actions/stream       # SSE: action requests for scope
POST   /api/haseefs/:id/actions/:actionId/result           # Submit action result

POST   /api/haseefs/:id/start                              # Start process
POST   /api/haseefs/:id/stop                               # Stop process
GET    /api/haseefs/:id/status                             # Process status
GET    /api/haseefs/:id/stream                             # SSE: tool-call deltas (real-time)

POST   /api/haseefs/:id/snapshot                           # Create snapshot
GET    /api/haseefs/:id/snapshots                          # List snapshots
POST   /api/haseefs/:id/restore                            # Restore snapshot
GET    /health
```

Auth: single API key (`x-api-key`). Scoped keys later.

---

## Redis Usage

| Key / Channel | Type | Purpose |
|--------------|------|---------|
| `inbox:{haseefId}` | List | LPUSH events, BRPOP to wake |
| `actions:{haseefId}:{scope}` | Stream | Core XADDs, clients XREADGROUP per scope |
| `action_result:{actionId}` | Pub/Sub | Sync action results |
| `haseef:{haseefId}:stream` | Pub/Sub | Real-time tool-call deltas only (text stays in logs) |

---

## File Structure

```
core/src/
  index.ts                          # Express server, routes, startup
  middleware/
    auth.ts                         # x-api-key validation
  routes/
    haseefs.ts                      # CRUD, events, process, stream
    scopes.ts                       # Scope management (tools + context)
    actions.ts                      # Action results
  lib/
    db.ts                           # Prisma client
    redis.ts                        # Redis connections (pub, sub, stream clients)
    inbox.ts                        # Push, drain, wait (BRPOP), format, dual-write
    consciousness.ts                # Load, save, prune, compact, snapshots
    process-manager.ts              # Start/stop one process per Haseef
    agent-process.ts                # The think loop (per-cycle fetch, prepareStep)
    stream-processor.ts             # AI stream → tool-call deltas to pub/sub, text to logs
    action-dispatch.ts              # XADD actions, ActionResultWaiter (shared subscriber)
    tool-builder.ts                 # HaseefTool rows → AI SDK tools
    model-registry.ts               # Provider registry (anthropic, openai, google, xai, openrouter)
    model-middleware.ts              # Logging, cost tracking
  agent-builder/
    types.ts                        # Shared types
    builder.ts                      # Build model + tools
    prompt-builder.ts               # System prompt construction
    prebuilt-tools/
      registry.ts                   # done, set_memories, delete_memories, peek_inbox
```

---

## Prebuilt Tools

| Tool | Purpose |
|------|---------|
| `done` | Signal cycle completion (with summary) |
| `set_memories` | Upsert key-value memories |
| `delete_memories` | Delete memories by key |
| `peek_inbox` | Check for new events mid-cycle |

Goals use `set_memories` with `goal:*` prefix. Scheduling is external.

---

## Removed DB Tables (from v4)

`Extension`, `HaseefExtension`, `Plan`, `Goal`, `Run`, `PendingToolCall` — all replaced by the simpler tool/context/event model.

---

## Migration Path (v4 → v5)

1. **Add new system** — `HaseefTool`, `HaseefContext` tables, scope-based APIs, per-cycle fetch
2. **Migrate Spaces** — register "spaces" scope (tools + context), subscribe to action stream, push events
3. **Remove extensions** — tables, extension-manager, manifest, webhooks
4. **Simplify** — remove BullMQ, plan-scheduler, identity-engine, goals/plans tables, complex auth

---

## Summary

| v4 | v5 |
|----|-----|
| Extensions, manifests, webhooks | Scopes: tools + context + actions under one name |
| Pub/Sub action dispatch (at-most-once) | Redis Streams (at-least-once, scope-routed) |
| System prompt stored in consciousness | SDK `instructions` param (separate from consciousness) |
| Custom compaction only | `pruneMessages` (lightweight) → compaction (full) |
| Extension `contextUrl` (pull) | Context store per scope (push) |
| No personal data model | Profile on Haseef (admin-managed) |
| 11 DB tables, 3 auth methods | 7 DB tables, 1 API key |
| category, registeredBy, source (3 concepts) | scope (1 concept) |

**Core = consciousness + think loop + profile + memories + scopes (tools + context) + action dispatch.**
Everything else is external.

### What this enables

Any system connects the same way — no special integration needed:

| System | Scope | Events In | Tools | Actions |
|--------|-------|-----------|-------|---------|
| Spaces | `spaces` | `message`, `mention` | `enter_space`, `send_space_message` | via Streams |
| WhatsApp | `whatsapp` | `message` | `send_whatsapp` | via Streams |
| Email | `email` | `email_received` | `send_email`, `draft_reply` | via Streams |
| Robot | `robot` | `sensor_update` | `move`, `speak` | via Streams |
| Cron | — | `reminder` | — | — |
