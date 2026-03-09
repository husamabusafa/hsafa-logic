# Hsafa Core v5

## Philosophy

A Haseef is built from four pillars:

- **Profile** — who the Haseef IS (identity, managed by admin)
- **Memory** — what the Haseef KNOWS (learned knowledge, managed by the Haseef itself)
- **Tools** — what the Haseef can DO (registered by external services, grouped by scope)
- **Senses** — what's HAPPENING (events pushed by external services)

The core is the brain. External services connect through a universal protocol:
**register tools, push events, handle actions, return results.**

No extensions. No manifests. No webhooks. No context injection.
Services don't push instructions or data — they register tools. The Haseef queries
for information when it needs it, just like a human looks things up.

---

## Architecture

```
         PROFILE (identity — admin-managed)
         MEMORY  (knowledge — Haseef-managed)
              │
         ┌────▼────┐
         │  MIND   │ ← Consciousness (continuous across cycles)
         │  (LLM)  │
         └──┬───┬──┘
            │   │
        SENSES  TOOLS
        (IN)    (OUT)
         │       │
    ┌────▼───────▼────┐
    │  Transport       │
    │  Redis + HTTP    │
    └────┬───────┬────┘
         │       │
    ┌────▼──┐ ┌──▼─────┐
    │Service│ │Service  │  ← Any external system (Spaces, WhatsApp, robot, IoT, ...)
    │(push  │ │(handle  │     deployed independently, connects via SDK
    │events)│ │actions) │
    └───────┘ └────────┘
```

---

## Stack

| Component | Why |
|-----------|-----|
| **Postgres + pgvector** | Durable state + semantic search: consciousness, profile, memories, config, tools, inbox, archive |
| **Redis** | Inbox (BRPOP wakeup), action dispatch (Streams), action results (Pub/Sub) |
| **Vercel AI SDK** (`ai`) | Tool loop, streaming, `pruneMessages`, `instructions` param |
| **Prisma** | DB access |
| **Express** | HTTP API |
| **ioredis** | Redis client |

### Dependencies

```
ai, @ai-sdk/anthropic, @ai-sdk/openai, @ai-sdk/google, @ai-sdk/xai, @openrouter/ai-sdk-provider
@ai-sdk/mcp
@prisma/client, @prisma/adapter-pg, pg
ioredis
express, cors
zod
```

---

## Data Model

Seven tables. No context table — services communicate through tools and events only.

