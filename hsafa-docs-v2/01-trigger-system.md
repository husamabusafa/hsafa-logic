# 01 — Trigger System

## Overview

An AI agent in Hsafa v2 can only be triggered by exactly **three sources**. There are no other entry points.

---

## 1. Space Message (All-Agent Trigger)

This is the primary trigger mechanism.

### Core Rule

> Any message from **any entity** (human or agent) in a space triggers **all other agent members** of that space. The sender is excluded — an agent's own message does not re-trigger itself.

### Rules

- **No mentions.** There is no `@AgentName` parsing. Every agent in the space runs.
- **No admin agent.** No agent has priority over another.
- **No router.** No hidden AI decides which agents should run.
- **The sender is always excluded.** An entity's message triggers every agent *except* itself.
- Each triggered agent independently decides whether to respond (send a message) or stay silent (end the run without sending anything).
- The trigger context includes `senderExpectsReply` (derived from whether the sender used `wait: true`). Agents use this to decide whether a reply is expected or the message is informational only.

### What the Triggered Agent Receives

Every triggered agent's run context includes:

| Field | Value |
|-------|-------|
| `triggerType` | `"space_message"` |
| `triggerSpaceId` | Space where the message was posted |
| `triggerMessageContent` | Full message text |
| `triggerMessageId` | Message ID (for use with `send_message(messageId)` to reply) |
| `triggerSenderEntityId` | Entity that sent the message |
| `triggerSenderName` | Display name of the sender |
| `triggerSenderType` | `"human"` or `"agent"` |
| `senderExpectsReply` | `true` if the sender used `wait: true`, `false` otherwise |
| `chainDepth` | How deep in a trigger chain this run is (see Loop Protection) |

### Multi-Agent Spaces

A single message in a space with 3 agents creates **3 independent runs** (or 2, if the sender is one of the agents). Each agent reads the same space history, reasons independently, and decides whether to respond.

```
Space "Project Alpha" — Husam (human), Designer (agent), Developer (agent), Analyst (agent)

Husam: "Let's finalize the Q4 report"

→ 3 runs created (all agents):
  - Designer run: reads context, decides if design input is needed
  - Developer run: reads context, decides if dev input is needed
  - Analyst run: reads context, this is about data — responds with analysis

Analyst: "Here's the Q4 breakdown: ..."

→ 2 runs created (Designer + Developer — Analyst excluded as sender):
  - Designer run: reads context, stays silent (data analysis, not design)
  - Developer run: reads context, stays silent (not a dev task)
```

Agents that have nothing to contribute simply end their run without calling `send_message`. No `skipResponse` tool needed — silence is the default.

### Loop Protection (Chain Depth)

Since agent messages trigger other agents, cascading loops are possible (A sends → triggers B → B sends → triggers A → ...). The gateway prevents this with **chain depth tracking**:

1. Human messages start at `chainDepth = 0`.
2. When an agent sends a message during a run with `chainDepth = N`, the resulting triggers have `chainDepth = N + 1`.
3. If `chainDepth >= MAX_CHAIN_DEPTH` (default: 5), **no agents are triggered** by that message. The message is still posted to the space — it just doesn't create new runs.

This limits the maximum cascade to 5 levels deep. In practice, most conversations resolve in 1-2 levels (human → agent → agent response). The agent is informed of `chainDepth` in its trigger context so it can reason about whether to continue the chain or stay silent.

```
Husam: "Summarize the report"                          chainDepth = 0
  → triggers Analyst

Analyst: "Here's the summary. Designer, thoughts?"     chainDepth = 1
  → triggers Designer, Developer

Designer: "The charts look good."                      chainDepth = 2
  → triggers Analyst, Developer

... continues until chainDepth = MAX_CHAIN_DEPTH, then messages stop triggering.
```

---

## 2. Predefined Plan (Self-Scheduled)

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

## 3. External Service Trigger

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

Loop protection via chain depth (see above). When `chainDepth >= MAX_CHAIN_DEPTH`, messages are still posted but no runs are created. This is simple and predictable — no pair tracking or chain metadata needed.

---

## Summary

| Trigger Source | Who Can Trigger | Triggers | Creates Trigger Space |
|----------------|-----------------|----------|-----------------------|
| Space message | Any entity (human or agent) | All other agent members (sender excluded) | Yes |
| Plan | Self (scheduled) | Single agent | No |
| Service | External system | Single agent | No |
