# 14 — Prebuilt Tools Reference

## Overview

Every agent in Hsafa v2 receives a set of **prebuilt tools** injected by the gateway. These tools are always available regardless of the agent's custom tool configuration. They handle space interaction, messaging, run control, and persistent state.

---

## Space Tools

### `enter_space`

Set the active space for the current run. All subsequent messages and visible tool results go to this space.

| Property | Value |
|----------|-------|
| **Execution type** | Gateway (immediate) |
| **Visible** | No |
| **Auto-set on trigger** | Yes — for `space_message` triggers, the trigger space is auto-entered |

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
    { "id": "msg-001", "senderName": "Husam", "senderType": "human", "content": "Can you check the status?", "timestamp": "2026-02-18T14:00:00Z", "seen": true },
    { "id": "msg-002", "senderName": "Designer", "senderType": "agent", "content": "On it.", "timestamp": "2026-02-18T14:01:00Z", "seen": false }
  ],
  "totalMessages": 48
}
```

The `history` array contains the last N messages from the space, formatted as a timeline. Each entry is tagged `seen: true` if the agent has processed it in a previous run (`lastProcessedMessageId`), or `seen: false` if it's new. This is the same `[SEEN]`/`[NEW]` logic used by the trigger-space context block.

**When to use:** Plan/service triggers start with no active space — the agent must call `enter_space` to set context and load history before sending messages. For `space_message` triggers, the trigger space is auto-entered and its history is already loaded in the system prompt, but the agent can call `enter_space` on a *different* space to load that space's context (e.g., before sending a cross-space message).

---

### `send_message`

Send a message to the active space. This is the primary communication tool.

| Property | Value |
|----------|-------|
| **Execution type** | Gateway (streamed) |
| **Visible** | Yes (always — it's a message) |
| **Triggers agents** | Yes — triggers all other agent members in the space (sender excluded) |

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

**When to use:** This is the agent's only way to communicate. The run continues immediately after posting. Conversational continuity happens through context — the next message in the space triggers a fresh run that reads the full timeline.

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

**When to use:** Load conversation history for context. The system prompt already includes recent messages from the trigger space, but `read_messages` is useful for:
- Reading other spaces the agent is a member of
- Loading older messages beyond the system prompt window
- Checking specific message details

---

## Run Control Tools

### `stop_run`

Cancel one of the agent's own active runs by ID. Used to cancel stale or superseded runs when a higher-priority task arrives.

| Property | Value |
|----------|-------|
| **Execution type** | Gateway (immediate) |
| **Visible** | No |

**Input:**
```json
{
  "runId": "string (required) — ID of the run to cancel. Must be one of your own runs."
}
```

**Output:**
```json
{ "success": true, "canceledRunId": "run-def-456" }
```

**When to use:** When the agent sees a stale or superseded run in its ACTIVE RUNS block and wants to cancel it. For example, an urgent message arrived while an older task was still processing.

**Note:** To end the *current* run silently, the agent simply stops generating (ends the tool loop) without sending a message. No explicit tool call needed.

---

### `get_my_runs`

Query the agent's own run history.

| Property | Value |
|----------|-------|
| **Execution type** | Gateway (immediate) |
| **Visible** | No |

**Input:**
```json
{
  "status": "string (optional) — filter by status: running, waiting_tool, completed, cancelled",
  "limit": "number (optional, default 10)"
}
```

**Output:**
```json
{
  "runs": [
    {
      "runId": "run-abc",
      "status": "running",
      "triggerType": "space_message",
      "triggerSummary": "Husam: 'Pull the Q4 numbers'",
      "activeSpaceId": "space-xyz",
      "startedAt": "2026-02-18T15:06:55Z"
    },
    {
      "runId": "run-def",
      "status": "running",
      "triggerType": "space_message",
      "triggerSummary": "Designer: 'Here's the mockup'",
      "activeSpaceId": "space-abc",
      "startedAt": "2026-02-18T15:04:00Z"
    }
  ]
}
```

**When to use:** Concurrent run awareness. The agent can check if it already has an active run for the same task, avoiding duplicate work.

---

## Persistent State Tools

### `set_memories`

Store or update persistent key-value memories that survive across runs.

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

Memories are injected into the system prompt of every future run, under a `MEMORIES:` block.

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

Goals are injected into the system prompt of every future run, under a `GOALS:` block. They help the agent maintain long-term focus across multiple runs.

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

### `set_plans`

Create or update scheduled/conditional plans that trigger the agent automatically.

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
| `runAfter` | One-shot trigger after a relative delay (e.g., `"2 hours"`, `"30 minutes"`, `"1 day"`) |
| `scheduledAt` | One-shot trigger at a specific ISO timestamp |
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

| Tool | Purpose | Visible | Triggers Agents | Pauses Run |
|------|---------|---------|-----------------|------------|
| `enter_space` | Set active space + load history | No | No | No |
| `send_message` | Send message to space | Yes | Yes (other agents) | No |
| `read_messages` | Read space history | No | No | No |
| `stop_run` | Cancel an active run by ID | No | No | Yes (terminates) |
| `get_my_runs` | Query own run history | No | No | No |
| `set_memories` | Store persistent memories | No | No | No |
| `get_memories` | Read stored memories | No | No | No |
| `delete_memories` | Delete memories by key | No | No | No |
| `set_goals` | Define agent goals | No | No | No |
| `delete_goals` | Delete goals by ID | No | No | No |
| `set_plans` | Create scheduled triggers | No | No | No |
| `get_plans` | Read current plans | No | No | No |
| `delete_plans` | Delete plans by ID | No | No | No |

---

## Relationship to Custom Tools

Prebuilt tools are injected **in addition to** the agent's custom tools (defined in the agent config JSON). Custom tools follow the same execution pipeline but can be:
- **Gateway-executed** (`executionType: "gateway"`) — server-side HTTP/function call
- **Space-executed** (`executionType: "space"`) — client-side tool requiring user interaction
- **Internal** (`executionType: "internal"`) — no execution, result provided by client
- **MCP tools** — from configured MCP servers

Custom tools use the `visible: true/false` flag to control whether their input/output is streamed and posted to the active space.

---

## Vercel AI SDK Tool Type Mapping

For developers familiar with the Vercel AI SDK, here's how Hsafa tool types map:

| Vercel AI SDK | Hsafa Equivalent | Notes |
|---------------|-----------------|-------|
| Server-side tool (with `execute`) | `executionType: "gateway"` | Auto-executed on gateway |
| Client-side auto tool (`onToolCall`) | `executionType: "internal"` | Client executes, returns result |
| Client-side interactive tool (no `execute`) | `executionType: "space"` with `visible: true` | Displayed in UI, user provides result |
| `tool({ strict: true })` | Not yet supported | Schema strictness is provider-dependent |
| `inputExamples` | Not yet supported | Could be added to agent config |

### Key Difference

In Vercel AI SDK, tools are defined per-request in the `streamText()` call. In Hsafa, tools are **configured per-agent** in the agent config JSON and injected at build time. This means:
- Tool configuration lives in the DB, not in code
- Tools are consistent across all runs for an agent
- Prebuilt tools are always injected alongside custom tools
- Tool visibility (`visible: true`) controls space posting — Vercel has no equivalent (tools are always silent)
