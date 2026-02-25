# 06 — Tool System

## Overview

Tools are **fully generalized and space-agnostic**. No tool has special routing logic. No tool receives `spaceId` as a parameter. Tools are pure capabilities — the gateway handles where their results appear based on configuration.

Tools can be **dynamically discovered at runtime** via MCP.

---

## Tool Configuration

A tool is defined by a minimal config:

```json
{
  "name": "confirmAction",
  "description": "Ask the user to confirm an action",
  "inputSchema": { /* JSON Schema */ },
  "executionType": "space",
  "visible": true,
  "isAsync": true,
  "timeout": 30000,
  "execution": { "url": "...", "method": "POST" }
}
```

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Tool name. Frontend uses this to pick the UI component when `visible: true`. |
| `description` | Yes | Description shown to the LLM. |
| `inputSchema` | Yes | JSON Schema for tool input parameters. |
| `executionType` | Yes | `gateway`, `external`, `space`, or `internal`. |
| `visible` | No | Whether tool call + result appear in the active space. Default: `true` (except `internal` = `false`). |
| `isAsync` | No | If `true`, returns `{ status: "pending" }` immediately — result arrives via inbox. Default: `false`. |
| `timeout` | No | Max ms to wait for the result (when `isAsync: false`). Default: 30000. Agent **never waits forever**. |
| `execution` | No | Execution config (URL, method, headers). |

### No `display.customUI`

The frontend determines how to render a visible tool based on its **tool name** — not a separate config field. If `visible: true`, the tool call is posted to the active space and the frontend maps `toolName → UI component`.

```tsx
// Frontend: tools.by_name maps tool name to component
tools: {
  by_name: {
    confirmAction: ConfirmationUI,
    displayChart: ChartDisplay,
  },
  Fallback: GenericToolCallPart,
}
```

---

## Execution Types

| Type | Description |
|------|-------------|
| `gateway` | HTTP call to a URL (`execution.url`). Always inline. |
| `external` | SDK / external server handles execution. Result submitted via API. |
| `space` | Rendered as interactive UI in the active space. User provides result. |
| `internal` | No execution needed. Returns the input args as the result immediately. |

---

## `isAsync` vs `timeout` — Two Independent Controls

These are **separate** config fields, not derived from each other.

### `isAsync: true` — Fire and Forget

The tool creates a `PendingToolCall` and returns `{ status: "pending" }` immediately. The agent continues with other work. The real result arrives in the agent's inbox in a later cycle.

Use for: confirmations, approvals, long-running jobs — anything where you don't want the agent to block.

### `isAsync: false` (default) — Wait for Result

The tool blocks and waits for the result:
- **Has `execution.url`** → makes HTTP request, returns result inline.
- **No URL** → creates `PendingToolCall` with status `waiting`, polls for the external result up to `timeout` ms. If resolved → returns result inline. If timeout → returns **error** (not pending).

**The agent never waits forever.** Every sync tool has a timeout (default 30s). If no result arrives, the tool returns an error.

### Decision Flow

```
Tool called
  ├─ internal?         → return { success: true, args }
  ├─ has URL?          → HTTP request → return result
  ├─ isAsync: true?    → PendingToolCall (status: 'pending') → return pending
  └─ isAsync: false    → PendingToolCall (status: 'waiting')
                          → poll for result up to timeout
                          → resolved? return result
                          → timeout?  return error
```

### Visible Tool Without a Space

If the agent calls a visible tool **without first calling `enter_space`**, the tool returns an error:

```json
{ "error": "Tool \"confirmAction\" is visible but you are not in a space. Call enter_space first." }
```

---

### Examples

**Inline (URL)** — Weather API:
```json
{
  "name": "fetchWeather",
  "executionType": "gateway",
  "visible": true,
  "execution": { "url": "https://api.weather.com/current", "method": "GET" }
}
```

**Sync with timeout (no URL)** — External server responds within 10s:
```json
{
  "name": "fetchExternalData",
  "executionType": "external",
  "visible": false,
  "isAsync": false,
  "timeout": 10000
}
```
The SDK detects the tool call via SSE, the external server processes it, submits result via `POST /api/runs/:runId/tool-results`. If submitted within 10s → agent gets result inline. If not → error returned to agent. If the result arrives later, it reaches the agent via inbox.

**Async** — Confirmation dialog:
```json
{
  "name": "confirmAction",
  "executionType": "space",
  "visible": true,
  "isAsync": true
}
```
Returns `{ status: "pending" }` immediately. User sees the confirmation UI in the space. When they click confirm/reject, the result arrives in the agent's inbox.

**Internal** — Display chart:
```json
{
  "name": "displayChart",
  "executionType": "internal",
  "visible": true
}
```
Agent provides chart data as input. Tool returns `{ success: true, args }` immediately. Chart rendered in the active space by the frontend.

---

## Tool Visibility

| Value | Behavior |
|-------|----------|
| `true` | Tool call + result posted to the **active space** as a message. Streamed in real-time. |
| `false` | Tool executes silently. Result only available to the agent in consciousness. |

**Default**: `false` for `internal`, `true` for all others.

### Visible Tools Require a Space

The agent **must call `enter_space` before using a visible tool** so it appears in the correct space. If the agent hasn't entered a space, visible tool calls will not be displayed anywhere. The system prompt instructs the agent about this.

