# @hsafa/sdk

Scope-based SDK for connecting any service to a Haseef brain. Register tools, handle actions via SSE, push events, and listen to real-time lifecycle events — all through a single persistent connection.

## Install

```bash
pnpm add @hsafa/sdk
```

## Quick Start

```typescript
import { HsafaSDK } from '@hsafa/sdk';

const sdk = new HsafaSDK({
  coreUrl: 'http://localhost:3001',
  apiKey: 'sk_...',
  scope: 'my-service',
});

// 1. Register tools with Core
await sdk.registerTools([
  {
    name: 'get_weather',
    description: 'Get current weather for a city',
    input: { city: 'string', units: 'string?' },
  },
]);

// 2. Handle tool calls from Haseefs
sdk.onToolCall('get_weather', async (args, ctx) => {
  console.log(`${ctx.haseef.name} wants weather for ${args.city}`);
  return { temperature: 72, conditions: 'sunny', city: args.city };
});

// 3. Connect — opens SSE stream, auto-reconnects
sdk.connect();
```

## Core Concepts

The SDK operates on a **scope** — a named channel that identifies your service to Core. Once connected, it maintains a persistent SSE stream that:

- Receives **action requests** (tool calls from Haseefs) and routes them to your registered handlers
- Emits **lifecycle events** (run started, tool called, tool result, etc.) that you can listen to
- **Auto-reconnects** with exponential backoff (2s → 30s max) on disconnection

## Registering Tools

Tools can be defined with a simple shorthand syntax or raw JSON Schema:

```typescript
// Shorthand — types: "string", "number", "boolean", "object", "string[]", "number[]", "boolean[]"
// Append "?" for optional fields
await sdk.registerTools([
  {
    name: 'send_message',
    description: 'Send a message to a channel',
    input: {
      channel: 'string',
      text: 'string',
      priority: 'number?',
    },
  },
]);

// Raw JSON Schema — for complex inputs
await sdk.registerTools([
  {
    name: 'create_task',
    description: 'Create a task with subtasks',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        subtasks: {
          type: 'array',
          items: { type: 'object', properties: { name: { type: 'string' } } },
        },
      },
      required: ['title'],
    },
  },
]);
```

You can also convert shorthand to JSON Schema manually:

```typescript
import { inputToJsonSchema } from '@hsafa/sdk';

const schema = inputToJsonSchema({ city: 'string', units: 'string?' });
// → { type: 'object', properties: { city: { type: 'string' }, units: { type: 'string' } }, required: ['city'] }
```

## Handling Tool Calls

When a Haseef invokes one of your tools, the SDK routes it to the matching handler:

```typescript
sdk.onToolCall('get_weather', async (args, ctx) => {
  // args: { city: 'Tokyo', units: 'celsius' }
  // ctx.actionId: unique ID for this action
  // ctx.haseef: { id, name, profile }

  const weather = await fetchWeather(args.city as string);
  return { temperature: weather.temp, conditions: weather.desc };
});
```

The return value is automatically sent back to Core as the tool result. If the handler throws, the error message is sent back instead.

## Pushing Events

Push sense events into a Haseef's inbox to trigger processing:

```typescript
await sdk.pushEvent({
  type: 'new_order',
  data: { orderId: '12345', total: 99.99, customer: 'Alice' },
  haseefId: 'haseef_abc',          // optional — target a specific haseef
  target: { department: 'sales' },  // optional — routing metadata
});

// With attachments
await sdk.pushEvent({
  type: 'document_uploaded',
  data: { filename: 'report.pdf' },
  attachments: [
    { type: 'file', mimeType: 'application/pdf', url: 'https://...' },
    { type: 'image', mimeType: 'image/png', base64: 'iVBORw0K...' },
  ],
});
```

## Listening to Events

Subscribe to real-time lifecycle events via the SSE stream. All listeners are type-safe:

```typescript
sdk.on('run.started', (event) => {
  console.log(`Run ${event.runId} started for ${event.haseef.name}`);
  console.log(`Trigger: ${event.triggerType} from ${event.triggerScope}`);
});

sdk.on('tool.call', (event) => {
  console.log(`Calling ${event.toolName} with`, event.args);
});

sdk.on('tool.result', (event) => {
  console.log(`${event.toolName} completed in ${event.durationMs}ms:`, event.result);
});

sdk.on('tool.error', (event) => {
  console.error(`${event.toolName} failed:`, event.error);
});

sdk.on('run.completed', (event) => {
  console.log(`Run ${event.runId} done in ${event.durationMs}ms`);
  if (event.summary) console.log('Summary:', event.summary);
});

// Streaming tool input (partial args as they arrive)
sdk.on('tool.input.start', (event) => {
  console.log(`${event.toolName} input streaming started`);
});

sdk.on('tool.input.delta', (event) => {
  console.log(`Partial args for ${event.toolName}:`, event.partialArgs);
});

// Remove a listener
const handler = (event) => { ... };
sdk.on('tool.result', handler);
sdk.off('tool.result', handler);
```

