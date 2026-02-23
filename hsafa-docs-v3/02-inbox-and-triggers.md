# 02 — Inbox & Triggers

## Overview

In v3, events don't "trigger runs" — they **push into the agent's inbox**. The inbox is a Redis list that collects all events for an agent. When events arrive, the agent wakes up (if sleeping) and processes everything in one think cycle.

The three event sources from v2 remain: **space messages**, **plans**, and **services**. The difference is they all flow through one unified inbox instead of creating separate runs.

---

## Inbox Architecture

```
┌─────────────────────────────┐
│  Event Sources              │
│                             │
│  Space A: Husam's message ──┐
│  Space B: Ahmad's message ──┼──▶ Redis List: inbox:{agentId}
│  Plan: daily report fires ──┤         │
│  Service: Jira webhook ─────┘         ▼
│                             │    Agent Process
│                             │    (BRPOP blocks until events arrive)
└─────────────────────────────┘
```

### Redis Structure

```
Key: inbox:{agentEntityId}
Type: List (LPUSH to add, BRPOP to consume)
```

Each inbox entry is a JSON object:

```json
{
  "eventId": "evt-abc-123",
  "type": "space_message",
  "timestamp": "2026-02-18T15:06:55Z",
  "data": {
    "spaceId": "space-xyz",
    "spaceName": "Project Alpha",
    "messageId": "msg-g7h8",
    "senderEntityId": "entity-husam",
    "senderName": "Husam",
    "senderType": "human",
    "content": "Pull the Q4 revenue numbers"
  }
}
```

---

## Event Source 1: Space Message

### Core Rule

> Any message from **any entity** (human or agent) in a space pushes an event to the inbox of **all other agent members** of that space. The sender is excluded — an agent's own message does not push to its own inbox.

This is the same all-agent triggering rule from v2. The only difference is it pushes to inbox instead of creating a run.

### Rules

- **No mentions.** There is no `@AgentName` parsing. Every agent in the space gets the event.
- **No admin agent.** No agent has priority over another.
- **No router.** No hidden AI decides which agents should receive events.
- **The sender is always excluded.** An entity's message pushes events to every agent *except* itself.

### Inbox Entry

```json
{
  "eventId": "evt-001",
  "type": "space_message",
  "timestamp": "2026-02-18T15:06:55Z",
  "data": {
    "spaceId": "space-xyz",
    "spaceName": "Project Alpha",
    "messageId": "msg-g7h8",
    "senderEntityId": "entity-husam",
    "senderName": "Husam",
    "senderType": "human",
    "content": "Pull the Q4 revenue numbers"
  }
}
```

### Multi-Agent Spaces

A single message in a space with 3 agents pushes to **3 inboxes** (or 2, if the sender is one of the agents). Each agent wakes independently, reads the event, and decides whether to respond.

```
Space "Project Alpha" — Husam (human), Designer (agent), Developer (agent), Analyst (agent)

Husam: "Let's finalize the Q4 report"

→ Event pushed to 3 inboxes: Designer, Developer, Analyst
→ Each agent wakes, thinks, decides independently:
  - Designer: "Not a design task." → silence
  - Developer: "Not a dev task." → silence
  - Analyst: "This is about data." → responds with analysis
```

---

## Event Source 2: Plan (Self-Scheduled)

An agent can define scheduled or conditional plans that push events to its own inbox.

### Plan Types

| Type | How Agent Specifies It | Stored As |
|------|----------------------|-----------|
| **Relative** | `"runAfter": "5 hours"` | `scheduledAt = now + 5h` |
| **Specific date** | `"scheduledAt": "2026-02-20T10:00:00Z"` | `scheduledAt` stored as-is |
| **Recurring** | `"cron": "0 9 * * 1"` | `nextRunAt` recomputed each fire |

### Inbox Entry

```json
{
  "eventId": "evt-plan-abc",
  "type": "plan",
  "timestamp": "2026-02-19T09:00:00Z",
  "data": {
    "planId": "plan-abc",
    "planName": "Daily Report",
    "instruction": "Generate and post the daily metrics summary"
  }
}
```

### Plan Lifecycle

1. Agent creates a plan using `set_plans` with `runAfter`, `scheduledAt`, or `cron`.
2. Gateway scheduler checks plans on a tick interval.
3. When a plan fires, the gateway pushes an event to the agent's inbox.
4. For recurring plans, `nextRunAt` is recomputed after each fire.
5. Agent can inspect, update, or delete its own plans via `get_plans` / `delete_plans`.

