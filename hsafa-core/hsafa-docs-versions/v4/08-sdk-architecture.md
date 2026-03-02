# 08 — SDK Architecture: Client Libraries for Services

## Overview

SDKs in v4 are scoped by purpose. Client SDKs talk to **services** (not to the core). Admin and extension SDKs talk to the **core**. This separation mirrors the architecture: clients interact with services, and only services/extensions/admins interact with the core.

---

## SDK Categories

### 1. Service SDKs — For Client Apps

These SDKs help developers build client applications that talk to specific services:

| SDK | Service | Purpose |
|-----|---------|---------|
| **@hsafa/spaces-react** | Spaces App | React hooks for chat UI: messages, streaming, spaces, agents |
| **@hsafa/spaces-react-native** | Spaces App | React Native hooks for mobile chat apps |
| **@hsafa/spaces-node** | Spaces App | Node.js client for backend-to-Spaces-App communication |

**Key point:** These SDKs talk to the **Spaces App service**, not to the Hsafa Core. They use the Spaces App's auth (public key + JWT).

```typescript
// @hsafa/spaces-react usage
import { HsafaProvider, useSmartSpace, useMessages } from '@hsafa/spaces-react';

function App() {
  return (
    <HsafaProvider
      baseUrl="https://spaces.example.com"  // ← Spaces App URL, NOT core URL
      publicKey="pk_..."                      // ← Spaces App public key
    >
      <ChatScreen />
    </HsafaProvider>
  );
}

function ChatScreen() {
  const { space, messages, sendMessage } = useSmartSpace('space-123');
  // All of this talks to the Spaces App API
  // The SDK has no concept of "the core" or "extensions"
}
```

### 2. Admin SDK — For Managing the Core

| SDK | Target | Purpose |
|-----|--------|---------|
| **@hsafa/admin** | Hsafa Core | Create Haseefs, register extensions, connect extensions, manage plans/memories |

```typescript
import { HsafaAdmin } from '@hsafa/admin';

const admin = new HsafaAdmin({
  coreUrl: 'https://core.hsafa.com',
  secretKey: 'sk_...'              // ← Core secret key
});

// Create a Haseef
const haseef = await admin.haseefs.create({
  name: 'Atlas',
  model: 'gpt-5',
  identity: 'You are Atlas, Husam\'s personal Haseef...'
});

// Register an extension
const ext = await admin.extensions.register({
  name: 'ext-spaces',
  description: 'Spaces communication platform adapter'
});

// Connect extension to Haseef
await admin.extensions.connect(ext.id, haseef.id, {
  config: { /* extension-specific config */ }
});
```

### 3. Extension SDK — For Building Extensions

| SDK | Target | Purpose |
|-----|--------|---------|
| **@hsafa/extension-sdk** | Hsafa Core | Toolkit for building extensions: push events, register tools, receive calls |

```typescript
import { HsafaExtension } from '@hsafa/extension-sdk';

const ext = new HsafaExtension({
  name: 'ext-spaces',
  coreUrl: 'https://core.hsafa.com',
  extensionKey: 'ext_...'           // ← Extension key from core
});

// Push sense events
ext.pushSenseEvent(haseefId, { channel: 'ext-spaces', ... });

// Register tools
ext.registerTools([{ name: 'send_space_message', ... }]);

// Provide instructions
ext.setInstructions('...');

// Start listening for tool calls from core
await ext.start();
```

---

## SDK Boundaries

