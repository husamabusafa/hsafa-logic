# 14 — v2 → v3 Gateway Migration Plan

## Delta Summary

| Area | v2 (Current) | v3 (Target) |
|------|-------------|-------------|
| **Execution model** | Stateless runs — fresh run per message | Persistent agent process — one loop per agent |
| **Context** | System prompt rebuilt from DB each run | Consciousness (`ModelMessage[]`) carried across cycles |
| **Concurrency** | Multiple concurrent runs + absorb_run | One process, sequential think cycles, inbox batching |
| **Triggering** | Message → `createAndExecuteRun()` | Message → Redis LPUSH to inbox → process wakes |
| **State tracking** | `lastProcessedMessageId`, `[SEEN]/[NEW]` | Not needed — consciousness tracks everything |
| **Active space** | Persisted on Run record (`activeSpaceId`) | In-memory per process (not persisted) |
| **Run model** | Full lifecycle (queued/running/waiting_tool/completed/failed/canceled) | Audit log only (running/waiting_tool/completed/failed) |
| **Prebuilt tools** | 15 tools incl. `stop_run`, `absorb_run`, `get_my_runs` | 12 tools + new `peek_inbox`; remove 3 run-control tools |

---

## Engineering Rules

### 1. Never Break the Space Pipeline

Spaces, messages, memberships, SSE streaming, and the `smartspace-db.ts` retry loop are battle-tested. Don't touch them unless the docs explicitly require it.

### 2. Build New Files, Don't Gut Old Ones

Create `agent-process.ts` (the process loop) and `consciousness.ts` alongside the existing `run-runner.ts`. Wire the new path in parallel. Only delete old code after the new path works end-to-end.

### 3. One Prisma Migration, Run It Early

Schema changes (add `AgentConsciousness`, add cycle fields to Run, remove `activeSpaceId` from Run, remove `lastProcessedMessageId` from membership) should be a single migration at the start. Everything else is pure code.

### 4. Keep the Stream-Processor Untouched

`fullStream` from `streamText()` emits the same events in v3 — the stream-processor intercepts `send_message` deltas and visible tool events identically. Zero changes needed.

### 5. Don't Change the REST API Surface

Routes, auth middleware, SSE endpoints stay the same. The Run model becomes an audit log but still exposes the same CRUD routes. SDKs don't need changes in Phase 1.

### 6. Test Each Phase in Isolation

Each phase should compile (`npx tsc --noEmit`) and be testable with a script before moving to the next.

### 7. Redis Is the New Coordination Layer

Every inbox push must use `LPUSH` + a wakeup signal. Every drain must be atomic (`LPOP` loop). Test the Redis path before wiring it to the LLM.

### 8. Consciousness Is Append-Only During a Cycle

Never mutate mid-cycle. Append after. Compact after. Save after. This makes crash recovery simple.

---

## Phased Step Order

### Phase 1: Schema + Consciousness Storage

*Foundation — no behavior change yet.*

**Step 1 — Prisma migration.**
- Add `AgentConsciousness` model (see [11-data-model.md](./10-data-model.md)).
- Add `cycleNumber`, `inboxEventCount`, `stepCount`, `promptTokens`, `completionTokens`, `durationMs` to Run.
- Remove `activeSpaceId` from Run.
- Remove `lastProcessedMessageId` from SmartSpaceMembership.
- Remove `queued` and `canceled` from RunStatus.

