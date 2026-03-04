# Extension Architecture — Manifest-Based

## Principle

An extension is a **generic, stateless HTTP server** (Docker container) that gives Haseefs new senses and actions. All haseef-specific data lives in Core, not in the extension. Extensions are install-and-use — only env vars change between deployments.

---

## The Manifest

Every extension serves `GET /manifest`. This is its identity card.

```json
{
  "name": "spaces",
  "description": "Chat communication platform",
  "version": "1.0.0",

  "tools": [
    {
      "name": "enter_space",
      "description": "Enter a space to load context.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "spaceId": { "type": "string" }
        },
        "required": ["spaceId"]
      }
    }
  ],

  "instructions": "When you receive a space message, call enter_space first, then respond.",

  "configSchema": {
    "type": "object",
    "properties": {
      "entityId": { "type": "string", "description": "Entity ID in Spaces platform" },
      "spaceIds": { "type": "array", "items": { "type": "string" } }
    },
    "required": ["entityId"]
  },

  "events": [
    { "type": "space_message", "description": "New message in a space" }
  ]
}
```

- **tools**: What actions the extension provides.
- **instructions**: Injected into the Haseef's system prompt.
- **configSchema**: What per-haseef config is required (validated on link).
- **events**: What sense events the extension can push (documentation only).

---

## Extension Endpoints

An extension exposes exactly **two** HTTP endpoints:

### `GET /manifest`

Returns the manifest JSON. Called by Core on installation and periodically to refresh.

### `POST /webhook`

Receives all communication from Core. Payload has a `type` field:

#### `type: "tool_call"` — Core asks extension to execute a tool

```json
{
  "type": "tool_call",
  "toolCallId": "tc-uuid",
  "toolName": "enter_space",
  "args": { "spaceId": "space-1" },
  "haseef": {
    "id": "haseef-uuid",
    "name": "Atlas",
    "config": { "entityId": "abc", "spaceIds": ["space-1"] }
  }
}
```

Extension executes the tool using `haseef.config` for identity, returns:

```json
{ "result": { "space": {...}, "members": [...], "messages": [...] } }
```

Or on error:

```json
{ "error": "Space not found" }
```

#### `type: "haseef.connected"` — A haseef was linked to this extension

```json
{
  "type": "haseef.connected",
  "haseefId": "haseef-uuid",
  "haseefName": "Atlas",
  "config": { "entityId": "abc", "spaceIds": ["space-1"] }
}
```

Extension starts listening for events relevant to this haseef (e.g., SSE listeners on spaces). Builds internal routing map for sense events.

#### `type: "haseef.disconnected"` — A haseef was unlinked

```json
{
  "type": "haseef.disconnected",
  "haseefId": "haseef-uuid"
}
```

Extension stops listeners, removes from routing map.

#### `type: "haseef.config_updated"` — A haseef's config was changed

```json
{
  "type": "haseef.config_updated",
  "haseefId": "haseef-uuid",
  "haseefName": "Atlas",
  "config": { "entityId": "abc", "spaceIds": ["space-1", "space-3"] }
}
```

Extension updates its routing map / listeners accordingly.

---

## Sense Events (Extension → Core)

When something happens externally (message arrives, file uploaded, etc.), the extension pushes a sense event to the relevant haseef:

```
POST {CORE_URL}/api/haseefs/{haseefId}/senses
x-extension-key: ek_...

{
  "event": {
    "eventId": "evt-unique-id",
    "channel": "spaces",
    "type": "space_message",
    "source": "space-1",
    "data": { "spaceId": "space-1", "from": "Husam", "text": "hello" },
    "timestamp": "2026-03-04T12:00:00Z"
  }
}
```

### How the extension knows which haseef to push to:

1. On startup: `GET {CORE_URL}/api/extensions/me` → returns all connected haseefs with their configs
2. On lifecycle: `haseef.connected` / `haseef.disconnected` webhooks keep it updated
3. Extension builds an **in-memory routing map** from this data

Example routing map for ext-spaces:
```
spaceId "space-1" → [{ haseefId: "atlas-id", entityId: "abc" }]
spaceId "space-2" → [{ haseefId: "atlas-id", entityId: "abc" }, { haseefId: "nova-id", entityId: "def" }]
```

When a message arrives in space-1 → look up map → push to atlas-id.

---

## Core API

### Install extension (admin, one-time)

```
POST /api/extensions
{ "url": "http://ext-spaces:4000" }
```

Core does:
1. `GET {url}/manifest` → fetch manifest
2. Generate `extensionKey` (`ek_...`)
3. Store Extension record with cached manifest
4. Return `{ extension: { id, name, extensionKey } }`

### Link haseef to extension (admin, per-haseef)

```
POST /api/haseefs/:haseefId/extensions
{ "extensionId": "ext-id", "config": { "entityId": "abc", "spaceIds": ["s1"] } }
```

