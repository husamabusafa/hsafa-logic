# Client Authentication & Subscription Guide

This document describes how clients authenticate and subscribe to SmartSpaces in the Hsafa Gateway.

---

## Key Types

Hsafa uses **2 system-wide keys** (environment variables), not per-SmartSpace keys:

| Key | Header | Purpose | Who Uses It | Safe to Expose? |
|-----|--------|---------|-------------|----------------|
| **Secret Key** (`sk_...`) | `x-secret-key` | Full access to all gateway operations | Your backend, Node.js services, CLI | **No** — server-side only |
| **Public Key** (`pk_...`) | `x-public-key` | Limited access (send messages, read streams, submit tool results) | React/browser/mobile clients | **Yes** — safe in client-side code |

Both keys are configured as environment variables on the gateway:

```env
HSAFA_SECRET_KEY=sk_...
HSAFA_PUBLIC_KEY=pk_...
```

---

## Authentication by Client Type

### React / Browser (Human Users) — Public Key + JWT

Human users authenticate via JWT from your existing auth system (Clerk, Auth0, NextAuth, etc.).

```tsx
import { HsafaProvider, useSmartSpace } from '@hsafa/react';
import { useAuth } from 'your-auth-provider'; // Clerk, Auth0, etc.

function App({ spaceId }) {
  const { token } = useAuth(); // JWT from your auth system

  return (
    <HsafaProvider
      gatewayUrl="http://localhost:3001"
      publicKey="pk_..."  // system-wide public key, safe for browser
      jwt={token}          // user's JWT from auth provider
    >
      <Chat spaceId={spaceId} />
    </HsafaProvider>
  );
}

function Chat({ spaceId }) {
  const { messages, send } = useSmartSpace(spaceId);

  return <ChatUI messages={messages} onSend={send} />;
}
```

**How Public Key + JWT works:**

1. User logs in via your auth system → gets JWT
2. JWT contains user identifier (e.g., `sub: "clerk_user_123"`)
3. Client passes public key + JWT to Hsafa SDK
4. Gateway validates the public key matches `HSAFA_PUBLIC_KEY` env var
5. Gateway verifies JWT signature (via shared secret or JWKS URL)
6. Gateway looks up entity by `externalId` matching JWT claim
7. Gateway checks entity is member of the SmartSpace
8. If all valid → allow action (send message, read stream, submit tool result)

**What public key auth CAN do:**
- Send messages (entityId auto-resolved from JWT)
- Subscribe to SmartSpace streams
- Read message history
- Submit tool results
- List spaces the user is a member of

**What public key auth CANNOT do:**
- Create/delete SmartSpaces
- Create/delete entities or agents
- Manage memberships
- Create/cancel runs
- Access entity stream (subscribeAll)

### Node.js (Backends / Services) — Secret Key

Backends and external services authenticate via the secret key. Note: external services are **NOT entities** — they trigger agents directly via API.

```ts
import { HsafaClient } from '@hsafa/node';

// Full access — backends, services, CLI
const client = new HsafaClient({
  gatewayUrl: 'http://localhost:3001',
  secretKey: 'sk_...',
});

// Optionally pass JWT to identify who sent a message
const clientWithJwt = new HsafaClient({
  gatewayUrl: 'http://localhost:3001',
  secretKey: 'sk_...',
  jwt: userToken,  // optional: resolves entityId from JWT instead of body
});
```

**What secret key auth CAN do:** Everything — full admin access to all gateway operations.

---

## Service Integration (Service Trigger API)

External services (Jira, Slack, cron jobs, IoT devices, Node.js backends) are **NOT entities** in the system. Instead, they trigger agents directly via API and optionally subscribe to runs for tool results.

### How It Works

```
┌─────────────────┐         ┌─────────────────────────────────────┐
│  Node.js        │         │           Hsafa Gateway             │
│  Service        │         │                                     │
│                 │  POST   │  POST /api/agents/{id}/trigger      │
│  trigger()      │────────►│  → Creates a Run with               │
│                 │         │    triggerType: 'service'            │
│                 │         │    triggerServiceName: 'MyService'   │
│                 │   SSE   │    triggerPayload: {...}             │
│  subscribe()    │◄───────►│  → Agent uses sendSpaceMessage to   │
│  (optional)     │         │    communicate with spaces           │
└─────────────────┘         └─────────────────────────────────────┘
```

### Usage