### No Active Space

Plan events have **no associated space**. The agent must call `enter_space` to interact with any space. The agent knows which spaces it belongs to from its consciousness/config.

---

## Event Source 3: External Service

An external system (Node.js, Python, webhook handler, etc.) can push events to an agent's inbox via the gateway API.

### API

```
POST /api/agents/{agentId}/trigger
Headers: x-secret-key: sk_...
Body: {
  "serviceName": "jira-webhook",
  "payload": { "issue": "PROJ-123", "action": "created" }
}
```

### Inbox Entry

```json
{
  "eventId": "evt-svc-xyz",
  "type": "service",
  "timestamp": "2026-02-18T15:10:00Z",
  "data": {
    "serviceName": "jira-webhook",
    "payload": { "issue": "PROJ-123", "action": "created" }
  }
}
```

### No Active Space

Like plans, service events have **no associated space**. The agent uses `enter_space` to route its output.

---

## Inbox Processing

### drainInbox

When the agent wakes, it pulls **all pending events** from the inbox in one operation:

```typescript
async function drainInbox(agentEntityId: string): Promise<InboxEvent[]> {
  const events: InboxEvent[] = [];
  while (true) {
    const item = await redis.lpop(`inbox:${agentEntityId}`);
    if (!item) break;
    events.push(JSON.parse(item));
  }
  return events;
}
```

### Deduplication

Events are deduplicated by `eventId` before processing:
- Space messages use `messageId` as the event ID
- Plans use `planId + scheduledAt` as the event ID
- Services use a gateway-generated UUID

If the same event is pushed twice (e.g., during a Redis reconnect), it's only processed once.

### Event Formatting

The drained events are formatted into a single user message and appended to consciousness:

```typescript
function formatInboxEvents(events: InboxEvent[]): string {
  const lines = events.map(e => {
    switch (e.type) {
      case 'space_message':
        return `[${e.data.spaceName}] ${e.data.senderName} (${e.data.senderType}): "${e.data.content}"`;
      case 'plan':
        return `[Plan: ${e.data.planName}] ${e.data.instruction}`;
      case 'service':
        return `[Service: ${e.data.serviceName}] ${JSON.stringify(e.data.payload)}`;
    }
  });
  
  return `INBOX (${events.length} events, ${new Date().toISOString()}):\n${lines.join('\n')}`;
}
```

Example consciousness entry:

```
role: user
content: |
  INBOX (3 events, 2026-02-18T15:07:00Z):
  [Family Space] Husam (human): "Tell Muhammad the meeting is at 3pm"
  [Family Space] Husam (human): "Also tell him to bring the documents"
  [Support] Ahmad (human): "What's the status of the Q4 report?"
```

The agent sees all three events as one batch and can reason about them together.

---

## Wakeup Mechanism

### Primary: Redis BRPOP

The agent process blocks on `BRPOP inbox:{agentEntityId} 0` — a blocking pop that waits indefinitely until an event arrives. This is the most efficient way to sleep:

- Zero CPU usage while waiting
- Immediate wakeup when an event is pushed
- Built-in Redis reliability

### Alternative: Redis Pub/Sub Signal

For scenarios where the agent needs to wake for reasons other than inbox events (e.g., process health checks), a secondary wakeup channel can be used:

```
Channel: wakeup:{agentEntityId}
```

Publishing any message to this channel wakes the agent, which then checks the inbox. If the inbox is empty, it goes back to sleep.

---

## Comparison to v2 Triggers

| v2 | v3 |
|----|-----|
| Space message → creates a run | Space message → pushes to inbox |
| Plan fires → creates a run | Plan fires → pushes to inbox |
| Service trigger → creates a run | Service trigger → pushes to inbox |
| Multiple messages → multiple concurrent runs | Multiple messages → batched in inbox |
| Each run has isolated context snapshot | One consciousness processes all events |
| `absorb_run` merges related runs | Not needed — inbox batches naturally |
| Dedup by `agentEntityId + triggerMessageId` | Dedup by `eventId` in inbox |

---

## Summary

| Event Source | Who Pushes | Inbox Entry Type | Has Space Context |
|-------------|-----------|-----------------|-------------------|
| Space message | Gateway (on any message in agent's spaces) | `space_message` | Yes (spaceId, sender) |
| Plan | Gateway scheduler (on fire) | `plan` | No |
| Service | External system via API | `service` | No |
