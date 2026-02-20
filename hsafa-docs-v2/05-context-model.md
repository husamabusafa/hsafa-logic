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

## Why System Prompt History Enables Multi-Run Waiting

### The LLM Tool-Call Pairing Constraint

All LLM APIs (including the Vercel AI SDK) enforce a strict pairing rule in message history:

```
assistant → tool_call → tool_result → assistant → ...
```

A tool call with no result is **invalid input**. You cannot insert a new `user` message after an unresolved tool call. This makes cross-run waiting impossible with role-based history — if an agent calls `send_message(wait: true)` and the run pauses, there is no way to later inject "the reply arrived" without completing the original tool call in the message array first.

### How System Prompt History Solves It

When a `waiting_reply` run resumes, the gateway starts a **fresh AI invocation** — an empty message array with no prior tool calls. All prior context lives in the system prompt as a structured timeline:

```
SPACE HISTORY ("Project Alpha"):
  [10:00] You: called send_message("@Designer please review the mockup", wait: true)
  [10:03] Designer: "@DataAnalyst looks good, ship it"
  ← RESUME: Designer replied. Continue from here.
```

The AI reads this, understands what happened, and continues — no dangling tool calls, no API constraint violation.

### Within a Single Run

Within one continuous AI invocation (before any pause), tool calls still need results in the normal SDK format. This is fine because all synchronous tools (`enter_space`, `read_messages`, `get_my_runs`) execute immediately — the AI receives the result before its next turn. There is no pause within a single invocation.

The only "pause" happens at the **run boundary** — and that is exactly where system prompt history takes over.

### Human Analogy

| Human | Agent (v2) |
|-------|-----------|
| Sends a message, goes to lunch | Calls `send_message(wait: true)`, run pauses (`waiting_reply`) |
| Comes back, reads the reply | Run resumes, system prompt shows the reply in the timeline |
| Continues the conversation naturally | AI reads context and continues — no re-setup needed |
| Can check what colleagues are doing | `get_my_runs` shows all active/paused runs with status |

### Context Growth

Each resume cycle appends new exchanges to the space history in the system prompt. For agents with many sequential waits in one run, this grows. Mitigations:
- **Window budget**: Load only the last N messages per space (default: 50).
- **Summarization**: Collapse older exchanges into a summary for very long runs.
- **New run**: Start a fresh run for a new independent task rather than chaining indefinitely in one run.

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
  senderExpectsReply: true
  chainDepth: 0
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
  senderExpectsReply: false
  chainDepth: 1
```

- `senderExpectsReply` is `true` when the sender used `wait: true`, and `false` otherwise.
- `chainDepth` indicates how deep in a trigger chain this run is. Human messages start at 0; each agent-to-agent hop increments by 1. At `MAX_CHAIN_DEPTH` (default 5), messages stop triggering new runs.
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
- Every message has a **message ID** (`msg:...`) — used by `send_message(messageId)` to reply and resume waiting runs.
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
  - Run def-456 — waiting_reply in "Daily Reports" (waiting for Sarah)
```

### 7. Instructions Block

```
INSTRUCTIONS:
  - Your text output is internal reasoning — never shown to anyone. Keep it brief.
  - Use send_message to communicate. The trigger space is already active — call enter_space only if you need to switch to a different space.
  - Use read_messages to load conversation history from any space you belong to.
  - If you have nothing to contribute, end this run without sending a message.
  - Set wait=true on send_message to pause until a reply arrives.
  - Provide messageId on send_message to reply to a specific message and resume any waiting run.
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
2. The agent must call `enter_space` + `read_messages` to load any space's history.

### For Resumed Runs (After Wait)

1. Load the same history as the original trigger.
2. Append new messages that arrived during the wait period.
3. Mark the reply messages that resolved the wait.

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
| **Run continuity** | Resumed runs see what happened during the wait |
| **Self-awareness** | Agent sees its own concurrent runs and goals |