## Connection Lifecycle

```typescript
// Start the SSE connection
sdk.connect();

// Disconnect when done
sdk.disconnect();
```

The SSE connection auto-reconnects with exponential backoff (2s → 4s → 8s → ... → 30s max). After a successful reconnection the delay resets.

## Full Example

```typescript
import { HsafaSDK } from '@hsafa/sdk';

const sdk = new HsafaSDK({
  coreUrl: process.env.CORE_URL!,
  apiKey: process.env.API_KEY!,
  scope: 'crm-integration',
});

// Register tools
await sdk.registerTools([
  {
    name: 'lookup_customer',
    description: 'Look up a customer by email',
    input: { email: 'string' },
  },
  {
    name: 'create_ticket',
    description: 'Create a support ticket',
    input: { subject: 'string', body: 'string', priority: 'number?' },
  },
]);

// Handle tool calls
sdk.onToolCall('lookup_customer', async (args) => {
  const customer = await db.customers.findByEmail(args.email as string);
  return customer ?? { error: 'Customer not found' };
});

sdk.onToolCall('create_ticket', async (args, ctx) => {
  const ticket = await db.tickets.create({
    subject: args.subject as string,
    body: args.body as string,
    priority: (args.priority as number) ?? 3,
    createdBy: ctx.haseef.name,
  });
  return { ticketId: ticket.id, url: ticket.url };
});

// Listen for events
sdk.on('run.started', (e) => console.log(`[${e.haseef.name}] Run started`));
sdk.on('tool.error', (e) => console.error(`[${e.toolName}] Error:`, e.error));
sdk.on('run.completed', (e) => console.log(`Run done in ${e.durationMs}ms`));

// Connect
sdk.connect();
console.log(`[${sdk.scope}] Connected and listening for actions`);

// Graceful shutdown
process.on('SIGINT', () => {
  sdk.disconnect();
  process.exit(0);
});
```

## API Reference

### `HsafaSDK` (main class)

| Method | Description |
|--------|-------------|
| `registerTools(tools)` | Register tools with Core (PUT to `/api/scopes/:scope/tools`) |
| `onToolCall(name, handler)` | Register a handler for incoming tool call actions |
| `pushEvent(event)` | Push a sense event to Core (POST to `/api/events`) |
| `on(event, listener)` | Subscribe to a lifecycle event (type-safe) |
| `off(event, listener)` | Unsubscribe from a lifecycle event |
| `connect()` | Open the SSE stream (auto-reconnects) |
| `disconnect()` | Close the SSE stream |

### `SdkOptions`

| Field | Type | Description |
|-------|------|-------------|
| `coreUrl` | `string` | Core API base URL (e.g. `http://localhost:3001`) |
| `apiKey` | `string` | API key for authentication |
| `scope` | `string` | Scope name identifying this service |

### `ToolDefinition`

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Tool name |
| `description` | `string` | What the tool does |
| `input` | `Record<string, string>` | Shorthand type map (e.g. `{ city: 'string' }`) |
| `inputSchema` | `unknown` | Raw JSON Schema (overrides `input` if both provided) |

### `ToolCallContext`

| Field | Type | Description |
|-------|------|-------------|
| `actionId` | `string` | Unique action ID |
| `haseef` | `HaseefContext` | The Haseef that invoked the tool (`{ id, name, profile }`) |

### `PushEventPayload`

| Field | Type | Description |
|-------|------|-------------|
| `type` | `string` | Event type |
| `data` | `Record<string, unknown>` | Event payload |
| `attachments` | `Attachment[]` | Optional file/image/audio attachments |
| `haseefId` | `string` | Optional target haseef |
| `target` | `Record<string, string>` | Optional routing metadata |

### Lifecycle Events

| Event | Payload | Description |
|-------|---------|-------------|
| `run.started` | `RunStartedEvent` | A Haseef run began |
| `tool.input.start` | `ToolInputStartEvent` | Tool input streaming started |
| `tool.input.delta` | `ToolInputDeltaEvent` | Partial tool args received (includes `partialArgs`) |
| `tool.call` | `ToolCallEvent` | Tool call dispatched with final args |
| `tool.result` | `ToolResultEvent` | Tool returned a result (includes `durationMs`) |
| `tool.error` | `ToolErrorEvent` | Tool call failed |
| `run.completed` | `RunCompletedEvent` | Run finished (includes `durationMs`, optional `summary`) |
