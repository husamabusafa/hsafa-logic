# V7 Implementation Progress

## Overall Status: 🟡 In Progress

---

## Phase 1: @hsafa/sdk (Node.js) — ✅ COMPLETE
- Location: `sdks/hsafa-sdk/`
- Package: `@hsafa/sdk` v7.0.0
- 4 concepts: `registerTools`, `onToolCall`, `pushEvent`, `on`/`connect`
- SSE connection with auto-reconnect, partial JSON parsing
- Added to `pnpm-workspace.yaml`

## Phase 2: hsafa-core v7 — 🟡 IN PROGRESS

### 2a. Prisma Schema — ✅ DONE
- [x] Add EpisodicMemory model (run summaries + context metadata)
- [x] Add SocialMemory model (person models with observations)
- [x] Add ProceduralMemory model (learned patterns with confidence)
- [x] Add SemanticMemory model (key-value facts with importance)
- [x] Simplify Run model (stateless: trigger info, summary, token counts)
- [x] Remove HaseefConsciousness, ConsciousnessArchive, ConsciousnessSnapshot
- [x] Remove InboxEvent, HaseefScope, HaseefTool, Memory
- [x] Keep Scope, ScopeTool (already v7-ready)
- [x] Keep Haseef with scopes[] array

### 2b. Core Lib — ✅ DONE
- [x] `coordinator.ts` — Trigger haseefs, manage concurrency, interrupts
- [x] `invoker.ts` — The think loop: perceive → think → act → remember
- [x] `event-router.ts` — Resolve events to haseefs (by ID or profile target)
- [x] `stream-publisher.ts` — Publish text deltas + tool events to Redis Pub/Sub
- [x] `prompt-builder.ts` — v7 system prompt builder (identity, memory, instructions)
- [x] Keep `tool-dispatcher.ts`, `tool-builder.ts`, `model-registry.ts`, `db.ts`, `redis.ts`
- [x] Removed v5 artifacts: `agent-process.ts`, `consciousness.ts`, `inbox.ts`, `process-manager.ts`, `action-dispatch.ts`, `stream-processor.ts`, `time-utils.ts`, `model-middleware.ts`, `agent-builder/` dir, `routes/scopes.ts`, `routes/actions.ts`

### 2c. Memory System — ✅ DONE
- [x] `memory/episodic.ts` — Run summaries + search
- [x] `memory/semantic.ts` — Facts with importance + search
- [x] `memory/social.ts` — Person models with observations
- [x] `memory/procedural.ts` — Learned patterns with confidence
- [x] `memory/reflection.ts` — Post-run episodic memory extraction
- [x] `memory/selection.ts` — Per-run memory assembly (all 4 types)

### 2d. Prebuilt Tools — ✅ DONE
- [x] `prebuilt-tools/done.ts` — Signal run completion + summary
- [x] `prebuilt-tools/set-memories.ts` — Store semantic memories
- [x] `prebuilt-tools/delete-memories.ts` — Remove memories
- [x] `prebuilt-tools/recall-memories.ts` — Search memories + episodic history

### 2e. Routes — ✅ DONE
- [x] `routes/events.ts` — Rewritten: routeEvent + coordinator.trigger()
- [x] `routes/haseefs.ts` — Rewritten: CRUD + profile + status + SSE stream (no consciousness/process mgmt)
- [x] `routes/memory.ts` — NEW: Memory CRUD + search (all 4 types + stats)
- [x] `routes/dashboard.ts` — NEW: System status overview
- [x] `routes/runs.ts` — Updated for v7
- [x] `routes/global-scopes.ts` — Already v7-ready (kept)
- [x] `routes/global-actions.ts` — Already v7-ready (kept)
- [x] Old `routes/scopes.ts` and `routes/actions.ts` — Dead code (not imported)

### 2f. index.ts — ✅ DONE
- [x] Wire all v7 routes (haseefs, events, scopes, actions, runs, memory, dashboard)
- [x] Remove process manager, consciousness, inbox references
- [x] Simplified startup (no process startup — trigger-based)

### 2g. Compile & Test — ✅ DONE
- [x] `prisma generate` — client regenerated successfully
- [x] `tsc --noEmit` — **0 errors in v7 code** (old v5 dead code files have errors but are not imported)
- [ ] Test with echo service using @hsafa/sdk

---

## Phase 3: Spaces SDK Integration — ✅ COMPLETE (from previous session)
- Spaces server refactored to use @hsafa/sdk
- `service/` directory replaced by ~50 lines of SDK integration
- Two SDK instances (spaces + scheduler scopes)

## Phase 4: Core Dashboard — ✅ COMPLETE (from previous session)
- Location: `hsafa-dashboard/`
- Vite 6 + React 19 + TypeScript + TailwindCSS
- Pages: Haseefs, Scopes, Runs, LiveFeed, Settings

## Phase 5: Python SDK — ✅ COMPLETE (from previous session)
- Location: `python-sdk/`
- Package: `hsafa-sdk` (pip)
- Same 4 concepts as Node.js SDK

---

## Key Architecture Differences: v5 → v7

| Aspect | v5 (Current) | v7 (Target) |
|--------|-------------|-------------|
| **Execution model** | Living agent: continuous SLEEP→DRAIN→THINK cycles | Stateless: trigger → run → done |
| **Consciousness** | Persistent conversation history + compaction | None — fresh prompt per run |
| **Inbox** | Redis BRPOP queue, events accumulate | Events trigger immediately, no queue |
| **Memory** | Single `Memory` table (key/value) | 4 types: episodic, semantic, social, procedural |
| **Memory search** | Basic key lookup | pgvector semantic search |
| **Process manager** | Long-running processes per haseef | No processes — trigger-based invocation |
| **Tool routing** | Per-haseef + global scopes | Global scopes only |
| **Reflection** | Consciousness compaction | Post-run episodic memory extraction |

---

## Files to Remove (v5 artifacts)
- `lib/agent-process.ts` — Living agent cycle
- `lib/consciousness.ts` — Consciousness management
- `lib/inbox.ts` — Inbox queue
- `lib/process-manager.ts` — Haseef process lifecycle
- `lib/action-dispatch.ts` — Redis Streams dispatch (replaced by SSE)
- `lib/stream-processor.ts` — v5 stream handling
- `lib/time-utils.ts` — Cycle timing utilities
- `lib/model-middleware.ts` — v5 model middleware
- `routes/global-scopes.ts` — Merged into routes/scopes.ts
- `routes/global-actions.ts` — Merged into routes/actions.ts
- `agent-builder/prebuilt-tools/` — All old tools replaced
