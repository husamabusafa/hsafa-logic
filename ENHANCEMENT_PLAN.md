# Hsafa Enhancement Plan

> Comprehensive plan for simplifying, generalizing, and enhancing hsafa-core and hsafa-spaces.

---

## Table of Contents

1. [Extension System — Easier to Use & Build](#1-extension-system)
2. [Code Simplification & Dead Code Removal](#2-simplification)
3. [hsafa-spaces — Stability & Generalization](#3-spaces-generalization)
4. [Tools & Simple Message UI](#4-tools-and-ui)
5. [Extension SDK (Node.js & Python)](#5-extension-sdk)
6. [Smart Ideas & Architectural Improvements](#6-smart-ideas)

---

## 1. Extension System — Easier to Use & Build {#1-extension-system}

### What Extensions Actually Are

**Extensions are independent services** — not thin adapters. `hsafa-spaces/use-case-app` is the best example: it's a full Next.js application with its own Postgres DB, Redis, UI, auth, business logic, entity system, and membership management. It ALSO acts as a Core extension by exposing a manifest and webhook. That is the primary model.

Some extensions are simpler adapter-style services (like ext-whatsapp or ext-gmail) — they don't need their own DB, they just bridge a third-party API. But this is the minority case. The architecture must support both:

| Extension Type | Example | Has own DB | Has own UI |
|---------------|---------|-----------|------------|
| Full Service | hsafa-spaces, ext-economy | ✅ | ✅ |
| Adapter | ext-whatsapp, ext-gmail | ❌ | ❌ |
| Hybrid | ext-calendar | optional | optional |

The connection contract between a service and Core is minimal: expose a `/manifest` (what tools and senses you offer) and a `/webhook` (receive tool calls and lifecycle events from Core). That's it — the service's internal architecture is its own business.

### Current Pain Points

Installing and wiring an extension is still too manual:
- Manual registration via `POST /api/extensions` with secret key
- Manual connection to each Haseef via `POST /api/haseefs/:id/extensions/:extId/connect`
- Redis subscription for tool call routing (`ext:{extId}:tools` channel) — unnecessary for most services
- Duplicated bootstrap code across every extension (CoreClient, config loading, self-discovery)

### Proposed Changes

#### 1.1 — Declarative Extension Registration (Install-and-Use) ✅ DONE

> **Status**: Implemented `POST /api/extensions/install` — one-step install from URL. Core fetches manifest, derives name/description/instructions, registers, returns extension key. Also sends `extension.installed` lifecycle webhook.

**Problem**: Installing an extension is a multi-step manual process.

**Solution**: One-command install with auto-discovery.

```
POST /api/extensions/install
{
  "url": "https://my-extension.com"    // OR npm package name
}
```

Core fetches the manifest, auto-registers, and returns the extension key. The manifest already declares everything needed (name, tools, instructions, config schema, events).

**Manifest v2** — add these fields:
```json
{
  "name": "ext-whatsapp",
  "version": "1.0.0",
  "description": "...",
  "tools": [...],
  "instructions": "...",
  "configSchema": {...},
  "events": ["message", "status_update"],
  
  // NEW fields:
  "autoConnect": true,           // Auto-connect to all Haseefs on install
  "requiredConfig": ["phoneNumber"], // Config fields that MUST be set before activation
  "healthCheck": "/health",      // Endpoint Core pings to verify extension is alive
  "capabilities": ["sense", "act"]   // What this extension provides
}
```

#### 1.2 — Webhook-First Tool Routing ✔️ ALREADY DONE

`extension-manager.ts` already uses webhook-first routing. Tool calls go via synchronous `POST {url}/webhook` with HTTP response. No Redis pub/sub, no PendingToolCall for extension tools. Nothing to change here.

#### 1.3 — Extension Lifecycle Webhooks (Already Exists, Formalize) ✅ DONE

Core already sends lifecycle webhooks (`haseef.connected`, `haseef.disconnected`, `haseef.config_updated`). Now also sends:
- `extension.installed` — sent once after registration via `installExtension()` in extension-manager.ts
- `extension.health_check` — ⏭️ deferred (periodic ping not yet implemented)

#### 1.4 — Per-Haseef Connection Config (Core-Side Storage)

**What lives in Core**: The **connection config** between a Haseef and a service — the minimal info the service needs to bridge the Haseef into its world. This lives in `HaseefExtension.config` JSON (already exists):
- ext-whatsapp: `{ "phoneNumber": "+1234567890" }` — which phone number belongs to this Haseef
- ext-spaces: `{ "agentEntityId": "...", "connectedSpaceIds": [...] }` — which entity and spaces this Haseef maps to
- ext-email: `{ "emailAddress": "haseef@example.com" }` — which mailbox this Haseef owns

**What lives in the service's own DB**: Everything else. The spaces-app owns its space messages, entities, memberships, and all space logic — that lives in the spaces-app DB, not Core. An extension service is free to have as large a database as it needs.

---

## 2. Code Simplification & Dead Code Removal {#2-simplification}

### 2.1 — hsafa-core Simplifications

#### `agent-process.ts` (484 lines)
- **Lines ~80-130 (normalizeSystemMessages)**: This Anthropic compatibility hack (`system` role not supported in non-first position) can be extracted to a small utility. Consider moving to a `lib/model-compat.ts` file.
- **Lines ~200-280 (error classification + degradation)**: ✅ **DONE — Model degradation removed.** After 3 consecutive failures, Core no longer silently downgrades to `gpt-4o-mini`. Errors now back off and retry with the original model only.
- **Lines ~330-400 (stream consumption + consciousness save)**: The post-stream processing (extract tool calls, save consciousness, update run) is a long sequential block. Extract to `finalizeCycle(runId, streamResult, consciousness)`.

#### `extension-manager.ts` (425 lines)
- **`notifyExtension` + `buildExtensionTools`**: These two functions together handle both webhook-based and Redis-based tool routing with overlapping logic. After implementing webhook-first (§1.2), this simplifies significantly — one path for most extensions.
- **Remove `fetchManifest` complexity**: The manifest fetch with retry/timeout can use a simple fetch + zod parse. Current code has too many edge cases for malformed manifests.

#### `prompt-builder.ts` (473 lines)
- **Good as-is for identity features**, but the `buildInstructionsSection` hardcodes behavioral text. Consider making this a template file (`instructions.md`) that can be edited without code changes.
- **`buildInnerLifeSection`**: ✅ **DONE — Entire function removed.** Score-based nudges were injecting synthetic self-knowledge. The raw memories/goals/plans are already in the prompt and the AI reasons about them directly.

#### `consciousness.ts` (497 lines)
- **Identity pattern matching (lines 275-317)**: The 30+ regex patterns for `SELF_PATTERNS`, `RELATIONSHIP_PATTERNS`, `WILL_PATTERNS` are brittle. Consider a simpler approach: tag summaries based on which tools were called in the cycle (set_memories with self:* key → self tag, set_goals → will tag). This is **deterministic** vs regex guessing.
- **`extractCycleSummary`**: Currently walks backwards to find the last assistant text. After implementing the `done()` tool with summary text (already exists), use the done() summary directly instead of guessing.

#### `inbox.ts` (472 lines)
- **`migrateLegacyType`** (lines 344-352): ⏭️ DEFERRED — harmless safety net for crash recovery. Remove after confirming no v3 events exist in production.
- **`formatInboxPreview`** (lines 446-471): ✅ Verified — actively used in `agent-process.ts` prepareStep. Keep as-is.

### 2.2 — hsafa-spaces Simplifications

#### `lib/extension/index.ts` (366 lines)
- **`handleLifecycle`** (lines 105-213): The entity resolution logic (find entity by name, resolve spaces) runs on every connect. This should be a one-time setup stored in config, not repeated.
- **Redis subscriber per connection** (lines 163-200): Each connected Haseef gets its own Redis subscriber for the stream bridge. This doesn't scale. Use a single shared subscriber with message routing by haseefId.
- **globalThis pattern** (lines 46-50): Necessary for Next.js dev mode but adds complexity. Document clearly why it exists.

#### `lib/extension/manifest.ts`
- **Good as-is.** Clean declarative manifest.

#### `lib/space-service.ts` (100 lines)
- **Lines 66-92 (entity + space lookup for inbox notification)**: ✅ **DONE — Now uses cached `getEntityInfo()` + `getSpaceName()` from membership-service.ts.** No DB hit on repeat messages from same entity/space (60s TTL cache).

### 2.3 — Dead Code Candidates

| File | What | Status |
|------|------|--------|
| `hsafa-core/extensions/ext-spaces/` | Old standalone ext-spaces | ✅ **Deleted** — merged into spaces-app |
| `hsafa-core/old-hsafa/` | Legacy v1/v2 code | ✅ **Deleted** — superseded by v4 |
| `hsafa-spaces/rn-app/` | React Native app skeleton | **Review** — likely outdated |
| `hsafa-spaces/sdks/react-native-sdk/` | RN SDK | **Review** — may need update or removal |
| `inbox.ts` → `migrateLegacyType` | v3 migration helper | **Remove** after data migration |
| `inbox.ts` → `formatInboxPreview` | Verified: actively used | ✅ Keep — used in agent-process.ts |

---

## 3. hsafa-spaces — Stability & Generalization {#3-spaces-generalization}

### Core Philosophy: Treat Haseefs Like Humans

The key insight: a Haseef in a space should be **indistinguishable from a human participant** at the data/API level. Currently there are subtle differences that leak the "agent" abstraction.

### 3.1 — Unified Entity Model ✅ DONE

**Current**: ~~Entities have `type: "human" | "agent"` and the code branches on this in several places:~~
- ~~`space-service.ts` line 66: `if (role === "assistant")` skip inbox notification~~
- ~~`extension/index.ts` line 332: `if (role === "assistant") return` — skip own messages~~

**Fixed**:
- `space-service.ts`: Always notifies the extension inbox (no role filtering)
- `extension/index.ts`: Filters by `entityId === conn.agentEntityId` instead of `role === "assistant"`
- Two Haseefs in the same space now correctly receive each other's messages

**Changes**:
```typescript
// extension/index.ts — handleInboxMessage
// BEFORE:
if (role === "assistant") return;
// AFTER:
if (entityId === conn.agentEntityId) return; // Skip own messages only
```

```typescript
// space-service.ts — postSpaceMessage
// BEFORE:
if (role !== "assistant") { notifyNewMessage(...) }
// AFTER:
// Always notify — let the extension filter by entityId
notifyNewMessage(...);
```

### 3.2 — Generalized Space Membership

**Current**: When a Haseef connects to ext-spaces, the extension resolves `agentEntityId` by name matching (`prisma.entity.findFirst({ displayName: haseefName, type: "agent" })`). This is fragile.

**Proposed**:
- On Haseef connection, Core sends the Haseef's identity in the lifecycle webhook
- ext-spaces creates/finds the entity automatically using a deterministic ID scheme
- Config stores `agentEntityId` so subsequent connections are instant

```json
// Lifecycle webhook payload
{
  "type": "haseef.connected",
  "haseefId": "uuid",
  "haseefName": "Atlas",
  "config": { "agentEntityId": "entity-uuid" }
}
```

### 3.3 — Space Auto-Discovery

**Current**: `connectedSpaceIds` must be configured manually or resolved by listing all entity memberships. This doesn't react to new spaces being created.

**Proposed**: 
- Default behavior: Haseef listens to **all spaces** it's a member of (already works this way)
- When a Haseef is added to a new space → extension detects this via DB trigger or membership-service cache invalidation → updates the connection's spaceIds
- Add a `membership.changed` event that the extension subscribes to

### 3.4 — Single Redis Subscriber (Stability Fix) ✅ DONE

**Fixed**: Replaced per-haseef Redis subscribers with a single shared `psubscribe('haseef:*:stream')` subscriber in `extension/index.ts`. One Redis connection for all haseef stream bridges. The `ActiveConnection` no longer holds a subscriber reference — the shared subscriber routes events by extracting the haseefId from the channel name. Event bridging extracted into a standalone `bridgeStreamEvent()` function.

### 3.5 — Graceful Reconnection ✅ DONE

**Fixed**: The shared Redis subscriber (§3.4) now uses `retryStrategy` with exponential backoff (500ms → 30s cap). Connection state transitions are logged via `error` and `connect` event handlers. No more silent error swallowing.

---

## 4. Tools & Simple Message UI {#4-tools-and-ui}

### 4.1 — Run Event Stream for Extensions (Preserve & Leverage)

`stream-processor.ts` already publishes rich real-time events to Redis `haseef:{haseefId}:stream` during every think cycle. Extensions can and should subscribe to this stream. **These events must NOT be removed** — they are the foundation of any streaming-capable extension.

**Full event set published today:**

| Event | Payload | Use in extension |
|-------|---------|-----------------|
| `run.start` | `{ runId, haseefId }` | Show "Haseef is thinking…" indicator |
| `text.delta` | `{ text, runId }` | Stream internal reasoning text (if exposed) |
| `tool.started` | `{ streamId, toolName, runId }` | Show "Atlas is calling **search_web**…" |
| **`tool-input.delta`** | `{ streamId, toolName, delta, runId }` | **Stream tool arguments as they're generated** |
| `tool.ready` | `{ streamId, toolName, args, runId }` | Tool args complete — show full query before execution |
| `tool.done` | `{ streamId, toolName, result, runId }` | Tool completed — show result in UI |
| `tool.error` | `{ streamId, toolName, error, runId }` | Tool failed |
| `step.finish` | `{ finishReason, runId }` | LLM step complete |
| `run.finish` | `{ runId, haseefId }` | Haseef cycle complete — hide thinking indicator |

**Why `tool-input.delta` matters for extensions:**
The model generates tool arguments character by character. As the Haseef types `search_web({ query: "latest AI news" })`, the extension sees `q`, `qu`, `que`, `quer`... in real-time. This enables:
- Spaces: show *"Atlas is searching for: 'latest AI news'"* as it appears, not after
- Any service: live previews of what the Haseef is about to do before it executes
- Dashboard: real-time observability of Haseef decision-making

The spaces-app already subscribes to `haseef:{haseefId}:stream` and bridges `run.start` / `run.finish` to `agent.active` / `agent.inactive`. It should also bridge `tool-input.delta` and `tool.done` for the full streaming experience.

### 4.2 — Tool Messages in Extensions

Tool visibility in extension UIs is handled via the **run event stream** (§4.1) — not by changing the message schema. Extensions subscribe to the stream and render tool events (tool.started → tool-input.delta → tool.done) as live `tool_message` UI elements. No DB schema change needed — tool messages are ephemeral streaming events, not stored messages.

---

## 5. Hsafa SDKs — `@hsafa/node` & `hsafa` (Python) {#5-sdks}

### Current State (Problem)

The existing SDKs (`@hsafa/node`, `@hsafa/react`, `@hsafa/ui`, `@hsafa/react-native`, `hsafa` Python) all talk to **spaces-app**. But spaces is just an extension — not the Hsafa system itself. These SDKs are spaces-specific clients, not Hsafa SDKs.

### New Vision: Two General-Purpose SDKs That Talk to Core

**`@hsafa/node`** (TypeScript) and **`hsafa`** (Python) become the **single, general-purpose Hsafa SDK** for each language. They talk directly to **Core**. Everything you can do with Hsafa, you do through these SDKs.

The old spaces-specific SDKs (`@hsafa/react`, `@hsafa/ui`, `@hsafa/react-native`) move into the spaces-app extension itself — they're spaces UI components, not Hsafa SDKs.

### What the SDK Can Do

```typescript
import { Hsafa } from '@hsafa/node';

// === CLIENT MODE (extension key) ===
const hsafa = new Hsafa({
  coreUrl: process.env.CORE_URL,
  extensionKey: process.env.EXTENSION_KEY,
});

// Push sense events to any connected Haseef
await hsafa.pushSense(haseefId, {
  channel: 'ext-weather',
  type: 'alert',
  data: { city: 'London', severity: 'high' },
});

// Subscribe to a Haseef's real-time stream (run events, tool deltas)
hsafa.onStream(haseefId, (event) => {
  if (event.type === 'tool-input.delta') {
    // Real-time tool argument streaming from AI
    process.stdout.write(event.delta);
  }
});

// Return a tool result
await hsafa.returnToolResult(haseefId, toolCallId, { temperature: 12 });

// Self-discover: what Haseefs am I connected to?
const me = await hsafa.me();

// === ADMIN MODE (secret key) ===
const admin = new Hsafa({
  coreUrl: process.env.CORE_URL,
  secretKey: process.env.SECRET_KEY,
});

// Manage Haseefs
const haseef = await admin.haseefs.create({ name: 'Atlas', model: 'openai:gpt-4o' });
await admin.haseefs.update(haseef.id, { instructions: '...' });
const all = await admin.haseefs.list();

// Manage extensions
const ext = await admin.extensions.register({ name: 'ext-weather', url: 'http://...' });
await admin.extensions.connect(haseef.id, ext.id, { city: 'London' });
await admin.extensions.disconnect(haseef.id, ext.id);
await admin.extensions.syncTools(ext.id, [{ name: 'get_weather', ... }]);

// Stream any Haseef (admin has access to all)
admin.onStream(haseefId, (event) => { ... });
```

### Building an Extension with the SDK

The SDK includes an **extension server helper** so building an extension is minimal:

```typescript
import { Hsafa, ExtensionServer } from '@hsafa/node';

const hsafa = new Hsafa({
  coreUrl: process.env.CORE_URL,
  extensionKey: process.env.EXTENSION_KEY,
});

const server = new ExtensionServer(hsafa);

// Register tools — auto-generates manifest
server.tool('get_weather', {
  description: 'Get current weather',
  inputSchema: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
  async execute({ city }, context) {
    return { temperature: await fetchTemp(city) };
  },
});

// Lifecycle hooks
server.on('haseef.connected', (haseefId, name, config) => { ... });

// Start — serves /manifest, /webhook, /health
server.listen(4200);
```

### Python Equivalent

```python
from hsafa import Hsafa, ExtensionServer

hsafa = Hsafa(core_url=os.environ['CORE_URL'], extension_key=os.environ['EXTENSION_KEY'])

server = ExtensionServer(hsafa)

@server.tool('get_weather', description='Get weather', input_schema={...})
def get_weather(city: str, context):
    return {'temperature': fetch_temp(city)}

server.listen(4200)
```

### SDK Architecture

```
@hsafa/node
├── src/
│   ├── hsafa.ts           — Main Hsafa class (client + admin modes)
│   ├── core-client.ts     — HTTP client for Core API
│   ├── stream.ts          — Redis subscriber for haseef:{id}:stream
│   ├── extension-server.ts — Express server for building extensions
│   ├── tool-handler.ts    — Tool execution + result routing
│   ├── sense-manager.ts   — Sense source lifecycle
│   ├── manifest.ts        — Auto-generate manifest from registered tools
│   ├── types.ts           — Shared types
│   └── index.ts           — Barrel export
```

### Key Features

| Feature | Description |
|---------|-------------|
| **Two auth modes** | Extension key (client) or secret key (admin) — same SDK, different capabilities |
| **Haseef stream** | `hsafa.onStream(haseefId, handler)` — subscribe to all run events including `tool-input.delta` |
| **Push senses** | `hsafa.pushSense(haseefId, event)` — send events to any connected Haseef |
| **Tool results** | `hsafa.returnToolResult(haseefId, callId, result)` — return tool execution results |
| **Self-discovery** | `hsafa.me()` — discover this extension's identity and connected Haseefs |
| **Admin CRUD** | `admin.haseefs.*`, `admin.extensions.*` — full Haseef and extension management |
| **Extension server** | `ExtensionServer` — auto-manifest, webhook handling, tool routing, health endpoint |
| **Error handling** | Unhandled tool errors caught and returned as `{ error: "..." }` to Core |
| **Graceful shutdown** | SIGTERM handler stops sense sources and closes connections |

### What Happens to the Old Spaces SDKs

| Old SDK | Action |
|---------|--------|
| `@hsafa/node` (spaces) | **Replaced** — becomes the new general Core SDK |
| `hsafa` Python (spaces) | **Replaced** — becomes the new general Core SDK |
| `@hsafa/react` | **Moves into spaces-app** — it's a spaces UI library, not a Hsafa SDK |
| `@hsafa/ui` | **Moves into spaces-app** — drop-in chat components for spaces |
| `@hsafa/react-native` | **Moves into spaces-app** — mobile chat components for spaces |

---

## 6. Smart Ideas & Architectural Improvements {#6-smart-ideas}

### 6.1 — Extension Marketplace Model ⏭️ DEFERRED

**Vision**: Extensions should be installable like npm packages or app store apps.

**Implementation path**:
1. Standardize manifest format (done in §1.1)
2. Build the Extension SDK (§5) so anyone can build extensions
3. Create a registry (simple JSON file or API) listing available extensions
4. `POST /api/extensions/install { "name": "ext-whatsapp" }` → Core fetches manifest from registry, installs, auto-connects

### 6.2 — Unified Event Bus (Replace Multiple Redis Patterns)

**Current**: Multiple Redis patterns:
- `inbox:{haseefId}` — LPUSH/BRPOP for inbox events
- `haseef:{haseefId}:stream` — PUB/SUB for LLM streaming
- `ext:{extId}:tools` — PUB/SUB for tool call routing
- `smartspace:{spaceId}` — PUB/SUB for space events
- `run:{runId}` — PUB/SUB for run events

**Proposed**: Keep the existing patterns (they serve different purposes) but document them clearly and add a Redis key namespace map in the codebase.

### 6.3 — Consciousness Snapshots ✅ DONE

**Implemented**: Full snapshot system in Prisma schema + consciousness.ts + haseefs.ts routes.
- `ConsciousnessSnapshot` model in schema.prisma (haseefId, cycleCount, messages, tokenEstimate, reason)
- Auto-snapshot every 50 cycles via `maybeAutoSnapshot()` called from agent-process.ts
- Manual snapshot: `POST /api/haseefs/:id/snapshot`
- List snapshots: `GET /api/haseefs/:id/snapshots`
- Restore: `POST /api/haseefs/:id/restore { snapshotId }` — saves pre-restore backup automatically

### 6.5 — Extension Hot-Reload ✔️ ALREADY DONE

`POST /api/extensions/:extId/refresh-manifest` already exists — it re-fetches the manifest from the extension URL and updates tools/instructions in DB. `buildExtensionTools` re-reads from DB on every cycle, so connected Haseefs automatically pick up changes on their next think cycle. Nothing to change here.

### 6.6 — Observability Dashboard ✅ DONE

**Implemented**: `GET /api/status` (secret key required) returns per-haseef stats:
- Running processes (from process-manager)
- Cycle count + token estimate (from consciousness)
- Last run duration + token usage (from runs)
- Failed run count in last 24h
- Inbox depth (pending events)
- Connected extensions
- Server uptime

### 6.7 — Deterministic Consciousness Tagging (Replace Regex) ✅ DONE

**Fixed**: Replaced 30+ regex patterns with deterministic `classifyCycleIdentity()` that scans actual tool calls in the cycle's messages:
- `set_memories` with `self:*` keys → `self` tag
- `set_memories` with `person-model:*` or `about:*` keys → `relationship` tag
- `set_goals`, `delete_goals`, `set_plans`, `delete_plans` → `will` tag

The old `classifyIdentityCritical()` is kept as a lightweight text-based fallback for already-compacted summaries that no longer have tool call data. Compaction now uses `classifyCycleIdentity` as primary, falling back to text-based only when needed.

---

## Implementation Priority

### Phase 1 — Quick Wins (1-2 days each)
1. ✅ Fix the `role === "assistant"` bug in spaces (§3.1) — **critical bug** — FIXED: filter by entityId not role
2. ✅ Single Redis subscriber for stream bridge (§3.4) — DONE: shared psubscribe('haseef:*:stream') with reconnection
3. ✅ Cache entity/space lookups in space-service.ts (§2.2) — DONE: uses cached getEntityInfo/getSpaceName
4. ✅ Delete dead code: ext-spaces, old-hsafa (§2.3) — DONE: both directories deleted
5. ✅ Remove model degradation chain (§2.1) — DONE: no more silent downgrade to gpt-4o-mini
6. ✅ Remove buildInnerLifeSection nudges (§2.1) — DONE: entire function removed

### Phase 2 — General SDK (3-5 days)
1. Build `@hsafa/node` general Core SDK (§5)
2. Build `hsafa` Python general Core SDK (§5)
3. Manifest v2 format (§1.1)
4. ✅ Declarative extension install endpoint (§1.1) — DONE: POST /api/extensions/install

### Phase 3 — Spaces Generalization (2-3 days)
1. Unified entity model — stop branching on type (§3.1)
2. Space auto-discovery (§3.3)
3. ✅ Graceful reconnection (§3.5) — DONE: retryStrategy with backoff + logging

### Phase 4 — Architecture (2-3 days)
1. ✅ Deterministic consciousness tagging (§6.7) — DONE: tool-call-based classifyCycleIdentity()
2. ✅ Consciousness snapshots (§6.3) — DONE: schema + API + auto-snapshot every 50 cycles
3. ✅ Observability dashboard (§6.6) — DONE: GET /api/status
4. Code simplification in agent-process.ts (§2.1)

---

## Summary of Key Principles

1. **Extensions are services** — a full service (with its own DB, UI, auth) OR a thin adapter; both are valid. The contract with Core is just a manifest + webhook.
2. **Connection config lives in Core** — the minimal mapping between a Haseef and a service (entityId, phone number, etc.) lives in `HaseefExtension.config`. The service's own domain data lives in its own DB.
3. **Haseefs are like humans** — no special-casing based on entity type at the data layer. Two Haseefs in the same space should interact naturally.
4. **Two general SDKs** — `@hsafa/node` (TypeScript) and `hsafa` (Python) talk directly to Core. They handle everything: extension building, admin control, streaming, sense pushing. Spaces-specific UI SDKs move into the spaces extension.
5. **Deterministic over heuristic** — tag by tool usage, not regex on text. Identity is too important to guess.
6. **One command install** — extensions should be as easy to install as npm packages.
7. **Powerful AI, not cheap AI** — never reduce Haseef capabilities for cost. Full context, rich prompts, no shortcuts on intelligence. No silent model downgrading. No synthetic nudges.
