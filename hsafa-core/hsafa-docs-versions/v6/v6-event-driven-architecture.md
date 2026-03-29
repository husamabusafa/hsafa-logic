# v6 — Event-Driven Interrupt/Rerun Architecture

## Overview

v6 replaces the cycle-based batch processing model with an **event-driven interrupt/rerun** architecture. Instead of batching events and processing them in rigid cycles, each event now triggers an immediate run. If a new event arrives while a run is in progress, the current run is **interrupted**, completed work is preserved, and a new run starts with full context.

This is how a human brain works — continuous reaction, not batch processing.

---

## What Changed

### Before (v5 — Cycle-Based)
```
SLEEP → DRAIN inbox → BATCH all events → THINK (LLM) → call done → SAVE → repeat
```
- Events accumulated in an inbox queue (Redis + Postgres)
- Haseef slept until events arrived, then drained ALL pending events
- All events were formatted as one big "SENSE EVENTS (N)" user message
- `peek_inbox` tool let the model pull more events mid-cycle
- If a new event arrived mid-cycle, it waited until the next cycle
- 15-second cooldown per haseef per space silently dropped rapid messages

### After (v6 — Event-Driven)
```
WAIT → EVENT arrives → [INTERRUPT if running] → RUN → done → SAVE → WAIT
```
- Events trigger runs immediately — no queue, no batching, no cooldown, no debounce
- If already running, the current run is interrupted
- Any events already in Redis are drained instantly (no waiting window)
- `done` tool signals clean completion with a summary
- Completed work (sent messages, tool results) is preserved on interrupt
- Incomplete work (partial text, in-progress tool calls) is discarded

---

## Key Design Decisions

### 1. Keep the `done` Tool
The `done` tool is retained because it provides significant benefits:
- **Clean termination signal** — the model explicitly says "I'm finished"
- **Summaries for archival** — `done({ summary: "Sent reply to Sarah." })` is used by `extractRunSummary()` for consciousness compaction
- **Prevents rambling** — `toolChoice: 'required'` + `hasToolCall('done')` ensures the model always calls tools and terminates cleanly
- **No invisible text** — the model can't generate bare text that goes nowhere

### 2. Remove `peek_inbox`
No inbox exists to peek at. Events arrive and trigger runs directly.

### 3. Events Don't Appear as Steps
When a new event arrives during a run:
- The current run is **aborted** (via AbortSignal)
- Completed work is preserved in consciousness
- A **new run** starts with the new event injected as context
- The interruption is invisible to the model — it just sees a new event in its next run
- The stream emits `run.finished` (with `interrupted: true`) and then `run.started` for the new run

### 4. No Cooldown, No Debounce
Every event is processed immediately. No artificial delays. If multiple events are already in the Redis queue when BRPOP returns, they're all drained instantly and processed together in one run. But there's no waiting window — simplicity over optimization.

---

## Architecture

### Event Flow
```
External Service → POST /api/haseefs/:id/events → pushEvent()
                                                      ↓
                                              Redis LPUSH (wakeup)
                                              Postgres upsert (audit)
                                                      ↓
                                              BRPOP wakes process
                                                      ↓
                                         drainPendingEvents() (instant)
                                                      ↓
                                         ┌─── Is a run active? ───┐
                                         │                        │
                                        YES                       NO
                                         │                        │
                                    Abort current run         Start new run
                                    Wait for cleanup              │
                                    Reload consciousness          │
                                         │                        │
                                         └────── executeRun() ────┘
                                                      │
                                              streamText (AI SDK)
                                              toolChoice: 'required'
                                              stopWhen: hasToolCall('done')
                                                      │
                                              Save consciousness
                                              Update run record
```

### Interrupt & Rollback
When a run is interrupted:
1. **AbortSignal** cancels the `streamText` call
2. **Completed tool calls** (with results) → **KEPT** in consciousness
3. **In-progress tool calls** (no result yet) → **DISCARDED**
4. **Sent messages** → **KEPT** (already delivered externally)
5. **Partial text output** → **DISCARDED**
6. Consciousness is saved with preserved work
7. New run starts with full context including preserved work + new event

---

## Files Changed

### Core Changes
| File | Change |
|------|--------|
| `lib/agent-process.ts` | **Rewritten** — event-driven loop with interrupt/rerun, debounce, rollback |
| `lib/inbox.ts` | **Rewritten** — simplified to `pushEvent`, `waitForEvent`, `logEvent`, `recoverUnprocessedEvents`, `formatEventForConsciousness`. Removed drain/batch/peek/lifecycle. |
| `lib/consciousness.ts` | **Updated** — `extractCycles` → `extractRuns`, `isCycleStart` → `isRunStart` (supports both v5 "SENSE EVENTS" and v6 "EVENT" headers), `extractRunSummary` uses done tool summary |
| `agent-builder/prompt-builder.ts` | **Updated** — event-driven language, `runCount`/`lastActiveAt` instead of `cycleCount`/`lastCycleAt`, EVENT HANDLING instructions |
| `agent-builder/types.ts` | **Updated** — `HaseefProcessContext.cycleCount` → `runCount` |
| `agent-builder/builder.ts` | **Updated** — comment only (removed peek_inbox reference) |
| `agent-builder/prebuilt-tools/registry.ts` | **Updated** — removed `peek_inbox`, kept `done` |
| `agent-builder/prebuilt-tools/done.ts` | **Updated** — description uses event-driven language |
| `agent-builder/prebuilt-tools/peek-inbox.ts` | **Deprecated** — file emptied, no longer imported |
| `routes/haseefs.ts` | **Updated** — `pushToInbox` → `pushEvent` |

### Backward Compatibility
- **Redis key prefix**: Changed from `inbox:` to `events:` — existing inbox data won't interfere
- **Consciousness format**: `isRunStart()` supports both `"SENSE EVENTS ("` (v5) and `"EVENT ("` (v6) headers
- **DB schema**: No Prisma migration needed — `cycleCount` field name stays, just used semantically as "run count"
- **Legacy alias**: `pushToInbox` exported as alias for `pushEvent`

---

## Features

### 1. Instant Reactivity
Events are processed immediately, not queued for the next cycle. A message sent to Haseef triggers a response within milliseconds (plus LLM latency).

### 2. Natural Interruption
Like a human, Haseef can be interrupted mid-thought. If you send a follow-up message while Haseef is still responding to the first, it will:
- Stop the current response
- Preserve any messages already sent
- Start fresh with both messages in context

### 3. No Artificial Delays
Every event triggers immediate processing. No cooldowns, no debounce windows. If multiple events happen to be queued simultaneously, they're drained and processed together, but there's no waiting.

### 4. Clean Consciousness Management
- The `done` tool provides human-readable summaries for archived runs
- Old runs are compacted with summaries and stored for later retrieval
- No cycle boundaries cluttering the consciousness

### 5. Robust Rollback
Interrupted runs don't leave dangling state. Only fully completed work is preserved.

### 6. Simplified Codebase
- Removed: inbox queue, drain/batch logic, peek_inbox tool, cycle terminology
- Cleaner mental model: event → run → done

---

## System Prompt Changes

The Haseef now understands itself as event-driven:

> **HOW YOU WORK:**
> You are event-driven. When something happens in your world — a message, a notification, a sensor reading — you react to it naturally, like a human. You receive events, think, act using tools, and then rest until the next event. If a new event arrives while you are still thinking, you will be interrupted and given the new event alongside your previous context.

> **EVENT HANDLING:**
> 1. Read and understand what happened
> 2. Use tools to respond and take action
> 3. Call done to signal you are finished processing