---

## Built-in Tools (Gateway-Provided)

Automatically injected into every agent. Not configurable.

| Tool | Description |
|------|-------------|
| `enter_space` | Set the active space and load history. |
| `leave_space` | Exit the active space. |
| `send_message` | Send a message to the active space. |
| `read_messages` | Read messages from a space (with offset/limit). |
| `skip` | Skip this cycle (nothing to do). |
| `set_goals` | Create/update agent goals. |
| `delete_goals` | Delete agent goals. |
| `set_memories` | Create/update agent memories. |
| `delete_memories` | Delete agent memories. |
| `set_plans` | Create/update agent plans. |
| `delete_plans` | Delete agent plans. |
| `get_plans` | Read agent's plans. |

Built-in tools are always invisible (`visible: false`).

---

## Tool Execution Flows

### `isAsync: true` — Result via Inbox

```
Cycle 15:
  INBOX: [Husam: "Book a hotel in Tokyo"]
  Agent → calls confirmAction("Confirm booking?")
  Tool result: { status: "pending", pendingToolCallId: "tc-abc" }
  Agent: "Asked Husam to confirm. Moving on to other tasks."
  → cycle ends, consciousness saved

Cycle 16:
  INBOX: [Tool Result: confirmAction] (callId: tc-abc) { "confirmed": true }
  Agent: "Husam confirmed! Booking now..."
  Agent → calls bookHotel(...)
```

### `isAsync: false` + `timeout` — Wait for Result

```
Cycle 15:
  INBOX: [Husam: "Look up active projects"]
  Agent → calls fetchExternalData({ query: "active projects" })
  → PendingToolCall created with status: 'waiting'
  → Gateway polls for result (up to 10s)
  → External server detects tool call via SSE, submits result in 3s
  Tool result: { source: "pm-api", results: [...] }  (returned inline!)
  Agent: "Found 3 active projects: ..."
```

If the external server takes longer than the timeout:
```
  → Timeout expires, status flipped to 'pending'
  Tool result: { error: "Tool timed out after 10000ms" }
  Agent sees the error and can inform the user or retry.
  → If the result arrives later, it reaches the agent via inbox.
```

### PendingToolCall Status Flow

```
  isAsync: true
  ─────────────
  Created → status: 'pending'
          → return { status: "pending" } immediately
          → tool-results API resolves → push inbox event

  isAsync: false (with timeout)
  ──────────────────────────────
  Created → status: 'waiting'
          → poll for result up to timeout
            ├─ resolved in time?  → return result inline
            └─ timeout expired?   → flip to 'pending', return error
                                    → late result still reaches inbox
```

### PendingToolCall Table

| Column | Purpose |
|--------|---------|
| `toolCallId` | Unique key for result submission |
| `agentEntityId` | Which agent owns this call |
| `runId` | Which cycle spawned it |
| `toolName` + `args` | What was called |
| `status` | `waiting` → `resolved` (inline) or `pending` → `resolved` (inbox) |
| `result` | Filled when result arrives |
| `expiresAt` | Optional TTL for auto-expiry |

### Result Submission API

`POST /api/runs/:runId/tool-results` with `{ callId, result }`

1. Looks up `PendingToolCall` by `callId`
2. Updates status to `resolved`, stores result
3. If previous status was `pending` → pushes `tool_result` inbox event (agent wakes in next cycle)
4. If previous status was `waiting` → skips inbox push (inline waiter picks up the result)
5. Updates the persisted `SmartSpaceMessage` from `requires_action` → `complete` (if visible)

---

## Visible Tool Results in Spaces

Visible tool calls share the same **routing and storage pipeline** as `send_message` — both are streamed to the active space and stored as `SmartSpaceMessage` records.

- **Content**: Structured input + output, stored in the message record as metadata.
- **Rendering**: Frontend renders UI based on the **tool name**. No config-level `customUI` field.
- **Cannot be replied to**: Visible tool messages are display-only.
- **Cannot trigger agents**: Unlike `send_message`, visible tool results do not push to other agents' inboxes.

### Streaming Events

When a visible tool is invoked:
1. `tool.started` — Tool invocation began.
2. `tool.streaming` — Partial args streamed incrementally.
3. `tool.done` — Tool completed with result (for inline tools).
4. `tool.error` — Tool execution failed.

For async visible tools (e.g. `confirmAction`), the message stays in `requires_action` status until the result is submitted.

---

## MCP Tools

MCP (Model Context Protocol) tools are loaded from external MCP servers at agent build time.

### Configuration

```json
{
  "mcp": {
    "servers": [
      {
        "name": "github-tools",
        "url": "https://mcp.github.com",
        "transport": "http",
        "allowedTools": ["list_prs", "create_issue"]
      }
    ]
  }
}
```

MCP tools behave like `gateway` tools with `visible: false` by default. They execute on the MCP server and return results to the agent.

---

## Design Principles

- **No `display.customUI`** — frontend maps tool name → component.
- **No special tools** — every tool follows the same pipeline.
- **Timeout determines sync/async** — simple, general rule.
- **SDK-driven external tools** — no gateway execution needed for external tools. The SDK detects tool calls and the external server handles execution.
- **Visible tools require a space** — agent must `enter_space` first.