**Step 2 — `consciousness.ts` (new file).**
- `loadConsciousness(agentEntityId)` — reads from DB, returns `ModelMessage[]`.
- `saveConsciousness(agentEntityId, messages, cycleCount)` — upserts to DB.
- `estimateTokens(messages)` — token counting utility.
- `compactConsciousness(consciousness)` — self-summary strategy (extract agent's final text from old cycles, keep recent cycles intact).
- Pure DB + utility functions, no process logic.

**Step 3 — Test.**
- Load/save round-trip.
- Compaction trims correctly.

---

### Phase 2: Inbox System

*Redis infrastructure — no behavior change yet.*

**Step 4 — `inbox.ts` (new file).**
- `pushToInbox(agentEntityId, event)` — `LPUSH` + publish wakeup signal.
- `drainInbox(agentEntityId)` — `LPOP` loop until empty.
- `waitForInbox(agentEntityId)` — `BRPOP` (blocking, zero CPU).
- `peekInbox(agentEntityId, count)` — `LRANGE` without removing.
- `formatInboxEvents(events)` — formats events into a single user message string.
- Deduplication by `eventId`.

**Step 5 — Wire inbox pushes into existing triggers.**
- In `smart-spaces.ts` messages route: after persisting a message, `LPUSH` to every other agent member's inbox (instead of/alongside `triggerAllAgents`).
- In `send-message.ts` prebuilt tool: same — LPUSH to agent inboxes.
- In `agents.ts` service trigger route: `LPUSH` service event.
- Plan scheduler: `LPUSH` plan event.

**Step 6 — Test.**
- Send a message via API → verify Redis inbox contains correctly formatted event.

---

### Phase 3: Agent Process Loop

*The core v3 change — replaces run-runner for agent execution.*

**Step 7 — `agent-process.ts` (new file).**

The persistent `while(true)` loop:

```
waitForInbox → drainInbox → refreshSystemPrompt → inject inbox as user message
→ streamText → processStream → append to consciousness → compact → save → loop
```

One function: `startAgentProcess(agentId)`.

Active space is in-memory only (closure variable, reset each cycle or carried if desired).

**Step 8 — `process-manager.ts` (new file).**
- Manages all agent processes.
- `startAllProcesses()` — called at gateway startup, spawns a process for every agent.
- `startProcess(agentId)` / `stopProcess(agentId)` — for dynamic agent creation/deletion.
- Keeps a `Map<agentId, { abort, status }>`.

**Step 9 — Update `prompt-builder.ts`.**

v3 system prompt structure:

```
IDENTITY → YOUR SPACES → GOALS → MEMORIES → PLANS → INSTRUCTIONS
```

Remove:
- `[SEEN]`/`[NEW]` marker logic
- `ACTIVE RUNS` block
- `ACTIVE SPACE` block
- Trigger block
- Origin annotations (consciousness handles all of these)

Much simpler than v2.

**Step 10 — Update `types.ts`.**
- Add `AgentProcessContext` (replaces `RunContext`).
- Remove `RunActionLog`, `RunActionSummary`, `triggerSummary`.
- Add `consciousness` config to `AgentConfigSchema`.

**Step 11 — Wire into `index.ts`.**
- On startup: `await processManager.startAllProcesses()`.
- On graceful shutdown: stop all processes, save consciousness.

**Step 12 — Test.**
- Start gateway → agent process boots → send message → agent wakes, thinks, responds.
- Verify consciousness grows across cycles.

---

### Phase 4: Prebuilt Tool Updates

*Align tools with v3 semantics.*

**Step 13 — Remove run-control tools.**
- Delete `absorb-run.ts`, `stop-run.ts`, `get-my-runs.ts`.
- Remove from `registry.ts`.

**Step 14 — Add `peek-inbox.ts` (new file).**
- Calls `peekInbox()` from inbox.ts.
- Pops events from Redis inbox (removes them from queue).
- Returns full events + remaining count.

**Step 15 — Update `enter-space.ts`.**
- Remove `activeSpaceId` DB persistence (process-level only, in-memory).
- Remove `[SEEN]`/`[NEW]` marker formatting.
- Remove `lastProcessedMessageId` update.
- Return plain history.

**Step 16 — Update `send-message.ts`.**
- Replace `triggerAllAgents()` call with `pushToInbox()` for all other agent members.
- Remove `RunContext.actionLog` logging.
- Remove origin metadata embedding (consciousness has the full chain).
- Keep streaming, DB persistence, retry loop.

**Step 17 — Update `read-messages.ts`.**
- Remove `[SEEN]`/`[NEW]` formatting.
- Return plain messages.

**Step 18 — Update `registry.ts`.**
- Remove old imports, add `peek-inbox`.

**Step 19 — Test.**
- Full cycle with all prebuilt tools working.

---

### Phase 5: `prepareStep` + Mid-Cycle Inbox

*Dynamic per-step behavior.*

**Step 20 — Implement `prepareStep` callback in `agent-process.ts`.**
- Lightweight inbox preview (Strategy 2 from [04-think-cycle.md](./04-think-cycle.md)).
- Read pending inbox via `LRANGE` (peek, don't pop).
- Inject as user message if events waiting.

**Step 21 — Tool phase gates (optional, can defer).**
- Restrict tools per step number (observe → think → respond pattern).

**Step 22 — Test.**
- Send a correction message mid-cycle → verify agent sees the preview.

---

### Phase 6: Run Audit Records

*Runs become audit logs, not active state.*

**Step 23 — Create Run at cycle start in `agent-process.ts`.**
- Status `running`, `cycleNumber`, inbox event count.
- Update on completion with `stepCount`, token usage, `durationMs`.

**Step 24 — `waiting_tool` flow.**
- When `streamText` stops on a `space` tool (no execute function), set run to `waiting_tool`.
- On tool result submission, resume the cycle (same as v2 but within the process loop).

**Step 25 — Emit `agent.active`/`agent.inactive` at cycle start/end.**
- Reuse existing `emitAgentStatusToAllSpaces` helper.

**Step 26 — Test.**
- Dashboard query for recent runs shows correct cycle metadata.

---

### Phase 7: Cleanup + Deprecation

**Step 27 — Remove `agent-trigger.ts`.**
- All triggering now goes through inbox pushes.

**Step 28 — Remove `run-runner.ts`.**
- Replaced by `agent-process.ts`.

**Step 29 — Remove `activeSpaceId` from all run-related code.**
- Grep and clean.

**Step 30 — Remove `lastProcessedMessageId` from all code.**
- Grep and clean.

**Step 31 — Update routes.**
- `/api/agents/:agentId/trigger` now pushes to inbox instead of `createAndExecuteRun`.

**Step 32 — Final compilation check.**
- `npx tsc --noEmit` clean.

---

### Phase 8: SDK Alignment (Later)

**Step 33 — react-sdk.**
- Remove run-awareness code that's no longer relevant.
- `isRunning` = any streaming active.
- Remove `waiting_tool` SSE handler if tool result flow changes.

**Step 34 — node-sdk.**
- Update types for simplified Run model.

**Step 35 — ui-sdk.**
- No changes expected (consumes react-sdk output).

---

## Reusable Files (Don't Rewrite)

| File | Status |
|------|--------|
| `smartspace-db.ts` | ✅ Keep as-is |
| `smartspace-events.ts` | ✅ Keep as-is |
| `stream-processor.ts` | ✅ Keep as-is |
| `builder.ts` (agent builder) | ✅ Keep — tool resolution unchanged |
| `tool-call-utils.ts` | ✅ Keep as-is |
| `redis.ts` | ✅ Keep + extend for inbox |
| `db.ts` | ✅ Keep as-is |
| All routes (except wiring changes) | ✅ Keep as-is |
| Auth middleware | ✅ Keep as-is |
| Most prebuilt tools (7 of 12) | ✅ Keep as-is |

---

## New Files

| File | Purpose |
|------|---------|
| `lib/consciousness.ts` | Load, save, compact, estimate tokens |
| `lib/inbox.ts` | Redis inbox: push, drain, wait, peek, format |
| `lib/agent-process.ts` | The persistent process loop |
| `lib/process-manager.ts` | Start/stop/manage all agent processes |
| `agent-builder/prebuilt-tools/peek-inbox.ts` | New prebuilt tool |

---

## Deleted Files

| File | Reason |
|------|--------|
| `lib/run-runner.ts` | Replaced by `agent-process.ts` |
| `lib/agent-trigger.ts` | Replaced by inbox pushes |
| `agent-builder/prebuilt-tools/absorb-run.ts` | No concurrent runs |
| `agent-builder/prebuilt-tools/stop-run.ts` | No concurrent runs |
| `agent-builder/prebuilt-tools/get-my-runs.ts` | No runs to query |

---

## Recommended Execution Order

Start with **Phase 1** (schema migration) then **Phase 2** (inbox). These are pure infrastructure with zero risk to existing behavior. Phase 3 is the big one — the process loop. Phases 4-6 can proceed in parallel once Phase 3 is stable. Phase 7 is cleanup. Phase 8 is SDK alignment, done last.
