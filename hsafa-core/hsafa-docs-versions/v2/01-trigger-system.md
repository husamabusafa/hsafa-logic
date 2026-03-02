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

### Run Coordination (`absorb_run`)

When an agent has multiple active runs, the runs can **coordinate mid-flight**. A run can absorb another run — canceling it and inheriting its full context. This lets the agent behave like **one entity thinking**, not multiple disconnected processes.

**How it works:**

1. A new run starts and sees its ACTIVE RUNS block listing other running runs.
2. The agent (LLM) reasons: "Is another run doing the same or related task?"
3. If yes → call `absorb_run(runId)`. The target run is immediately canceled (LLM generation aborted). The tool returns the target's full snapshot: trigger context + actions taken so far.
4. The absorbing run now has **both intents** and acts on everything in one coherent action.

**Prompt guidance:** The system prompt instructs agents: *"If you see active runs with related purposes in the same space, the run with the LATEST trigger should absorb the older ones."*

**Example — Correction mid-flight:**

```
[00:00] Husam: "Tell Muhammad the meeting is at 3pm"    → Run A starts
[00:05] Husam: "Tell him don't forget the documents"    → Run B starts

Run B context:
  ACTIVE RUNS:
    - Run A (running) — Husam: "Tell Muhammad the meeting is at 3pm"
    - Run B (this run) — Husam: "Tell him don't forget the documents"

Run B reasoning: "Run A is about the same task — messaging Muhammad. I should absorb it."
Run B calls: absorb_run({ runId: "run-a-id" })

Returns: {
  trigger: "Husam: 'Tell Muhammad the meeting is at 3pm'",
  actionsTaken: []  // caught before Run A sent anything
}

Run B now sends ONE message to Muhammad:
  "Hey Muhammad, the meeting is at 3pm. Also, don't forget the documents."
```

**Example — Absorb after partial work:**

```
Run A already sent a message before Run B absorbs it:

absorb_run returns: {
  trigger: "Husam: 'Tell Muhammad the meeting is at 3pm'",
  actionsTaken: [
    { tool: "send_message", space: "Muhammad Space", text: "Meeting is at 3pm." }
  ]
}

Run B sees Run A already told Muhammad about the meeting.
Run B just adds: "Also, don't forget the documents."
```

**Example — Voting:**

```
[00:00.0] Ahmad: "Option A"    → VoteBot Run 1 starts
[00:00.3] Sarah: "Option B"    → VoteBot Run 2 starts
[00:01.1] Husam: "Option A"    → VoteBot Run 3 starts

Run 3 (latest trigger) sees Run 1 and Run 2 in ACTIVE RUNS.
Run 3 calls: absorb_run(Run1), absorb_run(Run2)
Run 3 context now has all 3 votes.
Run 3: "Vote results: Option A wins 2-1."
```

**Example — Steering a different-purpose run:**

```
[00:00] Husam: "Generate the Q4 report"          → Run A starts (complex)
[00:08] Husam: "The deadline is March 1 not Feb 28" → Run B starts (correction)

Run B absorbs Run A → gets Run A's purpose + any partial work.
Run B generates the full report WITH the correct deadline.
Both purposes fulfilled in one run.
```

**Rules:**
- **Same agent only** — you can only absorb your own runs
- **Active runs only** — can't absorb completed or canceled runs
- **First caller wins** — if two runs try to absorb each other simultaneously, optimistic locking ensures only the first succeeds; the second gets "run already canceled"
- **Abort immediately** — when absorbed, the target run's LLM generation is aborted mid-stream and any pending tool calls are canceled

**Why this prevents infinite agent-to-agent loops:**

Each new run sees the **full conversation history** in its context. When Agent A is re-triggered by Agent B's response, Agent A reads the entire exchange and naturally recognizes "this conversation has concluded — I have nothing to add." The system prompt reinforces: *"If you have nothing to contribute, end without sending a message."* Conversations settle within 2-3 exchanges through LLM judgment alone.

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
