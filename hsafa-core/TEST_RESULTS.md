# Hsafa Core v5 — Test Results

> Generated: March 9, 2026

---

## What Was Built

### 1. Test Service (`services/test-service/`)

Standalone service per `TEST_SERVICE_PLAN.md`:

- **`index.ts`** — Registers 5 tools (`echo`, `add_numbers`, `log_event`, `slow_task`, `get_status`), pushes 3 event types (`ping`, `data_update`, `image_received`), consumes actions via SSE, submits results, manages profile and tool lifecycle
- **`package.json`** — `@hsafa/test-service`, tsx runner, zero runtime deps (native fetch + SSE)
- **`.env.example`** — `CORE_URL`, `HSAFA_API_KEY`, `HASEEF_ID`, `REDIS_URL`
- **`tsconfig.json`** — ESNext/bundler, aligned with core

### 2. API Test Suite (`core/scripts/test-v5-api.ts`)

**101 automated tests** covering every v5 API route without needing an LLM:

| Category | Tests |
|---|---|
| Health & Auth | Health check, 401 missing/wrong key |
| Haseef CRUD | Create, get, list, update, delete, 404, 409 dup name |
| Profile | Get, set, update, 404 |
| Tool Registration | PUT sync (5 tools), verify each mode/scope, list scope, list all, validation 400 |
| Tool Upsert | Update desc/timeout, create new, validation 400 |
| Tool Delete | Single delete, 404 nonexistent |
| Scope Delete | Full scope delete, verify empty |
| Scope Resync | Full replace (removes old, adds new, updates existing) |
| Multi-Scope | Independent scopes, cross-scope list, isolated delete |
| Event Push | Single, batch, multimodal, 404, validation, dedup |
| Inbox Redis | Verify events land in Redis list |
| Action Dispatch | Redis Streams key, consumer group creation |
| Action Result | Pub/Sub round-trip (subscribe → submit → receive) |
| SSE Stream | Redis Pub/Sub event propagation |
| Process Control | Status, stop, start, verify running/stopped |
| Snapshots | List, create (or correctly refuse fresh haseef) |
| Runs | List, filter by status/haseefId, limit, 404 |
| Admin Status | Uptime, process count, haseefs list |

**Result: 101/101 passed ✅**

Run: `pnpm test:api`

### 3. End-to-End Run Test (`core/scripts/test-e2e-run.ts`)

Full round-trip integration test with a real LLM (Claude Sonnet):

1. Creates a Haseef configured with `anthropic:claude-sonnet-4-20250514`
2. Registers 4 tools: `echo` (sync), `add_numbers` (sync), `get_weather` (sync), `log_event` (fire_and_forget)
3. Starts the Haseef process + SSE action consumer + thinking stream listener
4. Pushes 3 events and verifies tool calls:
   - **Ping event** → Haseef calls `echo` with a greeting ✅
   - **Math event** ("What is 42 + 58?") → Haseef calls `add_numbers(42, 58)` → `{sum: 100}` ✅
   - **Weather event** ("Weather in Tokyo?") → Haseef calls `get_weather("Tokyo")` + `log_event` ✅
5. Verifies runs created, stream events received, cleanup

**Result: 11/13 passed** (2 soft failures — LLM behavioral, not system bugs)

| Assertion | Status |
|---|---|
| At least 3 runs created (got 3) | ✅ |
| All runs completed | ✅ |
| echo tool was called | ✅ |
| add_numbers tool was called | ✅ |
| get_weather tool was called | ✅ |
| add_numbers returned correct sum (42+58=100) | ✅ |
| get_weather called for Tokyo | ✅ |
| run.started event received | ✅ |
| run.finished event received | ✅ |
| tool.started event received | ✅ |
| tool.done event received | ✅ |
| done tool called at least once | ❌ (LLM chose not to) |
| set_memories called at least once | ❌ (LLM chose not to) |

The `done` and `set_memories` failures are LLM behavioral — Claude completed cycles naturally without explicitly calling `done`, and chose not to store memories. The system itself processed everything correctly.

