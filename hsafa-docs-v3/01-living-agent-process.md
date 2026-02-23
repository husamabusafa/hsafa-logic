# 01 — Living Agent Process

## Overview

An AI agent in Hsafa v3 is a **persistent process** — a long-running loop that sleeps when idle, wakes when events arrive, thinks through a single `streamText` call, and goes back to sleep. There are no "runs" in the traditional sense. The agent is always alive.

---

## The Process Loop

```
┌──────────────────────────────────────────────────────────┐
│                    AGENT PROCESS                         │
│                                                          │
│  ┌──────────┐    ┌───────────────┐    ┌──────────────┐  │
│  │  INBOX   │───▶│  THINK CYCLE  │───▶│     ACT      │  │
│  │ (Redis)  │    │ (streamText)  │    │ (tools/msgs) │  │
│  └──────────┘    └───────────────┘    └──────────────┘  │
│       ▲                │                     │           │
│       │                ▼                     │           │
│       │     ┌───────────────────┐            │           │
│       │     │   CONSCIOUSNESS   │◀───────────┘           │
│       │     │  (ModelMessage[]) │                        │
│       │     │  sliding window   │                        │
│       │     └───────────────────┘                        │
│       │                                                  │
│  SLEEP ◀─── no events ─── LOOP BACK ◀── check inbox ──  │
│    │                                                     │
│    └── wakeup signal (Redis BRPOP / pub/sub) ─────────── │
└──────────────────────────────────────────────────────────┘
        ▲
   ┌────┴───────────────────────────────────┐
   │  Space A: message from Husam           │
   │  Space B: message from Ahmad           │
   │  Space C: Agent-B says "done"          │
   │  Timer: scheduled plan fires           │
   │  Service: Jira webhook                 │
   └────────────────────────────────────────┘
```

---

## Pseudocode

```typescript
async function agentProcess(agentId: string) {
  // Load consciousness from DB (last N ModelMessages)
  let consciousness: ModelMessage[] = await loadConsciousness(agentId);
  
  while (true) {
    // 1. SLEEP — block until inbox has events (zero CPU, zero cost)
    await waitForInbox(agentId); // Redis BRPOP
    
    // 2. WAKE — drain all pending events from inbox
    const events = await drainInbox(agentId);
    if (events.length === 0) continue;
    
    // 3. INJECT — format events as a user message and append to consciousness
    const inboxMessage: ModelMessage = {
      role: 'user',
      content: formatInboxEvents(events),
    };
    consciousness.push(inboxMessage);
    
    // 4. THINK — one streamText call processes everything
    const result = streamText({
      model: defaultModel,
      messages: consciousness,
      tools: agentTools,
      stopWhen: [stepCountIs(MAX_STEPS), tokenBudgetExceeded],
      prepareStep: async ({ stepNumber, steps }) => {
        // Dynamic model selection, tool phase gates, mid-cycle inbox check
        return prepareStepConfig(agentId, stepNumber, steps);
      },
    });
    
    // 5. PROCESS — stream-processor handles tool events (streaming to spaces)
    await processStream(result);
    
    // 6. SAVE — append new messages to consciousness
    const newMessages = (await result.response).messages;
    consciousness.push(...newMessages);
    
    // 7. COMPACT — trim consciousness if it exceeds the window
    consciousness = await compactConsciousness(consciousness);
    
    // 8. PERSIST — save consciousness to DB
    await saveConsciousness(agentId, consciousness);
    
    // Loop back to step 1 — sleep again
  }
}
```

---

## Lifecycle States

The agent process has exactly three states:

| State | What's Happening | Resource Cost |
|-------|-----------------|---------------|
| **Sleeping** | Blocked on `waitForInbox()`. No LLM, no CPU. | ~0 (one Redis connection) |
| **Thinking** | `streamText()` is executing. LLM generating, tools running. | LLM tokens + compute |
| **Processing** | Stream processor handling events. Persisting messages. | Minimal CPU + DB |

There is no `queued`, `running`, `waiting_tool`, `completed`, `failed`, `canceled` run status. The agent is either sleeping or thinking.

### Interactive Tool Pause

The one exception: when the agent calls an interactive `space` tool (e.g., approval dialog), the think cycle pauses until the user submits a result. This is handled by the SDK — a tool without `execute` stops the `streamText` loop. The process waits for the tool result, then resumes the cycle.

