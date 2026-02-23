# 10 — Prebuilt Tools Reference

## Overview

Every agent in Hsafa v3 receives a set of **prebuilt tools** injected by the gateway. These tools are always available regardless of the agent's custom tool configuration. They handle space interaction, messaging, and persistent state.

v3 removes the run-control tools (`stop_run`, `absorb_run`, `get_my_runs`) since there are no concurrent runs — the agent is a single process with one consciousness.

---

## Space Tools

### `enter_space`

Set the active space for the current think cycle. All subsequent messages and visible tool results go to this space.

| Property | Value |
|----------|-------|
| **Execution type** | Gateway (immediate) |
| **Visible** | No |

**Input:**
```json
{
  "spaceId": "string (required) — ID of the space to enter",
  "limit": "number (optional, default 50) — how many recent messages to load"
}
```

**Output:**
```json
{
  "success": true,
  "spaceId": "space-xyz",
  "spaceName": "Project Alpha",
  "history": [
    { "id": "msg-001", "senderName": "Husam", "senderType": "human", "content": "Can you check the status?", "timestamp": "2026-02-18T14:00:00Z" },
    { "id": "msg-002", "senderName": "Designer", "senderType": "agent", "content": "On it.", "timestamp": "2026-02-18T14:01:00Z" }
  ],
  "totalMessages": 48
}
```

**When to use:** The agent must call `enter_space` before sending messages. For space_message inbox events, the agent typically enters the source space first. For plan/service events, the agent decides which space to enter based on the task.

---

### `send_message`

Send a message to the active space. This is the primary communication tool.

