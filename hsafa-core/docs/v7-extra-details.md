# V7 Extra Details — Implementation Notes

Companion to `v7-hsafa-core.md`. Covers SDK design, tool lifecycle streaming, typing indicators, Vercel AI SDK compatibility, Redis reduction, dashboard, and spaces decoupling.

---

## 1. SDK API Design — 4 Concepts

The SDK has exactly 4 concepts. Nothing else.

```typescript
import { HsafaSDK } from '@hsafa/sdk';

const hsafa = new HsafaSDK({
  coreUrl: process.env.HSAFA_CORE_URL,
  apiKey: process.env.HSAFA_API_KEY,
  scope: 'spaces',
});

// 1. REGISTER — tell Core what you can do
await hsafa.registerTools([
  { name: 'send_message', description: '...', input: { spaceId: 'string', text: 'string' } },
]);

// 2. HANDLE — do the work when asked
hsafa.onToolCall('send_message', async (args, ctx) => {
  const msg = await db.message.create({ ... });
  return { sent: true, messageId: msg.id };
});

// 3. PUSH — tell Core what's happening
hsafa.pushEvent({
  type: 'message',
  data: { from: 'Husam', text: 'Hello' },
  haseefId: 'atlas-uuid',
});

// 4. LISTEN — observe what's going on (tool lifecycle, run lifecycle)
hsafa.on('tool.input.start', (event) => { ... });
hsafa.on('tool.call', (event) => { ... });
hsafa.on('tool.result', (event) => { ... });
hsafa.on('tool.error', (event) => { ... });
hsafa.on('run.started', (event) => { ... });
hsafa.on('run.completed', (event) => { ... });

// Start the SSE connection
hsafa.connect();
```

### Internal SDK Wiring

| Public Method | Internal HTTP/SSE |
|---|---|
| `registerTools([...])` | `PUT /api/scopes/{scope}/tools` |
| `onToolCall(name, fn)` | Registers handler in local map |
| `pushEvent({...})` | `POST /api/events` |
| `on(event, fn)` | Registers listener in local map |
| `connect()` | Opens SSE to `GET /api/scopes/{scope}/actions/stream` |

The SSE stream multiplexes:
- **Tool call requests** → routed to `onToolCall` handlers
- **Tool lifecycle events** → routed to `on('tool.*')` listeners
- **Run lifecycle events** → routed to `on('run.*')` listeners

---

## 2. Tool Lifecycle Events (via `on()`)

Core emits these events on the scope SSE stream as it processes the LLM's fullStream:

### Event: `tool.input.start`

Fired when the LLM begins generating arguments for a tool in this scope.

```typescript
hsafa.on('tool.input.start', (event) => {
  event.actionId     // unique ID for this tool call
  event.toolName     // "send_message"
  event.haseef       // { id, name, profile }
});
```

### Event: `tool.input.delta`

Fired as the LLM streams argument tokens. Includes the raw delta and a best-effort parsed partial args object.

> **Implementation note**: The SDK handles partial JSON parsing internally using a streaming JSON parser (e.g., `partial-json`). `partialArgs` is updated on every delta — if a delta produces invalid JSON mid-token, `partialArgs` retains the last successfully parsed state. Services never need to deal with raw JSON parsing. Both `delta` (raw text) and `partialArgs` (parsed object) are always available.

```typescript
hsafa.on('tool.input.delta', (event) => {
  event.actionId     // same as above
  event.toolName     // "send_message"
  event.delta        // raw JSON text delta: '{"text": "Hel'
  event.partialArgs  // best-effort parsed: { text: "Hel" }
  event.haseef       // { id, name, profile }
});
```

### Event: `tool.call`

Fired when arguments are fully parsed. The tool handler will be invoked next.

```typescript
hsafa.on('tool.call', (event) => {
  event.actionId     // same
  event.toolName     // "send_message"
  event.args         // final parsed: { spaceId: "...", text: "Hello!" }
  event.haseef       // { id, name, profile }
});
```

### Event: `tool.result`

Fired after the tool handler returns.

```typescript
hsafa.on('tool.result', (event) => {
  event.actionId     // same
  event.toolName     // "send_message"
  event.args         // { spaceId: "...", text: "Hello!" }
  event.result       // { sent: true, messageId: "..." }
  event.durationMs   // how long execution took
  event.haseef       // { id, name, profile }
});
```

### Event: `tool.error`

Fired if the tool handler throws.