Core does:
1. Validate `config` against `manifest.configSchema`
2. Create `HaseefExtension` record
3. POST `haseef.connected` to extension webhook
4. Return `{ success: true }`

### Unlink haseef from extension

```
DELETE /api/haseefs/:haseefId/extensions/:extensionId
```

Core does:
1. Delete `HaseefExtension` record
2. POST `haseef.disconnected` to extension webhook

### Update haseef extension config

```
PATCH /api/haseefs/:haseefId/extensions/:extensionId
{ "config": { "entityId": "abc", "spaceIds": ["s1", "s3"] } }
```

Core does:
1. Validate config against manifest.configSchema
2. Update `HaseefExtension.config`
3. POST `haseef.config_updated` to extension webhook

### Refresh manifest

```
POST /api/extensions/:extensionId/refresh
```

Core re-fetches `GET {url}/manifest` and updates cached manifest.

### Self-discovery (extension startup/restart)

```
GET /api/extensions/me
x-extension-key: ek_...
```

Returns extension info + all connected haseefs with their configs. Used by the extension to rebuild its routing map on restart.

---

## Core Database

### Extension model

```
Extension:
  id            UUID
  name          String (from manifest, unique)
  url           String (base URL of the extension)
  extensionKey  String (unique, "ek_...")
  manifest      JSON   (cached manifest: tools, instructions, configSchema, events)
  createdAt     DateTime
  updatedAt     DateTime
```

### HaseefExtension model (join table)

```
HaseefExtension:
  id            UUID
  haseefId      UUID
  extensionId   UUID
  config        JSON   (per-haseef config, validated against manifest.configSchema)
  enabled       Boolean
  connectedAt   DateTime

  @@unique([haseefId, extensionId])
```

### Removed models

- ~~ExtensionTool~~ — tools come from cached manifest
- ~~PendingToolCall~~ — webhook is synchronous HTTP, no need to store pending state

---

## Tool Execution (inside Core)

When building a Haseef's tools, Core reads the cached manifest for each connected extension and creates AI SDK tools that POST to the extension's webhook:

```typescript
// In extension-manager.ts buildExtensionTools()
for (const extTool of manifest.tools) {
  tools[extTool.name] = tool({
    description: extTool.description,
    inputSchema: jsonSchema(extTool.inputSchema),
    execute: async (args) => {
      const response = await fetch(`${extension.url}/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'tool_call',
          toolCallId: options.toolCallId,
          toolName: extTool.name,
          args,
          haseef: { id: haseefId, name: haseefName, config: connectionConfig }
        })
      });
      const data = await response.json();
      if (data.error) return { error: data.error };
      return data.result;
    }
  });
}
```

---

## Extension Container

An extension is a Docker container. Only env vars change between deployments.

### Required env vars (all extensions)

```
PORT=4000              # HTTP server port
CORE_URL=http://...    # Hsafa Core URL (for sense events + self-discovery)
EXTENSION_KEY=ek_...   # Auth key (given by Core at install time)
```

### Platform-specific env vars (per extension type)

```
# ext-spaces
SPACES_APP_URL=http://...
SPACES_APP_SECRET_KEY=sk_...

# ext-whatsapp
WHATSAPP_API_KEY=wk_...
WHATSAPP_BUSINESS_ID=biz_...

# ext-postgres
# (no platform credentials — connection string comes from haseef config)
```

### Docker Compose example

```yaml
ext-spaces:
  image: hsafa/ext-spaces:latest
  environment:
    PORT: 4000
    CORE_URL: http://core:3001
    EXTENSION_KEY: ek_abc123
    SPACES_APP_URL: http://spaces-app:3005
    SPACES_APP_SECRET_KEY: sk_xyz
  ports:
    - "4000:4000"
```

---

## Multiple Instances of the Same Extension

When a haseef needs two connections of the same type (e.g., two Postgres databases), the extension handles it via configSchema:

```json
{
  "configSchema": {
    "type": "object",
    "properties": {
      "databases": {
        "type": "object",
        "additionalProperties": {
          "type": "object",
          "properties": {
            "connectionString": { "type": "string" }
          }
        }
      }
    }
  }
}
```

Haseef config:
```json
{
  "databases": {
    "prod": { "connectionString": "postgres://prod..." },
    "analytics": { "connectionString": "postgres://analytics..." }
  }
}
```

Tool accepts a `database` parameter: `query_db({ database: "prod", sql: "SELECT..." })`.

This keeps Core simple — no alias system needed. The extension decides how to handle multi-instance.

---

## Lifecycle Summary

```
INSTALL (once per extension):
  1. Deploy container (set env: PORT, CORE_URL, platform credentials)
  2. POST /api/extensions { url } → Core fetches manifest, returns extensionKey
  3. Set EXTENSION_KEY env on container, restart

