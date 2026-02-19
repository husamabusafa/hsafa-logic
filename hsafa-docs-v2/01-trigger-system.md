# 01 — Trigger System

## Overview

An AI agent in Hsafa v2 can only be triggered by exactly **three sources**. There are no other entry points.

---

## 1. Space Message (Mention-Based Trigger)

This is the primary trigger mechanism.

### Core Rule

> Any message from any entity (human or agent) that contains `@AgentName` triggers the mentioned agent.

### Rules

- A single message can mention **one or multiple agents**. Each mentioned agent gets its own run.
- There is **no admin agent**. No agent has priority over another.
- There is **no delegate tool**. Agents don't hand off — they mention.
- There is **no special mention tool**. Mentions are part of `send_message`, not a separate action.
- **Any entity** (human or agent) can trigger **any agent** by mentioning it.
- Self-mention is blocked (an agent cannot trigger itself).

### Mention Format

Mentions are embedded in message text using `@` syntax:

```
Hey @DataAnalyst, can you pull the Q4 report?
```

The gateway parses `@AgentName` from message content and resolves it to an entity ID via the agent's `displayName`.

### What the Triggered Agent Receives

When an agent is triggered by mention, its run context includes:

| Field | Value |
|-------|-------|
| `triggerType` | `"space_message"` |
| `triggerSpaceId` | Space where the mention occurred |
| `triggerMessageContent` | Full message text |
| `triggerSenderEntityId` | Entity that sent the message |
| `triggerSenderName` | Display name of the sender |
| `triggerSenderType` | `"human"` or `"agent"` |

### Multiple Mentions

A single message can mention multiple agents:

```
@Designer create a mockup and @Developer implement the frontend
```

This creates **two independent runs** — one for `Designer`, one for `Developer`. Each run receives the full message as trigger content.

---

## 2. Special Case: Two-Entity Space (Implicit Trigger)

If a space contains exactly **two entities** of any type:
- **One human + one agent** (1:1 conversation)
- **One agent + one agent** (agent pair)

Then **any message from either entity triggers the other**, even without an explicit `@` mention.

### Why

In a 2-entity space there is only one possible recipient — requiring `@mentions` would be redundant. Whether it's a human talking to an agent, or two agents collaborating, the intent is always directed at the other party.

### Rules

- Only applies when the space has exactly **two entities total** (any combination of humans and agents).
- If a third entity joins, this behavior stops — mentions are required again.
- The triggered entity still receives the same `triggerType: "space_message"` context.
- A message does **not** re-trigger its own sender (no infinite loops).
- In an **agent + agent** space: each agent's message triggers the other agent.
- The trigger context includes `senderExpectsReply` (derived from whether the sender used `wait: true`). The triggered agent uses this to decide whether a reply is expected or the message is informational only.

### Detection Logic (Gateway)

```
space members = count entities in space

if (total_members === 2):
    trigger the other entity on any message (skip sender)
else:
    trigger only on explicit @mention
```

---

## 3. Predefined Plan

An agent can define scheduled or conditional plans that trigger it automatically.

### Plan Types

| Type | Trigger |
|------|---------|
| **One-time** | Fires at a specific `scheduledAt` datetime. |
| **Recurring** | Fires on a cron schedule (e.g., `"0 9 * * 1"` = every Monday 9am). |

### What the Triggered Agent Receives

| Field | Value |
|-------|-------|
| `triggerType` | `"plan"` |
| `triggerPlanId` | Plan ID |
| `triggerPlanName` | Plan name |
| `triggerPlanInstruction` | What to do (from plan config) |

### Plan Lifecycle

1. Agent creates a plan using `set_plans` tool (or plan is seeded via API).
2. Gateway scheduler checks `nextRunAt` on a tick interval.
3. When `nextRunAt <= now`, the gateway creates a run for the agent.
4. For recurring plans, `nextRunAt` is recomputed from the cron expression.
5. Agent can inspect, update, or delete its own plans.

### No Trigger Space

Plan-triggered runs have **no trigger space**. The agent must call `enter_space` to interact with any space. The agent knows which spaces it belongs to from its context.

---

## 4. External Service Trigger

An external system (Node.js, Python, cron job, webhook handler, etc.) can trigger an agent via the gateway API.

### API

```
POST /api/agents/{agentId}/trigger
Headers: x-secret-key: sk_...
Body: {
  "serviceName": "jira-webhook",
  "payload": { "issue": "PROJ-123", "action": "created" }
}
```

### What the Triggered Agent Receives

| Field | Value |
|-------|-------|
| `triggerType` | `"service"` |
| `triggerServiceName` | Name of the calling service |
| `triggerPayload` | Arbitrary JSON payload from the service |

### No Trigger Space

Like plans, service-triggered runs have **no trigger space**. The agent uses `enter_space` to route its output.

---

## Trigger Priority & Conflict Resolution

### No Queuing Conflicts

Multiple triggers can fire simultaneously for the same agent. Each trigger creates an independent run. The agent is informed of concurrent runs via run awareness (see [06-run-awareness.md](./06-run-awareness.md)).

### No Cascading Loops

Loop protection:
- **Self-mention blocked**: An agent cannot trigger itself.
- **Depth limit**: A chain of agent-to-agent mentions has a maximum depth (e.g., 10).
- **Pair tracking**: The gateway tracks which agent-pairs have already triggered each other in a chain, preventing A → B → A loops.

---

## Summary

| Trigger Source | Who Can Trigger | Requires Mention | Creates Trigger Space |
|----------------|-----------------|------------------|-----------------------|
| Space message | Any entity | Yes (except 2-entity spaces) | Yes |
| Plan | Self (scheduled) | N/A | No |
| Service | External system | N/A | No |