```typescript
hsafa.on('tool.error', (event) => {
  event.actionId     // same
  event.toolName     // "send_message"
  event.error        // "Connection refused"
  event.haseef       // { id, name, profile }
});
```

### Event: `run.started`

Fired when a haseef begins a run. **Visibility rule**: every connected service receives `run.started` and `run.completed` for ALL haseefs that have their scope active — even if this service didn't trigger the run. For example, if a WhatsApp message triggers Atlas, and Atlas has both `whatsapp` and `spaces` scopes active, the spaces service also sees `run.started`. This is intentional: it lets services show status (e.g., "Atlas is thinking...") regardless of who triggered the run.

```typescript
hsafa.on('run.started', (event) => {
  event.runId
  event.haseef       // { id, name }
  event.triggerScope  // "spaces"
  event.triggerType   // "message"
});
```

### Event: `run.completed`

```typescript
hsafa.on('run.completed', (event) => {
  event.runId
  event.haseef
  event.summary      // run summary
  event.durationMs
});
```

---

## 3. Typing Indicator — Tool-Level Precision

The typing indicator is tied to **tool input streaming**, NOT run start/end. This gives precise "typing..." only when the agent is actually composing a message.

### Spaces Server Implementation

```typescript
// Entire typing indicator logic — replaces ~9K stream-bridge.ts

hsafa.on('tool.input.start', (event) => {
  if (event.toolName === 'send_message') {
    sse.emit(`space:${event.partialArgs?.spaceId}`, 'agent.typing', {
      entityId: event.haseef.id,
      name: event.haseef.name,
    });
  }
});

hsafa.on('tool.result', (event) => {
  if (event.toolName === 'send_message') {
    sse.emit(`space:${event.args?.spaceId}`, 'agent.stopped_typing', {
      entityId: event.haseef.id,
    });
  }
});

hsafa.on('tool.error', (event) => {
  if (event.toolName === 'send_message') {
    sse.emit(`space:${event.args?.spaceId}`, 'agent.stopped_typing', {
      entityId: event.haseef.id,
    });
  }
});
```

### Why Tool-Level, Not Run-Level

| Approach | Problem |
|---|---|
| `run.started` → typing | Shows typing while agent is thinking/reading — not composing |
| `tool.input.start(send_message)` → typing | Shows typing ONLY when agent is writing a message |

The agent might call `get_space_messages` (reading), then `recall_memories` (thinking), then `send_message` (writing). Only the last one should show "typing..."

### Text Streaming (Optional)

The SDK parses partial JSON internally, so services can directly use `partialArgs`:

```typescript
hsafa.on('tool.input.delta', (event) => {
  if (event.toolName === 'send_message' && event.partialArgs?.text) {
    sse.emit(`space:${event.partialArgs.spaceId}`, 'agent.typing.preview', {
      entityId: event.haseef.id,
      text: event.partialArgs.text,  // progressive text — already parsed by SDK
    });
  }
});
```

This is optional — services that don't need text preview can ignore `tool.input.delta` entirely and just use `tool.input.start` / `tool.result` for typing indicators.

---

## 4. Online Indicator

The `Scope.connected` field in Core DB tracks whether a service is actively connected:

- SDK calls `connect()` → opens SSE → Core sets `Scope.connected = true`, updates `lastSeenAt`
- SSE disconnects → Core sets `Scope.connected = false`
- SDK sends periodic heartbeats → Core updates `lastSeenAt`

The dashboard shows 🟢/🔴 per scope. Spaces can also query `GET /api/scopes` to show "AI available" in the UI.

For per-haseef online status: a haseef is "online" if ALL its active scopes are connected.

---

## 5. "Seen" Message Indicator

100% stays in spaces. Core never knows about read receipts. This is a chat platform feature, not a brain feature. No changes needed.

---

## 6. Vercel AI SDK v6 Compatibility

### Confirmed Compatible

V7's invoker uses `streamText()` or `ToolLoopAgent.stream()` from AI SDK v6. Here's the exact mapping:

#### fullStream Events → Core SSE Events

Core iterates `fullStream` and re-emits to the scope SSE channel:

| AI SDK fullStream event | Core emits to scope SSE |
|---|---|
| `tool-call-streaming-start` | `tool.input.start` |
| `tool-call-delta` (`argsTextDelta`) | `tool.input.delta` |
| `tool-call` (`input`) | `tool.call` |
| `tool-result` (`output`) | `tool.result` |
| `text` (text delta) | `text.delta` (on haseef stream only) |
| `reasoning` | `reasoning.delta` (on haseef stream only) |

