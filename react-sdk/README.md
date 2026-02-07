# @hsafa/react-sdk

React SDK for Hsafa — hooks and providers for building chat UIs and admin panels.

## Installation

```bash
pnpm add @hsafa/react-sdk
```

Peer dependencies: `react` (18+/19+), optionally `@assistant-ui/react` (for `useHsafaRuntime`).

## Quick Start

### 1. Wrap your app with `HsafaProvider`

```tsx
import { HsafaProvider } from '@hsafa/react-sdk';

function App() {
  return (
    <HsafaProvider
      gatewayUrl="http://localhost:3001"
      publicKey="pk_..."
      jwt={userToken}
    >
      <MyApp />
    </HsafaProvider>
  );
}
```

### 2. Use hooks in your components

```tsx
import { useSmartSpace } from '@hsafa/react-sdk';

function Chat({ spaceId }: { spaceId: string }) {
  const { messages, send, runs, isConnected } = useSmartSpace(spaceId);

  return (
    <div>
      {messages.map(msg => (
        <div key={msg.id}>{msg.content}</div>
      ))}
      <input onKeyDown={(e) => {
        if (e.key === 'Enter') {
          send(e.currentTarget.value);
          e.currentTarget.value = '';
        }
      }} />
    </div>
  );
}
```

## Authentication Modes

| Mode | Props | Use Case |
|------|-------|----------|
| **Admin** | `adminKey` | Admin panels, backend operations |
| **Secret Key** | `secretKey` | Service dashboards |
| **Public Key + JWT** | `publicKey` + `jwt` | User-facing chat UIs |

## Hooks

### User-Facing

| Hook | Description |
|------|-------------|
| `useSmartSpace(spaceId)` | Subscribe to a space + send messages (SSE) |
| `useMessages(spaceId)` | Read-only message history with pagination |
| `useRun(runId)` | Subscribe to a single run's stream |
| `useMembers(spaceId)` | List space members |
| `useToolResult()` | Submit tool results back to gateway |

### Admin

| Hook | Description |
|------|-------------|
| `useAgents()` | CRUD agents |
| `useEntities(options?)` | CRUD entities |
| `useSpaces()` | CRUD spaces + manage members |
| `useRuns(options?)` | List/cancel/delete runs |

### Integration

| Hook | Description |
|------|-------------|
| `useHsafaRuntime(options)` | Adapter for `@assistant-ui/react` |

## Core Client (Standalone)

The `HsafaClient` class can be used outside React:

```ts
import { HsafaClient } from '@hsafa/react-sdk';

const client = new HsafaClient({
  gatewayUrl: 'http://localhost:3001',
  secretKey: 'sk_...',
});

const { agents } = await client.agents.list();
const stream = client.spaces.subscribe(spaceId);
```

### Resource API

- `client.agents` — create, list, get, delete
- `client.entities` — create, createAgent, list, get, update, delete, subscribe
- `client.spaces` — create, list, get, update, delete, addMember, listMembers, updateMember, removeMember, subscribe
- `client.messages` — send, list
- `client.runs` — list, get, create, cancel, delete, getEvents, subscribe
- `client.tools` — submitResult, submitRunResult
- `client.clients` — register, list, delete

## SSE Streaming

The SDK uses fetch-based SSE for streaming (supports custom auth headers unlike native EventSource). Streams auto-reconnect with exponential backoff.

```ts
const stream = client.spaces.subscribe(spaceId);

stream.on('text.delta', (event) => {
  console.log(event.data.delta);
});

stream.on('run.completed', (event) => {
  console.log('Done!');
});

stream.close();
```
