# Implementation Roadmap

The gateway skeleton, CRUD routes, and the full AI execution engine are implemented. The only remaining piece is the **plan scheduler** (Step 8).

`npx tsc --noEmit` passes cleanly ✅

---

## Step 1 — Stream Processor ✅
**`src/lib/stream-processor.ts`** (359 lines)

Consumes a Vercel AI SDK `fullStream` and emits Hsafa-native Redis events.

**What it does:**
- Agent text and reasoning are collected internally — never streamed to clients
- `send_message` tool: extracts the `text` field from partial JSON args using `partial-json` and emits `space.message.streaming` deltas (real-time typing in the UI)
- Visible custom tools: emits `tool.started` + `tool.streaming` + `tool.done`
- All tool events also go to the `run:{runId}` channel for programmatic consumers

**Hsafa-native event names:**

| Event | Channel | Description |
|-------|---------|-------------|
| `space.message.streaming` | `smartspace:{spaceId}` | `send_message` text delta (`phase: start \| delta \| done`) |
| `space.message.failed` | `smartspace:{spaceId}` | `send_message` errored |
| `space.message` | `smartspace:{spaceId}` | Persisted DB message (human or agent) |
| `tool.started` | `smartspace:{spaceId}` + `run:{runId}` | Visible tool began |
| `tool.streaming` | `smartspace:{spaceId}` | Partial args for visible custom tool |
| `tool.done` | `smartspace:{spaceId}` + `run:{runId}` | Tool completed with result |
| `tool.error` | `smartspace:{spaceId}` + `run:{runId}` | Tool execution failed |
| `agent.active` | `smartspace:{spaceId}` | Agent started a run |
| `agent.inactive` | `smartspace:{spaceId}` | Agent's run ended |
| `run.started` | `run:{runId}` | Run began execution |
| `run.completed` | `run:{runId}` + `smartspace:{spaceId}` | Run finished successfully |
| `run.failed` | `run:{runId}` + `smartspace:{spaceId}` | Run errored |

> Note: `agent.active`/`agent.inactive` and `run.completed`/`run.failed` are emitted by the **run-runner**, not the stream-processor.

**Returns:** `{ toolCalls, finishReason, internalText }` for the run-runner.

**Bugs fixed during validation:**
- AI SDK v6 renamed `tool-call-streaming-start` → `tool-input-start`, `tool-call-delta` → `tool-input-delta`
- Property names: `part.text` (not `.textDelta`), `part.inputTextDelta` (not `.argsTextDelta`), `part.input` (not `.args`), `part.output` (not `.result`)
- These compiled fine due to `any` casts but would have silently broken tool streaming at runtime.

---

## Step 2 — Agent Builder ✅
**`src/agent-builder/builder.ts`** (241 lines)

Reads an agent's `configJson` and produces everything needed to call the LLM.

**What it does:**
- Resolves LLM model instance from provider name (openai / anthropic / google / xai / openrouter)
- Converts custom tool definitions from agent config into Vercel AI SDK `tool()` format
- Supports all execution types: `gateway` (HTTP), `internal` (static), `external`/`space` (no execute → waiting_tool)
- Sets `visible: true/false` per tool (determines what gets streamed to the space)
- Injects all 13 prebuilt tools via lazy registry
- Returns `{ tools, visibleToolNames: Set<string>, model }`

**Supporting files:**
- `src/agent-builder/types.ts` — `AgentConfigSchema` (Zod), `RunContext` interface, `BuiltAgent` interface
- `src/agent-builder/prebuilt-tools/registry.ts` — Lazy dynamic-import registry (`initPrebuiltTools()` + `getPrebuiltTools()`)

---

## Step 3 — Prebuilt Tools ✅
**`src/agent-builder/prebuilt-tools/`** (13 tools, all registered)

### 3a — `enter_space` ✅
Sets `run.activeSpaceId` in DB + in-memory closure. Returns space info + recent message history with `seen: true/false` markers. Verifies agent membership.