```ts
import { HsafaClient } from '@hsafa/node';

const client = new HsafaClient({
  gatewayUrl: 'http://localhost:3001',
  secretKey: 'sk_...',  // system-wide secret key
});

// Trigger an agent directly (service trigger)
const { runId } = await client.agents.trigger('order-agent-id', {
  serviceName: 'OrderProcessor',
  payload: { event: 'new_order', orderId: '8891' },
});

// Optionally subscribe to the run for tool results
const stream = client.runs.subscribe(runId);

stream.on('run.waiting_tool', async (event) => {
  for (const tc of event.data.pendingToolCalls) {
    const result = await executeMyTool(tc.toolName, tc.input);
    await client.tools.submitRunResult(runId, {
      callId: tc.toolCallId,
      result,
    });
  }
});

stream.on('run.completed', () => {
  console.log('Agent run completed');
  stream.close();
});
```

### Benefits

- **No entity management** — services don't need to be entities or space members
- **Direct trigger** — one API call to kick off an agent
- **Run subscription** — optionally subscribe to handle client tools
- **Agent handles routing** — the agent uses `sendSpaceMessage` to post results to the right spaces

---

## Entity Management Flow

Entities must be created and added to spaces **before** they can interact. All management operations require the **secret key**.

### Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     YOUR APP (Backend)                          │
│                     (uses secret key)                           │
│                                                                 │
│  1. User signs up → Create entity in Gateway                    │
│  2. User joins workspace → Add entity to SmartSpace             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     HSAFA GATEWAY                               │
│                                                                 │
│  - Validates secret key (system-wide env var)                   │
│  - Stores entities with externalId (links to your auth)         │
│  - Stores memberships (which entities are in which spaces)      │
│  - JWT validates human identity (with public key)               │
│  - Checks membership before allowing actions                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Your Backend Code

```ts
import { HsafaClient } from '@hsafa/node';

const client = new HsafaClient({
  gatewayUrl: 'http://localhost:3001',
  secretKey: process.env.HSAFA_SECRET_KEY,  // system-wide secret key
});

// When user signs up in your app
async function onUserSignup(authUser) {
  // Create entity in Hsafa Gateway
  const { entity } = await client.entities.create({
    type: 'human',
    externalId: authUser.id,      // Links to JWT sub/userId claim
    displayName: authUser.name,
  });
  
  return entity;
}

// When user joins a workspace/project
async function onUserJoinsWorkspace(entityId, smartSpaceId) {
  await client.spaces.addMember(smartSpaceId, {
    entityId,
    role: 'member',
  });
}

// Trigger an agent from your backend (service trigger)
async function triggerAgentFromService(agentId: string, event: string, payload: any) {
  const { runId } = await client.agents.trigger(agentId, {
    serviceName: 'MyApp',
    payload: { event, ...payload },
  });
  return runId;
}
```

---

## Gateway Configuration

### System-Wide Keys

Set both keys as environment variables on the gateway:

```env
# System-wide authentication keys
HSAFA_SECRET_KEY=sk_...   # Full access — never expose to clients
HSAFA_PUBLIC_KEY=pk_...   # Limited access — safe for browser/mobile
```

You can generate keys using the gateway's key utility, or use any secure random string with the appropriate prefix.

### JWT Verification

Configure how Gateway verifies JWTs (used with public key auth):

```env
# Option A: Shared secret (simple)
JWT_SECRET=your-jwt-secret
JWT_ENTITY_CLAIM=sub

# Option B: JWKS URL (works with Clerk, Auth0, etc.)
JWKS_URL=https://your-auth.clerk.accounts.dev/.well-known/jwks.json
JWT_ENTITY_CLAIM=sub
```

### Supported Auth Providers

| Provider | JWKS URL |
|----------|----------|
| Clerk | `https://xxx.clerk.accounts.dev/.well-known/jwks.json` |
| Auth0 | `https://xxx.auth0.com/.well-known/jwks.json` |
| Supabase | Use `JWT_SECRET` from project settings |
| NextAuth | Use `JWT_SECRET` |
| Custom | Your own JWKS or secret |

---

## Security Model

### Defense in Depth (3 layers)

1. **Key validation** — Secret key or public key must be valid
2. **JWT verification** — For public key auth, JWT must be valid and signed correctly
3. **Membership check** — Entity must be a member of the SmartSpace they're accessing

### Key Principles

- The browser **never** sees the secret key
- The public key is useless without a valid JWT
- JWT users cannot impersonate other entities — `entityId` is resolved from the JWT token
- Membership is enforced on all space-scoped operations
- Both keys are system-wide — no per-space key management needed

---

## Summary

| Client Type | Authentication | Subscription |
|-------------|----------------|---------------|
| **React (human)** | `publicKey` + `jwt` | Per-space via SDK hooks |
| **Node.js (service)** | `secretKey` | Service trigger API (`client.agents.trigger`) + optional run subscription |
| **Your backend** | `secretKey` | Admin APIs for entity/membership management |
| **CLI** | `secretKey` | All operations |
