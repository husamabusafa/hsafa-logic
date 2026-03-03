# @hsafa/extension

Node.js SDK for building Hsafa extensions.

## Installation

```bash
npm install @hsafa/extension
# Optional: for real-time tool calls via Redis
npm install ioredis
```

## Quick Start

```typescript
import { HsafaExtension } from '@hsafa/extension';

const ext = new HsafaExtension({
  coreUrl: 'http://localhost:3100',
  extensionKey: 'ek_...',
  secretKey: 'sk_...',
  redisUrl: 'redis://localhost:6379', // optional — enables real-time tool calls
});

// Register tools
ext.tool('greet', {
  description: 'Greet a user by name',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Name to greet' },
    },
    required: ['name'],
  },
  execute: async (args, ctx) => {
    return { message: `Hello, ${args.name}!` };
  },
});

// Set instructions (injected into Haseef's system prompt)
ext.instructions(`[Extension: Greeter]
You can greet users by name using the greet tool.`);

// Start — discovers self, syncs tools, starts listening
await ext.start();
```

## Configuration

| Option | Required | Description |
|---|---|---|
| `coreUrl` | ✅ | Core API base URL |
| `extensionKey` | ✅ | Extension key (`ek_...`) for runtime ops |
| `secretKey` | ✅ | Secret key (`sk_...`) for bootstrap ops |
| `redisUrl` | ❌ | Redis URL for real-time tool calls. Falls back to HTTP polling if omitted. |
| `pollIntervalMs` | ❌ | Polling interval when using HTTP fallback (default: 2000ms) |
| `logPrefix` | ❌ | Custom log prefix (default: extension name) |

## Tool Handler Context

Every tool handler receives `(args, context)`:

```typescript
interface ToolCallContext {
  haseefId: string;        // Which Haseef called this tool
  haseefEntityId: string;  // The Haseef's entity ID
  runId: string;           // The run this tool call belongs to
  toolCallId: string;      // Unique tool call ID
  pushSenseEvent(event);   // Push a sense event to this Haseef
}
```

## Pushing Sense Events

```typescript
await ext.pushSenseEvent(haseefId, {
  eventId: crypto.randomUUID(),
  channel: 'my-extension',
  type: 'alert',
  data: { message: 'Something happened' },
});
```

## Accessing Connected Haseefs

```typescript
await ext.start();

for (const conn of ext.connections) {
  console.log(`${conn.haseefName} (${conn.haseefEntityId})`);
  console.log('Config:', conn.config);
}
```

## Environment Variables

```env
CORE_URL=http://localhost:3100
EXTENSION_KEY=ek_...
HSAFA_SECRET_KEY=sk_...
REDIS_URL=redis://localhost:6379
```

## Low-Level Client

For advanced use cases, the `CoreClient` is also exported:

```typescript
import { CoreClient } from '@hsafa/extension';

const client = new CoreClient({ coreUrl, extensionKey, secretKey });
const me = await client.getMe();
await client.pushSenseEvent(haseefId, event);
await client.returnToolResult(haseefId, callId, result);
```