### 3b — `send_message` ✅
Posts a message to the active space via `createSmartSpaceMessage()`. Emits `space.message` event with the persisted message for client dedup. Triggers all other agent members in the space via `triggerAllAgents()` (lazy import to avoid circular deps).

### 3c — `read_messages` ✅
Fetches space history with pagination (`limit`, `offset`). Defaults to active space. Verifies membership. Returns oldest-first with sender info.

### 3d — Memory tools ✅
- `set_memories` — upsert key/value pairs
- `get_memories` — fetch by keys or all
- `delete_memories` — delete by keys

### 3e — Goal tools ✅
- `set_goals` — create/update goals with description + priority
- `delete_goals` — delete by IDs

### 3f — Plan tools ✅
- `set_plans` — create plans with `name`, `instruction`, scheduling (`runAfter` / `scheduledAt` / `cron`)
- `get_plans` — list active/pending plans
- `delete_plans` — delete by IDs

### 3g — Run control tools ✅ (partial)
- `get_my_runs()` ✅ — lists the agent's runs with status filter
- `stop_run()` ✅ — cancels another of the agent's own runs (optimistic update)
- `absorb_run({ runId })` — **deferred** (complex handoff pattern, not needed for MVP)

---

## Step 4 — Prompt Builder ✅
**`src/agent-builder/prompt-builder.ts`** (309 lines)

Builds the structured system prompt from DB context. Sections in order:

1. **IDENTITY** — agent name, entityId, current time
2. **TRIGGER** — trigger type + full context (space_message: space/sender/message; plan: name/instruction; service: name/payload)
3. **ACTIVE SPACE** — current space name + ID (auto-set note for space_message triggers)
4. **SPACE HISTORY** — recent messages with `[SEEN]`/`[NEW]` markers based on `lastProcessedMessageId`, trigger message marked with `← TRIGGER`
5. **YOUR SPACES** — all spaces the agent belongs to, with member lists, `[ACTIVE]` marker
6. **MEMORIES** — key/value pairs (if any)
7. **GOALS** — active goals with priority (if any)
8. **PLANS** — active/pending plans with schedule info (if any)
9. **ACTIVE RUNS** — other concurrent runs for awareness (if any)
10. **INSTRUCTIONS** — system instructions + custom agent instructions from `configJson`

Ref: `05-context-model.md`, `13-context-continuity.md`

---

## Step 5 — Run Runner ✅
**`src/lib/run-runner.ts`** (~280 lines)

Orchestrates a run lifecycle. Uses AI SDK's `streamText` with `stopWhen` for the tool-call loop — the SDK manages message accumulation and tool result injection internally. The stream-processor intercepts `fullStream` events across all steps for real-time Redis emission.

```
1. Load run from DB, guard against re-execution (must be 'queued')
2. Transition to 'running', emit agent.active to all agent's spaces
3. Set up AbortController + activeSpaceId closure (mutable)
4. Build agent (Step 2) + build prompt (Step 4) in parallel
5. streamText({ stopWhen: stepCountIs(20), prepareStep: ... })
   - SDK loops internally: call LLM → execute tools → inject results → repeat
   - fullStream emits events across ALL steps (tool-input-start, tool-input-delta, etc.)
   - prepareStep checks for mid-run cancellation between steps
   - Tools without execute (space/external) stop the loop automatically
6. processStream(fullStream) → emits Redis events for all steps
7. Mark completed, update lastProcessedMessageId for agent in active space
8. Emit run.completed to run channel + active space
9. On error: mark failed, emit run.failed
10. Finally: always emit agent.inactive to all spaces, clean up AbortController
```

**Why `stopWhen` instead of manual loop:**
- SDK handles model message format internally — eliminates `input`/`args` and `output`/`content` format bugs
- `fullStream` still emits `tool-input-delta` events across all steps — stream-processor interception works unchanged
- `prepareStep` provides a clean hook for cancellation checks between steps
- ~50 fewer lines, zero manual message building

---

## Step 6 — Agent Trigger ✅
**`src/lib/agent-trigger.ts`** (144 lines)

Wired into `smart-spaces.ts` POST messages route (fire-and-forget).

