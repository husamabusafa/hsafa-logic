# 06 — Run Awareness

## Overview

An agent in v2 is always aware of its own execution state. It knows if it has active runs and what those runs are doing. This enables real reasoning continuity — the agent can avoid duplicating work, prioritize tasks, and coordinate across concurrent executions.

---

## Run States

| Status | Meaning |
|--------|----------|
| `queued` | Run created, waiting to start execution. |
| `running` | Agent is actively generating output and calling tools. |
| `waiting_tool` | Run is paused, waiting for a space tool (client-rendered UI) result. |
| `completed` | Run finished successfully. |
| `failed` | Run encountered an error. |
| `canceled` | Run was explicitly canceled. |

Runs are **short-lived and stateless**. There is no `waiting_reply` status — agents don't pause for chat messages. Every message triggers a fresh run. The only pause is `waiting_tool` for interactive UI components (forms, approval buttons).

---

## What the Agent Sees

At the start of every run, the agent's context includes:

```
ACTIVE RUNS:
  - Run abc-123 (this run) — triggered by Husam in "Project Alpha"
  - Run ghi-789 (running) — processing Jira webhook payload
```

### Fields Per Run

| Field | Description |
|-------|-------------|
| `runId` | Unique run ID |
| `status` | Current status |
| `triggerType` | What started the run |
| `triggerSummary` | Brief description (e.g., "Husam asked about Q4 report") |
| `activeSpaceId` | Which space the run is currently in |
| `startedAt` | When the run started |

---

## The `get_my_runs` Tool

Agents can query their own run history for deeper inspection:

```json
{
  "name": "get_my_runs",
  "inputSchema": {
    "type": "object",
    "properties": {
      "status": {
        "type": "string",
        "enum": ["running", "waiting_tool", "completed", "failed", "canceled"],
        "description": "Filter by status. Omit for all active runs."
      },
      "limit": {
        "type": "number",
        "description": "Max runs to return. Default: 10."
      }
    }
  }
}
```

### Response

```json
{
  "runs": [
    {
      "runId": "def-456",
      "status": "running",
      "triggerType": "space_message",
      "triggerSummary": "Ahmad asked for design review",
      "activeSpaceId": "space-design",
      "startedAt": "2026-02-18T14:00:00Z"
    }
  ],
  "totalActive": 2
}
```

---

## The `stop_run` Tool

Agents can cancel one of their own active runs:

```json
{
  "name": "stop_run",
  "description": "Cancel one of your own active runs by ID.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "runId": {
        "type": "string",
        "description": "The ID of the run to cancel. Must be one of your own runs."
      }
    },
    "required": ["runId"]
  }
}
```

### When to Use

When a new run starts and the agent sees a stale or superseded run — for example, an urgent message arrived while an older task was still processing — the agent can call `stop_run` to cancel it.

```
ACTIVE RUNS:
  - Run abc-123 (this run) — triggered by CEO: "urgent: cancel the deployment"
  - Run def-456 (running) — processing Designer's review in "Project Alpha"
```

Agent reasons: "Run def-456 is processing a design review, but the CEO just asked me to cancel the deployment. That's more urgent."
→ Calls `stop_run("def-456")` → then handles the urgent request.

---

## Deduplication

When an agent is triggered, the gateway checks for **existing active runs** with the same trigger context:

### Rules

1. If the agent already has a `running` run triggered by the **same message** (same `triggerMessageId`) → **skip** (prevent duplicate work from the same message).
2. If the agent has a `waiting_tool` run → new triggers are allowed (the agent can multitask).
3. Multiple concurrent `running` runs are allowed — the agent sees all of them in `ACTIVE RUNS`.

### Dedup Key

```
agentEntityId + triggerMessageId
```

Since every message triggers all other agent members (sender excluded), `triggerMessageId` is the natural dedup key. One run per agent per triggering message.

---

## Concurrent Run Coordination

