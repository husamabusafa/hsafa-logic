# @hsafa/sdk Reference

> Complete API reference for the Hsafa SDK used to build scope services.

## Install

```bash
npm install @hsafa/sdk
# or
pnpm add @hsafa/sdk
```

## Quick Start

```typescript
import { HsafaSDK } from '@hsafa/sdk';

const sdk = new HsafaSDK({
  coreUrl: process.env.CORE_URL || 'http://localhost:3001',
  apiKey: process.env.SCOPE_KEY || '',
  scope: process.env.SCOPE_NAME || 'my-scope',
});

// 1. Register tools
await sdk.registerTools([
  {
    name: 'get_weather',
    description: 'Get current weather for a city',
    input: { city: 'string', units: 'string?' },
  },
]);

// 2. Handle tool calls
sdk.onToolCall('get_weather', async (args, ctx) => {
  const weather = await fetchWeather(args.city as string);
  return { temperature: weather.temp, conditions: weather.desc };
});

// 3. Connect (opens SSE stream, auto-reconnects)
sdk.connect();
```

## Constructor

```typescript
new HsafaSDK(options: SdkOptions)
```

| Field | Type | Description |
|-------|------|-------------|
| `coreUrl` | `string` | Core API base URL (e.g. `http://localhost:3001`) |
| `apiKey` | `string` | Scope key for authentication (`hsk_scope_*`) |
| `scope` | `string` | Scope name identifying this service |

## Registering Tools

```typescript
await sdk.registerTools(tools: ToolDefinition[])
```

Sends a PUT request to Core to register all tools for this scope. Call this once at startup. Calling it again replaces all previous tools.

### ToolDefinition

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Tool name (snake_case recommended) |
| `description` | `string` | Yes | What the tool does — the Haseef reads this to decide when to use it |
| `input` | `Record<string, string>` | No | Shorthand type map (see below) |
| `inputSchema` | `object` | No | Raw JSON Schema (overrides `input` if both provided) |

### Input Shorthand

For simple tools, use the shorthand type strings:

```typescript
input: {
  city: 'string',        // required string
  units: 'string?',      // optional string
  limit: 'number',       // required number
  verbose: 'boolean?',   // optional boolean
  tags: 'string[]',      // required string array
  counts: 'number[]',    // required number array
  metadata: 'object',    // required object (any shape)
}
```

Append `?` to make a field optional.

### Raw JSON Schema

For complex inputs (nested objects, enums, etc.), use `inputSchema` directly:

```typescript
{
  name: 'create_task',
  description: 'Create a task with subtasks',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Task title' },
      priority: { type: 'string', enum: ['low', 'medium', 'high'] },
      subtasks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            done: { type: 'boolean' },
          },
          required: ['name'],
        },
      },
    },
    required: ['title'],
  },
}
```

### Schema Helper

Convert shorthand to JSON Schema manually:

```typescript
import { inputToJsonSchema } from '@hsafa/sdk';

const schema = inputToJsonSchema({ city: 'string', units: 'string?' });
// → { type: 'object', properties: { city: { type: 'string' }, units: { type: 'string' } }, required: ['city'] }
```

## Handling Tool Calls

```typescript
sdk.onToolCall(toolName: string, handler: ToolHandler)
```

Register a handler for a specific tool. When a Haseef invokes this tool, the handler runs and its return value is sent back as the tool result.

```typescript
type ToolHandler = (
  args: Record<string, unknown>,
  ctx: ToolCallContext,
) => Promise<unknown>;
```

### ToolCallContext

| Field | Type | Description |
|-------|------|-------------|
| `actionId` | `string` | Unique ID for this tool call action |
| `haseef` | `HaseefContext` | The Haseef that invoked the tool |

### HaseefContext

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Haseef UUID |
| `name` | `string` | Haseef display name |
| `profile` | `Record<string, unknown>` | Haseef profile data |

### Handler Patterns

```typescript
// Simple handler
sdk.onToolCall('ping', async () => {
  return { pong: true, timestamp: Date.now() };
});

// Handler with args and context
sdk.onToolCall('send_email', async (args, ctx) => {
  console.log(`Haseef ${ctx.haseef.name} wants to send an email`);
  await emailService.send({
    to: args.to as string,
    subject: args.subject as string,
    body: args.body as string,
  });
  return { sent: true };
});

// Error handling — thrown errors are sent back as { error: "message" }
sdk.onToolCall('risky_action', async (args) => {
  if (!args.confirmed) {
    throw new Error('Action requires confirmation');
  }
  return await doRiskyThing();
});
```