**What it does:**
- `triggerAllAgents()` — finds all agent members of the space (excluding sender), creates a `Run` for each with full trigger context, auto-enters the trigger space (`activeSpaceId: spaceId`)
- `createAndExecuteRun()` — creates Run record then fires `executeRun()` in background via lazy import (avoids circular deps). Returns `runId` immediately.
- Deduplication: skips if a non-canceled run already exists for the same `agentEntityId + triggerMessageId`
- Also called by `send_message` prebuilt tool (agent→agent triggering)

Ref: `01-trigger-system.md`

---

## Step 7 — Service Trigger ✅
**In `src/routes/agents.ts`** — `POST /api/agents/:agentId/trigger`

Fully wired — uses `createAndExecuteRun()` from `agent-trigger.ts`.

- Requires `secretKey` auth + `serviceName` in body
- Creates a `Run` with `triggerType: 'service'`, `triggerServiceName`, `triggerPayload`
- No initial `activeSpaceId` — the agent must call `enter_space` first
- Returns `{ runId, agentEntityId, status: 'queued' }` immediately

---

## Step 8 — Plan Scheduler ❌
**`src/lib/plan-scheduler.ts`** — NOT YET IMPLEMENTED

The TODO comment remains in `src/index.ts` line 61. The plan CRUD prebuilt tools (3f) exist and agents can create/read/delete plans, but no scheduler polls the `Plan` table to trigger runs.

**What needs to be built:**
- Cron loop (every minute) scanning `Plan` table for `nextRunAt <= now AND status = 'active'`
- For each due plan: call `createAndExecuteRun()` with `triggerType: 'plan'`, `triggerPlanId`, `triggerPlanName`, `triggerPlanInstruction`
- Update `nextRunAt` based on cron expression (for recurring) or set `status = 'completed'` (for one-time)
- Wire into `startPlanScheduler()` in `src/index.ts`
- `cron-parser` package is already in `package.json`

Ref: `01-trigger-system.md` (Plan section)

---

## Progress Summary

| Step | Status | File(s) |
|------|--------|---------|
| 1. Stream Processor | ✅ Done | `src/lib/stream-processor.ts` |
| 2. Agent Builder | ✅ Done | `src/agent-builder/builder.ts`, `types.ts` |
| 3a. enter_space | ✅ Done | `prebuilt-tools/enter-space.ts` |
| 3b. send_message | ✅ Done | `prebuilt-tools/send-message.ts` |
| 3c. read_messages | ✅ Done | `prebuilt-tools/read-messages.ts` |
| 3d. Memory tools | ✅ Done | `set-memories.ts`, `get-memories.ts`, `delete-memories.ts` |
| 3e. Goal tools | ✅ Done | `set-goals.ts`, `delete-goals.ts` |
| 3f. Plan tools | ✅ Done | `set-plans.ts`, `get-plans.ts`, `delete-plans.ts` |
| 3g. Run control | ✅ Partial | `get-my-runs.ts`, `stop-run.ts` (absorb_run deferred) |
| 4. Prompt Builder | ✅ Done | `src/agent-builder/prompt-builder.ts` |
| 5. Run Runner | ✅ Done | `src/lib/run-runner.ts` |
| 6. Agent Trigger | ✅ Done | `src/lib/agent-trigger.ts` |
| 7. Service Trigger | ✅ Done | `src/routes/agents.ts` |
| 8. Plan Scheduler | ❌ TODO | `src/lib/plan-scheduler.ts` (not created) |

---

## What to Build Next

**Immediate:** Step 8 — Plan Scheduler (unblocks agent-initiated scheduled runs)

**After that — suggested priorities:**
1. **E2E testing** — seed a demo agent, send a message, verify the full loop works at runtime
2. **Client tool support** — `waiting_tool` status handling, tool result submission endpoint in `runs.ts`, resume flow in run-runner
3. **React SDK runtime** — SSE handlers for space events (`space.message.streaming`, `space.message`, `agent.active`/`agent.inactive`)
4. **absorb_run** — complex handoff pattern (only if needed for multi-agent scenarios)
