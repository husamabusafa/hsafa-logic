# Model Context Protocol (MCP) Tools

## Overview

MCP (Model Context Protocol) enables your agents to connect to external MCP servers and use their tools dynamically. This allows agents to discover and use capabilities across various services through a standardized interface without needing to define each tool manually.

## Configuration

Add MCP servers to your agent configuration using the `mcp` property:

```json
{
  "version": "1.0",
  "agent": {
    "name": "my-agent",
    "description": "Agent with MCP tools",
    "system": "You are a helpful assistant."
  },
  "model": {
    "provider": "openai",
    "name": "gpt-4o"
  },
  "mcp": {
    "servers": [
      {
        "name": "my-mcp-server",
        "url": "https://mcp.example.com/sse",
        "transport": "sse"
      }
    ]
  }
}
```

## MCP Configuration Schema

### `mcp` Object

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `servers` | Array of MCP Server objects | Yes | List of MCP servers to connect to |

### MCP Server Object

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | Yes | Unique name for this MCP server |
| `url` | string | Yes | URL of the MCP server endpoint |
| `transport` | string | Yes | Transport protocol: `"http"` or `"sse"` |
| `headers` | object | No | Optional HTTP headers for authentication |
| `allowedTools` | string[] | No | Whitelist of tool names to load. If not specified, all tools from the server are loaded |

## Transport Types

### HTTP Transport (Recommended)

HTTP is the recommended transport for production deployments. Based on the Vercel AI SDK's MCP best practices, HTTP transport (`StreamableHTTPClientTransport`) provides the most reliable connection:

```json
{
  "name": "http-server",
  "url": "https://mcp.example.com/mcp",
  "transport": "http"
}
```

### SSE (Server-Sent Events)

SSE is an alternative HTTP-based transport. Use when the MCP server only exposes an SSE endpoint:

```json
{
  "name": "sse-server",
  "url": "https://mcp.example.com/sse",
  "transport": "sse"
}
```

**Note:** stdio transport is not supported — it is local-only and not suitable for production.

## Authentication

### Using Headers

Add authentication headers to secure MCP server connections:

```json
{
  "name": "secure-server",
  "url": "https://mcp.example.com/sse",
  "transport": "sse",
  "headers": {
    "Authorization": "Bearer ${MCP_API_KEY}",
    "X-Custom-Header": "value"
  }
}
```

**Note:** Environment variables like `${MCP_API_KEY}` are automatically interpolated at runtime.

## Tool Filtering

### Loading All Tools

By default, all tools from an MCP server are loaded:

```json
{
  "name": "all-tools-server",
  "url": "https://mcp.example.com/sse",
  "transport": "sse"
}
```

### Whitelisting Specific Tools

Use `allowedTools` to only load specific tools from a server:

```json
{
  "name": "filtered-server",
  "url": "https://mcp.example.com/sse",
  "transport": "sse",
  "allowedTools": ["weather", "calendar", "email"]
}
```

This is useful when:
- A server exposes many tools but you only need a few
- You want to reduce the context window size
- You want to prevent access to sensitive tools

## Multiple MCP Servers

You can connect to multiple MCP servers simultaneously:

```json
{
  "mcp": {
    "servers": [
      {
        "name": "weather-service",
        "url": "https://weather.mcp.example.com/sse",
        "transport": "sse",
        "allowedTools": ["getCurrentWeather", "getForecast"]
      },
      {
        "name": "calendar-service",
        "url": "https://calendar.mcp.example.com/sse",
        "transport": "sse",
        "headers": {
          "Authorization": "Bearer ${CALENDAR_API_KEY}"
        }
      },
      {
        "name": "file-service",
        "url": "https://files.mcp.example.com/http",
        "transport": "http"
      }
    ]
  }
}
```

**Important:** If multiple servers expose tools with the same name, the last loaded tool will override previous ones.

## Combining MCP Tools with Static Tools

MCP tools work alongside your statically defined tools:

```json
{
  "tools": [
    {
      "name": "getUserApproval",
      "description": "Request user approval",
      "inputSchema": {
        "type": "object",
        "properties": {
          "action": { "type": "string" }
        }
      },
      "executionType": "basic",
      "execution": {
        "mode": "static",
        "output": { "approved": true }
      }
    }
  ],
  "mcp": {
    "servers": [
      {
        "name": "external-tools",
        "url": "https://mcp.example.com/sse",
        "transport": "sse"
      }
    ]
  }
}
```

The agent will have access to both:
- Static tools defined in `tools` array
- Dynamic tools loaded from MCP servers

## Error Handling

The agent builder handles MCP connection errors gracefully:

- **Connection Failures**: If an MCP server fails to connect, a warning is logged but the agent continues to build with other available tools
- **Tool Loading Failures**: If tools fail to load from a server, the agent continues with successfully loaded tools
- **Cleanup**: MCP clients are automatically closed when the agent build fails

## Best Practices

### 1. Use Environment Variables for Secrets

Never hardcode API keys. Use environment variable interpolation:

```json
{
  "headers": {
    "Authorization": "Bearer ${MCP_API_KEY}"
  }
}
```

### 2. Filter Tools When Possible

Use `allowedTools` to reduce context window usage and improve performance:

```json
{
  "allowedTools": ["tool1", "tool2", "tool3"]
}
```

### 3. Name Servers Descriptively

Use clear server names for easier debugging:

```json
{
  "name": "production-weather-service"
}
```

### 4. Monitor Connection Health

MCP connections are established during agent build. Check logs for connection warnings.

## Example: Complete Agent with MCP

```json
{
  "version": "1.0",
  "agent": {
    "name": "smart-assistant",
    "description": "AI assistant with MCP tools",
    "system": "You are a helpful assistant with access to external tools via MCP. Use them when the user asks for help."
  },
  "model": {
    "provider": "google",
    "name": "gemini-2.5-flash",
    "maxOutputTokens": 8000
  },
  "loop": {
    "maxSteps": 10,
    "toolChoice": "auto"
  },
  "mcp": {
    "servers": [
      {
        "name": "hsafa-mcp",
        "url": "https://mcp.hsafa.com/metamcp/hsafa-endpoint/sse",
        "transport": "sse"
      }
    ]
  }
}
```

## Lifecycle Management

### Agent Build Process

1. **Validation**: MCP configuration is validated against the schema
2. **Connection**: MCP clients are created and connected to servers
3. **Tool Discovery**: Tools are loaded from each MCP server
4. **Tool Filtering**: `allowedTools` filter is applied if specified
5. **Merging**: MCP tools are merged with static tools
6. **Agent Creation**: Agent is initialized with all available tools

### Cleanup

MCP clients returned in `BuildAgentResult.mcpClients` should be closed when the agent is done:

```typescript
const { agent, mcpClients } = await buildAgent({ config });

try {
  // Use agent...
} finally {
  // Close MCP clients
  if (mcpClients) {
    await closeMCPClients(mcpClients);
  }
}
```

## Limitations

- **No stdio transport**: Only HTTP and SSE transports are supported (stdio is local-only and not suitable for production)
- **No OAuth providers**: Currently only header-based authentication is supported. The AI SDK supports OAuth via `authProvider`, but Hsafa Logic uses header-based auth
- **Tool name conflicts**: If multiple servers expose the same tool name, the last one wins
- **No resource/prompt support**: Currently only MCP tools are supported, not MCP resources or prompts

## Troubleshooting

### MCP Server Not Connecting

Check:
- URL is correct and accessible
- Transport type matches server implementation
- Authentication headers are correct
- Environment variables are set

### Tools Not Loading

Check:
- Server exposes tools via MCP protocol
- `allowedTools` names match exactly (case-sensitive)
- Check console for warning messages

### Tool Name Conflicts

If tools from different sources have the same name:
- The last loaded tool overrides previous ones
- Use `allowedTools` to explicitly control which tools load
- Rename static tools to avoid conflicts