## Pushing Events

```typescript
await sdk.pushEvent(event: PushEventPayload)
```

Push a sense event into a Haseef's inbox. This is how your service tells the Haseef that something happened.

### PushEventPayload

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `string` | Yes | Event type (e.g. `new_order`, `alert`, `webhook_received`) |
| `data` | `Record<string, unknown>` | Yes | Event payload — include all relevant context |
| `haseefId` | `string` | No | Target a specific Haseef (omit for broadcast) |
| `target` | `Record<string, string>` | No | Routing metadata |
| `attachments` | `Attachment[]` | No | File/image/audio attachments |

### Attachment

| Field | Type | Description |
|-------|------|-------------|
| `type` | `'image' \| 'audio' \| 'file'` | Attachment type |
| `mimeType` | `string` | MIME type |
| `url` | `string` | URL to the file (use this OR base64) |
| `base64` | `string` | Base64-encoded content (use this OR url) |
| `name` | `string` | Optional filename |

### Examples

```typescript
// Simple event
await sdk.pushEvent({
  type: 'new_order',
  data: { orderId: '12345', total: 99.99, customer: 'Alice' },
  haseefId: 'haseef-uuid',
});

// Event with formatted context (recommended — helps the Haseef understand)
await sdk.pushEvent({
  type: 'alert',
  data: {
    severity: 'high',
    message: 'Server CPU at 95%',
    formattedContext: [
      '[SERVER ALERT]',
      'Server: prod-api-1',
      'CPU: 95% (threshold: 80%)',
      'Duration: 5 minutes',
      '',
      '>>> Decide what to do.',
    ].join('\n'),
  },
  haseefId: 'haseef-uuid',
});

// Event with attachment
await sdk.pushEvent({
  type: 'document_uploaded',
  data: { filename: 'report.pdf' },
  attachments: [
    { type: 'file', mimeType: 'application/pdf', url: 'https://...' },
  ],
});
```

## Listening to Events

Subscribe to real-time lifecycle events via the SSE stream:

```typescript
sdk.on(event: SdkEventType, listener: (data) => void)
sdk.off(event: SdkEventType, listener: (data) => void)
```

### Available Events

| Event | Payload | Description |
|-------|---------|-------------|
| `run.started` | `{ runId, haseef, triggerScope, triggerType }` | A Haseef think cycle began |
| `tool.input.start` | `{ actionId, toolName, haseef }` | Tool input streaming started |
| `tool.input.delta` | `{ actionId, toolName, delta, partialArgs, haseef }` | Partial tool args received |
| `tool.call` | `{ actionId, toolName, args, haseef }` | Tool call dispatched with final args |
| `tool.result` | `{ actionId, toolName, args, result, durationMs, haseef }` | Tool returned a result |
| `tool.error` | `{ actionId, toolName, error, haseef }` | Tool call failed |
| `run.completed` | `{ runId, haseef, summary, durationMs }` | Think cycle finished |

```typescript
sdk.on('run.started', (event) => {
  console.log(`Run ${event.runId} started for ${event.haseef.name}`);
});

sdk.on('tool.result', (event) => {
  console.log(`${event.toolName} completed in ${event.durationMs}ms`);
});

sdk.on('tool.error', (event) => {
  console.error(`${event.toolName} failed:`, event.error);
});
```

## Connection

```typescript
sdk.connect()    // Open SSE stream (auto-reconnects with exponential backoff 2s → 30s)
sdk.disconnect() // Close SSE stream
```

The connection auto-reconnects on failure. After a successful reconnection, the backoff delay resets.

## Environment Variables

Every scope service needs these:

| Variable | Description | Source |
|----------|-------------|--------|
| `SCOPE_NAME` | Scope name (matches what's registered in Core) | Set by user or platform |
| `SCOPE_KEY` | API key for Core auth (`hsk_scope_*`) | Generated by `hsafa scope create` or platform |
| `CORE_URL` | Core API base URL | `http://localhost:3001` (local) or platform URL |

Additional config variables specific to your scope (e.g. `API_KEY`, `DATABASE_URL`) should also be loaded from environment.

## Graceful Shutdown

Always disconnect the SDK on process exit:

```typescript
process.on('SIGINT', () => {
  sdk.disconnect();
  process.exit(0);
});

process.on('SIGTERM', () => {
  sdk.disconnect();
  process.exit(0);
});
```
