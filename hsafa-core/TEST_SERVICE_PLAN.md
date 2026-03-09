# V5 Test Service Plan

A pure test service that exercises the majority of hsafa-core v5 surface area.
No real-world domain logic — just raw protocol testing.

---

## Scope: `test`

---

## What It Covers

| V5 Feature | How It's Tested |
|------------|-----------------|
| **Tool Registration** | PUT 5 tools under `test` scope |
| **Sync mode** | `echo` + `add_numbers` — dispatch → handle → return result via Pub/Sub |
| **Fire-and-forget mode** | `log_event` — dispatch → handle → no result expected |
| **Async mode** | `slow_task` — dispatch → return pending → push result as event later |
| **Event pushing** | Push `test_ping` and `data_update` events via HTTP |
| **Action dispatch (Redis Streams)** | Service consumes `actions:{haseefId}:test` via XREADGROUP |
| **Action result (Pub/Sub)** | Sync results published to `action_result:{actionId}` |
| **Multimodal events** | Push event with image attachment (URL-based) |
| **Prebuilt: set_memories** | Push event that says "remember X" → Haseef stores memory |
| **Prebuilt: recall_memories** | Push event that says "what do you know about X" → Haseef searches |
| **Prebuilt: done** | Every cycle ends with done |
| **Prebuilt: peek_inbox** | Long tool execution → Haseef may peek inbox mid-cycle |
| **Consciousness** | Multiple events across cycles — verify continuity |
| **Profile** | Set profile via API, verify it appears in system prompt |
| **Time awareness** | Events carry timestamps, Haseef reasons about "when" |
| **Memory importance** | Push events that should trigger high vs low importance memories |
| **Scope removal** | DELETE scope → tools disappear from Haseef |
| **Tool upsert** | PUT single tool → verify update |
| **SSE stream** | Connect to `haseef:stream` → verify real-time thinking output |

---

## Tools (5)

### 1. `echo` — sync
```json
{
  "name": "echo",
  "description": "Echoes back the input message. Use this to test communication.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "message": { "type": "string", "description": "The message to echo back" }
    },
    "required": ["message"]
  },
  "mode": "sync",
  "timeout": 10000
}
```
**Handler**: Returns `{ echo: args.message, timestamp: now }`.

### 2. `add_numbers` — sync
```json
{
  "name": "add_numbers",
  "description": "Adds two numbers and returns the sum.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "a": { "type": "number", "description": "First number" },
      "b": { "type": "number", "description": "Second number" }
    },
    "required": ["a", "b"]
  },
  "mode": "sync",
  "timeout": 5000
}
```
**Handler**: Returns `{ sum: args.a + args.b }`.

### 3. `log_event` — fire_and_forget
```json
{
  "name": "log_event",
  "description": "Logs a message to the service console. No result returned.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "level": { "type": "string", "enum": ["info", "warn", "error"] },
      "message": { "type": "string" }
    },
    "required": ["level", "message"]
  },
  "mode": "fire_and_forget"
}
```
**Handler**: `console.log(...)` — no result returned to core.

### 4. `slow_task` — async
```json
{
  "name": "slow_task",
  "description": "Starts a slow background task. The result will arrive as a future event in your inbox.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "taskName": { "type": "string", "description": "Name of the task to run" },
      "delaySeconds": { "type": "number", "description": "How many seconds the task takes" }
    },
    "required": ["taskName"]
  },
  "mode": "async"
}
```
**Handler**: Waits `delaySeconds` (default 5), then pushes a `task_completed` event to the Haseef's inbox with the result.

### 5. `get_status` — sync
```json
{
  "name": "get_status",
  "description": "Returns the current status of the test service: uptime, actions handled, events pushed.",
  "inputSchema": {
    "type": "object",
    "properties": {},
    "required": []
  },
  "mode": "sync",
  "timeout": 5000
}
```
**Handler**: Returns `{ uptime, actionsHandled, eventsPushed, startedAt }`.

---

## Events (3)

### 1. `test_ping`
```json
{
  "eventId": "ping-{uuid}",
  "scope": "test",
  "type": "ping",
  "data": { "message": "Hello from test service", "counter": 1 }
}
```
Pushed on startup and optionally on a 60s timer. Triggers a think cycle.
Validates: event push → inbox → Haseef wakes → processes.

### 2. `data_update`
```json
{
  "eventId": "data-{uuid}",
  "scope": "test",
  "type": "data_update",
  "data": {
    "key": "temperature",
    "value": 22.5,
    "unit": "celsius",
    "source": "sensor-001"
  }
}
```
Simulates structured data from an external system.
Validates: Haseef can reason about structured data, potentially store as memory.

