# 04 — Messaging & Waiting

## Overview

Agents have one messaging tool: `send_message`. It posts a message to the active space and supports `wait: true` to pause the sender's run until replies arrive. If an optional `messageId` is provided, the message acts as a **reply** — resuming any waiting run that was waiting on that message.

---

## The `send_message` Tool

### Signature

```json
{
  "name": "send_message",
  "description": "Post a message to the active space. If messageId is provided, acts as a reply and resumes waiting runs. Supports wait to pause until replies arrive.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "text": {
        "type": "string",
        "description": "Message text."
      },
      "messageId": {
        "type": "string",
        "description": "Optional. If provided, this message is a reply to the specified message. The gateway will resume any waiting_reply run that was waiting on this messageId."
      },
      "wait": {
        "type": "boolean",
        "description": "If true, pause this run until replies arrive in the active space. Default: false."
      }
    },
    "required": ["text"]
  }
}
```

### Behavior

1. Message is posted to the active space (with streaming).
2. **The message triggers all other agent members in the space** (sender excluded). Chain depth is inherited from the current run and incremented (see [01-trigger-system.md](./01-trigger-system.md) for loop protection).
3. If `messageId` is provided: the gateway checks for `waiting_reply` runs whose `waitState.messageId` matches. If found, the reply is recorded and the waiting run is resumed (see Wait Resolution below).
4. If `wait: true`: this run pauses until replies arrive in the space (see Waiting Logic below).
5. If `wait: false`: this run continues immediately after posting.

### As a New Message (no `messageId`)

```json
{ "text": "Here's the analysis you requested.", "wait": false }
```

Posts to the active space. Triggers all other agent members (sender excluded). No waiting runs affected.

### As a Reply (`messageId` provided)

```json
{ "text": "Here are the summaries you asked for.", "messageId": "msg-xyz" }
```

Posts to the active space AND resumes any `waiting_reply` run that was waiting on `msg-xyz`. The agent finds the `messageId` in the space history (every message in the timeline has an ID).

---

## Waiting Logic

`send_message` supports `wait: true`, which pauses the sender's run until replies arrive.

### Who Does the Sender Wait For?

Since there are no mentions, **`wait: true` always waits for any entity in the space to reply.** The first reply from any entity resolves the wait.

### Rules

1. **Any reply resolves**: The first message posted to the same space by any other entity after the sender's message resolves the wait.
2. **Timeout**: Configurable (default: 5 minutes). Run resumes with timeout indicator.

### What "Reply" Means

A reply is any message posted to the **same space** by **any other entity** after the sender's message. The gateway watches the space message stream.

---

## Wait Resolution

When a reply arrives (or timeout occurs), the waiting run resumes.

### Incoming Reply Processing

When a new message arrives in a space, the gateway:

1. Checks for `waiting_reply` runs in that space.
2. For each waiting run, checks if the message sender is different from the waiting agent.
3. If match: records the reply and resumes the run.

### Explicit Resume via `messageId`

Separately, when an agent calls `send_message` with a `messageId`, the gateway:

1. Finds `waiting_reply` runs whose `waitState.messageId` matches.
2. Records the reply and resumes the waiting run.

This is how agents explicitly reply to each other's waiting messages. Both mechanisms (automatic reply detection and explicit `messageId` resume) can coexist.

### Tool Result on Success

```json
{
  "reply": {
    "entityId": "entity-sarah-id",
    "entityName": "Sarah",
    "entityType": "human",
    "text": "Looks good! Ship it.",
    "timestamp": "2026-02-18T12:34:56Z"
  },
  "waitDuration": 12400,
  "status": "resolved"
}
```

### Tool Result on Timeout

```json
{
  "reply": null,
  "waitDuration": 300000,
  "status": "timeout"
}
```

---

## Implementation: How Waiting Works

### Run State

When `wait: true` is called:

1. Message posted to active space (streaming).
2. Current run transitions to `waiting_reply` status.
3. Run metadata stores wait state:
   ```json
   {
     "waitState": {
       "spaceId": "space-abc",
       "messageId": "msg-xyz",
       "toolCallId": "call-123",
       "startedAt": "2026-02-18T12:34:00Z",
       "timeout": 300000,
       "reply": null
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

### Pattern 1: Agent waits for human approval

```
Agent Run:
  1. send_message("Deploy v2.1? Reply yes/no.", wait: true)
     [trigger space auto-set as active]
     → Run pauses, waits for any reply

Sarah: "yes"
  → Gateway detects reply in the space → resumes run

Agent Run (resumed):
  2. Receives reply: { text: "yes", entityName: "Sarah" }
  3. Proceeds with deployment
```

### Pattern 2: Agent asks a question, waits, continues

```
Agent Run:
  1. send_message("What's your budget for the project?", wait: true)
     → Run pauses

Husam: "$50,000"
  → Reply detected → run resumes

Agent Run (resumed):
  2. Receives reply: { text: "$50,000" }
  3. Calls searchVendors({ maxBudget: 50000 })
  4. send_message("Found 3 vendors within budget: ...")
```

### Pattern 3: Agent replies to another agent's waiting message

```
Agent A Run:
  1. send_message("I've prepared the data. Analysts, please review.", wait: true)
     → Run pauses, messageId = "msg-abc"

[Agent B is triggered by Husam's next message in the space]

Agent B Run:
  1. Reads space history, sees Agent A's message (msg-abc) and that Agent A is waiting
  2. send_message("Data looks correct. Approved.", messageId: "msg-abc")
     → Gateway resumes Agent A's run

Agent A Run (resumed):
  3. Receives reply: { text: "Data looks correct. Approved." }
  4. Continues processing
```

---

## Multiple Sequential Waits

An agent can wait multiple times in a single run:

```
1. send_message("What city do you want to visit?", wait: true)
   → waits → human replies "Tokyo" → resumes

2. send_message("Budget per night for hotels?", wait: true)
   → waits → human replies "$150" → resumes

3. Calls searchHotels({ city: "Tokyo", maxPrice: 150 })
4. send_message("Found 3 great options: ...")
```

Each wait is a pause-resume cycle. The run stays alive across all waits.

---

## Wait Limits

- **Max wait duration**: Configurable per-agent or globally (default: 5 minutes).
- **Max sequential waits per run**: Configurable (default: 10). Prevents infinite wait loops.
- **Max concurrent `waiting_reply` runs per agent**: Configurable (default: 5).

---

## Removed Concepts

| v1 | v2 |
|----|----|
| `sendSpaceMessage(spaceId, text, mention)` | `send_message(text)` — space from active context, no mentions |
| `send_reply` (separate tool) | Merged into `send_message` — provide `messageId` to make it a reply |
| `mention` parameter (entity ID) | Removed. All agents triggered automatically. No mention parsing. |
| No wait mechanism | `wait: true` pauses run until any reply arrives |