| Property | Value |
|----------|-------|
| **Execution type** | Gateway (streamed) |
| **Visible** | Yes (always — it's a message) |
| **Triggers agents** | Yes — pushes to all other agent members' inboxes (sender excluded) |

**Input:**
```json
{
  "text": "string (required) — message content"
}
```

One parameter. That's it.

**Output:**
```json
{
  "success": true,
  "messageId": "msg-abc-123",
  "status": "delivered"
}
```

**When to use:** This is the agent's only way to communicate externally. The think cycle continues immediately after posting. Do NOT retry after receiving `{ success: true }`.

---

### `read_messages`

Read recent messages from a space.

| Property | Value |
|----------|-------|
| **Execution type** | Gateway (immediate) |
| **Visible** | No |

**Input:**
```json
{
  "spaceId": "string (optional — defaults to active space)",
  "limit": "number (optional, default 50)",
  "offset": "number (optional, for paging back)"
}
```

**Output:**
```json
{
  "messages": [
    {
      "id": "msg-abc",
      "content": "Hello everyone",
      "senderName": "Husam",
      "senderType": "human",
      "timestamp": "2026-02-18T14:50:00Z"
    }
  ],
  "total": 127
}
```

**When to use:** Load conversation history. `enter_space` already returns recent messages, but `read_messages` is useful for:
- Reading other spaces without switching active space
- Loading older messages beyond the default window
- Checking specific message details

---

### `peek_inbox`

Pull one or more pending inbox events into the current think cycle. The agent sees lightweight inbox previews via `prepareStep` at every step — if something looks relevant or urgent, it can call `peek_inbox` to get the **full event** and act on it immediately instead of waiting for the next cycle.

| Property | Value |
|----------|-------|
| **Execution type** | Gateway (immediate) |
| **Visible** | No |

**Input:**
```json
{
  "count": "number (optional, default 1) — how many events to pull",
  "filter": "string (optional) — filter by event type: 'space_message', 'plan', 'service'. Omit for any."
}
```

**Output:**
```json
{
  "events": [
    {
      "eventId": "evt-001",
      "type": "space_message",
      "timestamp": "2026-02-18T15:08:00Z",
      "data": {
        "spaceId": "space-family",
        "spaceName": "Family",
        "senderName": "Husam",
        "senderType": "human",
        "content": "Actually cancel that, I changed my mind about the Tokyo trip"
      }
    }
  ],
  "remaining": 1
}
```

**Behavior:**

1. Pops the requested number of events from the Redis inbox (removes them from the queue).
2. Returns the full event data — not just a preview.
3. The events are now part of the current cycle's context (in the tool result inside consciousness).
4. Remaining events stay in the inbox for the next cycle.

**When to use:** The agent sees a lightweight inbox preview (via `prepareStep`) and decides it needs the full event NOW. Common scenarios:

- **Correction spotted** — preview shows `Husam: "Actually cancel that..."` → agent peeks to get the full correction before continuing
- **Related context** — preview shows a message that's directly relevant to the current task → agent pulls it in
- **Human priority** — preview shows a human message while the agent is processing agent messages → agent peeks to handle the human first

**How it works with prepareStep:**

```
Step 0: Agent processes inbox events (3 events from drainInbox)
Step 1: Agent calls enter_space → tool result
Step 2: prepareStep shows:
          [INBOX PREVIEW — 1 waiting]
            [Family] Husam: "Actually cancel that, I changed..."
        Agent sees the preview in context →
        Agent calls peek_inbox({ count: 1 })
          → Returns full event: "Actually cancel that, I changed my mind about the Tokyo trip"
Step 3: Agent reads the full event, adapts its plan
Step 4: Agent sends updated message instead of the original one
```

**Without peek_inbox:** The agent would finish the current cycle, then process the correction in the NEXT cycle — possibly after already sending an outdated message.

**With peek_inbox:** The agent catches the correction mid-cycle and adapts immediately.

---

## Persistent State Tools

### `set_memories`

Store or update persistent key-value memories that survive across cycles and consciousness compaction.

| Property | Value |
|----------|-------|
| **Execution type** | Gateway (immediate) |
| **Visible** | No |

**Input:**
```json
{
  "memories": [
    { "key": "project_alpha_deadline", "value": "Q4 report due Feb 28" },
    { "key": "designer_prefers_png", "value": "Designer always requests PNG exports" }
  ]
}
```

**Output:**
```json
{ "success": true, "count": 2 }
```

Memories are injected into the system prompt (first message in consciousness) on every refresh, under a `MEMORIES:` block. They persist even when consciousness is compacted.

**When to use:** Store important facts that need to survive beyond the consciousness window — deadlines, preferences, discovered constraints, workflow state.

---

### `get_memories`

Read the agent's stored memories.

| Property | Value |
|----------|-------|
| **Execution type** | Gateway (immediate) |
| **Visible** | No |

**Input:**
```json
{
  "keys": ["string (optional) — specific keys to retrieve. If empty, returns all."]
}
```

**Output:**
```json
{
  "memories": [
    { "key": "project_alpha_deadline", "value": "Q4 report due Feb 28" },
    { "key": "designer_prefers_png", "value": "Designer always requests PNG exports" }
  ]
}
```

---

### `delete_memories`

Delete one or more of the agent's stored memories by key.

| Property | Value |
|----------|-------|
| **Execution type** | Gateway (immediate) |
| **Visible** | No |

**Input:**
```json
{
  "keys": ["project_alpha_deadline", "designer_prefers_png"]
}
```

**Output:**
```json
{ "success": true, "deleted": 2 }
```

---

### `set_goals`

Define or update the agent's current goals.

| Property | Value |
|----------|-------|
| **Execution type** | Gateway (immediate) |
| **Visible** | No |

**Input:**
```json
{
  "goals": [
    { "id": "goal-1", "description": "Complete Q4 report by Feb 28", "status": "active" },
    { "id": "goal-2", "description": "Review Designer's mockup", "status": "completed" }
  ]
}
```

Goals are injected into the system prompt on every refresh, under a `GOALS:` block. They help the agent maintain long-term focus across cycles.

---

### `delete_goals`

Delete one or more of the agent's goals by ID.

| Property | Value |
|----------|-------|
| **Execution type** | Gateway (immediate) |
| **Visible** | No |

**Input:**
```json
{
  "goalIds": ["goal-1", "goal-2"]
}
```

**Output:**
```json
{ "success": true, "deleted": 2 }
```

---

### `set_plans`

Create or update scheduled/conditional plans that push events to the agent's inbox.

| Property | Value |
|----------|-------|
| **Execution type** | Gateway (immediate) |
| **Visible** | No |

**Input:**
```json
{
  "plans": [
    {
      "name": "Daily Report",
      "cron": "0 9 * * *",
      "instruction": "Generate and post the daily metrics summary"
    },
    {
      "name": "Follow Up",
      "runAfter": "2 hours",
      "instruction": "Check if Husam responded to the mockup review request"
    },
    {
      "name": "Pre-launch checklist",
      "scheduledAt": "2026-03-01T08:00:00Z",
      "instruction": "Run the pre-launch checks before the product goes live"
    }
  ]
}
```

**Plan scheduling (mutually exclusive — use one per plan):**

| Field | Description |
|-------|-------------|
| `runAfter` | One-shot after relative delay (e.g., `"2 hours"`, `"30 minutes"`, `"1 day"`) |
| `scheduledAt` | One-shot at specific ISO timestamp |
| `cron` | Recurring schedule (standard cron expression) |

---

### `get_plans`

Read the agent's current plans.

| Property | Value |
|----------|-------|
| **Execution type** | Gateway (immediate) |
| **Visible** | No |

**Input:**
```json
{
  "status": "string (optional) — filter by status: active, completed, expired. Omit for all."
}
```

**Output:**
```json
{
  "plans": [
    { "id": "plan-abc", "name": "Daily Report", "cron": "0 9 * * *", "nextRunAt": "2026-02-19T09:00:00Z", "status": "active" },
    { "id": "plan-def", "name": "Follow Up", "scheduledAt": "2026-02-18T17:07:00Z", "status": "completed" }
  ]
}
```

---

### `delete_plans`

Delete one or more of the agent's plans by ID.

| Property | Value |
|----------|-------|
| **Execution type** | Gateway (immediate) |
| **Visible** | No |

**Input:**
```json
{
  "planIds": ["plan-abc", "plan-def"]
}
```

**Output:**
```json
{ "success": true, "deleted": 2 }
```

---

## Quick Reference Table

| Tool | Purpose | Visible | Triggers Agents | Pauses Cycle |
|------|---------|---------|-----------------|--------------|
| `enter_space` | Set active space + load history | No | No | No |
| `send_message` | Send message to space | Yes | Yes (other agents) | No |
| `read_messages` | Read space history | No | No | No |
| `peek_inbox` | Pull pending inbox events into current cycle | No | No | No |
| `set_memories` | Store persistent memories | No | No | No |
| `get_memories` | Read stored memories | No | No | No |
| `delete_memories` | Delete memories by key | No | No | No |
| `set_goals` | Define agent goals | No | No | No |
| `delete_goals` | Delete goals by ID | No | No | No |
| `set_plans` | Create scheduled triggers | No | No | No |
| `get_plans` | Read current plans | No | No | No |
| `delete_plans` | Delete plans by ID | No | No | No |

---

## Removed from v2

| v2 Tool | Why Removed in v3 |
|---------|-------------------|
| `stop_run` | No concurrent runs — one process per agent |
| `absorb_run` | No concurrent runs — inbox batches events |
| `get_my_runs` | No runs to query — agent has one continuous process |

---

## Relationship to Custom Tools

Prebuilt tools are injected **in addition to** the agent's custom tools (defined in agent config JSON). Custom tools follow the same execution pipeline but can be:
- **Gateway-executed** (`executionType: "gateway"`) — server-side HTTP/function call
- **Space-executed** (`executionType: "space"`) — client-side tool requiring user interaction
- **Internal** (`executionType: "internal"`) — no execution, result provided by client
- **MCP tools** — from configured MCP servers

Custom tools use the `visible: true/false` flag to control whether their input/output is streamed to the active space.
