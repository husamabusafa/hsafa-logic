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

### What the Triggered Agent Receives

Every triggered agent's run context includes:

| Field | Value |
|-------|-------|
| `triggerType` | `"space_message"` |
| `triggerSpaceId` | Space where the message was posted |
| `triggerMessageContent` | Full message text |
| `triggerMessageId` | Message ID (used for deduplication) |
| `triggerSenderEntityId` | Entity that sent the message |
| `triggerSenderName` | Display name of the sender |
| `triggerSenderType` | `"human"` or `"agent"` |

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

### Trigger Debounce (Run Coordination)

When multiple messages arrive rapidly in a space, the gateway **batches** them into a single run per agent instead of spawning one run per message. This mirrors how humans behave — you don't reply after every single message in a group chat. You wait a beat, read everything new, then respond.

**How it works:**

1. A message arrives that would trigger Agent A in Space S.
2. If Agent A has **no pending timer** for Space S → start a debounce timer (default: 2 seconds).
3. If Agent A **already has a timer** running for Space S → reset the timer (wait another 2 seconds from now).
4. When the timer fires → create **one run**. The trigger message is the **latest** message. All messages from the debounce window appear as `[NEW]` in the space history.
5. If Agent A **already has an active run** in Space S → queue the trigger (run after current completes).

**Example — 3 votes arrive within 1 second:**

```
[00:00.0] Ahmad: "Option A"    → starts 2s timer for VoteBot
[00:00.3] Sarah: "Option B"    → resets timer
[00:01.1] Husam: "Option A"    → resets timer
[00:03.1] Timer fires → ONE run starts

VoteBot Run:
  TRIGGER: Husam in "Team Vote": "Option A"
  Context:
    [SEEN] VoteBot: "Team vote: Option A or B?"
    [NEW]  Ahmad: "Option A"
    [NEW]  Sarah: "Option B"
    [NEW]  Husam: "Option A"  ← TRIGGER

  → Counts: 3/3 votes. A wins 2-1.
  → send_message("Vote results: Option A wins 2-1.")
  Run ends.
```

One run. One response. All messages processed together.

**Example — Multi-agent discussion batching:**

```
Space: Husam + Architect + SecurityBot + DevOps

Architect: "Suggest OAuth2 with JWT"       [00:05.0]
SecurityBot: "Use short-lived tokens"      [00:06.2]

→ Both messages trigger DevOps. Debounce merges into ONE run.

DevOps Run:
  Context:
    [SEEN] Husam: "Redesign auth"
    [NEW]  Architect: "OAuth2 + JWT"
    [NEW]  SecurityBot: "Short-lived tokens"
  → Sees BOTH suggestions, responds once: "I can set up Keycloak."
```

**Configuration:**

```typescript
const TRIGGER_DEBOUNCE_MS = 2000;  // default: 2 seconds
// Can be per-space for flexibility:
// 1:1 spaces → 500ms (fast response)
// Multi-agent spaces → 3000ms (let messages accumulate)
```

**Why this prevents infinite agent-to-agent loops:**

Even if agents respond to each other, there's a natural 2-second cooldown between exchanges. Each round, the agent reads MORE context (the full conversation) and naturally recognizes when the discussion has concluded. Combined with the system prompt instruction *"If you have nothing to contribute, end without sending a message"*, conversations settle within 2-3 exchanges.

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

---

## Summary

| Trigger Source | Who Can Trigger | Triggers | Creates Trigger Space |
|----------------|-----------------|----------|-----------------------|
| Space message | Any entity (human or agent) | All other agent members (sender excluded) | Yes |
| Plan | Self (scheduled) | Single agent | No |
| Service | External system | Single agent | No |