#### Tool Registration — External Tools Use `execute`

External service tools ARE registered with `execute` functions. The `execute` function internally:
1. Sends action request to the service via SSE
2. Waits for result (with timeout)
3. Returns the result to the AI SDK

```typescript
// Inside Core's tool-builder.ts
function buildExternalTool(scopeTool: ScopeTool, scope: string): AISdkTool {
  return tool({
    description: scopeTool.description,
    inputSchema: buildZodSchema(scopeTool.inputSchema),
    execute: async (args, { toolCallId }) => {
      // Dispatch to service via SSE action channel
      const result = await toolDispatcher.dispatch({
        actionId: toolCallId,
        scope,
        toolName: scopeTool.name,
        args,
        haseef: currentHaseef,
      });
      return result;
    },
  });
}
```

The AI SDK handles the tool loop automatically — it calls `execute`, gets the result, feeds it back to the LLM, and continues until `stopWhen` is met.

#### Per-Tool Hooks (onInputStart, onInputDelta, onInputAvailable)

AI SDK v6 supports per-tool lifecycle hooks. Core uses these to emit events BEFORE the execute function runs:

```typescript
tool({
  description: '...',
  inputSchema: z.object({ ... }),
  onInputStart: ({ toolCallId }) => {
    // Emit tool.input.start to scope SSE
    scopeStream.emit('tool.input.start', { actionId: toolCallId, toolName, haseef });
  },
  onInputDelta: ({ toolCallId, inputTextDelta }) => {
    // Emit tool.input.delta to scope SSE
    scopeStream.emit('tool.input.delta', { actionId: toolCallId, delta: inputTextDelta, haseef });
  },
  onInputAvailable: ({ toolCallId, input }) => {
    // Emit tool.call to scope SSE
    scopeStream.emit('tool.call', { actionId: toolCallId, args: input, haseef });
  },
  execute: async (args) => {
    const result = await toolDispatcher.dispatch({ ... });
    // Emit tool.result to scope SSE (after execute returns)
    return result;
  },
});
```

This gives services **real-time streaming of tool args as the LLM generates them**, not just the final result.

#### ToolLoopAgent

V7 can use either `streamText` with `stopWhen` or `ToolLoopAgent`. Both produce the same `StreamTextResult` with `fullStream`. `ToolLoopAgent` is cleaner for reuse:

```typescript
// Core creates agent once per haseef
const agent = new ToolLoopAgent({
  model: resolveModel(haseef.configJson.model),
  tools: buildTools(haseef),  // prebuilt + external scope tools
  stopWhen: stepCountIs(50),
  prepareStep: async ({ stepNumber, steps }) => {
    // Mid-run logic: check interrupts, inject context
  },
  onStepFinish: async ({ toolCalls, toolResults, usage }) => {
    // Track metrics, emit events
  },
});

// Per-run invocation
const stream = agent.stream({
  system: buildSystemPrompt(haseef, memories),
  messages: buildMessages(triggerEvent),
});
```

#### Tool Approval (needsApproval)

AI SDK v6 supports `needsApproval: true` on tools. This could be used for sensitive tools where the admin needs to approve before execution. Not needed for v7 MVP but available for future use.

---

## 7. Redis Reduction

### What v7 Eliminates

| Current Redis Usage | v7 Status |
|---|---|
| Redis Streams (XREADGROUP) for action dispatch | **ELIMINATED** — replaced by SSE |
| Shared Redis subscriber for stream bridging | **ELIMINATED** — SDK handles it |
| Redis pub/sub for space SSE events | **STAYS** — spaces needs this internally |
| Redis BRPOP for event wakeup | **CAN BE REPLACED** — see below |

### Remaining Redis in Core

Only two uses remain:

1. **Event wakeup (BRPOP)** — when pushEvent arrives while haseef process is sleeping
2. **Haseef stream pub/sub** — publishing text/reasoning deltas to SSE listeners (dashboard, etc.)

### Path to Zero Redis in Core

Both can be replaced:

1. **Event wakeup** → Postgres LISTEN/NOTIFY. When an event is inserted, fire `pg_notify('haseef_wake', haseefId)`. The coordinator listens with `LISTEN haseef_wake`.

2. **Stream pub/sub** → In-process EventEmitter for single-node. For multi-node, Postgres LISTEN/NOTIFY or just accept SSE connections only on the node running the haseef.

