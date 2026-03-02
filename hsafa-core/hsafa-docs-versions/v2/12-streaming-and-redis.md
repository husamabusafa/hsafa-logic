# 12 — Streaming & Redis Architecture

## Overview

Hsafa uses **Server-Sent Events (SSE)** for real-time streaming from gateway to clients, and **Redis Pub/Sub** for fan-out across multiple connected clients and server instances. This document covers the full streaming pipeline: from LLM tool calls to the user's screen.

### What Gets Streamed

Only **tool inputs and outputs** are streamed. The agent's raw text output and reasoning are internal planning — never shown to anyone. All visible content reaches users through tool calls, primarily `send_message`.

---

## Architecture Layers

```
┌─────────────┐     ┌───────────────┐     ┌──────────────┐     ┌────────────┐
│  LLM (AI    │────▶│  Gateway      │────▶│  Redis       │────▶│  Client    │
│  Provider)  │     │  (run-runner  │     │  Pub/Sub     │     │  (SSE      │
│             │     │   + stream-   │     │              │     │   listener)│
│             │     │   processor)  │     │              │     │            │
└─────────────┘     └───────────────┘     └──────────────┘     └────────────┘
```

### Why Redis?

1. **Horizontal scaling** — Multiple gateway instances can serve different clients. Redis ensures all clients see all events regardless of which instance processed the run.
2. **Fan-out** — A single run's events need to reach every client subscribed to that space. Redis Pub/Sub handles this natively.
3. **Resumable streams** — Redis Streams (or keys with TTL) can buffer events for clients that disconnect and reconnect.
4. **Decoupled producers/consumers** — The run-runner publishes events without knowing how many clients are listening.

---

## Event Flow (Step by Step)

### 1. LLM Starts Generating

The `run-runner.ts` calls `streamText()` (Vercel AI SDK) which returns an async iterable of chunks from the LLM provider.

### 2. Stream Processor

`stream-processor.ts` consumes the LLM stream and emits structured events for **tool calls only**:

| LLM Chunk Type | Hsafa Event | Description |
|----------------|-------------|-------------|
| Tool call start | `tool-call.start` | Tool invocation begins, args streaming |
| Tool input delta | `tool-input-delta` | Partial JSON args (for visible tools) |
| Tool call complete | `tool-call.complete` | Tool finished, result available |
| Tool call error | `tool-call.error` | Tool execution failed |

**Ignored (not streamed):**
- Raw text tokens — agent's internal reasoning/planning, never shown
- Reasoning tokens — same, internal only
- Final text response — not a tool call, therefore not visible

The agent communicates exclusively through `send_message`. When the LLM generates `send_message({ text: "Hello world" })`, the `text` field is extracted from the partial JSON tool input and streamed to the space as the message content.

### 3. Space-Directed Events

Events are directed to the **active space** of the run. The stream processor reads `activeSpaceId` from the run state and publishes events to the appropriate Redis channel.

```
Channel: smartspace:{spaceId}
```

