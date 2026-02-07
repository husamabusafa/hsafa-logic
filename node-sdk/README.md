# @hsafa/node

Node.js SDK for Hsafa — admin operations, services, robots, and backends.

## Installation

```bash
pnpm add @hsafa/node
```

## Quick Start

```ts
import { HsafaClient } from '@hsafa/node';

// Admin mode (full access)
const admin = new HsafaClient({
  gatewayUrl: 'http://localhost:3001',
  adminKey: 'gk_...',
});

// Secret key mode (space-scoped admin)
const service = new HsafaClient({
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
  visibility: 'private',
});
// smartSpace.publicKey, smartSpace.secretKey

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
const { runs } = await client.runs.list({ smartSpaceId: 'uuid', status: 'running' });
const { run } = await client.runs.get(runId);
const { runId } = await client.runs.create({ smartSpaceId: 'uuid', agentEntityId: 'uuid' });
await client.runs.cancel(runId);
await client.runs.delete(runId);
const { events } = await client.runs.getEvents(runId);
```

### Tool Results

```ts
await client.tools.submitResult(spaceId, {
  runId: 'uuid',
  toolCallId: 'uuid',
  result: { approved: true },
});

await client.tools.submitRunResult(runId, {
  callId: 'uuid',
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

stream.on('tool-input-available', (event) => {
  const { toolCallId, toolName, input } = event.data;
  // Execute tool and send result back
});

stream.on('error', (err) => console.error(err));
stream.close();
```

### Subscribe to Entity (all spaces)

```ts
const stream = client.entities.subscribe(entityId);

stream.on('hsafa', (event) => {
  console.log(`[${event.smartSpaceId}] ${event.type}:`, event.data);
});

stream.on('tool-input-available', async (event) => {
  const { toolCallId, toolName, input } = event.data;
  const result = await executeTool(toolName as string, input);
  await client.tools.submitResult(event.smartSpaceId!, {
    runId: event.runId!,
    toolCallId: toolCallId as string,
    result,
  });
});

stream.close();
```

### Subscribe to a Run

```ts
const stream = client.runs.subscribe(runId, { since: '0-0' });

stream.on('text.delta', (event) => { /* ... */ });
stream.on('run.completed', (event) => { /* ... */ });

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
| **Admin** | `x-admin-key` | Full access: create spaces, entities, agents |
| **SecretKey** | `x-secret-key` | Space-scoped admin: services, robots |
| **PublicKey + JWT** | `x-public-key` + `Bearer` | User-scoped (rare in Node) |
