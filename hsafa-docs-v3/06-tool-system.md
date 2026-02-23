# 06 — Tool System

## Overview

Tools in v3 are identical to v2: **fully generalized and space-agnostic**. No tool has special routing logic. No tool receives `spaceId` as a parameter. Tools are pure capabilities — the gateway handles where their results appear based on configuration.

The v3 addition: tools can now be **dynamically discovered at runtime** via MCP, and the middleware stack can enhance tool behavior (caching, logging, input repair).

---

## Tool Execution Types

Every tool has an `executionType` that determines how it runs:

| Type | Runs Where | Description |
|------|-----------|-------------|
| `gateway` | Gateway server | HTTP requests, computations, image generation, AI sub-agents. Always **inline** (2-4s). |
| `external` | External service | If `execution.url` exists: **inline** HTTP call (same as gateway). If no URL: **async** — returns pending, result arrives via inbox. |
| `space` | Client/browser | Tool call rendered in the active space as interactive UI. Always **async** — returns pending immediately, user submits result which arrives via inbox. |
| `internal` | Gateway server | Like `gateway`, but results are never shown in any space. Purely internal. Always **inline**. |

---

## Tool Visibility

Each tool's configuration declares whether its result should appear in the active space:

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

| Value | Behavior |
|-------|----------|
| `true` | Tool call + result posted to the **active space** as a message. Streamed in real-time. |
| `false` | Tool executes silently. Result only available to the agent in consciousness. |

**Default**: `false` for `internal` tools, `true` for `gateway`, `external`, and `space` tools.

### No Active Space

If the agent hasn't called `enter_space` and a visible tool executes, the result is **not posted anywhere**. It's available in consciousness but invisible to all spaces. The gateway logs a warning.

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

**`external`** — Webhook:
```json
{
  "webhookUrl": "https://my-service.com/tools/process",
  "method": "POST",
  "headers": { "Authorization": "Bearer ${env.SERVICE_KEY}" },
  "timeout": 30000
}
```

**`space`** — Client-rendered UI (async, result via inbox):
```json
{
  "display": {
    "customUI": "confirmAction"
  }
}
```

---

## Built-in Tools (Gateway-Provided)

These tools are automatically injected into every agent. They are not configurable.

| Tool | Description |
|------|-------------|
| `enter_space` | Set the active space context and load history. |
| `send_message` | Send a message to the active space. |
| `read_messages` | Read messages from a space (with offset/limit for paging). |
| `set_goals` | Create/update agent goals. |
| `delete_goals` | Delete agent goals. |
| `set_memories` | Create/update agent memories. |
| `delete_memories` | Delete agent memories. |
| `set_plans` | Create/update agent plans. |
| `delete_plans` | Delete agent plans. |
| `get_plans` | Read agent's plans. |

Built-in tools are always invisible (`visible: false`) — their execution is infrastructure, not user-facing content.

### Removed from v2

| v2 Tool | Why Removed |
|---------|-------------|
| `stop_run` | No concurrent runs — one process, one mind |
| `absorb_run` | No concurrent runs — inbox batches events |
| `get_my_runs` | No runs to query — agent has one process |

---

## Inline vs. Async Tools

### Inline (`executionType: "gateway"` or `"internal"` or `"external"` with URL)

The tool has an `execute()` function that resolves within the cycle. The agent sees the result immediately and continues reasoning. **The think cycle continues normally.**

Examples: weather API (gateway), Jira webhook (external+URL), static lookup (internal).

### Async (`executionType: "space"` or `"external"` without URL)

The tool's `execute()` function creates a `PendingToolCall` record and returns `{ status: "pending" }` immediately. **The think cycle continues** — the agent knows the result is coming later and can do other work.

When the real result arrives (user submits, webhook fires), it is pushed as a `tool_result` inbox event. The agent wakes, sees the result in the next cycle's inbox, and continues its work with the result.

Examples: approval dialog (space), confirmation prompt (space), long-running batch job (external, no URL).

### Async Tool Flow

```
Cycle 15:
  INBOX: [Husam: "Book a hotel in Tokyo"]
  Agent → calls confirmAction("Confirm booking?")
  Tool result: { status: "pending", pendingToolCallId: "tc-abc" }
  Agent: "Asked Husam to confirm. I'll continue when he responds."
  → cycle ends, consciousness saved

Cycle 16:
  INBOX: [Tool Result: confirmAction] (callId: tc-abc) { "confirmed": true }
  Agent: "Husam confirmed! Booking now..."
  Agent → calls bookHotel(...)
```

### PendingToolCall Table

Tracks async tool calls awaiting external results:

| Column | Purpose |
|--------|---------|
| `toolCallId` | SDK tool call ID (unique key for result submission) |
| `agentEntityId` | Which agent — so the result endpoint knows where to push |
| `runId` | Which cycle spawned the call |
| `toolName` + `args` | What was called |
| `status` | `pending` → `resolved` or `expired` |
| `result` | Filled when result arrives |
| `expiresAt` | Optional TTL for auto-expiry |

### Result Submission Flow

1. Client/webhook calls `POST /api/runs/:runId/tool-results` with `{ callId, result }`
2. Gateway looks up `PendingToolCall` by `callId`
3. Updates status to `resolved`, stores result
4. Pushes `tool_result` inbox event → agent wakes in next cycle
5. Updates the persisted `SmartSpaceMessage` from `requires_action` → `complete` (if visible)

### What This Eliminates

| v2 | v3 |
|----|----|
| `waiting_tool` run status blocks the process | Agent never blocks — returns pending, continues |
| Tool result resumes the run mid-cycle | Tool result arrives as inbox event in next cycle |
| Complex resume logic (inject tool-result into messages) | Natural consciousness — agent reads result as inbox event |
| One tool call blocks all other work | Agent can process other inbox events while waiting |

---

## Visible Tool Results in Spaces

Visible tool calls share the same **routing and storage pipeline** as `send_message` — both are streamed to the active space and stored as `SmartSpaceMessage` records.

### What a Visible Tool Call Is

- **Content**: Structured input + output, stored in the message record as metadata.
- **Rendering**: Frontend renders a custom UI based on the tool name and input.
- **Cannot be replied to**: Visible tool messages are display-only. Not part of the reply chain.
- **Cannot trigger agents**: Unlike `send_message`, visible tool results do not push to other agents' inboxes.

### Streaming

When a visible tool is invoked:
1. `tool-call.start` — Tool invocation started, args begin streaming.
2. `tool-input-delta` — Structured input args streamed incrementally.
3. `tool-call.complete` — Full input + output stored in the `SmartSpaceMessage`.
4. `tool-call.error` — Tool failed.

---

## MCP Tools

MCP (Model Context Protocol) tools are loaded from external MCP servers. They allow the agent to **discover and use tools from external services at runtime**.

### Configuration

```json
{
  "mcp": {
    "servers": [
      {
        "name": "github-tools",
        "url": "https://mcp.github.com",
        "transport": "http",
        "headers": { "Authorization": "Bearer ${env.GITHUB_TOKEN}" },
        "allowedTools": ["list_prs", "create_issue"]
      }
    ]
  }
}
```

### How It Works

At agent build time, the gateway connects to configured MCP servers and loads their tool definitions:

```typescript
const mcpClients = await Promise.all(
  agentConfig.mcpServers.map(server =>
    createMCPClient({ transport: { type: 'http', url: server.url } })
  )
);

const mcpTools = await Promise.all(
  mcpClients.map(client => client.tools())
);

const allTools = {
  ...builtInTools,
  ...customTools,
  ...Object.assign({}, ...mcpTools),
};
```

MCP tools behave like `gateway` tools with `visible: false` by default. They execute on the MCP server and return results to the agent.

### Dynamic Tool Discovery

The power of MCP: you can add capabilities to an agent **without changing any code**. Point it at a new MCP server and it gains new tools. A Jira MCP server → agent can manage tickets. A GitHub MCP server → agent can create PRs. A database MCP server → agent can query data.

---

## Preliminary Tool Results (Progress Streaming)

Tools can yield **intermediate status updates** while executing using `AsyncIterable`:

```typescript
const analyzeData = tool({
  description: 'Analyze a dataset',
  inputSchema: z.object({ datasetId: z.string() }),
  async *execute({ datasetId }) {
    yield { status: 'loading', text: 'Loading dataset...' };
    const data = await loadDataset(datasetId);
    
    yield { status: 'analyzing', text: `Analyzing ${data.rows.length} rows...` };
    const results = await runAnalysis(data);
    
    yield { status: 'complete', text: 'Analysis complete', results };
  },
});
```

These intermediate yields become `tool-result` events in `fullStream`, so the stream processor can show progress to the user in real-time.

---

## No Special Tools

Same as v2: there are no "special" tools with hard-coded gateway behavior.

- No `delegateToAgent` (agents are independent).
- No `skipResponse` (agent simply doesn't send a message).
- No `displayTool` flag with `targetSpaceId` injection (`visible: true/false` is config-based).
- No `@mention` parameter on any tool.

Every tool follows the same pipeline: configure → build → execute → optionally post result to active space.
