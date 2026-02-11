# Agent Config JSON Structure

The agent config JSON is the single object that defines an agent in hsafa-gateway. It is validated by `AgentConfigSchema` (Zod) at creation time.

## Top-Level Fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `version` | string | yes | — | Config schema version (e.g. `"1.0"`). |
| `agent` | object | yes | — | Agent identity & system prompt. |
| `model` | object | yes | — | LLM provider and generation settings. |
| `loop` | object | no | `{ maxSteps: 5, toolChoice: "auto" }` | Controls the tool-call loop. |
| `tools` | array | no | `[]` | Tools the agent can invoke. |
| `mcp` | object | no | — | MCP server connections for remote tools. |

---

## `agent`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Unique agent name. |
| `description` | string | no | Short human-readable description. |
| `system` | string | yes | System prompt sent to the LLM. |
| `instructions` | string | no | Instructions for the agent. |

## `model`

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `provider` | string | yes | — | Provider id (`openai`, `anthropic`, `google`, `xai`, etc.). |
| `name` | string | yes | — | Model name (e.g. `gpt-4o-mini`). |
| `api` | `"default"` \| `"responses"` \| `"chat"` \| `"completion"` | no | `"default"` | Which API variant to use. |
| `temperature` | number (0–2) | no | `0.7` | Sampling temperature. |
| `maxOutputTokens` | number | no | `1000` | Max tokens in the response. |
| `reasoning` | object | no | — | Reasoning/thinking config (effort, budgetTokens, etc.). |
| `providerOptions` | object | no | — | Provider-specific options keyed by provider name. |

## `loop`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `maxSteps` | number | `5` | Max tool-call loop iterations. |
| `toolChoice` | `"auto"` \| `"required"` \| `"none"` | `"auto"` | How the LLM picks tools. |

---

## `tools` (array of tool objects)

Every tool has these common fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Tool name the LLM sees. |
| `description` | string | no | What the tool does. |
| `inputSchema` | JSON Schema | varies | Parameters the tool accepts. |
| `executionType` | string | no (defaults to `"basic"`) | Determines how the tool runs. |
| `execution` | object | depends on type | Type-specific execution config. |
| `display` | object | no | UI display hints (`mode`, `showInput`, `showOutput`, `customUI`). |

### Execution Types

- **`basic`** — No real execution, static output, or pass-through.
  - `mode`: `"no-execution"` | `"static"` | `"pass-through"`
  - `output`: static JSON to return (when `static`)
  - `template`: whether to template the output

- **`request`** — Makes an HTTP request.
  - `url`, `method` (`GET`/`POST`/`PUT`/`DELETE`/`PATCH`), `headers`, `queryParams`, `body`, `timeout`
  - Supports env var interpolation: `${env.VAR_NAME}`

- **`ai-agent`** — Spawns a nested agent.
  - `agentConfig`: inline agent config object
  - `includeContext`, `stream`, `timeout`

- **`image-generator`** — Generates images.
  - `provider`: `"dall-e"` | `"stable-diffusion"`
  - `size`, `quality`, `style`, `includeContext`

- **`waiting`** — Pauses execution.
  - `duration` (ms), `reason`

- **`compute`** — Evaluates an expression.
  - `operation`, `expression`

- **`prebuilt`** — Runs a server-side prebuilt action (auto-injected by the gateway).
  - `action`: action identifier

---

## `mcp` (optional)

Connects to external MCP tool servers.

```json
"mcp": {
  "servers": [
    {
      "name": "my-server",
      "url": "https://mcp.example.com",
      "transport": "http",
      "headers": { "Authorization": "Bearer ${env.TOKEN}" },
      "allowedTools": ["tool_a", "tool_b"]
    }
  ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Server identifier. |
| `url` | string | yes | Server endpoint. |
| `transport` | `"http"` \| `"sse"` | yes | Connection protocol. |
| `headers` | object | no | Auth / custom headers (supports `${env.*}`). |
| `allowedTools` | string[] | no | Whitelist of tool names to load. |

---

## Minimal Example

```json
{
  "version": "1.0",
  "agent": {
    "name": "my-agent",
    "system": "You are a helpful assistant."
  },
  "model": {
    "provider": "openai",
    "name": "gpt-5.2"
  }
}
```

Everything else (`loop`, `tools`, `mcp`) is optional and uses sensible defaults.
