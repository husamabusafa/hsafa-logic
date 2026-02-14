# Core Concept: General-Purpose Runs

## The Old Model (Current)

A run is bound to a space. When the agent generates text, it's automatically persisted as a message in that space. The run "belongs to" the space.

Problem: this creates a fundamental asymmetry. Responding to "your" space is automatic, but talking to another space requires a different mechanism (`goToSpace` child run). Plan runs are a third special case with no space context at all. Three models for the same thing.

## The New Model

**A run is just an agent execution.** It has:
- An agent (who is running)
- A trigger context (what caused this run)
- Tools (how the agent interacts with the world)

That's it. The run does NOT belong to a space. The agent's LLM text output is **internal** — it's the agent's reasoning/planning, logged but not posted to any space. All externally visible communication happens through `sendSpaceMessage`.

---

## Entities: Only Humans and AI Agents

Entities are **participants** in the system. There are exactly two types:

- **Human Entity** — a real person (employee, customer, friend)
- **Agent Entity** — an AI agent

That's it. External services (Jira, Slack, IoT devices, payment gateways, cron jobs, Node.js backends) are **NOT entities**. They are **services** — they interact with agents via API but are not participants in spaces.

### Why Services Are Not Entities

In the old model, services were "System Entities" — members of spaces that sent messages. This created unnecessary complexity:
- Services cluttered space membership lists
- Services needed entity management (create, update, delete)
- Services appeared as "participants" in conversations, which is conceptually wrong
- The same service (e.g., Jira) needed separate entity instances for each space

In the new model, services are **external callers**. They interact with the system through two API operations:

1. **Trigger an agent** — `POST /api/agents/{agentId}/trigger` with a payload. Creates a general run for that agent. The service does not need to be in any space.
2. **Submit a tool result** — `POST /api/runs/{runId}/tool-results`. When an agent calls a client tool that a service handles (e.g., `runSqlQuery`), the service subscribes to the run and submits the result.

Services are stateless from Hsafa's perspective. They don't have profiles, memberships, or identities. They're just API callers.

---

## Three Trigger Types

Every run has a trigger context that tells the agent why it was created. There are exactly three trigger types:

### 1. `space_message` — A message in a space

A human (or another agent) posted a message in a space, and this agent was triggered to respond.

```json
{
  "trigger": {
    "type": "space_message",
    "spaceId": "space-123",
    "spaceName": "Husam's Chat",
    "messageContent": "What's our Q4 budget status?",
    "senderEntityId": "entity-husam",
    "senderName": "Husam",
    "senderType": "human"
  }
}
```

When triggered by an agent's message (via mention):
```json
{
  "trigger": {
    "type": "space_message",
    "spaceId": "space-456",
    "spaceName": "Engineering Ops",
    "messageContent": "Hey Finance, can you pull the Q4 numbers?",
    "senderEntityId": "entity-ops-agent",
    "senderName": "Ops Agent",
    "senderType": "agent",
    "mentionReason": "Need Q4 financial data for the weekly report"
  }
}
```

### 2. `plan` — A scheduled plan

The agent's own plan triggered it (cron-style).

```json
{
  "trigger": {
    "type": "plan",
    "planId": "plan-xyz",
    "planName": "Morning Report",
    "scheduledAt": "2025-02-13T06:00:00Z"
  }
}
```

### 3. `service` — An external service

An external service (Node.js backend, webhook, cron service, IoT device) triggered the agent directly via API.

```json
{
  "trigger": {
    "type": "service",
    "serviceName": "Jira",
    "payload": {
      "event": "ticket_created",
      "ticketId": "PROJ-123",
      "priority": "critical",
      "summary": "Login page broken after deploy #287"
    }
  }
}
```

The service trigger is **not tied to any space**. The agent receives the payload and decides which spaces to interact with (if any). For example, a Jira webhook triggers the Ops Agent, which then posts an alert to the `#engineering` space using `sendSpaceMessage`.

### The System Prompt

The trigger context is injected into the system prompt:

```
TRIGGER: This run was triggered by a message from Husam in "Husam's Chat":
"What's our Q4 budget status?"

Use sendSpaceMessage to respond when ready.
```

```
TRIGGER: This run was triggered by your scheduled plan "Morning Report".
Use sendSpaceMessage to post updates to the relevant spaces.
```

```
TRIGGER: This run was triggered by service "Jira":
{ "event": "ticket_created", "ticketId": "PROJ-123", "priority": "critical", ... }

Use sendSpaceMessage to post updates or alerts to the relevant spaces.
```

---

## Why This Is Better

| Aspect | Space-Bound Run | General Run |
|--------|----------------|-------------|
| Responding to trigger space | Automatic (text → message in space) | Explicit: `sendSpaceMessage(triggerSpaceId, text)` |
| Talking to another space | Different mechanism (goToSpace) | Same: `sendSpaceMessage(otherSpaceId, text)` |
| Plan runs | Special case (no space) | Same: general run, uses tools |
| Service-triggered runs | System entity sends message in space | Direct API trigger — no space needed |
| Agent's mental model | "I'm in Space X, I can reach out to Space Y" | "I can talk to any space. Here's why I was triggered." |
| Entity model | Humans + Agents + System Entities | Humans + Agents only. Services are external API callers. |

**One model for everything.** The agent is like a person who gets a notification ("Husam asked you something in Chat" or "Jira reported a critical ticket"), does their work, and sends messages to whichever spaces need them.

---

## What the User Sees (Event Relay)

The run is general, but the user in the trigger space still needs to see the agent working. The gateway **relays run events** to the trigger space's SSE channel, building a **composite message** — one message per run per space with parts accumulating in order:

- `reasoning-delta` → shown as collapsible thinking (if `showAgentReasoning` is on)
- `tool-input-delta` for `sendSpaceMessage` → text part streams into composite message
- `tool-input-available` for client/UI tools → UI part renders inline in composite message
- Tool calls with `minimal`/`full` visibility → tool card part appears in composite message
- Hidden tools (`readSpaceMessages`, `getMyRuns`, etc.) → not relayed, invisible

The agent's internal text (LLM text output) is NOT relayed — it's internal reasoning. The actual response comes via `sendSpaceMessage`, which streams the `text` argument in real-time via tool-input-delta interception. See [Composite Messages & Tool Visibility](./05-space-ui.md) for full details.

```
User sees in Space X (one composite message):
  Husam: What's the Q4 budget?
  AI Assistant:
    Here's the Q4 budget: $2.1M allocated... (text part, REAL LLM streaming)
```

For **service-triggered** and **plan-triggered** runs, there is no trigger space — so no event relay unless the agent explicitly sends messages to spaces. The run executes silently and communicates via `sendSpaceMessage` when ready.
