# 03 — Tool System

## Overview

In v2, tools are **fully generalized and space-agnostic**. No tool has special routing logic. No tool receives `spaceId` or `targetSpaceId` as a parameter. Tools are pure capabilities — the gateway handles where their results appear based on configuration.

---

## Tool Execution Types

Every tool has an `executionType` that determines how it runs:

| Type | Runs Where | Description |
|------|-----------|-------------|
| `gateway` | Gateway server | HTTP requests, computations, image generation, AI sub-agents. |
| `external` | External service | Tool call is forwarded to an external service (Node.js, Python, etc.) via webhook/API. The service returns the result. |
| `space` | Client/browser | Tool call is rendered in the active space as interactive UI. The user (or frontend logic) submits the result. Run pauses until result arrives. |
| `internal` | Gateway server | Like `gateway`, but results are never shown in any space. Purely internal. |

### Mapping from v1

| v1 Type | v2 Type |
|---------|---------|
| `basic` (no-execution / static) | `space` (for UI tools) or `internal` |
| `request` | `gateway` |
| `ai-agent` | `gateway` |
| `image-generator` | `gateway` |
| `compute` | `gateway` or `internal` |
| `waiting` | Removed (replaced by `send_message` with `wait`) |
| `prebuilt` | Internal gateway tools (not configurable) |

---

## Tool Visibility

Each tool's configuration declares whether its result should appear in the active space using a simple boolean:

```json
{
  "name": "fetchWeather",
  "executionType": "gateway",
  "visible": true,
  "execution": {
    "url": "https://api.weather.com/current",
    "method": "GET"
  }
}
```

### Visibility

| Value | Behavior |
|-------|----------|
| `true` | Tool call + result are posted to the **active space** as a message. Streamed in real-time. |
| `false` | Tool executes silently. Result is only available to the agent internally. |

**Default**: `false` for `internal` tools, `true` for `gateway`, `external`, and `space` tools.

### No Active Space

If the agent hasn't called `enter_space` and a visible tool executes, the result is **not posted anywhere**. It's available to the agent internally but invisible to all spaces. The gateway logs a warning.

---

## Tool Configuration Schema

```json
{
  "name": "string",
  "description": "string",
  "inputSchema": { /* JSON Schema */ },
  "executionType": "gateway | external | space | internal",
  "visible": true,
  "execution": { /* type-specific config */ },
  "display": {
    "customUI": "component-name"
  }
}
```

### `execution` by Type

**`gateway`** — HTTP request:
```json
{
  "url": "https://api.example.com/data",
  "method": "POST",
  "headers": { "Authorization": "Bearer ${env.API_KEY}" },
  "body": { "query": "{{input.query}}" },
  "timeout": 30000
}
```

**`gateway`** — AI sub-agent:
```json
{
  "agentConfig": { /* inline agent config */ },
  "includeContext": true,
  "timeout": 60000
}
```

**`gateway`** — Image generation:
```json
{
  "provider": "dall-e",
  "model": "dall-e-3",
  "size": "1024x1024",
  "quality": "hd"
}
```

**`gateway`** — Compute:
```json
{
  "operation": "evaluate",
  "expression": "{{input.expression}}"
}
```

**`external`** — Webhook:
```json
{
  "webhookUrl": "https://my-service.com/tools/process",
  "method": "POST",
  "headers": { "Authorization": "Bearer ${env.SERVICE_KEY}" },
  "timeout": 30000
}
```

**`space`** — Client-rendered UI (no server execution):
```json
{
  "display": {
    "customUI": "confirmAction"
  }
}
```

**`internal`** — No execution config needed (or static output):
```json
{
  "output": { "status": "ok" }
}
```

---

## Built-in Tools (Gateway-Provided)

These tools are automatically injected into every agent. They are not configurable — they exist at the gateway level.

| Tool | Description |
|------|-------------|
| `enter_space` | Set the active space context. |
| `send_message` | Send a message to the active space. Supports `wait: true` to pause until replies arrive. If `messageId` is provided, acts as a reply and resumes waiting runs. |
| `read_messages` | Read recent messages from the active space (or a specified space). Supports `offset` to read earlier history. |
| `stop_run` | Cancel one of the agent's own active or waiting runs by ID. |
| `get_my_runs` | List agent's active/recent runs. |
| `set_goals` | Create/update agent goals. |
| `delete_goals` | Delete agent goals. |
| `set_memories` | Create/update agent memories. |
| `delete_memories` | Delete agent memories. |
| `set_plans` | Create/update agent plans. |
| `delete_plans` | Delete agent plans. |
| `get_plans` | Read agent's previous/completed plans. |

