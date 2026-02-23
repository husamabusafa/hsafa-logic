# 09 — Streaming & Events

## Overview

Hsafa uses **Server-Sent Events (SSE)** for real-time streaming from gateway to clients, and **Redis Pub/Sub** for fan-out across multiple connected clients and server instances. The streaming architecture is largely unchanged from v2 — the agent communicates through tools, and only tool inputs/outputs are streamed.

---

## Architecture

```
┌─────────────┐     ┌───────────────┐     ┌──────────────┐     ┌────────────┐
│  LLM (AI    │────▶│  Gateway      │────▶│  Redis       │────▶│  Client    │
│  Provider)  │     │  (process     │     │  Pub/Sub     │     │  (SSE      │
│             │     │   loop +      │     │              │     │   listener)│
│             │     │   stream-     │     │              │     │            │
│             │     │   processor)  │     │              │     │            │
└─────────────┘     └───────────────┘     └──────────────┘     └────────────┘
```

### What Gets Streamed

Only **tool inputs and outputs** are streamed. The agent's raw text output and reasoning are internal planning — never shown to anyone. All visible content reaches users through tool calls, primarily `send_message`.

---

## Event Flow

### 1. Agent Process Starts Think Cycle

The agent process calls `streamText()` which returns an async iterable of chunks from the LLM.

### 2. Stream Processor

`stream-processor.ts` consumes the LLM stream and emits structured events for **tool calls only**:

| LLM Chunk Type | Hsafa Event | Description |
|----------------|-------------|-------------|
| Tool call start | `tool-call.start` | Tool invocation begins |
| Tool input delta | `tool-input-delta` | Partial JSON args (for visible tools) |
| Tool call complete | `tool-call.complete` | Tool finished, result available |
| Tool call error | `tool-call.error` | Tool execution failed |

**Ignored (not streamed):**
- Raw text tokens — agent's internal reasoning
- Reasoning tokens — internal only
- Final text response — internal only

### 3. Space-Directed Events

Events are directed to the **active space** of the agent process. The stream processor reads the active space and publishes events to the appropriate Redis channel.

```
Channel: smartspace:{spaceId}
```

Only events from **visible** tool calls are published:
- `send_message` → always visible. The `text` arg is extracted and streamed as message content.
- Custom tools with `visible: true` → tool input/output streamed to space.
- All other tools → not streamed (silent execution).

### 4. Redis Pub/Sub

```typescript
await redis.publish(`smartspace:${spaceId}`, JSON.stringify({
  type: 'tool-input-delta',
  agentEntityId: agent.entityId,
  streamId: stream.id,
  toolName: 'send_message',
  data: { textDelta: 'Hello' },
}));
```

### 5. SSE Delivery to Clients

Each connected client has an SSE connection. The gateway subscribes to Redis channels for the client's spaces:

```typescript
// SSE endpoint: GET /api/spaces/:spaceId/events
const subscriber = redis.duplicate();
await subscriber.subscribe(`smartspace:${spaceId}`);

subscriber.on('message', (channel, message) => {
  res.write(`data: ${message}\n\n`);
});
```

### 6. Client Processing

The react-sdk processes SSE events and updates the UI:

```typescript
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  switch (data.type) {
    case 'tool-input-delta':
      if (data.toolName === 'send_message') {
        appendToStreamingMessage(data.streamId, data.data.textDelta);
      } else {
        updateToolCallInput(data.streamId, data.data);
      }
      break;
    case 'tool-call.complete':
      addToolResult(data.streamId, data.data);
      break;
    case 'smartSpace.message':
      addPersistedMessage(data.data);
      break;
  }
};
```

---

## Event Types

### Agent Status Events

| Event | Published To | Description |
|-------|-------------|-------------|
| `agent.active` | All agent's space channels | Agent woke up (think cycle started) |
| `agent.inactive` | All agent's space channels | Agent went to sleep (think cycle ended) |

### Tool Events (Visible Tools Only)

| Event | Published To | Description |
|-------|-------------|-------------|
| `tool-call.start` | Active space | Tool invocation started |
| `tool-input-delta` | Active space | Partial JSON args streaming. For `send_message`, text field extracted. |
| `tool-call.complete` | Active space | Tool finished with result |
| `tool-call.error` | Active space | Tool execution failed |
| `smartSpace.message` | Active space | Persisted message (DB record created) |

---

## StreamId Linking

Every streaming sequence gets a unique `streamId`:

