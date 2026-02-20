# 05 — Context Model

## Overview

v2 replaces the traditional `user`/`assistant` role-based history with a **structured chronological event context**. The agent doesn't role-play a conversation — it reads a timeline of events and understands exactly who said what, when, and why.

---

## Why Not Role-Based History?

In v1 (and most LLM frameworks), conversation history looks like:

```
system: You are a helpful assistant.
user: [Husam] Hello!
assistant: Hi Husam! How can I help?
user: [Ahmad] Can you check the report?
assistant: Sure, checking now...
```

### Problems with This

1. **Multiple humans map to "user"** — The agent can't distinguish between Husam and Ahmad in multi-entity spaces without name-tag hacks.
2. **Multiple agents map to "assistant"** — In multi-agent spaces, all agent messages look like they came from "me".
3. **No trigger context** — The history doesn't explain *why* the agent is running right now.
4. **No temporal awareness** — Messages have no timestamps, no gaps, no sense of time passing.
5. **No cross-space awareness** — The agent can't see that a message was sent because of an event in another space.

---

## Why System Prompt History Works

### The Stateless Runs Model

Every run is a fresh AI invocation — an empty message array with no prior tool calls. All conversational context lives in the **system prompt** as a structured timeline:

```
SPACE HISTORY ("Project Alpha"):
  [SEEN] [msg:a1b2] [14:50] Husam (human): "Let's finalize the Q4 report"
  [SEEN] [msg:c3d4] [14:51] Designer (agent): "I've updated the charts."
  [NEW]  [msg:e5f6] [14:55] Ahmad (human): "Can you add revenue breakdown?"
  [NEW]  [msg:g7h8] [15:06] Husam (human): "Pull the Q4 revenue numbers"  ← TRIGGER
```

The agent reads this, understands the full conversation, and acts — no dangling tool calls, no API constraint violations.

### Why This Is Better Than Role-Based History for Multi-Run Conversations

All LLM APIs enforce a strict pairing rule: `assistant → tool_call → tool_result → assistant`. A tool call with no result is invalid input. By putting all prior context in the system prompt instead of the message array, every run starts clean — no tool-call pairing issues across runs.

This means multi-turn conversations (agent asks question → human answers → agent continues) work naturally across separate runs. Each run is a fresh invocation that reads the full timeline.

### Human Analogy

| Human | Agent (v2) |
|-------|------------|
| Sends a message, goes do other things | Sends a message, run ends |
| Comes back when notified of a reply | New run triggered by the reply |
| Re-reads the conversation and responds | Reads space timeline with `[SEEN]`/`[NEW]` markers |
| Remembers what they were working on | Reads memories and goals from previous runs |

### Context Growth

Long conversations grow the space history in the system prompt. Mitigations:
- **Window budget**: Load only the last N messages per space (default: 50).
- **Summarization**: Collapse older exchanges into a summary for very active spaces.
- **Memories**: Agent stores key facts in memories — survives even if messages scroll out of the window.

---

## v2 Context Structure

The agent receives a **structured system prompt** with distinct sections:

### 1. Identity Block

```
IDENTITY:
  name: "DataAnalyst"
  entityId: "entity-abc-123"
  currentTime: "2026-02-18T15:07:00Z"
```

### 2. Trigger Block

Tells the agent exactly why it's running:

**Space message trigger (from human):**
```
TRIGGER:
  type: space_message
  space: "Project Alpha" (id: space-xyz)
  sender: Husam (human, id: ent-husam-01)
  message: "Pull the Q4 revenue numbers"
  messageId: msg-g7h8
  timestamp: "2026-02-18T15:06:55Z"
```

**Space message trigger (from another agent):**
```
TRIGGER:
  type: space_message
  space: "Project Alpha" (id: space-xyz)
  sender: Designer (agent, id: ent-designer-02)
  message: "Here's the mockup. Can someone review the feasibility?"
  messageId: msg-k9l0
  timestamp: "2026-02-18T15:10:30Z"
```

- Every other agent member in the space (sender excluded) receives this trigger. Each independently decides whether to respond.

**Plan trigger:**
```
TRIGGER:
  type: plan
  plan: "Daily Report" (id: plan-abc)
  instruction: "Generate and post the daily metrics summary"
  scheduledAt: "2026-02-18T09:00:00Z"
```

**Service trigger:**
```
TRIGGER:
  type: service
  service: "jira-webhook"
  payload: { "issue": "PROJ-123", "action": "status_changed", "newStatus": "done" }
```

### 3. Active Space Block

For **space_message triggers**, the trigger space is **automatically set as the active space** at run start:
```
ACTIVE SPACE: "Project Alpha" (id: space-xyz)  [auto-set from trigger]
```

For **plan/service triggers**, no space is active initially:
```
ACTIVE SPACE: none (call enter_space to enter a space first)
```

### 4. Space History Block

Instead of role-based messages, the agent sees a **chronological event timeline**:

```
SPACE HISTORY ("Project Alpha"):
  [msg:a1b2] [2026-02-18T14:50:00Z] Husam (human, id:ent-husam-01): "Let's finalize the Q4 report"  [SEEN]
  [msg:c3d4] [2026-02-18T14:51:23Z] Designer (agent, id:ent-designer-02): "I've updated the charts. See attached."  [SEEN]
  [msg:e5f6] [2026-02-18T14:55:10Z] Ahmad (human, id:ent-ahmad-03): "Looks good. Can you add the revenue breakdown?"  [NEW]
  [msg:g7h8] [2026-02-18T15:06:55Z] Husam (human, id:ent-husam-01): "Pull the Q4 revenue numbers"  [NEW] ← TRIGGER
```