Built-in tools are always invisible (`visible: false`) — their execution is infrastructure, not user-facing content.

---

## Tool Result in Active Space

Visible tool calls share the same **routing and storage pipeline** as `send_message` — both are streamed to the active space and stored as `SmartSpaceMessage` records in the database. This is what they have in common.

What they are **not** is the same content type. A visible tool call is **not** reformatted as plain text. It carries its own **structured data**: the tool's input arguments (and result) stored as-is in the message record. The frontend uses that structured data to render a custom UI component — not a text bubble.

### What a Visible Tool Call Is

- **Content**: The tool's structured input (and output), stored in the message record as metadata.
- **Rendering**: The frontend renders a custom UI based on the tool name and input (e.g., an approval card, a weather widget, a product tile).
- **Cannot be replied to**: Visible tool messages are display-only. They are not part of the conversation reply chain.
- **Routing**: Goes to the active space (set by `enter_space`). No `spaceId` in the tool schema.

### What a Visible Tool Call Is Not

- It is **not** a text message. There is no `display.format` template that converts output to a plain text string.
- It is **not** replyable. Entities cannot @reply or respond to a tool result message.
- It is **not** the same as `send_message`. They share routing; they do not share content format.

### Comparison

| | `send_message` | Visible tool call |
|--|--|--|
| Stored as `SmartSpaceMessage` | ✅ | ✅ |
| Routed to active space | ✅ | ✅ |
| Streamed to frontend | ✅ | ✅ |
| Content type | Plain text | Structured input/output |
| Frontend rendering | Text bubble | Custom UI component |
| Can be replied to | ✅ | ❌ |
| Can trigger agents | Yes (all other agent members, sender excluded) | No |

### Streaming

When a visible tool is invoked:
1. `tool-call.start` — Tool invocation started, args begin streaming to active space.
2. `tool-input-delta` — Structured input args streamed incrementally (partial JSON).
3. `tool-call.complete` — Full input + output stored in the `SmartSpaceMessage` record.
4. `tool-call.error` — Tool failed (error stored in the message record).

The frontend receives the `tool-call.complete` event with the full structured payload and renders the appropriate UI component.

### Use Cases

Visible tools are for **displaying information or interactive UI** in a space:
- Approval dialog (`getApproval` — pauses run, waits for user input)
- Product card (`fetchProduct`)
- Weather widget (`getWeather`)
- Map embed (`showLocation`)
- Chart display (`renderChart`)

---

## Interactive vs. Display-Only Visible Tools

Visible tools come in two variants based on whether the run needs to wait for user interaction:

### Display-Only (`executionType: "gateway"` + `visibility: "visible"`)

The tool executes on the gateway. The result is stored as a `SmartSpaceMessage` and streamed to the active space. **The run continues immediately** — no waiting.

Examples: weather widget, chart render, product card, fetch summary.

### Interactive (`executionType: "space"` + `visibility: "visible"`)

The tool call is streamed to the active space. **The run pauses** (`waiting_tool` status). The frontend renders the tool's custom UI and the user interacts with it. The frontend submits the result back to the gateway and the run resumes.

Examples: approval dialog, form input, confirmation prompt, file picker.

Both variants store the structured tool call (input + result) in a `SmartSpaceMessage` record and render via custom UI. The only difference is whether the run waits for a client-side response.

---

## MCP Tools

MCP (Model Context Protocol) tools are loaded from external MCP servers at agent build time. They behave like `gateway` tools with `visibility: "hidden"` by default.

```json
{
  "mcp": {
    "servers": [
      {
        "name": "my-mcp-server",
        "url": "https://mcp.example.com",
        "transport": "http",
        "allowedTools": ["tool_a", "tool_b"]
      }
    ]
  }
}
```

---

## No Special Tools

In v2, there are no "special" tools with hard-coded gateway behavior:

- No `delegateToAgent` (agents are independent — all run on every message).
- No `skipResponse` (agent simply doesn't send a message if it has nothing to say).
- No `displayTool` flag with `targetSpaceId` injection (`visible: true/false` is config-based, space is run state).
- No `@mention` parameter on any tool (all agents triggered automatically).

Every tool follows the same pipeline: configure → build → execute → optionally post result to active space.