```
tool-call.start   { streamId: "s-abc", toolName: "send_message" }
tool-input-delta  { streamId: "s-abc", textDelta: "Hello" }
tool-input-delta  { streamId: "s-abc", textDelta: " world" }
tool-call.complete { streamId: "s-abc", result: { success: true, messageId: "msg-xyz" } }
smartSpace.message { streamId: "s-abc", messageId: "msg-xyz", content: "Hello world" }
```

The `streamId` is critical for:
- **Deduplication** — when `smartSpace.message` arrives (persisted), the client removes the streaming entry with the same `streamId`.
- **Ordering** — multiple concurrent tool calls in one cycle each get their own `streamId`.

---

## Deduplication (Streaming → Persisted)

A race condition exists: the `smartSpace.message` event (persisted DB record) and `tool-input-delta` events can arrive in any order because the execute function runs concurrently with the stream processor.

**Solution:** `persistedStreamIdsRef` — a `useRef<Set<string>>` in the react-sdk:

1. When `smartSpace.message` arrives, immediately add its `streamId` to the ref (synchronous, before any setState).
2. The `useMemo` that computes display messages filters out streaming entries whose `streamId` is in the ref.
3. Works regardless of React render batching because the ref is updated synchronously.

---

## Concurrent Message Streaming

When an agent calls `send_message` multiple times in one think cycle, each call gets its own `streamId`:

```
Think cycle:
  send_message("First message")  → streamId: s-001
  send_message("Second message") → streamId: s-002

Events:
  tool-call.start   { streamId: "s-001", toolName: "send_message" }
  tool-input-delta  { streamId: "s-001", textDelta: "First" }
  tool-call.start   { streamId: "s-002", toolName: "send_message" }
  tool-input-delta  { streamId: "s-001", textDelta: " message" }
  tool-input-delta  { streamId: "s-002", textDelta: "Second" }
  tool-call.complete { streamId: "s-001" }
  tool-input-delta  { streamId: "s-002", textDelta: " message" }
  tool-call.complete { streamId: "s-002" }
```

The client groups deltas by `streamId` and renders each message independently.

### Sequence Number Conflict

When two `send_message` calls execute close together, both try to `INSERT` with the next sequence number. The second INSERT fails (unique constraint).

**Solution:** Retry loop with backoff — on conflict, re-read `max(seq)` and retry (up to 5 attempts).

---

## Resumable Streams

When a client disconnects and reconnects:

### Redis Streams + SSE Resume

1. Events are written to a Redis Stream (alongside Pub/Sub):
   ```
   XADD smartspace:{spaceId}:stream * type text-delta data "..."
   ```
2. Client tracks its last received event ID.
3. On reconnect, the gateway replays missed events from the Redis Stream.
4. TTL: stream entries expire after 5 minutes. After that, the client reloads from DB.

---

## Redis Channel Design

| Channel Pattern | Purpose |
|----------------|---------|
| `smartspace:{spaceId}` | All events for a space |
| `entity:{entityId}` | Entity-specific events |
| `inbox:{agentEntityId}` | Inbox events for an agent (LPUSH/BRPOP) |
| `wakeup:{agentEntityId}` | Wakeup signal channel |

---

## [SEEN] / [NEW] for Humans (Chat UI)

While v3 agents don't use `[SEEN]`/`[NEW]` markers (consciousness tracks everything), **humans** still need unread indicators:

### For Humans (Client-Side)

The frontend tracks `lastSeenMessageId` per space per user:
- Messages after `lastSeenMessageId` → shown with "new" indicator, unread count badge.
- When the user opens a space → frontend sends read receipt: `POST /api/spaces/:spaceId/read`.
- Same as WhatsApp/Slack read receipts.

| Entity Type | Tracking | Updated By | Used For |
|-------------|----------|------------|----------|
| Agent | Consciousness (automatic) | Think cycle | Agent knows what it saw |
| Human | `lastSeenMessageId` | Frontend (read receipt) | Unread badge, "new" divider |

---

## Comparison with v2

| Aspect | v2 | v3 |
|--------|----|----|
| Event source | Run execution | Think cycle execution |
| `run.started` / `run.completed` events | Yes | Replaced by `agent.active` / `agent.inactive` |
| Multiple concurrent streams per agent | Yes (multiple runs) | Rare (one process, sequential cycles) |
| `ACTIVE RUNS` in context | Yes | Not needed |
| Stream processor | Same | Same (fullStream works identically) |
| Redis channels | Same | Same + inbox channels |
