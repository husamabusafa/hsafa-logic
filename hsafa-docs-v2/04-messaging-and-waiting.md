# 04 — Messaging & Waiting

## Overview

Agents have two messaging tools: `send_message` and `send_reply`. Both post a message to the active space and parse `@mentions`. The key difference is **what happens to a mentioned agent's waiting run**:

- `send_message` — always **starts a new run** for every @mentioned agent, no exceptions.
- `send_reply` — **resumes** the waiting run of an @mentioned agent if one exists; starts a new run otherwise.

Both support `wait: true` to pause the sender's run until replies arrive.

---

## The `send_message` Tool

### Signature

```json
{
  "name": "send_message",
  "description": "Post a message to the active space. Always triggers a new run for every @mentioned agent.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "text": {
        "type": "string",
        "description": "Message text. Can include @mentions to trigger other agents."
      },
      "wait": {
        "type": "boolean",
        "description": "If true, pause this run until replies arrive from mentioned entities. Default: false."
      }
    },
    "required": ["text"]
  }
}
```

### Behavior

- Message is posted to the active space.
- Every `@AgentName` in the text triggers a **brand new run** for that agent.
- If the mentioned agent already has a `waiting_reply` run, that waiting run is **not affected** — a new run is created on top of it. The agent then has two concurrent runs.
- If `wait: true`: this run pauses until replies arrive from mentioned entities.
- If `wait: false`: this run continues immediately after posting.

### When to Use

Use `send_message` when you are **initiating** a new task or conversation — you want the other agent to start fresh with this message as the trigger.

```json
{ "text": "@Designer please design a new logo for the Q3 campaign.", "wait": false }
```

---

## The `send_reply` Tool

### Signature

```json
{
  "name": "send_reply",
  "description": "Post a reply to the active space. Resumes a waiting run for @mentioned agents if one exists. Falls back to triggering a new run otherwise.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "text": {
        "type": "string",
        "description": "Reply text. Can include @mentions."
      },
      "replyToMessageId": {
        "type": "string",
        "description": "The message ID this reply is responding to. Always required — find it in the space history. Used by the gateway to resume the correct waiting run."
      },
      "wait": {
        "type": "boolean",
        "description": "If true, pause this run until replies arrive from mentioned entities. Default: false."
      }
    },
    "required": ["text", "replyToMessageId"]
  }
}
```

### Behavior — Per Mentioned Agent

For each `@AgentName` in the reply text, the gateway checks:

| Situation | What Happens |
|-----------|-------------|
| Agent has a `waiting_reply` run whose `waitState.messageId` matches `replyToMessageId` | **Resume** that exact run. No new run created. |
| Agent has a `waiting_reply` run but `replyToMessageId` doesn't match | **Start a new run** (this reply isn't addressing that wait). |
| Agent has **no** `waiting_reply` run | **Start a new run** (same as `send_message`). |

### Mixed Mentions Example

```
Agent A is waiting for Agent B to reply.
Agent C sends: send_reply("@AgentB here's my review. Also @AgentD could you help?")
```

- `@AgentB` → Agent B has a `waiting_reply` run waiting for Agent C → **resume** Agent B's run.
- `@AgentD` → Agent D has no waiting run → **start a new run** for Agent D.

Both happen simultaneously. The message is posted once.

### No Mentions

```json
{ "text": "Done, everything looks good!", "wait": false }
```

Without mentions, `send_reply` behaves identically to `send_message` — the message is posted and no agents are triggered. Any waiting run that was waiting for "any human reply" in this space will be resolved by this message (see reply detection below).

### When to Use

Use `send_reply` when you are **responding to something** — you expect the other agent to be waiting for your answer and you want to resume their work rather than spawn a parallel run.

```json
{ "text": "@Researcher here are the summaries you asked for: ..." }
```

---

## Waiting Logic

Both `send_message` and `send_reply` support `wait: true`, which pauses the sender's run until replies arrive.

### Who Does the Sender Wait For?

| Message text | Wait for |
|-------------|----------|
| `@Designer review this` | Designer's reply |
| `@Designer and @Developer check this` | **Both** agents' replies (AND semantics) |
| `Hey team, thoughts?` (no mention) | **Any entity** reply in the space |
| `@Designer and thoughts?` | Designer's reply **and** any other entity reply |

### Rules

1. **Mentioned agents**: Wait for each mentioned entity to post at least one reply.
2. **No mentions**: Wait for any entity in the space to reply.
3. **Multiple mentions**: Wait for **all** (AND semantics).
4. **Timeout**: Configurable (default: 5 minutes). Run resumes with timeout indicator.

### What "Reply" Means

A reply is any message posted to the **same space** by a **waited-for entity** after the sender's message. The gateway watches the space message stream for matching senders.

---

## Wait Resolution

When all waited-for replies arrive (or timeout occurs), the waiting run resumes.

### Incoming Reply Processing

When a new message arrives in a space, the gateway:

1. Checks for `waiting_reply` runs in that space.
2. For each waiting run, checks if the sender matches any `waitingFor` entity.
3. If match: records the reply, marks that entity as responded.
4. If all `waitingFor` entities have responded: resumes the run.

> **Note:** If the incoming message was sent via `send_reply` and triggers a resume, the gateway skips starting a new run for the waited-for agent (the resume is the response). If the message also mentions other agents, those get new runs as normal.

### Tool Result on Success