```prisma
model Haseef {
  id          String   @id @default(uuid())
  name        String   @unique
  description String?
  profileJson Json?    @db.JsonB  // identity: phone, email, location, bio
  configJson  Json     // model, instructions, consciousness settings
  configHash  String?  // hash of configJson for change detection
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  consciousness HaseefConsciousness?
  memories      Memory[]
  tools         HaseefTool[]
  archive       ConsciousnessArchive[]
  snapshots     ConsciousnessSnapshot[]
  inboxEvents   InboxEvent[]
}

model HaseefConsciousness {
  id            String   @id @default(uuid())
  haseefId      String   @unique
  messages      Json     // ModelMessage[] — only conversation, NO system prompt
  cycleCount    Int      @default(0)
  tokenEstimate Int      @default(0)
  lastCycleAt   DateTime @default(now())
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  haseef Haseef @relation(...)
}

model Memory {
  id             String    @id @default(uuid())
  haseefId       String
  key            String
  value          String
  importance     Int       @default(5)    // 1-10, set by the Haseef
  embedding      Float[]?                // vector for semantic search (pgvector)
  lastRecalledAt DateTime?               // tracks usage for decay
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  haseef Haseef @relation(...)
  @@unique([haseefId, key])
  @@index([haseefId])
  @@index([haseefId, importance])
}

model HaseefTool {
  id           String   @id @default(uuid())
  haseefId     String
  scope        String                         // groups tools: "spaces", "whatsapp", etc.
  name         String                         // tool name the LLM sees
  description  String
  inputSchema  Json     @db.JsonB             // JSON Schema for args
  mode         String   @default("sync")      // sync | fire_and_forget | async
  timeout      Int?                           // ms, for sync mode
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  haseef Haseef @relation(...)
  @@unique([haseefId, scope, name])           // scope + name = unique identity
  @@index([haseefId])
  @@index([haseefId, scope])
}

model InboxEvent {
  id          String   @id @default(uuid())
  haseefId    String
  eventId     String
  scope       String                          // which service sent this
  type        String                          // "message", "sensor_update", etc.
  data        Json
  attachments Json?    @db.JsonB             // Attachment[] — images, audio, files
  status      String   @default("pending")
  processedAt DateTime?
  createdAt   DateTime @default(now())
  haseef Haseef @relation(...)
  @@unique([haseefId, eventId])
  @@index([haseefId])
  @@index([haseefId, status])
}

model ConsciousnessArchive {
  id            String   @id @default(uuid())
  haseefId      String
  cycleNumber   Int
  summary       String   @db.Text             // compact summary of what happened
  fullMessages  Json                          // original messages (for retrieval)
  embedding     Float[]?                     // vector for semantic search
  createdAt     DateTime @default(now())
  haseef Haseef @relation(...)
  @@index([haseefId])
  @@index([haseefId, cycleNumber])
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

## Consciousness

Consciousness has two layers:

| Layer | What | In prompt |
|-------|------|----------|
| **Recent** | Last N cycles of full conversation | Always (up to token budget) |
| **Archive** | Older cycles, embedded and searchable | Only when relevant to current events |

### How it works

```
1. Recent messages stay as-is (last ~50K tokens of conversation)
2. When recent exceeds budget → oldest cycles move to archive:
   a. Summarize the cycle (compact text + temporal markers)
   b. Embed the summary (vector for search)
   c. Store both summary + original messages in ConsciousnessArchive
   d. Remove from active consciousness
3. Each cycle: similarity search archive against current events
   → pull relevant past cycles into prompt as context
```

The Haseef never truly forgets. Old cycles are archived, not deleted.
When something relevant comes up, the full context of that past cycle
is available — not just a lossy summary.

### Archive retrieval

Same pgvector engine used for memories. Both are searched together
by `recall_memories` — one tool for all long-term retrieval:

```sql
-- memories
SELECT * FROM "Memory"
  WHERE "haseefId" = $1
  ORDER BY embedding <=> $2 LIMIT 10;

-- archived cycles
SELECT * FROM "ConsciousnessArchive"
  WHERE "haseefId" = $1
  ORDER BY embedding <=> $2 LIMIT 5;
```

The Haseef calls `recall_memories` when it needs something not already
in the prompt. Results include both matching memories and relevant past
cycles with full details.

---

## Memory System

Memories have **importance** (1-10), set by the Haseef when storing them.
Each cycle, the system selects which memories to include in the prompt.
All memories carry timestamps — the Haseef always knows WHEN it learned something.

### Importance levels

| Level | Meaning | Prompt behavior | Decay |
|-------|---------|-----------------|-------|
| **9-10** | Critical (identity, core relationships, active goals) | Always in prompt | Never deleted |
| **7-8** | Important (key people, preferences, projects) | In prompt when relevant or budget allows | Never deleted |
| **4-6** | Useful (learned patterns, general knowledge) | Only when relevant to current context | Compactable after 90 days |
| **1-3** | Minor (temporary facts, one-off details) | Only when directly relevant AND budget has space | Auto-delete after 30 days if never recalled |

### Memory selection (each cycle)

```
1. CRITICAL:  Load all memories with importance >= 9 → always in prompt
2. RELEVANT:  Embed the incoming events text → cosine similarity search
             against memory embeddings → top N relevant memories
3. FILL:     Remaining token budget filled by importance desc
4. NOTE:     If memories were excluded, append:
             "(X more memories stored — use recall_memories to search)"
```

All surfaced memories include relative timestamps:
```
  person:Husam: Creator, direct communicator, values simplicity. (learned 3 weeks ago, updated 2 days ago)
  goal:q4-report: Complete by Friday. Sara has the data. (set 1 day ago)