---

## One Process Per Agent

Every agent has exactly **one process**. This eliminates all concurrent run coordination problems from v2:

| v2 Problem | v3 Solution |
|------------|-------------|
| Multiple concurrent runs with overlapping context | One process, sequential think cycles |
| `absorb_run` for merging related runs | Inbox batches events — one cycle handles all |
| Race conditions between concurrent `send_message` calls | Sequential execution within one cycle |
| Deduplication of concurrent triggers | Inbox deduplicates by event ID |
| `ACTIVE RUNS` context block | Not needed — no concurrent runs |

### Why Sequential Is Better

In v2, if Husam sent two messages quickly:
1. Two runs started concurrently
2. Each had its own context snapshot (potentially stale)
3. The newer run had to absorb the older one mid-flight
4. Edge cases: both runs acted before absorption, partial work, race conditions

In v3, those two messages both land in the inbox. The agent wakes once, reads both messages together, and responds coherently in one think cycle. No coordination needed.

---

## Inbox Batching

When the agent is sleeping and multiple events arrive, they all queue in the inbox. When the agent wakes, `drainInbox()` pulls **all pending events** at once:

```
[00:00] Husam: "Tell Muhammad the meeting is at 3pm"    → inbox
[00:05] Husam: "Also tell him to bring the documents"   → inbox
[00:06] Ahmad: "What's the status of the Q4 report?"    → inbox

Agent wakes at [00:06]:
  events = [
    { type: "space_message", space: "Family", sender: "Husam", text: "Tell Muhammad..." },
    { type: "space_message", space: "Family", sender: "Husam", text: "Also tell him..." },
    { type: "space_message", space: "Support", sender: "Ahmad", text: "What's the status..." },
  ]
```

The agent sees all three events in one think cycle and can handle them coherently:
- Sends ONE message to Muhammad with both items
- Responds to Ahmad about the Q4 report
- All in a single `streamText` call

### During a Think Cycle

If new events arrive **while** the agent is thinking, they queue in the inbox for the next cycle. The `prepareStep` callback can optionally check for urgent events mid-cycle and inject them (see [04-think-cycle.md](./04-think-cycle.md)).

---

## Process Lifecycle

### Startup

When the gateway starts (or when an agent is first created), the agent process is spawned:

1. Load agent config from DB
2. Load consciousness from DB (or initialize empty)
3. Build tools (prebuilt + custom + MCP)
4. Enter the process loop

### Shutdown

On graceful shutdown:
1. Finish the current think cycle (if any)
2. Save consciousness to DB
3. Close Redis connections

On crash:
1. Consciousness is already persisted after each cycle
2. On restart, consciousness is loaded from DB — the agent picks up where it left off
3. Any unprocessed inbox events remain in Redis — they'll be processed on restart

### Scaling

Each agent process is independent. Multiple agents run as separate process loops, potentially on different server instances. Redis acts as the coordination layer:
- Inbox: Redis list per agent
- Pub/Sub: space channels for event fan-out
- Consciousness: persisted to DB, loaded on startup

---

## Cost Model

| Activity | Cost |
|----------|------|
| Agent sleeping | ~$0 (Redis connection only) |
| Agent thinking (per cycle) | LLM tokens (prompt + completion) |
| Tool execution | Depends on tool (HTTP calls, DB queries, etc.) |
| Consciousness persistence | DB write per cycle |

The key insight: **1000 sleeping agents cost almost nothing.** They only consume resources when they have work to do. This makes it economically viable to have many agents, each responsible for a narrow domain, sleeping most of the time.

---

## Comparison to v2

| Aspect | v2 (Stateless Runs) | v3 (Living Agent) |
|--------|---------------------|-------------------|
| Unit of work | Run (fresh LLM invocation) | Think cycle (one `streamText` call) |
| Context | Rebuilt from DB every run (system prompt) | Consciousness persists across cycles |
| Multiple triggers | Multiple concurrent runs | Batched in inbox, one cycle handles all |
| Coordination | `absorb_run`, `ACTIVE RUNS` block | Not needed — sequential processing |
| Resource usage when idle | None (no process exists) | ~0 (sleeping on Redis) |
| Continuity | Memories + goals bridge runs | Consciousness IS the continuity |
| Agent text output | Internal reasoning (same) | Internal reasoning (same) |