**Recommendation**: Keep Redis for v7.0 (proven, fast). Remove it in v7.1 as an optimization if single-node is sufficient.

### Redis in Spaces (Unchanged)

Spaces still uses Redis for its own SSE pub/sub (space message events, typing events, etc.). This is independent of Core.

---

## 8. Dashboard — Simple Admin UI

A small React app (Vite + Tailwind + shadcn/ui) that talks to Core API. ~10 pages.

### Pages

| Page | Endpoint | What it shows |
|---|---|---|
| Haseef List | `GET /api/haseefs` | All haseefs, status, active scopes |
| Haseef Edit | `PATCH /api/haseefs/:id` | Name, profile fields, model, instructions, scope toggles |
| Scope Overview | `GET /api/scopes` | All registered scopes, connection status, tool count |
| Scope Detail | `GET /api/scopes/:scope/tools` | Tools in scope, descriptions, schemas |
| Memory Browser | `GET /api/haseefs/:id/memory` | Search, view, edit, delete memories |
| Run History | `GET /api/haseefs/:id/runs` | Every run — trigger, tools called, summary, tokens, duration |
| Run Detail | `GET /api/haseefs/:id/runs/:runId` | Step-by-step breakdown, tool calls, results |
| Live Feed | `GET /api/haseefs/:id/stream` (SSE) | Real-time: what haseef is doing right now |
| Status | `GET /api/dashboard/status` | Overview: haseef count, scope health, recent activity |

### No Restarts

Everything is in Postgres. Changes take effect on the next run:
- Toggle a scope → next run includes/excludes those tools
- Edit profile → next run uses new identity
- Change model → next run uses new LLM
- Edit instructions → next run uses new prompt

### Build Priority

Dashboard comes LAST. Core + SDK + Spaces integration first. Dashboard is just a nice UI over the API — the API works without it (use curl/Postman for initial testing).

---

## 9. Spaces Decoupling — Remove Haseefs from Spaces

### Current Problem

`hsafa-spaces/server/src/routes/haseefs.ts` is **781 lines** managing haseef CRUD, entity creation, voice config, personas — all tangled into the chat platform.

`hsafa-spaces/server/src/lib/service/` is **~120K bytes** of glue code connecting spaces to core.

### V7 Target

Spaces becomes a **general-purpose chat platform** (like WhatsApp). No haseef management. No core-proxy. No service module.

**What stays in spaces:**
- Users, auth, registration
- Spaces CRUD, memberships
- Messages, SSE streaming
- Media uploads, voice notes
- Read receipts, typing indicators
- Interactive messages (confirmation, vote, form, choice, card)
- Response tracking
- Invitations, roles
- API keys for external access

**What moves OUT of spaces:**
- Haseef CRUD → Core dashboard
- Haseef entity creation → happens via SDK when haseef is assigned to spaces scope
- core-proxy.ts → deleted
- service/ directory → replaced by ~50 lines of SDK integration

### How Haseefs Join Spaces

1. Admin creates haseef in Core dashboard, toggles "spaces" scope
2. Spaces server (via SDK) gets notified, creates an agent entity in spaces DB
3. Admin (or the haseef itself) joins the entity to specific spaces
4. Messages in those spaces trigger events via `hsafa.pushEvent()`

### SDK Integration in Spaces (~50 lines)

```typescript
// spaces-server/src/lib/hsafa.ts — THE ENTIRE INTEGRATION

import { HsafaSDK } from '@hsafa/sdk';
import { TOOLS } from './hsafa-tools';

export const hsafa = new HsafaSDK({
  coreUrl: process.env.HSAFA_CORE_URL,
  apiKey: process.env.HSAFA_API_KEY,
  scope: 'spaces',
});

await hsafa.registerTools(TOOLS);

// Tool handlers
hsafa.onToolCall('send_message', async ({ spaceId, text }, ctx) => {
  return await spaceService.postMessage(spaceId, ctx.haseef.id, text, 'agent');
});

hsafa.onToolCall('get_messages', async ({ spaceId, limit }, ctx) => {
  return await spaceService.getMessages(spaceId, limit);
});

hsafa.onToolCall('get_spaces', async (_, ctx) => {
  return await membershipService.getSpacesForEntity(ctx.haseef.id);
});

// ... other tool handlers (send_confirmation, send_vote, etc.)

// Typing indicator
hsafa.on('tool.input.start', (event) => {
  if (event.toolName === 'send_message') {
    sseEmit(event.partialArgs?.spaceId, 'agent.typing', { entityId: event.haseef.id });
  }
});

hsafa.on('tool.result', (event) => {
  if (event.toolName === 'send_message') {
    sseEmit(event.args?.spaceId, 'agent.stopped_typing', { entityId: event.haseef.id });
  }
});

hsafa.connect();
```

