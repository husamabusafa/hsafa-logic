# @hsafa/node

General Node.js SDK for Hsafa Core. Build extensions, manage haseefs, push senses, stream events.

## Install

```bash
pnpm add @hsafa/node
```

## Two Modes

### Extension Mode — build services that connect to Core

```typescript
import { Hsafa, ExtensionServer } from '@hsafa/node';

const hsafa = new Hsafa({
  coreUrl: 'http://localhost:3001',
  extensionKey: 'ek_...',
});

// Self-discovery: who am I and which haseefs am I connected to?
const info = await hsafa.me();
console.log(info.name, info.connections);

// Push a sense event to a haseef's inbox
await hsafa.pushSense(haseefId, {
  eventId: 'evt_123',
  channel: 'ext-myservice',
  source: 'space-abc',
  type: 'ext-myservice:message',
  timestamp: new Date().toISOString(),
  data: { text: 'Hello from my extension' },
});
```

### Admin Mode — manage haseefs and extensions

```typescript
import { Hsafa } from '@hsafa/node';

const hsafa = new Hsafa({
  coreUrl: 'http://localhost:3001',
  secretKey: 'sk_...',
});

// List all haseefs
const haseefs = await hsafa.haseefs.list();

// Install an extension from URL
const { extension, extensionKey } = await hsafa.extensions.install('https://my-ext.com');

// Connect extension to a haseef
await hsafa.haseefs.connectExtension(haseefId, extension.id, { phoneNumber: '+1234' });

// Consciousness snapshots
await hsafa.haseefs.createSnapshot(haseefId);
const snapshots = await hsafa.haseefs.listSnapshots(haseefId);
await hsafa.haseefs.restoreSnapshot(haseefId, snapshots[0].id);

// System status
const status = await hsafa.status();
console.log(status.haseefs); // per-haseef stats
```

## Building Extensions

Use `ExtensionServer` to build an extension that Core can communicate with:

```typescript
import { Hsafa, ExtensionServer } from '@hsafa/node';

const hsafa = new Hsafa({
  coreUrl: 'http://localhost:3001',
  extensionKey: 'ek_...',
});

const server = new ExtensionServer(hsafa, {
  name: 'ext-weather',
  description: 'Weather extension',
  version: '1.0.0',
  instructions: 'Use get_weather to check current weather for any city.',
});

// Register a tool
server.tool('get_weather', {
  description: 'Get current weather for a city',
  inputSchema: {
    type: 'object',
    properties: { city: { type: 'string' } },
    required: ['city'],
  },
}, async (args, ctx) => {
  console.log(`${ctx.haseefName} wants weather for ${args.city}`);
  return { temperature: 72, conditions: 'sunny', city: args.city };
});

// Handle lifecycle events
server.onLifecycle('haseef.connected', (event) => {
  console.log(`Haseef ${event.haseefName} connected with config:`, event.config);
});

// Start serving
await server.listen(4200);
// Manifest at GET http://localhost:4200/manifest
// Webhooks at POST http://localhost:4200/webhook
// Health at GET http://localhost:4200/health
```

## Streaming

Subscribe to real-time haseef events (SSE):

```typescript
const controller = new AbortController();

await hsafa.onStream(haseefId, (event) => {
  if (event.type === 'run.start') console.log('Thinking...');
  if (event.type === 'tool.started') console.log(`Calling ${event.toolName}`);
  if (event.type === 'tool.done') console.log(`Result:`, event.result);
  if (event.type === 'run.finish') console.log('Done');
}, controller.signal);

// To disconnect:
controller.abort();
```

## API Reference

### `Hsafa` (main class)

| Method | Auth | Description |
|--------|------|-------------|
| `me()` | extension | Self-discovery — get extension info + connected haseefs |
| `pushSense(haseefId, event)` | extension | Push sense event to haseef inbox |
| `pushSenses(haseefId, events)` | extension | Push multiple sense events |
| `onStream(haseefId, handler, signal?)` | secret | Subscribe to haseef event stream |
| `status()` | secret | Get system observability status |

### `hsafa.haseefs` (admin)

| Method | Description |
|--------|-------------|
| `list()` | List all haseefs |
| `get(id)` | Get haseef details |
| `connectExtension(haseefId, extId, config?)` | Connect extension |
| `disconnectExtension(haseefId, extId)` | Disconnect extension |
| `listExtensions(haseefId)` | List connected extensions |
| `updateExtensionConfig(haseefId, extId, config)` | Update connection config |
| `createSnapshot(haseefId)` | Create consciousness snapshot |
| `listSnapshots(haseefId, limit?)` | List snapshots |
| `restoreSnapshot(haseefId, snapshotId)` | Restore from snapshot |

### `hsafa.extensions` (admin)

| Method | Description |
|--------|-------------|
| `install(url)` | One-step install from URL |
| `register(data)` | Manual registration |
| `list()` | List all extensions |
| `get(extId)` | Get extension details |
| `update(extId, data)` | Update metadata |
| `delete(extId)` | Delete extension |
| `refreshManifest(extId)` | Re-fetch manifest from URL |

### `ExtensionServer`

| Method | Description |
|--------|-------------|
| `tool(name, definition, handler)` | Register a tool |
| `onLifecycle(type, handler)` | Handle lifecycle events |
| `listen(port?)` | Start the server |
| `close()` | Stop the server |
| `getApp()` | Get underlying Express app |
