# 06 — Run Awareness

## Overview

An agent in v2 is always aware of its own execution state. It knows if it has active runs, paused runs, waiting runs, and what those runs are doing. This enables real reasoning continuity — the agent can avoid duplicating work, prioritize tasks, and coordinate across concurrent executions.

---

## Run States

| Status | Meaning |
|--------|---------|
| `queued` | Run created, waiting to start execution. |
| `running` | Agent is actively generating output and calling tools. |
| `waiting_reply` | **New in v2.** Run is paused, waiting for reply to a `send_message(wait: true)` call. |
| `waiting_tool` | Run is paused, waiting for a space tool (client-rendered UI) result. |
| `completed` | Run finished successfully. |
| `failed` | Run encountered an error. |
| `canceled` | Run was explicitly canceled. |

### New: `waiting_reply`

This is the key addition in v2. When an agent calls `send_message` with `wait: true`, the run enters `waiting_reply`. It's distinct from `waiting_tool` because:

- `waiting_tool` = waiting for a UI interaction from the frontend.
- `waiting_reply` = waiting for a message from another entity in a space.

---

## What the Agent Sees

At the start of every run, the agent's context includes:

```
ACTIVE RUNS:
  - Run abc-123 (this run) — triggered by Husam in "Project Alpha"
  - Run def-456 (waiting_reply) — waiting for Designer's reply in "Design Review"
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
| `waitingFor` | If `waiting_reply`: who the run is waiting for |

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
        "enum": ["running", "waiting_reply", "waiting_tool", "completed", "failed", "canceled"],
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
      "status": "waiting_reply",
      "triggerType": "space_message",
      "triggerSummary": "Ahmad asked for design review",
      "activeSpaceId": "space-design",
      "startedAt": "2026-02-18T14:00:00Z",
      "waitingFor": [
        { "entityId": "entity-designer", "entityName": "Designer", "responded": false }
      ]
    }
  ],
  "totalActive": 3
}
```

---

## The `stop_run` Tool

Agents can cancel one of their own active or waiting runs:

```json
{
  "name": "stop_run",
  "description": "Cancel one of your own active or waiting_reply runs by ID.",
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

When a new run starts and the agent sees a superseded `waiting_reply` run in its `ACTIVE RUNS` context — for example, an urgent message arrived while an older task was waiting for a reply — the agent can call `stop_run` to cancel the stale waiting run before proceeding.

```
ACTIVE RUNS:
  - Run abc-123 (this run) — triggered by CEO: "urgent: cancel the deployment"
  - Run def-456 (waiting_reply) — waiting for Designer's reply in "Project Alpha"
```

Agent reasons: "Run def-456 is waiting for a design review, but the CEO just asked me to cancel the deployment. That's more urgent and supersedes the design task."
→ Calls `stop_run("def-456")` → then handles the urgent request.

---

## Deduplication

When an agent is triggered, the gateway checks for **existing active runs** with the same trigger context:

### Rules

1. If the agent already has a `running` run triggered by the **same message** (same `triggerMessageId`) → **skip** (prevent duplicate work from the same message).
2. If the agent has a `waiting_reply` run in the same space → the new trigger is allowed (the agent can handle both).
3. If the agent has a `waiting_tool` run → new triggers are allowed (the agent can multitask).

### Dedup Key

```
agentEntityId + triggerMessageId
```

Since every message triggers all other agent members (sender excluded), `triggerMessageId` is the natural dedup key. One run per agent per triggering message.

---

## Concurrent Run Coordination

An agent can have multiple runs active simultaneously. The context model ensures each run knows about the others:

### Scenario: Agent Receives Two Requests Simultaneously

```
Run 1: Husam asks "@Agent pull Q4 report"
Run 2: Ahmad asks "@Agent check the deployment status"

Run 1 context:
  ACTIVE RUNS:
    - Run 1 (this run) — Husam asked for Q4 report
    - Run 2 (running) — Ahmad asked about deployment

Run 2 context:
  ACTIVE RUNS:
    - Run 1 (running) — Husam asked for Q4 report
    - Run 2 (this run) — Ahmad asked about deployment
```

Each run can see the other and reason about whether to coordinate or work independently.

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
| `run.waiting_reply` | Run pauses for reply |
| `run.waiting_tool` | Run pauses for space tool result |
| `run.resumed` | Run resumes after wait |
| `run.completed` | Run finishes successfully |
| `run.failed` | Run encounters an error |
| `run.canceled` | Run is canceled |

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
| Max waiting_reply duration | 5 min | Auto-timeout for reply waits |
| Max waiting_tool duration | 10 min | Auto-timeout for space tool waits |
| Max run duration | 30 min | Hard cap on any single run |
| Max sequential waits per run | 10 | Prevents infinite wait loops |
