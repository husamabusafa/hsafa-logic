# 04 — Messaging & Conversations

## Overview

Agents have one messaging tool: `send_message({ text })`. It posts a message to the active space. That's it — no waiting, no reply threading, no pausing.

**Conversational continuity comes from context, not from run state.** Every message triggers a fresh run. The agent reads the full space timeline (with `[SEEN]`/`[NEW]` markers), its memories and goals, and reasons about what to do. This is exactly how humans work in group chats — you come back, read what's new, and respond.

---

## The `send_message` Tool

### Signature

```json
{
  "name": "send_message",
  "description": "Post a message to the active space.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "text": {
        "type": "string",
        "description": "Message text."
      }
    },
    "required": ["text"]
  }
}
```

One tool. One parameter.

### Behavior

1. Message is posted to the active space (with streaming via tool-input-delta).
2. Message is persisted as a `SmartSpaceMessage` in the DB.
3. **The message triggers all other agent members in the space** (sender excluded).
4. The run continues immediately after posting — it can send more messages, call other tools, or end.

### Tool Result

```json
{
  "success": true,
  "messageId": "msg-abc-123",
  "status": "delivered"
}
```

---

## How Conversations Work (Stateless Runs)

There is no `wait`, no `resume`, no reply threading. Instead:

1. **Agent sends a message** → run ends (or continues with other work).
2. **Someone responds** → triggers a new run for all agents (including the original sender).
3. **New run reads context** → sees its own previous message + the new response → acts accordingly.

The space timeline IS the conversation state. The agent re-reads it fresh every run.

### Why This Works

The agent's context at the start of every run includes:

```
SPACE HISTORY ("Deployments"):
  [SEEN] [msg-001] [14:00] DeployBot (agent, you): "Deploy v2.1? Confirm yes or no."
  [NEW]  [msg-002] [14:05] Sarah (human): "yes"  ← TRIGGER
```

The agent sees:
- Its own previous question (`[SEEN]`)
- Sarah's answer (`[NEW]`, marked as trigger)
- The temporal relationship (question → answer)

The LLM naturally reasons: *"I asked for confirmation, Sarah said yes. I should proceed with deployment."*

No explicit "wait/resume" needed — the context makes the conversational link obvious.

---

## Conversation Patterns

### Pattern 1: Agent Asks, Human Answers

```
[Sarah: "Deploy v2.1 to production"]
  → Triggers DeployBot

DeployBot Run 1:
  Context: [NEW] Sarah: "Deploy v2.1 to production"
  1. send_message("I'll deploy v2.1. This affects 3 services. Confirm by replying yes.")
  Run ends.

[Sarah: "yes"]
  → Triggers DeployBot

DeployBot Run 2:
  Context:
    [SEEN] DeployBot: "...Confirm by replying yes."
    [NEW]  Sarah: "yes"  ← TRIGGER
  1. Reasons: "I asked for confirmation, Sarah said yes."
  2. deployService({ version: "2.1", target: "production" })
  3. send_message("Deployment complete! All 3 services running v2.1.")
  Run ends.
```

### Pattern 2: Multi-Turn Back-and-Forth

```
[Husam: "What's your budget for the project?"]
  → Triggers Agent

Agent Run 1:
  Context: [NEW] Husam asked about budget
  1. send_message("What's your budget for the project?")
  Run ends.

Wait — actually, Husam asked the agent. Let's fix:

[Husam: "Find me hotels in Tokyo"]
  → Triggers Agent

Agent Run 1:
  1. send_message("What's your budget per night?")
  Run ends.

[Husam: "$150"]
  → Triggers Agent

Agent Run 2:
  Context:
    [SEEN] Husam: "Find me hotels in Tokyo"
    [SEEN] Agent: "What's your budget per night?"
    [NEW]  Husam: "$150"
  1. searchHotels({ city: "Tokyo", maxPrice: 150 })
  2. send_message("Found 3 great options: ...")
  Run ends.
```

Each "turn" is a separate run. The agent reconstructs the full conversation from context.

### Pattern 3: Multi-Agent Discussion

```
Space "Architecture" — Husam, Architect (agent), SecurityBot (agent), DevOps (agent)

[Husam: "We need to redesign the auth system"]
  → Triggers: Architect, SecurityBot, DevOps

Architect Run:
  1. send_message("I'd suggest OAuth2 with JWT. Gives us SSO and token refresh.")
  Run ends.

SecurityBot Run:
  1. send_message("From security: use short-lived tokens (15 min) with refresh rotation.")
  Run ends.

DevOps Run:
  1. Reads context — waits to see the direction.
  Run ends (silent).

[Architect's message triggers SecurityBot + DevOps]

SecurityBot Run:
  Context: Architect proposed OAuth2 + JWT
  1. send_message("OAuth2 is good. Add PKCE for public clients, store refresh tokens server-side only.")
  Run ends.

DevOps Run:
  Context: Architect + Security discussion
  1. send_message("I can set up Keycloak — supports OAuth2 + PKCE out of the box. ETA: 2 days.")
  Run ends.

[SecurityBot's message triggers Architect + DevOps]

Architect Run:
  1. send_message("Great alignment. I'll draft the architecture doc.")
  Run ends.
```

Three agents had a natural multi-turn discussion. No waiting, no threading, no coordination tools. Each agent reads the full context and contributes when relevant.

### Pattern 4: Collecting Responses Over Time