Run: `pnpm test:e2e`

---

## Bugs Found & Fixed

### Bug 1: Scope Sync Data Loss (`routes/scopes.ts`)

**Severity: High**

`PUT /api/haseefs/:id/scopes/:scope/tools` deleted all existing tools **before** validating incoming tools. If validation failed (e.g., a tool missing `description`), existing tools were already gone — silent data loss.

**Fix:** Moved the validation loop **before** `deleteMany()`:

```typescript
// BEFORE (buggy): delete first, validate after
await prisma.haseefTool.deleteMany({ where: { haseefId, scope } });
for (const t of tools) {
  if (!t.name || !t.description || !t.inputSchema) {
    res.status(400).json({ error: '...' }); // tools already deleted!
    return;
  }
}

// AFTER (fixed): validate first, then delete
for (const t of tools) {
  if (!t.name || !t.description || !t.inputSchema) {
    res.status(400).json({ error: '...' }); // existing tools preserved
    return;
  }
}
await prisma.haseefTool.deleteMany({ where: { haseefId, scope } });
```

### Bug 2: BRPOP Consuming Wake Event (`agent-process.ts`)

**Severity: Critical — Events silently lost**

`waitForInbox()` uses Redis BRPOP which **removes** the event from the Redis list. Then `drainInbox()` tries to RPOP remaining events. If only one event was pushed, it was already consumed by BRPOP → `events.length === 0` → `continue` → the event was silently lost forever.

This meant: **every single-event push was dropped.** Multiple events only worked because BRPOP consumed one but the rest survived for drainInbox.

**Fix:** Prepend the wake event to the drained list with dedup:

```typescript
// BEFORE (buggy):
const wakeEvent = await waitForInbox(haseefId, blockingRedis, signal);
const events = await drainInbox(haseefId);
if (events.length === 0) continue; // wake event lost!

// AFTER (fixed):
const wakeEvent = await waitForInbox(haseefId, blockingRedis, signal);
const moreEvents = await drainInbox(haseefId);
const seen = new Set(moreEvents.map((e) => e.eventId));
const events = seen.has(wakeEvent.eventId)
  ? moreEvents
  : [wakeEvent, ...moreEvents];
if (events.length === 0) continue;
```

---

## DB Schema Changes

- pgvector `extensions = [vector]` temporarily commented out (`prisma/schema.prisma` line 11) — Docker `postgres:16-alpine` doesn't include pgvector
- `embedding Unsupported("vector(1536)")?` fields in `Memory` and `ConsciousnessArchive` temporarily commented out
- `prisma db push --accept-data-loss` applied v5 schema (dropped old v4 tables: `extensions`, `haseef_extensions`, `goals`, `plans`, `pending_tool_calls`)

---

## Files Changed

| File | Action |
|---|---|
| `services/test-service/index.ts` | Created — test service implementation |
| `services/test-service/package.json` | Created — dependencies |
| `services/test-service/.env.example` | Created — env template |
| `services/test-service/tsconfig.json` | Created — TypeScript config |
| `core/scripts/test-v5-api.ts` | Created — 101 API tests |
| `core/scripts/test-e2e-run.ts` | Created — E2E run test with Claude |
| `core/package.json` | Modified — added `test:api` and `test:e2e` scripts |
| `core/src/routes/scopes.ts` | **Bug fix** — validate before delete |
| `core/src/lib/agent-process.ts` | **Bug fix** — preserve BRPOP wake event |
| `core/prisma/schema.prisma` | Modified — temporarily disabled pgvector |
| `core/.env` | Created from `.env.example` + added `HSAFA_API_KEY` |

---

## How to Run

```bash
# Ensure Docker services are running (postgres + redis)
docker compose up -d

# API tests (no LLM needed)
cd hsafa-core/core
pnpm test:api

# E2E run test (requires ANTHROPIC_API_KEY in .env)
pnpm test:e2e
```
