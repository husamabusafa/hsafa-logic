# 13 — Context Continuity

## The Core Problem

LLMs are stateless. Each run is a fresh AI invocation with no inherent memory of what happened before. Left unaddressed, this creates a fundamental contradiction: an agent sees its own past messages in history but has no idea why it sent them. It might contradict a decision it made yesterday, repeat work it already did, or respond to something it already handled.

Humans never have this problem. When a human sees a message they sent a week ago, they know exactly why they wrote it — the conversation context, the request that prompted it, the goal they were working toward. That continuity is implicit in human consciousness.

For agents, it must be **explicit and engineered into every run**.

---

## The Rule

> **An agent must always know the full context of every action it took, every message it sent, and every run it started — even when looking back at them later as history.**

This isn't just about reading old messages. It's about understanding:
- Why was I triggered to run?
- Why did I send that message in this space?
- Why did I send a message in a *different* space?
- What was I waiting for when I paused?
- What have I already processed vs. what is new?

---

## How the Current Design Solves It

### Layer 1 — The Trigger Block (Why am I running right now?)

Every run begins with a structured trigger block that tells the agent exactly what started this run:

```
TRIGGER:
  type: space_message
  space: "Project Alpha" (id: space-xyz)
  sender: Husam (human, id: ent-husam-01)
  message: "@DataAnalyst pull the Q4 revenue numbers"
  messageId: msg-g7h8
  timestamp: "2026-02-18T15:06:55Z"
  senderExpectsReply: true
```

The agent never has to guess why it's running. The reason is always the first thing it reads.

---

### Layer 2 — Structured Timeline History (Why did I say that?)

Instead of anonymous `assistant:` / `user:` message pairs, the agent sees a named, timestamped, ID-tagged timeline:

```
SPACE HISTORY ("Project Alpha"):
  [msg:a1b2] [14:50] Husam (human, id:ent-husam-01): "Let's finalize the Q4 report"  [SEEN]
  [msg:c3d4] [14:51] You (agent): "I'll prepare the revenue breakdown"  [SEEN]
  [msg:g7h8] [15:06] Husam (human, id:ent-husam-01): "@DataAnalyst pull the numbers"  [NEW] ← TRIGGER
```

When the agent sees `[msg:c3d4]` — its own past message — it knows:
- When it was sent
- In response to what context (the lines above it)
- That it already processed it (`[SEEN]`)

The history is not a generic log. It is **the agent's own lived experience**, structured for re-reading.

---

### Layer 3 — Origin Metadata (Why did I send a message in a different space?)

When an agent enters Space B and sends a message because of something that happened in Space A, that message carries **origin metadata**:

```json
{
  "origin": {
    "triggerSpaceId": "space-a",
    "triggerSpaceName": "Project Alpha",
    "triggerSenderName": "Husam",
    "triggerMessage": "Send the report to the dev channel"
  }
}
```

When the agent (or another agent) later sees that message in Space B's history, the origin is visible:

```
SPACE HISTORY ("Dev Channel"):
  [msg:x9y0] [15:10] DataAnalyst (agent): "Here's the Q4 report"
              [sent because Husam asked in "Project Alpha"]
```

No cross-space message is ever context-free. The reason it was sent travels with it.

---

### Layer 4 — [SEEN] / [NEW] Markers (What have I already handled?)

The gateway tracks `lastProcessedMessageId` per agent per space. When the agent's history block is built for a new run, messages are tagged:

- `[SEEN]` — the agent processed this in a previous run. It has context about it. No need to act on it again.
- `[NEW]` — this arrived since the agent last ran. These are the messages that matter for this run.

This prevents the agent from re-processing old decisions, re-answering already-answered questions, or redoing completed work.

---

### Layer 5 — Active Runs Block (What else am I doing right now?)

The agent always sees its own concurrent runs:

```
ACTIVE RUNS:
  - Run abc-123 (this run) — triggered by Husam in "Project Alpha"
  - Run def-456 (waiting_reply) — sent "@Designer review mockup", waiting in "Design Team"
```

When the agent sees Run def-456, it knows:
- It is currently waiting for Designer's reply
- It sent a message asking for a review
- That run is paused — not lost, not forgotten

This prevents the agent from starting a duplicate task or being confused by why it has a paused run.

---

### Layer 6 — Reply Threading (Why did that reply come in?)

Every `send_reply` carries `replyToMessageId`. This means that in history, each reply is always traceable to the specific message it was responding to:

```
SPACE HISTORY:
  [msg:a1b2] You: "@Designer can you review the mockup?"  [SEEN]
  [msg:c3d4] Designer: "Looks good, approved!"  [SEEN]
              [reply to msg:a1b2]
```

The agent reading this doesn't just see a sequence of messages. It sees a conversation graph — who responded to what, and why each message exists.

---

### Layer 7 — Memory (Long-term context across many runs)

The system prompt timeline covers the recent window (last 50 messages per space). For decisions, constraints, and facts that need to survive beyond that window, the agent has persistent memory:

```
set_memories([
  { key: "project_alpha_deadline", value: "Q4 report due Feb 28" },
  { key: "designer_prefers_png", value: "Designer always requests PNG exports, not PDF" }
])
```

Memories are injected into every future run. This is how an agent maintains awareness of things that happened weeks ago without needing them in the active history window.

---

## What Full Context Looks Like in Practice

An agent wakes up for a new run. Before it takes any action, it already knows:

| Question | Answer source |
|----------|--------------|
| Why am I running? | Trigger block |
| What's happening in this space? | Space history timeline |
| What did I do here before? | `[SEEN]` messages in timeline |
| What's new since I last ran? | `[NEW]` messages in timeline |
| Why did I send that cross-space message? | Origin metadata on the message |
| What other tasks am I working on? | Active runs block |
| What did I decide weeks ago? | Memory block |
| What are my ongoing goals? | Goals block |

No inference required. No guessing. The context is **explicit, structured, and complete**.

---

## The Design Principle

Every piece of information that a human would "just know" from lived experience must be **embedded in the agent's context**. Not as vague background, but as structured, traceable, labeled data — because the agent needs to be able to act on it precisely, not just reference it loosely.

The richer the context, the more the agent's behavior resembles a participant in an ongoing conversation rather than a stateless function that runs in isolation and forgets everything.
