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

| Type | How Agent Specifies It | Stored As |
|------|----------------------|-----------|
| **Relative** | `"runAfter": "5 hours"` | `scheduledAt = now + 5h` |
| **Specific date** | `"scheduledAt": "2026-02-20T10:00:00Z"` | `scheduledAt` stored as-is |
| **Recurring** | `"cron": "0 9 * * 1"` | `nextRunAt` recomputed each fire |

### runAfter — Human-Friendly Scheduling

Agents don't need to know cron syntax. They can express timing naturally:

```json
{
  "name": "Follow up with Designer",
  "instruction": "Check if Designer has replied to the mockup review request",
  "runAfter": "2 hours"
}
```

The gateway computes `scheduledAt = now + duration` and saves it as a one-time plan. The agent just says "run this after 2 hours" — the gateway handles the scheduling.

**Accepted formats for `runAfter`:**
- `"30 minutes"`, `"2 hours"`, `"1 day"`, `"3 days"`, `"1 week"`

For a specific point in time, the agent can use `scheduledAt` directly:

```json
{
  "name": "Pre-launch checklist",
  "instruction": "Run the pre-launch checks before the product goes live",
  "scheduledAt": "2026-03-01T08:00:00Z"
}
```

For truly recurring needs (e.g. daily reports), `cron` is still available — but the agent can always set a recurring follow-up by creating a new plan from within a triggered run.

### What the Triggered Agent Receives

| Field | Value |
|-------|-------|
| `triggerType` | `"plan"` |
| `triggerPlanId` | Plan ID |
| `triggerPlanName` | Plan name |
| `triggerPlanInstruction` | What to do (from plan config) |

### Plan Lifecycle

1. Agent creates a plan using `set_plans` with either `runAfter` or `cron`.
2. Gateway computes `scheduledAt` (for `runAfter`) or `nextRunAt` (for `cron`) at save time.
3. Gateway scheduler checks on a tick interval and fires when the time arrives.
4. For recurring plans, `nextRunAt` is recomputed from the cron expression after each fire.
5. Agent can inspect, update, or delete its own plans via `get_plans` / `delete_plans`.

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

## 5. Proactive Router Trigger

A gateway-level AI router that reads space messages and decides whether to trigger agents that were **not explicitly @mentioned**. Agents can enter an ongoing conversation when genuinely needed — without any human explicitly calling for them.

### When It Activates

The router only runs if **all** of the following are true:

1. The space has `proactiveRouterEnabled: true` (per-space opt-in).
2. The space has **more than 2 members** (2-entity spaces use auto-trigger instead).
3. The space has **at least one agent member** (human-only spaces never use this).

### Configuration

The router is universal — one configuration applies to all enabled spaces. It is set via environment variables:

```env
PROACTIVE_ROUTER_MODEL=gpt-4o-mini
PROACTIVE_ROUTER_CONTEXT_MESSAGES=5
```

Per-space opt-in is a field on the space record (see [09-data-model.md](./09-data-model.md)):

```json
{ "proactiveRouterEnabled": true }
```

### Gateway Pre-Filters (Before Calling the Router)

Before spending any AI tokens, the gateway filters out ineligible agents. If no eligible agents remain, the router is **never called**:

| Filter | Reason |
|--------|--------|
| Agent was already triggered by an `@mention` in this message | Normal trigger handles it — no double-trigger |
| Agent already has an active `running` run in this space | Already working on something here |
| Agent already has a `waiting_reply` run in this space | Will resume naturally when a reply arrives |
| Agent is the sender of the message | No self-triggering |

### What the Router Receives

The router gets rich context — not just the latest message:

```json
{
  "recentMessages": [
    { "messageId": "msg:a1", "sender": "Ahmad (human)", "text": "the dashboard is really slow lately", "timestamp": "..." },
    { "messageId": "msg:a2", "sender": "Husam (human)", "text": "yeah especially the reports page, could be the joins we added", "timestamp": "..." },
    { "messageId": "msg:a3", "sender": "Ahmad (human)", "text": "nobody knows how to fix it", "timestamp": "..." }
  ],
  "spaceMembers": [
    { "name": "Ahmad", "type": "human" },
    { "name": "Husam", "type": "human" },
    { "name": "DB Expert", "type": "agent", "description": "Database performance, SQL optimization, query analysis" }
  ],
  "alreadyTriggeredAgents": [],
  "eligibleAgents": [
    { "entityId": "entity-db-expert", "name": "DB Expert", "description": "Database performance, SQL optimization, query analysis" }
  ]
}
```

`alreadyTriggeredAgents` lists agents already fired by the normal `@mention` system in this message, so the router doesn't re-trigger them.

### The High Bar

The router's system prompt enforces a strict standard:

> **Your default answer is: trigger nobody.** Only trigger an agent if you are highly confident their input is genuinely needed and not triggering them would be a clear miss. When in doubt, output an empty trigger list.

**Trigger if:**
- A user refers to an agent by name or role without using `@` (e.g., "maybe the AI assistant should check this")
- The conversation reaches a decision point where an agent has specific knowledge that no human in the space has, and the humans are clearly stuck

**Do NOT trigger if:**
- A topic is briefly mentioned but humans are actively handling it
- The message is casual conversation
- The connection to the agent's domain is vague or indirect

### Router Output

```json
{ "trigger": [
    { "agentId": "entity-db-expert", "reason": "Users stuck on DB performance issue, no one has DB expertise" }
]}
```

or when nothing is needed:

```json
{ "trigger": [] }
```

### What the Triggered Agent Receives

The agent's trigger block includes `triggerSource: "proactive_router"` so it knows it was not explicitly called:

```
TRIGGER:
  type: space_message
  triggerSource: proactive_router
  space: "Team Chat" (id: space-xyz)
  sender: Ahmad (human, id: ent-ahmad-01)
  message: "nobody knows how to fix it"
  messageId: msg-a3
  timestamp: "2026-02-18T15:06:55Z"
  senderExpectsReply: false
```

The agent's instructions in this case:

```
You were triggered by the proactive router, not by an explicit mention.
Only send a message if you have something genuinely valuable to contribute.
If you are unsure or your input is not clearly needed, end this run without sending anything.
```

The agent is the final gatekeeper — it reads the conversation and decides whether to speak up or silently exit.

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
| Proactive router | Gateway AI | No (agent decides to respond) | Yes (same space) |
| Plan | Self (scheduled) | N/A | No |
| Service | External system | N/A | No |