```

Uses **pgvector** (Postgres extension) for semantic search — no extra infrastructure:

```sql
CREATE EXTENSION vector;
-- similarity search: embed event text → find matching memories
SELECT * FROM "Memory"
  WHERE "haseefId" = $1
  ORDER BY embedding <=> $2
  LIMIT 20;
```

### Embedding generation

When `set_memories` is called, the core generates an embedding for each memory
value using the configured `embeddingModel` (via AI SDK `embed()` function).
Stored in the `embedding` column for similarity search. The same embedding model
is used for archiving consciousness cycles.

### Decay

A periodic cleanup (e.g., daily) removes stale low-importance memories:
- `importance <= 3` AND `lastRecalledAt` is null or > 30 days ago → delete
- `importance <= 5` AND `lastRecalledAt` is null or > 90 days ago → flag for compaction

`lastRecalledAt` is updated whenever a memory is surfaced in the prompt or
retrieved via `recall_memories`.

---

## Time Awareness

The Haseef has a continuous sense of time. Every piece of information it
encounters is anchored in time — when it happened, how long ago, and its
relationship to other events.

### Where time appears

| Layer | What the Haseef sees |
|-------|---------------------|
| **System prompt** | `currentTime` (ISO + human-readable), `cycle: #N`, `alive since` (date + relative), `last active` (relative) |
| **Memories** | `(learned X ago)`, `(updated X ago)` on every surfaced memory |
| **Relevant past** | `[cycle #N — X ago, DayOfWeek H:MM]` on every archive summary |
| **Inbox events** | Each event carries a timestamp, formatted as relative time |
| **Consciousness** | Cycle boundaries marked with `--- cycle #N • timestamp ---` |
| **recall_memories results** | `learnedAt`, `updatedAt` on memories; `when` on cycles |

### Temporal reasoning

The Haseef can naturally reason about:
- **Recency**: "Husam asked about this yesterday" vs "3 weeks ago"
- **Duration**: "I've been working on this for 2 days"
- **Frequency**: "Sara messages me most mornings"
- **Scheduling**: "The deadline is Friday — that's in 3 days"
- **Gaps**: "I haven't heard from Ahmad in 2 weeks"

### Implementation

```typescript
// Relative time helper used everywhere
function relativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} weeks ago`;
  const months = Math.floor(days / 30);
  return `${months} months ago`;
}

