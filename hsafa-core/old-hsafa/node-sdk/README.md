# @hsafa/node

Node.js SDK for Hsafa — admin operations, services, robots, and backends.

## Installation

```bash
pnpm add @hsafa/node
```

## Quick Start

```ts
import { HsafaClient } from '@hsafa/node';

// Secret key — full admin access (backends, services, CLI)
const client = new HsafaClient({
  gatewayUrl: 'http://localhost:3001',
  secretKey: 'sk_...',
});

// Public key + JWT (human user — rare in Node)
const userClient = new HsafaClient({
  gatewayUrl: 'http://localhost:3001',
  publicKey: 'pk_...',
  jwt: 'eyJ...',
});
```

## Resource API

All operations follow `client.<resource>.<method>()`.

### Agents

```ts
const { agentId } = await client.agents.create({
  name: 'my-assistant',
  config: {
    version: '1.0',
    agent: { name: 'my-assistant', system: 'You are helpful.' },
    model: { provider: 'openai', name: 'gpt-4.1-mini' },
    tools: [],
  },
});

const { agents } = await client.agents.list({ limit: 50 });
const { agent } = await client.agents.get(agentId);
await client.agents.delete(agentId);
```

### Entities

```ts
const { entity } = await client.entities.create({
  type: 'human',
  externalId: 'clerk_user_123',
  displayName: 'John Doe',
});

const { entity: agentEntity } = await client.entities.createAgent({
  agentId: 'uuid',
  displayName: 'My Assistant',
});

const { entities } = await client.entities.list({ type: 'human' });
await client.entities.update(entityId, { displayName: 'Jane' });
await client.entities.delete(entityId);
```

### SmartSpaces

```ts
const { smartSpace } = await client.spaces.create({
  name: 'Project Chat',
  adminAgentEntityId: agentEntity.id, // optional: set admin agent
});

const { smartSpaces } = await client.spaces.list();
await client.spaces.update(spaceId, { name: 'New Name' });
await client.spaces.delete(spaceId);
```

### Memberships

```ts
await client.spaces.addMember(spaceId, { entityId, role: 'member' });
const { members } = await client.spaces.listMembers(spaceId);
await client.spaces.updateMember(spaceId, entityId, { role: 'admin' });
await client.spaces.removeMember(spaceId, entityId);
```

### Messages

```ts
const { message, runs } = await client.messages.send(spaceId, {
  content: 'Hello!',
  entityId: 'uuid',
});

const { messages } = await client.messages.list(spaceId, {
  afterSeq: '42',
  limit: 50,
});
```

### Runs

```ts
const { runs } = await client.runs.list({ agentId: 'uuid', status: 'running' });
const { run } = await client.runs.get(runId);
await client.runs.cancel(runId);
await client.runs.delete(runId);
const { events } = await client.runs.getEvents(runId);
```

### Tool Results

```ts
// Submit a client tool result (run must be in waiting_tool status)
await client.tools.submitResult(runId, {
  callId: 'tool-call-uuid',
  result: { approved: true },
});
```

### Clients

```ts
const { client: conn } = await client.clients.register({
  entityId: 'uuid',
  clientKey: 'stable-device-key',
  clientType: 'node',
  displayName: 'My Service',
  capabilities: { canExecuteTools: true },
});

const { clients } = await client.clients.list(entityId);
await client.clients.delete(clientId);
```

## Service Triggers

External services (Jira, Slack, cron jobs, IoT devices) are **NOT entities**. They trigger agents directly via API:

```ts
// Trigger an agent from your backend
const { runId, streamUrl } = await client.agents.trigger('agent-id', {
  serviceName: 'OrderProcessor',
  payload: { event: 'new_order', orderId: '8891' },
});

// Optionally subscribe to the run for client tool handling
const stream = client.runs.subscribe(runId);

stream.on('run.waiting_tool', async (event) => {
  const data = event.data as Record<string, unknown>;
  const pending = data.pendingToolCalls as Array<{ toolCallId: string; toolName: string; input: unknown }>;
  for (const tc of pending) {
    const result = await executeMyTool(tc.toolName, tc.input);
    await client.tools.submitResult(runId, { callId: tc.toolCallId, result });
  }
});

stream.on('run.completed', () => {
  console.log('Done');
  stream.close();
});
```

## Streaming

### Subscribe to a SmartSpace

```ts
const stream = client.spaces.subscribe(spaceId, { afterSeq: 0 });

stream.on('smartSpace.message', (event) => {
  console.log('New message:', event.data);
});

stream.on('text.delta', (event) => {
  process.stdout.write(event.data.delta as string);
});

stream.on('error', (err) => console.error(err));
stream.close();
```

### Subscribe to a Run

```ts
const stream = client.runs.subscribe(runId);

stream.on('run.completed', (event) => { /* ... */ });
stream.on('run.failed', (event) => { /* ... */ });
stream.on('tool-input-available', (event) => { /* ... */ });

stream.close();
```

## Convenience Methods

### Send and Wait

```ts
const response = await client.messages.sendAndWait(spaceId, {
  content: 'What is 2+2?',
  entityId: 'uuid',
  timeout: 30000,
});
// response.text = "2+2 = 4"
// response.toolCalls = [...]
```

### Setup: Create Space with Entities

```ts
const setup = await client.setup.createSpace({
  name: 'My Chat',
  agents: [{ agentId: 'uuid', displayName: 'Assistant' }],
  humans: [{ externalId: 'user-123', displayName: 'John' }],
});
// setup.smartSpace, setup.entities, setup.memberships
```

## Auth Modes

| Mode | Header | Use Case |
|------|--------|----------|
| **SecretKey** | `x-secret-key` | Full access: backends, services, admin ops |
| **PublicKey + JWT** | `x-public-key` + `Bearer` | User-scoped (rare in Node) |