```
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│  @hsafa/spaces-react        →  Spaces App API (service)       │
│  @hsafa/spaces-react-native →  Spaces App API (service)       │
│  @hsafa/spaces-node         →  Spaces App API (service)       │
│                                                                │
│  ─────────────── NEVER crosses into core ───────────────────  │
│                                                                │
│  @hsafa/admin               →  Hsafa Core API (secret key)    │
│  @hsafa/extension-sdk       →  Hsafa Core API (extension key) │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

A React app using `@hsafa/spaces-react` has **zero knowledge** of the core, extensions, or Haseefs. It just sees a chat platform with spaces, messages, and entities (some of which happen to be AI agents).

---

## What Each SDK Knows About

| Concept | @hsafa/spaces-react | @hsafa/admin | @hsafa/extension-sdk |
|---------|--------------------:|-------------:|---------------------:|
| Spaces | ✅ | ❌ | ❌ |
| Messages | ✅ | ❌ | ❌ |
| Entities (users/agents) | ✅ | ✅ | ❌ |
| SSE streaming | ✅ | ❌ | ❌ |
| JWT auth | ✅ | ❌ | ❌ |
| Haseefs | ❌ | ✅ | ✅ |
| Extensions | ❌ | ✅ | ✅ |
| Sense events | ❌ | ❌ | ✅ |
| Tool calls | ❌ | ❌ | ✅ |
| Secret key | ❌ | ✅ | ❌ |
| Extension key | ❌ | ❌ | ✅ |
| Consciousness | ❌ | ❌ | ❌ |

**Consciousness is never exposed.** No SDK can read or modify a Haseef's consciousness directly. It's private to the core.

---

## Service SDK Details: @hsafa/spaces-react

### Hooks

| Hook | Purpose |
|------|---------|
| `useSmartSpace(spaceId)` | Connect to a space: messages, streaming, members |
| `useMessages(spaceId)` | Read messages with pagination |
| `useAgents(spaceId)` | List agents in a space |
| `useToolResult()` | Submit tool results for interactive (client-side) tools |

### Provider

```tsx
<HsafaProvider
  baseUrl="https://spaces.example.com"
  publicKey="pk_..."
  token={jwt}        // User's JWT from your auth system
  entityId={userId}  // User's entity ID
>
  {children}
</HsafaProvider>
```

### Streaming

The SDK handles SSE streaming from the Spaces App:

```
Browser ←SSE→ Spaces App
  Events: space.message, space.message.streaming, agent.active, agent.inactive,
          tool.started, tool.done, run.cancelled
```

The SDK reconstructs streaming state on page refresh by fetching recent runs and replaying events.

---

## Admin SDK Details: @hsafa/admin

### Resources

```typescript
const admin = new HsafaAdmin({ coreUrl, secretKey });

// Haseefs
admin.haseefs.create({ name, model, identity })
admin.haseefs.get(id)
admin.haseefs.list()
admin.haseefs.update(id, { ... })
admin.haseefs.delete(id)

// Extensions
admin.extensions.register({ name, description })
admin.extensions.connect(extId, haseefId, config)
admin.extensions.disconnect(extId, haseefId)
admin.extensions.list()

// Memories (per Haseef)
admin.memories.set(haseefId, key, value)
admin.memories.get(haseefId, key)
admin.memories.list(haseefId)

// Plans (per Haseef)
admin.plans.create(haseefId, { type, instruction, ... })
admin.plans.list(haseefId)
admin.plans.delete(haseefId, planId)
```

---

## Extension SDK Details: @hsafa/extension-sdk

### Core Methods

```typescript
const ext = new HsafaExtension({ name, coreUrl, extensionKey });

// Push events to a Haseef
ext.pushSenseEvent(haseefId, senseEvent)

// Register tools (called once at startup)
ext.registerTools(tools)

// Set instructions (called once at startup)
ext.setInstructions(text)

// Start listening for tool calls
ext.start()

// Handle tool calls (alternative to execute in registerTools)
ext.onToolCall(toolName, handler)
```

### Tool Call Flow

```
1. LLM calls send_space_message({ spaceId: "...", text: "Hello!" })
2. Core routes call to ext-spaces (based on tool→extension map)
3. ext-spaces receives the call via ext.onToolCall or registered execute function
4. ext-spaces calls Spaces App API using stored credentials
5. ext-spaces returns result to core
6. Core feeds result back to LLM for next step
```

---

## Why Not One SDK?

A single SDK would violate the architecture:

- **Service SDKs** would need to know about the core → coupling
- **Admin SDK** would need to know about services → coupling
- **Extension SDK** would need to know about clients → coupling

By separating SDKs, each one mirrors its layer in the architecture. You can build a Spaces App client without knowing Hsafa exists. You can build an extension without knowing what clients look like. Clean boundaries.