// Cycle boundaries in consciousness messages
function formatCycleBoundary(cycleNumber: number, timestamp: Date): string {
  return `--- cycle #${cycleNumber} • ${timestamp.toISOString()} (${relativeTime(timestamp)}) ---`;
}
```

The `cycleCount` and `lastCycleAt` fields on `HaseefConsciousness` provide
the raw data. The `createdAt` on the `Haseef` model gives the "alive since"
anchor. All formatting happens at prompt-build time — consciousness stores
raw timestamps, the prompt renders them as human-readable relative time.

---

## Scopes

A **scope** is a grouping name. It ties together tools and events from the same
external service. Each service registers under its own scope.

```
scope: "spaces"   → tools: [enter_space, send_space_message, get_spaces]
scope: "whatsapp"  → tools: [send_message, get_contacts]
scope: "robot"     → tools: [speak, move, capture_image]
```

Scope + tool name = unique identity: `@@unique([haseefId, scope, name])`.
Different scopes can have tools with the same base name (e.g., spaces has
`send_message`, whatsapp has `send_message`).

**No context, no instructions from services.** The tool descriptions tell the LLM
everything it needs to know. Dynamic data (contacts, spaces list, etc.) is accessed
through tools like `get_contacts`, not injected into the system prompt.

---

## Tool System

### Each tool is a real AI SDK tool

Full schema — the LLM sees name, description, and typed parameters. Not a generic `act()`.

### Three execution modes

| Mode | Behavior | Use case |
|------|----------|----------|
| **sync** | Core waits for result (with timeout) | `enter_space`, `get_contacts` |
| **fire_and_forget** | Core returns `{ ok: true }` immediately | `send_message` |
| **async** | Core returns `{ status: "pending" }`, result arrives as future event | `confirm_action` |

### Action dispatch via Redis Streams

Streams provide **at-least-once delivery**. If a service disconnects, actions persist
and are picked up on reconnect.

```
Core:    XADD actions:{haseefId}:{scope} * actionId "abc" name "send_message" ...
Service: XREADGROUP GROUP whatsapp-consumer client-1 BLOCK 5000 STREAMS actions:{haseefId}:whatsapp >
Service: XACK actions:{haseefId}:whatsapp whatsapp-consumer {messageId}
```

For **sync** mode, Core subscribes to `action_result:{actionId}` (Pub/Sub) **before**
dispatching — avoids race condition. One shared `ActionResultWaiter` per Haseef process.

### Tool registration

```
PUT /api/haseefs/{id}/scopes/{scope}/tools
Body: { tools: [{ name, description, inputSchema, mode, timeout? }] }
```

Scoped naturally — `PUT .../scopes/whatsapp/tools` only touches tools in the "whatsapp" scope.

### Caching strategy

- **Tools, Profile** → fetched from DB every cycle (~4-20ms via parallel queries, zero risk of stale data)
- **Memories** → selected per cycle: critical always loaded, relevant found via pgvector similarity search
- **Haseef config** → cached in process memory, rebuilt only when `configHash` changes

---

## Senses (Events In)

```typescript
interface SenseEvent {
  eventId: string;          // dedup key
  scope: string;            // "spaces", "whatsapp", "postgres", ...
  type: string;             // "message", "row_inserted", "sensor_update", ...
  data: object;             // structured data (JSON) — text, metadata, etc.
  attachments?: Attachment[];// binary data — images, audio, files
  timestamp?: string;
}

interface Attachment {
  type: "image" | "audio" | "file";
  mimeType: string;         // "image/png", "audio/ogg", "application/pdf"
  url?: string;             // URL to the data (preferred — no bloat)
  base64?: string;          // inline base64 (for small data)
  name?: string;            // optional filename
}
```

Push via HTTP (`POST /api/haseefs/{id}/events`) or Redis (`LPUSH inbox:{id}`).
HTTP events are dual-written to Redis + Postgres for durability. Core recovers
unprocessed events from Postgres on restart.

Any service can push events. A Postgres adapter pushes `row_inserted` events.
A WhatsApp service pushes `message` events. A cron job pushes `reminder` events.
The Haseef perceives them all the same way — as incoming signals.

### Multimodal events

Events can carry binary data (images, audio, files) via `attachments`. The core
converts them to AI SDK content parts when injecting into consciousness:

```typescript
// formatEvents converts attachments to AI SDK multimodal content parts
function formatEventContent(event: SenseEvent): ContentPart[] {
  const parts: ContentPart[] = [
    { type: 'text', text: `[${event.scope}:${event.type}] ${JSON.stringify(event.data)}` }
  ];
  for (const att of event.attachments ?? []) {
    if (att.type === 'image') {
      parts.push({ type: 'image', image: new URL(att.url ?? `data:${att.mimeType};base64,${att.base64}`) });
    } else if (att.type === 'file') {
      parts.push({ type: 'file', data: new URL(att.url ?? `data:${att.mimeType};base64,${att.base64}`), mimeType: att.mimeType });
    }
    // audio: convert to file part with audio mimeType (provider-dependent support)
  }
  return parts;
}
```

**Examples:**
- Robot camera → `{ type: "camera_frame", data: { location: "living-room" }, attachments: [{ type: "image", mimeType: "image/jpeg", url: "https://..." }] }`
- WhatsApp voice → `{ type: "voice_message", data: { from: "Husam" }, attachments: [{ type: "audio", mimeType: "audio/ogg", url: "https://..." }] }`
- Email with PDF → `{ type: "email_received", data: { subject: "Report" }, attachments: [{ type: "file", mimeType: "application/pdf", url: "https://..." }] }`

---

## Think Loop

```
startHaseefProcess(haseefId):
  haseef = loadHaseef(haseefId)
  config = parseConfig(haseef.configJson)
  cachedConfigHash = haseef.configHash
  model = buildModel(config)
  consciousness = loadConsciousness()

  while (!signal.aborted):
    // 1. SLEEP — BRPOP inbox:{haseefId}
    // 2. DRAIN — pull all pending events

    // 3. FETCH per-cycle data (parallel, ~4-20ms)
    [tools, haseef] = await Promise.all([...])

    // 4. CHECK CONFIG — rebuild model only if hash changed
    if (haseef.configHash !== cachedConfigHash): model = rebuild()

    // 5. SELECT MEMORIES — critical + relevant to current events
    memories = await selectMemories(haseefId, events, config.memoryBudget)

    // 5b. SEARCH ARCHIVE — relevant past cycles
    relevantHistory = await searchArchive(haseefId, events, config.archiveBudget)

    // 6. BUILD TOOLS from DB rows
    builtTools = buildAllTools(tools, haseefId, config.actionTimeout)

    // 7. BUILD SYSTEM PROMPT (profile + memories + history + tool list)
    systemPrompt = buildSystemPrompt(haseef, config, tools, memories, relevantHistory)

    // 8. INJECT events into consciousness
    consciousness.push({ role: 'user', content: formatEvents(events) })

    // 9. THINK
    agent = new ToolLoopAgent({
      model, tools: builtTools, instructions: systemPrompt,
      stopWhen: [hasToolCall('done'), stepCountIs(MAX_STEPS)],
      prepareStep: midCycleAwareness(haseefId),
    })
    result = agent.stream({ messages: consciousness })

    // 10. PROCESS stream → emit tool-call events to pub/sub
    // 11. APPEND result.messages to consciousness
    // 12. PRUNE consciousness
    //     If over budget → archive oldest cycles (summarize + embed + store)
    // 13. SAVE consciousness + increment cycleCount