### 3. `image_event` (multimodal)
```json
{
  "eventId": "img-{uuid}",
  "scope": "test",
  "type": "image_received",
  "data": { "source": "camera-1", "description": "Test image" },
  "attachments": [
    {
      "type": "image",
      "mimeType": "image/png",
      "url": "https://via.placeholder.com/100x100.png"
    }
  ]
}
```
Validates: multimodal event handling, attachment injection into consciousness.

---

## Test Sequence

The test service runs through these phases:

### Phase 1: Setup
1. **Set profile** — `PATCH /api/haseefs/{id}/profile` with `{ phone: "+1234567890", location: "Test Lab" }`
2. **Register tools** — `PUT /api/haseefs/{id}/scopes/test/tools` with all 5 tools
3. **Verify tools** — `GET /api/haseefs/{id}/tools` → confirm 5 tools in `test` scope
4. **Connect SSE stream** — `GET /api/haseefs/{id}/stream` → listen for real-time output
5. **Connect action stream** — Start XREADGROUP loop on `actions:{haseefId}:test`

### Phase 2: Basic Event → Tool Round-Trip
6. **Push `test_ping`** — `POST /api/haseefs/{id}/events`
7. **Wait for action** — Haseef wakes, calls `echo` or responds
8. **Handle sync action** — Return result via `POST /api/haseefs/{id}/actions/{actionId}/result`
9. **Verify** — SSE stream shows the full think cycle (text deltas, tool calls)

### Phase 3: All Tool Modes
10. **Push event**: "Please echo 'hello world', add 3 + 7, log an info message, and start a slow task called 'analysis'"
11. **Handle `echo`** (sync) — return `{ echo: "hello world" }`
12. **Handle `add_numbers`** (sync) — return `{ sum: 10 }`
13. **Handle `log_event`** (fire_and_forget) — log to console, no result
14. **Handle `slow_task`** (async) — wait 5s, then push `task_completed` event
15. **Verify async** — Haseef receives `task_completed` in next cycle

### Phase 4: Memory
16. **Push event**: "Remember that the test lab temperature is 22.5°C"
17. **Verify** — Haseef calls `set_memories` (prebuilt tool)
18. **Push event**: "What do you know about the test lab?"
19. **Verify** — Haseef either recalls from consciousness or calls `recall_memories`

### Phase 5: Structured Data
20. **Push `data_update`** event (temperature sensor reading)
21. **Verify** — Haseef processes structured data, possibly stores or responds

### Phase 6: Multimodal
22. **Push `image_event`** with placeholder image URL
23. **Verify** — Event appears in consciousness with image attachment

### Phase 7: Continuity
24. **Push multiple events** across several cycles
25. **Verify** — Haseef references previous cycles ("earlier you sent...", "as I mentioned...")
26. **Verify** — Cycle count increments, timestamps are correct

### Phase 8: Tool Management
27. **Upsert tool** — `PUT /api/haseefs/{id}/scopes/test/tools/echo` with updated description
28. **Verify** — Tool description changed
29. **Delete tool** — `DELETE /api/haseefs/{id}/scopes/test/tools/log_event`
30. **Verify** — Tool no longer available
31. **Delete scope** — `DELETE /api/haseefs/{id}/scopes/test`
32. **Verify** — All test tools removed

### Phase 9: Status & Observability
33. **Call `get_status`** — Verify the service can report its own stats
34. **Check SSE stream** — Verify all events were streamed in real-time
35. **List snapshots** — `GET /api/haseefs/{id}/snapshots`

---

## Service Structure

```
services/test-service/
  index.ts          # Main entry: register, listen, handle, push
  package.json      # deps: ioredis (Redis Streams), node-fetch or native fetch
  .env.example      # CORE_URL, API_KEY, HASEEF_ID
```

Single file (`index.ts`), ~200 lines. No domain logic. Just:
1. Register tools via HTTP
2. Push events via HTTP
3. Listen for actions via Redis Streams (XREADGROUP)
4. Handle actions in a switch statement
5. Return results via HTTP (POST /actions/:id/result)

---

## What's NOT Tested (for later)

- Multiple services on different scopes simultaneously
- Multiple Haseefs served by one service
- Service reconnection / at-least-once delivery recovery
- Memory decay / cleanup
- Consciousness compaction / archiving
- pgvector semantic search
- MCP server integration
- Config hot-reload (configHash change)
- Process start/stop lifecycle
- Concurrent tool calls from same cycle
- Large-scale load / token budget management
