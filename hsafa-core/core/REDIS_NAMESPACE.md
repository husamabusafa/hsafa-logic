# Redis Namespace Map

All Redis key patterns used by hsafa-core and extensions.

## Lists (Inbox Queue)

| Pattern | Used By | Purpose |
|---------|---------|---------|
| `inbox:{haseefId}` | `lib/inbox.ts` | Per-haseef inbox queue. LPUSH to enqueue, RPOP/BRPOP to dequeue (FIFO). |

## Pub/Sub Channels

| Pattern | Publisher | Subscriber | Purpose |
|---------|-----------|------------|---------|
| `run:{runId}` | `lib/run-events.ts` | `routes/runs.ts` (SSE) | Per-run event stream (run.start, tool.started, tool-input.delta, tool.done, tool.error, run.finish) |
| `haseef:{haseefId}:stream` | `lib/run-events.ts` | Extensions (psubscribe `haseef:*:stream`) | Per-haseef event stream — same events as run channel, used by extensions for stream bridging |
| `tool-result:{callId}` | `routes/runs.ts` | `lib/extension-manager.ts` | Instant delivery of tool results to actively-waiting extension tools |
| `tool-workers` | `lib/tool-worker-events.ts` | `routes/tool-workers.ts` (SSE) | Broadcasts tool call events to external tool worker processes |

## Extension Pub/Sub (ext-spaces)

| Pattern | Publisher | Subscriber | Purpose |
|---------|-----------|------------|---------|
| `smartspace:{spaceId}` | `lib/smartspace-events.ts` | SSE stream route | Per-space real-time events (space.message, agent.active, agent.inactive, tool.started, tool.streaming, tool.done, tool.error) |

## Notes

- All keys are ephemeral — no persistence needed. Redis is used for real-time messaging only.
- Inbox lists are drained each cycle. Durable state lives in Postgres `InboxEvent` rows.
- The `haseef:*:stream` pattern uses `psubscribe` (pattern subscribe) so a single Redis connection handles all haseefs.
- `tool-result:{callId}` is a short-lived channel — published once when result arrives, subscriber blocks with timeout.