An agent can have multiple runs active simultaneously. The context model ensures each run knows about the others.

### Independent Runs (Different Purposes)

```
Run 1: Husam in "Project Alpha": "pull Q4 report"
Run 2: Ahmad in "Support": "check the deployment status"

Run 1 context:
  ACTIVE RUNS:
    - Run 1 (this run) — Husam asked for Q4 report
    - Run 2 (running) — Ahmad asked about deployment

Run 2 context:
  ACTIVE RUNS:
    - Run 1 (running) — Husam asked for Q4 report
    - Run 2 (this run) — Ahmad asked about deployment
```

Each run sees the other. Since the purposes are unrelated, both proceed independently.

### Mid-Flight Absorption (Related Purposes)

When runs share a related purpose, the newer run can **absorb** the older one using `absorb_run`. This cancels the older run and returns its full snapshot (trigger context + actions taken so far). The absorbing run then handles both intents as one coherent action.

```
Run A: Husam: "Tell Muhammad the meeting is at 3pm"      (started 00:00)
Run B: Husam: "Tell him don't forget the documents"      (started 00:05)

Run B context:
  ACTIVE RUNS:
    - Run A (running) — "Tell Muhammad the meeting is at 3pm"
    - Run B (this run) — "Tell him don't forget the documents"

Run B reasoning: "Run A is about the same task. I should absorb it."
Run B calls: absorb_run({ runId: "run-a-id" })

→ Run A canceled. Run B receives Run A's trigger + actions.
→ Run B sends ONE message: "Meeting at 3pm. Don't forget the docs."
```

### Absorption After Partial Work

If the absorbed run already took actions (e.g., sent a message), the absorbing run sees what was done and adapts:

```
absorb_run returns:
  actionsTaken: [
    { tool: "send_message", text: "Meeting is at 3pm." }
  ]

Run B sees Run A already sent the meeting info.
Run B just adds: "Also, don't forget the documents."
```

### Race Conditions

If two runs try to absorb each other simultaneously:
- **First caller wins** — optimistic locking on run status
- The second call fails: `{ success: false, error: "run already canceled" }`
- The losing run proceeds independently (it still has its own trigger context)

**Prompt guidance:** The system prompt instructs: *"If you see active runs with related purposes in the same space, the run with the LATEST trigger should absorb the older ones."* This ensures the run with the most recent context takes charge.

---

## Run History

Agents can access their completed run history for continuity:

```json
{ "status": "completed", "limit": 5 }
```

Returns recent completed runs with summaries. This lets the agent remember what it did previously without relying solely on space message history.

### Use Cases

- "I already processed this Jira ticket in a previous run" → skip.
- "My last run generated a report — I can reference it" → continuity.
- "I've been asked this question before — here's what I said" → consistency.

---

## Run Lifecycle Events

The gateway emits run lifecycle events to the run's SSE stream:

| Event | When |
|-------|------|
| `run.started` | Run begins execution |
| `run.waiting_tool` | Run pauses for space tool result |
| `run.resumed` | Run resumes after tool result submitted |
| `run.completed` | Run finishes successfully |
| `run.failed` | Run encounters an error |
| `run.canceled` | Run is canceled |
| `run.absorbed` | Run is canceled via `absorb_run` (includes `absorbedByRunId`) |

### Space-Level Events

The gateway also broadcasts agent activity status to spaces:

| Event | When |
|-------|------|
| `agent.active` | Agent starts a run (broadcast to all spaces the agent belongs to) |
| `agent.inactive` | Agent finishes/pauses a run |

This powers the "Agent is active" UI indicator.

---

## Limits

| Limit | Default | Description |
|-------|---------|-------------|
| Max concurrent runs per agent | 5 | Prevents resource exhaustion |
| Max waiting_tool duration | 10 min | Auto-timeout for space tool waits |
| Max run duration | 30 min | Hard cap on any single run |