**Compare**: current `service/` directory = 12 files, ~120K bytes. V7 = 1 file, ~50 lines.

---

## 10. Multi-SDK Strategy

The API surface is intentionally minimal (3 methods + events). Easy to port:

| SDK | Language | Use Case | Priority |
|---|---|---|---|
| `@hsafa/sdk` | Node.js/TypeScript | Spaces, web services, most services | P0 — build first |
| `hsafa-sdk` | Python (pip) | ML pipelines, data services, robot vision | P1 — build second |
| `hsafa-sdk-go` | Go | High-perf microservices | P2 — later |
| `hsafa-sdk-rust` | Rust | Embedded, robot firmware | P3 — much later |

Each SDK implements the same 4 concepts:
1. `registerTools` → `PUT /api/scopes/{scope}/tools`
2. `onToolCall` / `on_tool_call` → local handler registry
3. `pushEvent` / `push_event` → `POST /api/events`
4. `on` → event listener + SSE parsing
5. `connect` → SSE connection management with auto-reconnect

Python SDK example:

```python
from hsafa_sdk import HsafaSDK

hsafa = HsafaSDK(
    core_url=os.environ["HSAFA_CORE_URL"],
    api_key=os.environ["HSAFA_API_KEY"],
    scope="vision",
)

await hsafa.register_tools([
    { "name": "detect_objects", "description": "...", "input": {} },
])

@hsafa.on_tool_call("detect_objects")
async def handle_detect(args, ctx):
    frame = await camera.capture()
    objects = await model.detect(frame)
    return {"objects": objects}

@hsafa.on("tool.input.start")
def on_tool_start(event):
    print(f"Tool {event.tool_name} starting for {event.haseef.name}")

await hsafa.connect()
```

---

## 11. Prebuilt Tools (Core-Internal)

Some tools execute inside Core, not via services. These are registered as prebuilt tools with `execute` functions that run in-process:

| Tool | What it does | Where it executes |
|---|---|---|
| `done` | Signal run completion + summary | Core (in-process) |
| `set_memories` | Store semantic memories | Core (Postgres) |
| `delete_memories` | Remove memories | Core (Postgres) |
| `recall_memories` | Search memories + episodic history | Core (pgvector) |

These are always available to every haseef. They don't go through the scope SSE dispatch — they execute directly in the AI SDK tool loop.

---

## 12. How Core Dispatches Tool Calls to Services

When the LLM calls an external tool (registered by a service via SDK):

```
1. LLM generates tool call args
2. AI SDK triggers execute() on the tool
3. execute() creates a pending action:
   - Generates actionId
   - Sends action on the scope's SSE channel:
     { actionId, toolName, args, haseef: { id, name, profile } }
   - Waits for result (Promise with timeout)
4. Service SDK receives action on SSE
5. SDK routes to onToolCall handler
6. Handler executes and returns result
7. SDK posts result: POST /api/actions/{actionId}/result
8. Core resolves the pending Promise with the result
9. execute() returns the result to AI SDK
10. AI SDK feeds result to LLM, continues the loop
```

### Timeout

If a service doesn't respond within the timeout (default: 30s), the execute function returns an error result: `{ error: "Tool execution timed out" }`. The LLM sees this and can decide what to do (retry, skip, tell the user).

### Multiple Services, Same Scope

Only ONE service per scope. If you need multiple WhatsApp services (e.g., different providers), use different scopes: `whatsapp_twilio`, `whatsapp_meta`.

---

## 13. Implementation Order

```
Phase 1: @hsafa/sdk (Node.js)         — ~200 lines, defines the contract
Phase 2: hsafa-core v7                 — fresh rewrite, ~15 files
Phase 3: Spaces SDK integration        — strip service/, add SDK, ~50 lines
Phase 4: Core dashboard                — simple React app over API
Phase 5: hsafa-sdk (Python)            — port SDK to Python
```

Each phase is independently testable. Phase 1+2 can be tested with a simple test service (echo tool). Phase 3 integrates with the existing spaces frontend.