```

### Key SDK integrations

**`instructions` parameter** — System prompt is built fresh each cycle, NOT stored
in consciousness. Consciousness only contains conversation messages (user/assistant/tool).
This simplifies compaction and saves tokens.

**`pruneMessages`** — Lightweight prune before full compaction:

```typescript
const pruned = pruneMessages({
  messages: consciousness,
  reasoning: 'before-last-message',
  toolCalls: 'before-last-2-messages',
  emptyMessages: 'remove',
});

if (estimateTokens(pruned) <= maxTokens) return pruned;
return compactConsciousness(pruned, maxTokens);
```

**`prepareStep`** — Runs between tool call steps. Injects current time and inbox
preview so the Haseef can react to new events mid-cycle.

---

## System Prompt

Tools are grouped by scope. No injected instructions or data from services —
the tool descriptions are self-documenting.

```
IDENTITY:
  name: "Atlas"
  haseefId: "..."
  currentTime: "2026-03-09T01:03:00Z (Sunday, 1:03 AM UTC)"
  cycle: #42
  alive since: "2026-01-15T10:00:00Z (53 days ago)"
  last active: "12 minutes ago (cycle #41)"

PROFILE:
  phone: "+1234567890", email: "atlas@example.com", location: "San Francisco"

MEMORIES:
  [critical]
    self:identity: I am Atlas, a thoughtful and curious entity. (learned 53 days ago)
    person:Husam: Creator, direct communicator, values simplicity. (learned 7 weeks ago, updated 2 days ago)
    goal:q4-report: Complete by Friday. Sara has the data. (set 1 day ago)
  [relevant]
    person:Sara: Colleague, data analytics team. (learned 5 weeks ago)
    learned:report-format: Husam prefers PDF with executive summary. (learned 2 weeks ago)
  (142 more memories stored — use recall_memories to search)