LINK (once per haseef per extension):
  4. POST /api/haseefs/:id/extensions { extensionId, config }
     → Core validates config, stores link, notifies extension via webhook

RUNTIME (automatic):
  5. External event happens (message, webhook, etc.)
     → Extension receives it
     → Looks up routing map → finds target haseef(s)
     → POST /api/haseefs/:id/senses → Core wakes haseef

  6. Haseef LLM calls extension tool
     → Core POST {extension.url}/webhook { type: tool_call, args, haseef config }
     → Extension executes, returns result
     → Core gives result to LLM

RESTART (extension recovery):
  7. Extension starts, calls GET /api/extensions/me
     → Rebuilds routing map from connected haseefs
     → Starts listeners
```

---

## Haseef Stream (Real-Time Tool Input Deltas)

Core is the **single source of truth** for the haseef's LLM stream. During generation, the AI SDK fires tool lifecycle hooks (`onInputStart`, `onInputDelta`, `onInputAvailable`). Core publishes these as events to a Redis channel. Anyone can subscribe via SSE.

### How it works

```
LLM generating speak({ text: "Hello, how are you?" })

        Core (AI SDK hooks)
              │
              │ publishes to Redis
              │ channel: haseef:{id}:stream
              │
              ├─────────────────────────────────────┐
              │                                     │
      SSE subscriber                        SSE subscriber
      (ext-robot)                           (spaces-app)
              │                                     │
    robot starts speaking                  UI shows typing
    "Hel" → "Hello," → "Hello, how"       indicator with deltas
```

### SSE endpoint

```
GET /api/haseefs/:haseefId/stream
x-extension-key: ek_...   (extensions)
  OR
x-secret-key: sk_...      (admin/apps)
```

### Stream events

```
tool.started       → { toolCallId, toolName }
tool.input_delta   → { toolCallId, toolName, delta, partialArgs }
tool.ready         → { toolCallId, toolName, args }
tool.done          → { toolCallId, toolName, result }
text.delta         → { delta }
text.done          → { text }
```

### Inside Core: how events are published

Extension tools get lifecycle hooks automatically when built by `buildExtensionTools`:

```typescript
tools[extTool.name] = tool({
  description: extTool.description,
  inputSchema: jsonSchema(extTool.inputSchema),

  // Stream hooks — publish deltas to haseef stream channel
  onInputStart: async ({ toolCallId }) => {
    await publishHaseefStream(haseefId, {
      type: 'tool.started', toolCallId, toolName: extTool.name
    });
  },

  onInputDelta: async ({ toolCallId, inputTextDelta }) => {
    // Parse partial JSON to extract readable fields
    argsText += inputTextDelta;
    const partialArgs = parsePartialJson(argsText);
    await publishHaseefStream(haseefId, {
      type: 'tool.input_delta', toolCallId, toolName: extTool.name,
      delta: inputTextDelta, partialArgs
    });
  },

  onInputAvailable: async ({ toolCallId, input }) => {
    await publishHaseefStream(haseefId, {
      type: 'tool.ready', toolCallId, toolName: extTool.name, args: input
    });
  },

  // Execute — still webhook, called AFTER full args are ready
  execute: async (args, options) => {
    const response = await fetch(`${extension.url}/webhook`, { ... });
    const data = await response.json();

    await publishHaseefStream(haseefId, {
      type: 'tool.done', toolCallId: options.toolCallId,
      toolName: extTool.name, result: data.result
    });

    return data.result;
  }
});
```

### Example: Robot Speaker Extension

```typescript
// ext-robot — subscribes to haseef stream for real-time speaking

const eventSource = new EventSource(
  `${CORE_URL}/api/haseefs/${haseefId}/stream`,
  { headers: { 'x-extension-key': EXTENSION_KEY } }
);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.type === 'tool.input_delta' && data.toolName === 'speak') {
    // Speak each delta as it arrives — real-time voice
    robot.speakDelta(data.partialArgs?.text);
  }

  if (data.type === 'tool.done' && data.toolName === 'speak') {
    robot.finishSpeaking();
  }
};
```

The robot extension ALSO has a `/webhook` endpoint for the `tool_call` (Core still calls it with full args after generation). But the SSE stream gives it a **head start** — it can begin speaking before the tool call completes.

### Example: Spaces App — Direct Stream, No Bridge

```typescript
// spaces-app — subscribes to haseef stream for UI typing indicators
// NO ext-spaces bridge needed for streaming