Only events from **visible** tool calls are published to the space channel:
- `send_message` → always visible (it's a message). The `text` arg is extracted from tool-input-delta and streamed as message content.
- Custom tools where `visible: true` → tool input/output streamed to space
- All other tools (`visible: false`, prebuilt tools like `read_messages`, `set_memories`) → not streamed (silent execution)

### 4. Redis Pub/Sub

The gateway publishes events to Redis channels. Each space has its own channel:

```typescript
// Publishing (in stream-processor or run-runner)
await redis.publish(`smartspace:${spaceId}`, JSON.stringify({
  type: 'tool-input-delta',
  runId: run.id,
  streamId: stream.id,
  agentEntityId: run.agentEntityId,
  toolName: 'send_message',
  data: { textDelta: 'Hello' }  // extracted from partial JSON args
}));
```

### 5. SSE Delivery to Clients

Each connected client has an SSE connection to the gateway. The gateway subscribes to Redis channels for the spaces the client is a member of:

```typescript
// SSE endpoint: GET /api/spaces/:spaceId/events
const subscriber = redis.duplicate();
await subscriber.subscribe(`smartspace:${spaceId}`);

subscriber.on('message', (channel, message) => {
  res.write(`data: ${message}\n\n`);
});
```

### 6. Client Processing

The react-sdk (`useHsafaRuntime.ts`) processes SSE events and updates the UI state:

```typescript
// Simplified event handler
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  switch (data.type) {
    case 'tool-input-delta':
      if (data.toolName === 'send_message') {
        // Extract text field from partial JSON → stream as message content
        appendToStreamingMessage(data.streamId, data.data.textDelta);
      } else {
        // Other visible tools: show tool input being built
        updateToolCallInput(data.streamId, data.data);
      }
      break;
    case 'tool-call.complete':
      addToolResult(data.streamId, data.data);
      break;
    case 'smartSpace.message':
      addPersistedMessage(data.data);
      break;
    // ...
  }
};
```

---

## Event Types (Full Reference)

### Run Lifecycle Events

| Event | Published To | Description |
|-------|-------------|-------------|
| `run.started` | Space channel | Run began execution |
| `run.completed` | Space channel | Run finished successfully |
| `run.failed` | Space channel | Run errored |
| `run.cancelled` | Space channel | Run was cancelled |

### Agent Status Events

| Event | Published To | Description |
|-------|-------------|-------------|
| `agent.active` | All agent's space channels | Agent started a run |
| `agent.inactive` | All agent's space channels | Agent's run ended |

### Tool Events (Visible Tools Only)

These are the **only content events** streamed to clients. No raw text or reasoning is streamed.

| Event | Published To | Description |
|-------|-------------|-------------|
| `tool-call.start` | Active space | Tool invocation started (includes tool name) |
| `tool-input-delta` | Active space | Partial JSON args streaming. For `send_message`, the `text` field is extracted and streamed as message content. |
| `tool-call.complete` | Active space | Tool finished with result |
| `tool-call.error` | Active space | Tool execution failed |
| `smartSpace.message` | Active space | Persisted message (DB record created after `send_message` executes) |

---

## StreamId Linking

Every streaming sequence gets a unique `streamId` that links all related events:

```
tool-call.start   { streamId: "s-abc", toolName: "send_message" }
tool-input-delta  { streamId: "s-abc", textDelta: "Hello" }
tool-input-delta  { streamId: "s-abc", textDelta: " world" }
tool-call.complete { streamId: "s-abc", result: { success: true, messageId: "msg-xyz" } }
smartSpace.message { streamId: "s-abc", messageId: "msg-xyz", content: "Hello world" }
```

The `streamId` is critical for:
- **Deduplication** — When `smartSpace.message` arrives (persisted), the client removes the streaming entry with the same `streamId`.
- **Ordering** — Multiple concurrent `send_message` calls in one run each get their own `streamId`.

---

## Deduplication (Streaming → Persisted)

A race condition exists: the `smartSpace.message` event (persisted DB record) and `tool-input-delta` events can arrive in any order because the execute function runs concurrently with the stream processor.

**Solution:** `persistedStreamIdsRef` — a `useRef<Set<string>>` in the react-sdk:

1. When `smartSpace.message` arrives, immediately add its `streamId` to the ref (synchronous, before any setState).
2. The `useMemo` that computes the display messages filters out streaming entries whose `streamId` is in the ref.
3. This works regardless of React render batching because the ref is updated synchronously.

---

## Resumable Streams

When a client disconnects (tab close, page reload) and reconnects, it needs to catch up on any events it missed.

### Approach: Redis Streams + SSE Resume

1. **On publish**, events are also written to a Redis Stream (not just Pub/Sub):
   ```
   XADD smartspace:{spaceId}:stream * type text-delta data "..."
   ```
2. **Each client tracks** its last received event ID.
3. **On reconnect**, the client sends its last event ID. The gateway reads from the Redis Stream starting from that ID and replays missed events before switching to live Pub/Sub.
4. **TTL** — Redis Stream entries expire after a configurable window (e.g., 5 minutes). After that, the client must reload from DB.

### Alternative: Active Stream Tracking

Inspired by Vercel AI SDK's `resumable-stream` pattern:

1. Each run stores an `activeStreamId` in the DB.
2. On reconnect, the client GETs the active stream for its space.
3. If a stream is active, the gateway replays from Redis and continues.
4. If no stream is active (run completed), the client loads the final state from DB.

---

## Concurrent Message Streaming

When an agent calls `send_message` multiple times in a single run, each call gets its own `streamId`. This prevents interleaving:

```
Run abc:
  send_message("First message")  → streamId: s-001
  send_message("Second message") → streamId: s-002

Events arrive as:
  tool-call.start   { streamId: "s-001", toolName: "send_message" }
  tool-input-delta  { streamId: "s-001", textDelta: "First" }
  tool-call.start   { streamId: "s-002", toolName: "send_message" }  ← concurrent
  tool-input-delta  { streamId: "s-001", textDelta: " message" }
  tool-input-delta  { streamId: "s-002", textDelta: "Second" }
  tool-call.complete { streamId: "s-001" }
  tool-input-delta  { streamId: "s-002", textDelta: " message" }
  tool-call.complete { streamId: "s-002" }
```

The client groups deltas by `streamId` and renders each message independently.

### Sequence Number Conflict

When two `send_message` calls run concurrently, both try to `INSERT` with the next sequence number. The second INSERT fails (unique constraint on `seq` per space).

**Solution:** Retry loop in `smartspace-db.ts` — on conflict, re-read `max(seq)` and retry (up to 5 attempts with backoff).

---

## Redis Channel Design

| Channel Pattern | Purpose |
|----------------|---------|
| `smartspace:{spaceId}` | All events for a space (messages, tool calls, run status) |
| `entity:{entityId}` | Entity-specific events (used for per-entity SSE connections) |
| `run:{runId}` | Run-specific events (used for node-sdk `runs.subscribe`) |

Clients subscribe to the channels relevant to their view:
- **Chat UI** → subscribe to `smartspace:{currentSpaceId}`
- **Admin dashboard** → subscribe to `entity:{entityId}` for all spaces
- **Programmatic (node-sdk)** → subscribe to `run:{runId}` for a specific run

---

## Comparison with Vercel AI SDK Stream Protocol

Our SSE events are compatible in structure with Vercel AI SDK's UI Message Stream Protocol, but with additions for multi-agent spaces:

| Vercel AI SDK | Hsafa | Notes |
|---------------|-------|-------|
| `text-delta` | — | Not streamed. Agent text is internal planning. |
| `reasoning-start/delta/end` | — | Not streamed. Reasoning is internal. |
| `tool-input-start/delta/available` | `tool-call.start` + `tool-input-delta` + `tool-call.complete` | **This is all we stream.** |
| `data-*` (custom data parts) | `smartSpace.message` (persisted) | We persist immediately |
| `finish` | `run.completed` | We have run-level lifecycle |
| `abort` | `run.cancelled` | Same concept |
| — | `agent.active` / `agent.inactive` | Hsafa-specific: agent presence |

### Key Differences

1. **Tools-only streaming** — Vercel streams raw text + reasoning + tool calls. Hsafa only streams tool inputs/outputs because the agent's text is internal planning.
2. **Multi-space routing** — Vercel streams to the requesting client. Hsafa publishes to Redis channels per space, fan-out to all connected clients.
3. **Persistence-first** — Vercel optionally persists via `onFinish`. Hsafa always persists messages to DB and emits `smartSpace.message` events.
4. **No request-response coupling** — Vercel's `useChat` sends a POST and gets a streaming response. Hsafa's clients connect via SSE and receive events from any run in any space they're subscribed to.
5. **Transient events** — Vercel has `transient: true` data parts. Hsafa's `agent.active`/`agent.inactive` are transient by nature (not persisted).

---

## [SEEN] / [NEW] Markers for Streaming

When new events arrive via SSE while the user is viewing a space, the frontend can mark them as seen in real-time. When events arrive while the user is in a different space (or disconnected), they accumulate as [NEW].

This applies to **both agents and humans**:

### For Agents (Server-Side)
The gateway tracks `lastProcessedMessageId` per agent per space. When building the agent's system prompt:
- Messages before `lastProcessedMessageId` → tagged `[SEEN]`
- Messages after → tagged `[NEW]`

### For Humans (Client-Side, Chat UI)
The frontend tracks `lastSeenMessageId` per space per user:
- Store in localStorage or send to the gateway via API.
- Messages before `lastSeenMessageId` → no badge / indicator.
- Messages after → shown with "new" indicator, unread count badge on space list.

### Implementation Notes

```typescript
// Client-side: track last seen message
const markSpaceAsRead = (spaceId: string, lastMessageId: string) => {
  localStorage.setItem(`lastSeen:${spaceId}`, lastMessageId);
  // Optionally: POST /api/spaces/:spaceId/read { lastMessageId }
};

// When user opens a space:
const lastSeen = localStorage.getItem(`lastSeen:${spaceId}`);
const unreadMessages = messages.filter(m => m.id > lastSeen);

// When user scrolls to bottom / views latest:
markSpaceAsRead(spaceId, messages[messages.length - 1].id);
```

This is identical to how WhatsApp, Slack, and other messaging apps handle read receipts — because Hsafa spaces behave like messaging channels.