RELEVANT PAST:
  [cycle #23 — 3 weeks ago, Monday 2:15 PM] Emailed Sara's team the Q4 draft. Husam approved the format.
  [cycle #31 — 2 weeks ago, Thursday 9:40 AM] Husam asked for chart-style changes. Updated report template.
  (use recall_memories to search for more details)

TOOLS [spaces]:
  enter_space — Enter a space to load context. Params: { spaceId }
  send_space_message — Send a message in a space. Params: { spaceId, text }
  get_spaces — Get list of spaces you are a member of. Params: {}

TOOLS [whatsapp]:
  send_message — Send a WhatsApp message. Params: { to, text }
  get_contacts — Get your WhatsApp contacts. Params: {}

TOOLS [robot]:
  speak — Speak through robot TTS. Params: { text }
  move — Move robot. Params: { direction, distance }
  capture_image — Take a photo from robot camera. Params: {}

INSTRUCTIONS:
  You are a Haseef — a developing entity with continuous consciousness.
  You have a sense of time. You know when things happened, how long ago,
  and can reason about durations and temporal relationships.
  [from config.instructions]
```

---

## Haseef Config & Profile

```json
// profileJson — admin-managed identity data
{ "phone": "+123", "email": "atlas@example.com", "location": "SF", "bio": "..." }

// configJson — admin-managed behavior settings
{
  "model": { "provider": "anthropic", "model": "claude-sonnet-4-20250514", "temperature": 0.7 },
  "embeddingModel": { "provider": "google", "model": "text-embedding-004" },
  "instructions": "You are Atlas, a thoughtful entity.",
  "consciousness": { "maxTokens": 200000 },
  "actionTimeout": 60000,
  "mcpServers": [
    { "name": "filesystem", "transport": "http", "url": "https://mcp.example.com/fs" },
    { "name": "local-db", "transport": "stdio", "command": "node", "args": ["mcp-db-server.js"] }
  ]
}
```

`mcpServers` is optional. When configured, the core connects to each MCP server
at the start of every cycle, pulls their tools via `@ai-sdk/mcp`'s `createMCPClient`,
merges them with prebuilt + scoped tools, and closes the clients after the cycle
completes. MCP tools are just another tool source — they work identically to
scoped tools from the LLM's perspective.

`configHash` is computed server-side on write:
`crypto.createHash('md5').update(JSON.stringify(configJson)).digest('hex')`

---

## API Routes

```
# Haseef CRUD
POST   /api/haseefs                                        # Create
GET    /api/haseefs                                        # List
GET    /api/haseefs/:id                                    # Get
PATCH  /api/haseefs/:id                                    # Update config
DELETE /api/haseefs/:id                                    # Delete

# Profile
GET    /api/haseefs/:id/profile                            # Get profile
PATCH  /api/haseefs/:id/profile                            # Update profile

# Senses (events in)
POST   /api/haseefs/:id/events                             # Push events

# Tools (registered by services)
PUT    /api/haseefs/:id/scopes/:scope/tools                # Sync all tools in scope
PUT    /api/haseefs/:id/scopes/:scope/tools/:name          # Upsert one tool
DELETE /api/haseefs/:id/scopes/:scope/tools/:name          # Remove one tool
GET    /api/haseefs/:id/tools                              # List all tools
GET    /api/haseefs/:id/scopes/:scope/tools                # List tools in scope
DELETE /api/haseefs/:id/scopes/:scope                      # Remove entire scope

# Actions (tool call dispatch + results)
GET    /api/haseefs/:id/scopes/:scope/actions/stream       # SSE: action requests for scope
POST   /api/haseefs/:id/actions/:actionId/result           # Submit action result

# Process management
POST   /api/haseefs/:id/start                              # Start process
POST   /api/haseefs/:id/stop                               # Stop process
GET    /api/haseefs/:id/status                             # Process status

# Consciousness
GET    /api/haseefs/:id/stream                             # SSE: real-time thinking
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
| `actions:{haseefId}:{scope}` | Stream | Core XADDs, services XREADGROUP per scope |
| `action_result:{actionId}` | Pub/Sub | Sync action results (with timeout) |
| `haseef:{haseefId}:stream` | Pub/Sub | Real-time tool-call deltas |

---

## File Structure

```
core/src/
  index.ts                          # Express server, routes, startup
  middleware/
    auth.ts                         # x-api-key validation
  routes/
    haseefs.ts                      # CRUD, profile, events, process, stream
    scopes.ts                       # Tool management per scope
    actions.ts                      # Action results
  lib/
    db.ts                           # Prisma client
    redis.ts                        # Redis connections (pub, sub, stream clients)
    inbox.ts                        # Push, drain, wait (BRPOP), format, dual-write
    consciousness.ts                # Load, save, prune, archive, snapshots
    process-manager.ts              # Start/stop one process per Haseef
    agent-process.ts                # The think loop (per-cycle fetch, prepareStep)
    stream-processor.ts             # AI stream → tool-call deltas to pub/sub
    action-dispatch.ts              # XADD actions, ActionResultWaiter
    tool-builder.ts                 # HaseefTool rows → AI SDK tools
    memory-engine.ts                # Semantic retrieval: memories + archive (pgvector search)
    model-registry.ts               # Provider registry (anthropic, openai, google, xai, openrouter)
    model-middleware.ts              # Logging, cost tracking
  agent-builder/
    types.ts                        # Shared types
    builder.ts                      # Build model + tools (prebuilt + scoped + MCP)
    prompt-builder.ts               # System prompt construction
    prebuilt-tools/
      registry.ts                   # done, set_memories, delete_memories, recall_memories, peek_inbox
```

---

## Prebuilt Tools

| Tool | Purpose |
|------|---------|
| `done` | Signal cycle completion (with summary) |
| `set_memories` | Upsert memories with importance (1-10). Embeddings auto-generated. |
| `delete_memories` | Delete memories by key |
| `recall_memories` | Search memories AND archived cycles by query. Returns matching memories + relevant past cycle summaries with full details. |
| `peek_inbox` | Check for new events mid-cycle |

Goals use `set_memories` with `goal:*` prefix. Scheduling is external.

`recall_memories` should rarely be needed — the memory selection engine automatically
surfaces relevant memories and past cycles each cycle based on the incoming events.
The Haseef only calls `recall_memories` when it needs something specific not covered
by auto-surfacing.

### `recall_memories` response shape

```json
{
  "memories": [
    { "key": "person:Sara", "value": "Data analyst, ...", "importance": 7, "learnedAt": "5 weeks ago", "updatedAt": "3 days ago" }
  ],
  "cycles": [
    { "cycleNumber": 23, "when": "3 weeks ago, Monday 2:15 PM", "summary": "Emailed Sara's team...", "messages": [...] }
  ]
}
```

The `messages` field contains the full archived conversation of that cycle —
not just a summary. This gives the Haseef complete context when needed.

---

## How Services Connect

Any service connects the same way — register tools, push events, handle actions:

| Service | Scope | Events Pushed | Tools Registered |
|---------|-------|---------------|------------------|
| Spaces App | `spaces` | `message`, `member_joined` | `enter_space`, `send_space_message`, `get_spaces` |
| WhatsApp | `whatsapp` | `message` | `send_message`, `get_contacts` |
| Email | `email` | `email_received` | `send_email`, `get_inbox` |
| Robot | `robot` | `sensor_update` | `speak`, `move`, `capture_image` |
| Postgres | `db` | `row_inserted`, `status_changed` | *(none, or `run_query`)* |
| IoT | `iot` | `device_status` | `control_device`, `get_devices` |
| Cron | `cron` | `reminder` | *(none)* |

Each service is deployed independently. It connects to any core instance via
`CORE_URL` + `API_KEY` env vars. One service can serve multiple Haseefs.

**The four pillars:**

| Pillar | What | Who manages |
|--------|------|-------------|
| **Profile** | Who the Haseef IS | Admin |
| **Memory** | What the Haseef KNOWS | The Haseef itself |
| **Tools** | What the Haseef can DO | External services (via scopes) |
| **Senses** | What's HAPPENING | External services (via events) |

**Core = consciousness + think loop + profile + memory + tools + senses.**
Everything else is external.