```
[Request: "Team vote: Option A or B?"]

Agent Run 1:
  1. send_message("Team vote: should we go with Option A or B? Everyone please reply.")
  Run ends.

[Ahmad: "Option A"] → Triggers Agent

Agent Run 2:
  Context: Agent asked for votes. [NEW] Ahmad: "A"
  1. Counts votes in history: 1/3.
  2. Stays silent (not enough votes yet).
  Run ends.

[Sarah: "Option B"] → Triggers Agent

Agent Run 3:
  Context: Vote question + Ahmad: A + [NEW] Sarah: B
  1. Counts: 2/3.
  2. Stays silent.
  Run ends.

[Husam: "Option A"] → Triggers Agent

Agent Run 4:
  Context: Vote question + Ahmad: A + Sarah: B + [NEW] Husam: A
  1. Counts: 3/3. A wins 2-1.
  2. send_message("Vote results: Option A wins (2-1). Proceeding with A.")
  Run ends.
```

The agent counts votes by reading the space history. No `continue_waiting`, no race conditions.

### Pattern 5: Long-Running Workflow with Memory

For complex workflows that span many interactions, the agent uses **memories and goals** to bridge runs:

```
Agent Run 1 (triggered by: "Generate the Q4 report"):
  1. Pulls revenue data, user metrics
  2. send_message("Started the Q4 report. I need budget numbers from Finance — can someone share?")
  3. set_memories([
       { key: "q4_report", value: "waiting for budget from Finance. Data so far: revenue $2.1M, users 45K" }
     ])
  4. set_goals([{ id: "q4", description: "Complete Q4 report", status: "active" }])
  Run ends.

[Later — Finance: "Budget is $500K"]
  → Triggers Agent

Agent Run 2:
  Context:
    [SEEN] Agent: "Started Q4 report. Need budget numbers..."
    [NEW]  Finance: "Budget is $500K"
  Memories: q4_report = "waiting for budget... Data: revenue $2.1M, users 45K"
  Goals: "Complete Q4 report" (active)

  1. Reasons: "I was waiting for budget numbers, they arrived. I have all the data now."
  2. Generates full report using stored data + new budget
  3. send_message("Q4 Report: Revenue $2.1M, Users 45K, Budget $500K. [full analysis]")
  4. set_goals([{ id: "q4", status: "completed" }])
  5. set_memories — clears q4_report key
  Run ends.
```

**Memories are more robust than in-run state** — if the server crashes during a waiting run, all in-run state is lost. Memories survive in the DB.

---

## Why No Waiting?

### The Problems with Waiting (Removed)

The previous design had `wait: true`, `continue_waiting`, `resume_run`, and `messageId` reply threading. This created:

1. **Race conditions** — reply arrives while run is `running` (between resume and `continue_waiting`)
2. **Threading burden** — humans must explicitly thread replies (they won't)
3. **Extra runs** — `resume_run` needed a whole run just to route a message to a sibling
4. **Complex state** — `waitState`, `lastResumedAt`, `waitCycle`, `toolCallId`, catch-up checks
5. **Edge cases** — multiple replies, gap handling, timeout management

### Why Context Works Better

| Waiting Model | Stateless Model |
|---------------|-----------------|
| Run pauses, holds state | Run ends, state goes to memories/goals |
| Reply must be threaded with `messageId` | Human just sends a normal message |
| Race condition if reply arrives during processing | No race — each message is a fresh run |
| `continue_waiting` for multiple replies | Agent just counts messages in history |
| `resume_run` for unthreaded replies | Problem doesn't exist — every message triggers a fresh run |
| 7 interrelated mechanisms | 0 — context replaces all of them |

### The Human Analogy

Humans don't "pause" in WhatsApp:
1. Send a message
2. Go do other things
3. Come back when there's a notification
4. Read the new messages
5. Respond based on full context

The agent does exactly this — every message triggers a fresh run that reads the full timeline.

---

## Interactive UI Tools (Still Pause)

**Important:** Interactive `space` tools (forms, approval buttons, file pickers) still pause the run with `waiting_tool` status. This is different from chat-level conversation:

- **`waiting_tool`** = waiting for structured UI input from a rendered component. The run must pause because the tool call needs a specific result.
- **Chat messages** = handled by context across runs. No pausing needed.

```
Agent Run:
  1. Calls getApproval({ message: "Deploy to prod?", options: ["Approve", "Reject"] })
     → Tool UI rendered in space
     → Run pauses (waiting_tool)

  [User clicks "Approve"]
     → Run resumes with tool result: { choice: "Approve" }

  2. Proceeds with deployment.
  Run ends.
```

This is the only case where a run pauses — and it's waiting for a UI interaction, not a chat message.

---

## Removed Concepts

| Previous | Now |
|----------|-----|
| `send_message(text, messageId, wait)` | `send_message(text)` — one parameter |
| `wait: true` (pause run) | Removed. Runs don't pause for messages. |
| `messageId` (reply threading) | Removed. No threading needed — context links messages. |
| `continue_waiting` tool | Removed. Agent reads message history instead. |
| `resume_run` tool | Removed. Every message triggers a fresh run. |
| `waiting_reply` run status | Removed. Only `waiting_tool` remains for UI interactions. |
| `waitState` metadata | Removed entirely. |
| `senderExpectsReply` | Removed. The agent reads the question in context. |
| Race conditions, catch-up checks | Don't exist in the stateless model. |