```json
{
  "replies": [
    {
      "entityId": "entity-designer-id",
      "entityName": "Designer",
      "entityType": "agent",
      "text": "Looks good! I'd suggest making the header bolder.",
      "timestamp": "2026-02-18T12:34:56Z"
    }
  ],
  "waitDuration": 12400,
  "status": "resolved"
}
```

### Tool Result on Timeout

```json
{
  "replies": [],
  "waitDuration": 300000,
  "status": "timeout",
  "waitingFor": [
    { "entityId": "entity-designer-id", "entityName": "Designer", "responded": false }
  ]
}
```

### Tool Result on Partial Resolution

```json
{
  "replies": [
    { "entityId": "entity-designer-id", "entityName": "Designer", "text": "Approved!", "timestamp": "..." }
  ],
  "waitDuration": 300000,
  "status": "partial_timeout",
  "waitingFor": [
    { "entityId": "entity-designer-id", "entityName": "Designer", "responded": true },
    { "entityId": "entity-developer-id", "entityName": "Developer", "responded": false }
  ]
}
```

---

## Implementation: How Waiting Works

### Run State

When `wait: true` is called (on either tool):

1. Message posted to active space (streaming).
2. Mentioned agents triggered or resumed (depending on tool used).
3. Current run transitions to `waiting_reply` status.
4. Run metadata stores wait state:
   ```json
   {
     "waitState": {
       "spaceId": "space-abc",
       "messageId": "msg-xyz",
       "toolCallId": "call-123",
       "waitingFor": [
         { "entityId": "entity-designer-id", "entityName": "Designer", "type": "agent", "responded": false }
       ],
       "startedAt": "2026-02-18T12:34:00Z",
       "timeout": 300000,
       "replies": []
     }
   }
   ```

### Implementation Options for Reply Detection

**Option A: Redis Pub/Sub** — Subscribe to the space's message channel, filter for matching senders. Clean and real-time.

**Option B: Polling** — Periodically check for new messages after the wait message. Simpler but less responsive.

**Option C: Database trigger** — Use Postgres LISTEN/NOTIFY when a message is inserted for the waited space.

Recommended: **Option A** for production, **Option B** as fallback.

---

## Conversation Patterns

### Pattern 1: Agent A starts a task, Agent B replies with send_reply

```
Run 1 (Agent A):
  1. send_message("@AgentB what's the deployment status?", wait: true)
     [trigger space auto-set as active — no enter_space needed]
     → New run started for Agent B
     → Run 1 pauses

Run 2 (Agent B):
  1. [active space = project-space, auto-set]
  2. send_reply("@AgentA deployment is at 85%, ETA 10 min")
     → Agent A has a waiting_reply run waiting for Agent B → RESUME Run 1
     → No new run created for Agent A
  → Run 2 completes

Run 1 (Agent A resumes):
  3. Receives reply: "deployment is at 85%, ETA 10 min"
  4. send_message("Thanks! I'll check back in 10.")
```

### Pattern 2: Agent A sends, Agent B replies with send_message (no resume)

```
Run 1 (Agent A):
  1. send_message("@AgentB what's the status?", wait: true)
     → Run 1 pauses

Run 2 (Agent B):
  1. send_message("@AgentA status is good")
     → send_message always triggers a NEW run for Agent A
     → Run 1 is still waiting (not resolved by a new run trigger)
     → Run 3 is created for Agent A with "status is good" as trigger

  → The new Run 3 for Agent A may respond to Run 1's wait state
    if the gateway detects Agent B's message in the waited space
```

> In practice, humans and agents should use `send_reply` when responding to a waiting agent. `send_message` is for initiating, `send_reply` is for responding.

### Pattern 3: Human waits for agent approval (agent+human space)

```
Agent Run:
  1. send_message("Deploy v2.1? Reply yes/no.", wait: true)
     [already in "approvals" space — trigger space auto-set as active]
     → Run pauses, no @mention → waits for any entity reply

Sarah: "yes"
  → send_reply not required here — any message in the space resolves a no-mention wait

Agent Run (resumed):
  3. Receives reply: "yes"
  4. Proceeds with deployment
```

---

## Multiple Sequential Waits

An agent can wait multiple times in a single run:

```
1. send_message("@Designer create mockup", wait: true)
   → waits → Designer replies via send_reply → gets mockup

2. send_message("@Developer implement this: [mockup]", wait: true)
   → waits → Developer replies via send_reply → gets status

3. send_message("Both tasks done!")
```

Each wait is a pause-resume cycle. The run stays alive across all waits.

---

## Wait + No Mention (Any-Entity Wait)

```json
{ "text": "What would you like me to do next?", "wait": true }
```

Waits for **any entity** in the space to post a message. The first reply resolves the wait, regardless of who sent it.

---

## Wait Limits

- **Max wait duration**: Configurable per-agent or globally (default: 5 minutes).
- **Max sequential waits per run**: Configurable (default: 10). Prevents infinite wait loops.
- **Max concurrent `waiting_reply` runs per agent**: Configurable (default: 5).

---

## Removed Concepts

| v1 | v2 |
|----|----|
| `sendSpaceMessage(spaceId, text, mention)` | `send_message(text, wait)` + `send_reply(text, wait)` — space from active context, mentions parsed from text |
| No wait mechanism | `wait: true` on either tool pauses run until replies arrive |
| `mention` parameter (entity ID) | `@AgentName` in message text (resolved by gateway) |
| Separate `triggerMentionedAgent` function | Unified into `send_message` / `send_reply` processing |
| Single message tool | Two tools: `send_message` (always new run) and `send_reply` (resume if waiting) |
