# @hsafa/service

Node.js SDK for building services that connect to Hsafa Core.

## Installation

```bash
npm install @hsafa/service
# Optional: for Redis Streams action listening (recommended for production)
npm install ioredis
```

## Quick Start

```typescript
import { HsafaService } from '@hsafa/service';

const svc = new HsafaService({
  coreUrl: 'http://localhost:3001',
  apiKey: 'sk_...',
  scope: 'whatsapp',
  haseefId: '...', // or ['id1', 'id2'] for multi-Haseef
  redisUrl: 'redis://localhost:6379', // optional — uses Redis Streams (at-least-once delivery)
});

// Register tools with execution modes
svc.tool('send_message', {
  description: 'Send a WhatsApp message',
  inputSchema: {
    type: 'object',
    properties: {
      to: { type: 'string', description: 'Phone number' },
      text: { type: 'string', description: 'Message text' },
    },
    required: ['to', 'text'],
  },
  mode: 'fire_and_forget', // returns immediately, no result needed
  execute: async (args, ctx) => {
    // Call WhatsApp API here
    return { success: true };
  },
});

svc.tool('get_contacts', {
  description: 'Get WhatsApp contacts',
  inputSchema: { type: 'object', properties: {} },
  mode: 'sync', // waits for result (default)
  timeout: 5000, // ms
  execute: async () => ({ contacts: [...] }),
});

// Start — syncs tools to all Haseefs, starts listening via Redis Streams or SSE
await svc.start();
```

## Configuration

| Option | Required | Description |
|---|---|---|
| `coreUrl` | ✅ | Core API base URL |
| `apiKey` | ✅ | API key for authentication |
| `scope` | ✅ | Scope name (e.g. `spaces`, `whatsapp`, `robot`) |
| `haseefId` | ✅ | Haseef ID (string) or IDs (string[]) to connect to |
| `redisUrl` | ❌ | Redis URL for Streams-based action listening. If omitted, uses SSE. |
| `logPrefix` | ❌ | Custom log prefix (default: scope name) |

## Tool Execution Modes

| Mode | Behavior | Use Case |
|------|----------|----------|
| `sync` | Core waits for result (with timeout) | `get_contacts`, `enter_space` |
| `fire_and_forget` | Core returns `{ ok: true }` immediately | `send_message`, `log_event` |
| `async` | Core returns `{ status: "pending" }`, result arrives as future event | `confirm_action`, `long_running_task` |

Default: `sync`

## Tool Handler Context

Every tool handler receives `(args, context)`:

```typescript
interface ToolCallContext {
  haseefId: string;        // Which Haseef called this tool
  toolCallId: string;      // Unique action ID
  pushSenseEvent(event): Promise<void>; // Push events back to this Haseef
}
```

## Tool Registration

```typescript
svc.tool('tool_name', {
  description: 'What the tool does',
  inputSchema: { type: 'object', properties: { ... } },
  mode: 'sync' | 'fire_and_forget' | 'async', // optional, default: 'sync'
  timeout: 5000,                              // optional, ms, for sync mode
  execute: async (args, ctx) => { ... },
});
```

## Pushing Sense Events

```typescript
// Push event to a specific Haseef
await svc.pushSenseEvent(haseefId, {
  eventId: crypto.randomUUID(),
  scope: 'whatsapp',
  type: 'message',
  data: { from: '+123', text: 'Hello' },
});

// Or from within a tool handler
const execute = async (args, ctx) => {
  await ctx.pushSenseEvent({
    eventId: crypto.randomUUID(),
    scope: 'whatsapp',
    type: 'delivery_receipt',
    data: { messageId: args.id, status: 'delivered' },
  });
};
```

## Multi-Haseef Services

A single service can serve multiple Haseefs:

```typescript
const svc = new HsafaService({
  coreUrl: 'http://localhost:3001',
  apiKey: 'sk_...',
  scope: 'whatsapp',
  haseefId: ['haseef-1', 'haseef-2', 'haseef-3'], // array of IDs
});

// Tools are synced to all Haseefs
// Actions from any Haseef are handled by the same tool implementations
```

## Action Transport

### Redis Streams (Recommended)
- **At-least-once delivery** — actions persist if service disconnects
- Uses `XREADGROUP` for consumer groups
- Automatic ACK after successful execution
- Set `redisUrl` in config to enable

### SSE Fallback
- Used when `redisUrl` is not provided
- Real-time via Server-Sent Events
- Auto-reconnect on disconnect
- Good for development, less reliable for production

## Low-Level Client

For advanced use cases, the `CoreClient` is also exported:

```typescript
import { CoreClient } from '@hsafa/service';

const client = new CoreClient({ coreUrl, apiKey });

// Push events
await client.pushSenseEvent(haseefId, event);

// Sync tools with mode/timeout
await client.syncTools(haseefId, scope, [
  { name: 'send_msg', description: '...', inputSchema: {...}, mode: 'fire_and_forget' },
  { name: 'get_data', description: '...', inputSchema: {...}, mode: 'sync', timeout: 5000 },
]);

// Submit action result
await client.submitActionResult(haseefId, actionId, result);

// SSE stream actions (async generator)
for await (const action of client.streamActions(haseefId, scope)) {
  console.log(action.actionId, action.toolName, action.args);
}
```