const eventSource = new EventSource(
  `${CORE_URL}/api/haseefs/${haseefId}/stream`,
  { headers: { 'x-secret-key': SECRET_KEY } }
);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.type === 'tool.input_delta' && data.toolName === 'send_space_message') {
    // Extract text delta from partial args
    const textSoFar = data.partialArgs?.text;
    // Emit to space SSE channel for frontend typing indicator
    emitToSpace(spaceId, { type: 'typing', agentEntityId, text: textSoFar });
  }

  if (data.type === 'tool.done' && data.toolName === 'send_space_message') {
    // Message fully sent — persist and emit final
    emitToSpace(spaceId, { type: 'message', agentEntityId, text: data.result.text });
  }
};
```

### What this means for ext-spaces

ext-spaces does NOT bridge streaming anymore. Its only jobs:

1. **Tool execution** — receives `tool_call` webhook, calls Spaces App API, returns result
2. **Sense events** — listens to Spaces App SSE for new messages, pushes to Core

The streaming/typing goes **directly from Core to whoever subscribes**:

```
                        Core
                    haseef stream
                         │
            ┌────────────┼────────────┐
            │            │            │
        ext-spaces   spaces-app   frontend SDK
        (optional)   (typing UI)  (typing UI)
```

ext-spaces might subscribe if it needs to react to streaming (e.g., update a typing indicator on the spaces platform). Or it might not subscribe at all — spaces-app handles UI directly.

### Who subscribes to what

| Subscriber | Subscribes to | Listens for | Purpose |
|-----------|---------------|-------------|---------|
| **ext-robot** | `haseef:atlas/stream` | `tool.input_delta` (speak) | Real-time voice |
| **spaces-app** | `haseef:atlas/stream` | `tool.input_delta` (send_space_message) | Typing indicator |
| **frontend SDK** | `haseef:atlas/stream` | `tool.input_delta` (any) | Live tool UI |
| **ext-spaces** | `haseef:atlas/stream` | (optional) | Only if needed |

### Key principle

**Core publishes. Everyone subscribes. No bridge needed.**

The stream is the same for everyone. Each subscriber filters for the events it cares about. The extension/app decides what to do with the deltas — Core doesn't know or care.

---

## What Changes from Current Implementation

### Core (hsafa-core/core/)

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `url` + `manifest` to Extension. Remove `ExtensionTool` model. Remove `PendingToolCall` model. |
| `src/lib/extension-manager.ts` | Rewrite: `buildExtensionTools` uses HTTP webhook instead of Redis pub/sub. Add `fetchManifest`, `notifyExtension`. Remove `syncExtensionTools`, `getPendingToolCalls`. |
| `src/routes/extensions.ts` | Simplify: install via URL (fetch manifest), refresh manifest, remove tool sync endpoint. |
| `src/routes/haseefs.ts` | Simplify: remove tool polling endpoint, remove tool result endpoint. Link/unlink send lifecycle webhooks. Add config update endpoint. |
| `src/lib/tool-result-wait.ts` | **Delete** — no longer needed. |
| `src/lib/tool-worker-events.ts` | **Delete** — no longer needed. |
| `src/agent-builder/builder.ts` | Remove `waitForToolResult` and `emitToolWorkerEvent` imports. Custom tool async/sync variants simplified (no PendingToolCall for extension tools). |

### ext-spaces (hsafa-core/extensions/ext-spaces/)

| File | Change |
|------|--------|
| `src/index.ts` | Becomes Express server with `/manifest` + `/webhook`. Remove self-discovery dance, tool sync, instruction sync. |
| `src/tool-handler.ts` | Rewrite: handle tool_call webhook requests instead of Redis subscriber. |
| `src/spaces-listener.ts` | Keep: still needed for SSE sense events. Started/stopped by lifecycle webhooks. |
| `src/core-client.ts` | Simplify: only needs `pushSenseEvent` and `getMe` (for restart recovery). Remove `syncTools`, `updateInstructions`, `parseConnection`. |
| `src/config.ts` | Simplify: remove `HaseefConnection` (managed dynamically via webhooks). |
| `src/stream-bridge.ts` | Keep: still forwards LLM streaming to spaces-app. |

### Removed

- `src/lib/tool-result-wait.ts` — deleted
- `src/lib/tool-worker-events.ts` — deleted
- `ExtensionTool` Prisma model — deleted
- `PendingToolCall` Prisma model — deleted (note: still used by custom tool async/sync variants in builder.ts — those need separate handling, see below)

### Note: PendingToolCall for Custom Tools

`PendingToolCall` is also used by custom tools (async and sync-with-timeout variants in `builder.ts`). These are NOT extension tools — they're for external tool workers that connect via SSE/polling.

Options:
1. Keep `PendingToolCall` for custom tools only (rename to `ToolWorkerCall`?)
2. Migrate custom tools to the same webhook model (custom tools with a URL already use HTTP)
3. Remove async custom tools entirely (they can be extensions instead)

Recommendation: Keep PendingToolCall for now, only remove extension usage of it. Clean up custom tools in a separate pass.