`[SEEN]` messages were processed by the agent in a previous run. `[NEW]` messages arrived since the agent last ran in this space. The gateway tracks `lastProcessedMessageId` per agent per space membership to compute this.

Key differences from v1:
- Every message has a **message ID** (`msg:...`) — for reference in conversation.
- Every message has a **timestamp**.
- Every sender has a **named display name**, **type** (human/agent), and **entity ID** — agents use entity IDs for precise targeting.
- The trigger message is marked.
- Agent's own previous messages are labeled with its name, not "assistant".
- Other agents' messages are labeled with their names and IDs, not forced into "user" or "assistant".

### 5. Spaces Block

```
YOUR SPACES:
  - "Project Alpha" (id: space-xyz) [ACTIVE] — Husam (human), Ahmad (human), Designer (agent), You
  - "Daily Reports" (id: space-abc) — You, Sarah (human)
  - "1:1 with Husam" (id: space-def) — Husam (human), You
```

### 6. Agent Context Block

```
GOALS:
  - Complete Q4 revenue analysis (priority: 2)
  - Maintain daily report pipeline (long-term, priority: 1)

MEMORIES:
  - [Q4] Revenue source breakdown uses the new categorization from October
  - [reports] Sarah prefers charts over tables

PLANS:
  - "Daily Report" (recurring, cron: 0 9 * * *, next: 2026-02-19T09:00:00Z, in 17h 53m)
  - "Follow up with Designer" (one-time, scheduledAt: 2026-02-18T17:07:00Z, in 2h 00m)  [created via runAfter: "2 hours"]

ACTIVE RUNS:
  - Run abc-123 (this run) — triggered by Husam in "Project Alpha"
  - Run def-456 — running in "Daily Reports" (processing Sarah's request)
```

### 7. Instructions Block

```
INSTRUCTIONS:
  - Your text output is internal reasoning — never shown to anyone. Keep it brief.
  - Use send_message to communicate. The trigger space is already active — call enter_space only if you need to switch to a different space.
  - Use read_messages to load conversation history from any space you belong to.
  - If you have nothing to contribute, end this run without sending a message.
  - Runs are stateless — each message triggers a fresh run. Use memories/goals to track multi-step workflows.
```

---

## How History Is Built

### For Space Message Triggers

1. **Auto-set active space** to the trigger space (no `enter_space` call needed).
2. Load the last N messages from the trigger space (default: 50).
3. Format each message as a timeline entry with message ID, timestamp, sender name, sender type, entity ID, and content.
4. Mark each entry as `[SEEN]` (processed in a previous run) or `[NEW]` (arrived since last run), using `lastProcessedMessageId` from the agent's space membership.
5. Mark the trigger message with `← TRIGGER`.
6. Include origin annotations on cross-space messages.
7. After the run completes, update `lastProcessedMessageId` to the latest message seen.

### For Human Users (Chat UI)

The `[SEEN]` / `[NEW]` mechanism is not agent-only — it applies to **humans too**. The chat UI uses the same pattern for unread indicators:

1. The gateway tracks `lastSeenMessageId` per entity per space (stored in `SmartSpaceMembership`).
2. When the human opens a space, the frontend sends a read receipt: `POST /api/spaces/:spaceId/read { lastMessageId }`.
3. Messages after `lastSeenMessageId` are marked as unread in the UI (badge count on space list, "new" divider in the chat).
4. When the user scrolls to the latest message, the frontend updates `lastSeenMessageId`.

This is the same model as WhatsApp/Slack — because spaces behave like messaging channels for both humans and agents.

| Entity Type | Tracking Field | Updated By | Used For |
|-------------|---------------|------------|----------|
| Agent | `lastProcessedMessageId` | Gateway (after run completes) | `[SEEN]`/`[NEW]` in system prompt |
| Human | `lastSeenMessageId` | Frontend (read receipt API) | Unread badge, "new messages" divider |

### For Plan/Service Triggers

1. No space history is loaded initially (no trigger space).
2. The agent must call `enter_space` to set active space and load history.

---

## Cross-Space Message Annotations

When the agent encounters its own previous messages that were sent cross-space, they carry context:

```
[2026-02-18T14:30:00Z] You: [sent because Husam asked "Send report to dev team" in "Project Alpha"]
  "Hey team, here's the Q4 report summary..."
```

This prevents confusion about why the agent said something in a space where it wasn't directly asked.

---

## Model Message Conversion

The structured context is converted to LLM-compatible messages at the last moment:

```typescript
// System message: identity + trigger + instructions + context blocks
[{ role: "system", content: structuredSystemPrompt }]

// History messages: timeline entries converted to alternating user/assistant
// Own messages → role: "assistant"
// All other messages → role: "user" with [SenderName (type)] prefix
```

The conversion preserves the chronological order and sender attribution while satisfying the LLM's expected format.

---

## Key Benefits

| Benefit | How |
|---------|-----|
| **Multi-entity clarity** | Every message has a named sender — no ambiguity |
| **Temporal awareness** | Timestamps show gaps, urgency, recency |
| **Trigger understanding** | Agent always knows WHY it's running |
| **Cross-space traceability** | Origin annotations explain cross-space actions |
| **Run continuity** | Memories and goals bridge context across runs |
| **Self-awareness** | Agent sees its own concurrent runs and goals |
