# Multi-Agent Triggering — Admin Agent + Unified `sendSpaceMessage`

## Overview

When a human sends a message in a multi-agent space, the **admin agent** is always triggered first. The admin decides what to do: respond directly, delegate silently, mention another agent, or skip. Agent-to-agent collaboration uses a single unified tool — `sendSpaceMessage` — with optional `mention` (trigger an agent) and optional `wait` (block for a reply).

No round-robin. No reply stack. No mention chains. No `mentionAgent` tool.

---

## Triggering Rules

### Human Messages → Admin Agent

When a human sends a message, the **admin agent** (`adminAgentEntityId` on SmartSpace) is always triggered. The admin has three options:

1. **Respond directly** — `sendSpaceMessage(spaceId, text)` to reply
2. **Delegate silently** — `delegateToAgent(targetAgentEntityId)` to hand off. Admin's run is canceled and removed. Target agent gets a **new run** with the **original human message** as the trigger — as if the admin was never involved.
3. **Mention + coordinate** — `sendSpaceMessage` with `mention` (+ optional `wait`) to get another agent's input, then continue reasoning/responding
4. **Do nothing** — if the message doesn't need a response, the agent simply doesn't call `sendSpaceMessage`. The run completes silently.

### Agent Messages → Mentioned Agent Only

When an agent sends a message via `sendSpaceMessage`:

- **With `mention`** → the mentioned agent is triggered with a `space_message` trigger (`senderType: agent`)
- **Without `mention`** → **no agent is triggered**. The message is posted for humans to read.

### No Other Triggering

- Agent messages NEVER trigger the admin agent
- Agent messages NEVER trigger round-robin
- Only explicit `mention` triggers agents from agent messages
- Human messages ALWAYS go to admin — deterministic

---

## `sendSpaceMessage` — Unified Communication Tool

One tool for all agent communication. Sends a message to any space the agent is a member of. Optionally **mentions** another agent to trigger them, and optionally **waits** for a reply.

```json
sendSpaceMessage({
  spaceId: "space-X",
  text: "What's the Q4 budget status?",
  mention: "finance-agent-entity-id",
  wait: { for: [{ type: "agent" }], timeout: 60 }
})
```

### `mention` and `wait` Are Independent

| mention | wait | Behavior |
|---------|------|----------|
| No | No | Fire-and-forget. Message posted, no agent triggered, no blocking. |
| Yes | No | Trigger agent, don't wait. Agent responds on its own. |
| No | Yes | Post message, wait for a reply (e.g., wait for human). |
| Yes | Yes | Trigger agent AND wait for their reply (most common for cross-space asks). |

### Wait Conditions

The `wait.for` array specifies conditions — the tool blocks until **any one** matches (OR logic):

- `{ type: "any" }` — any message
- `{ type: "agent" }` — any agent reply
- `{ type: "human" }` — any human reply
- `{ type: "entity", entityId: "..." }` — a specific entity's reply

---

## `delegateToAgent` — Admin-Only Silent Handoff

When the admin decides it shouldn't handle a message, it calls `delegateToAgent` for an invisible handoff:

1. Admin's run is **canceled and removed**
2. A new run is created for the target agent with the **same trigger context** (original human message)
3. The target agent sees the human message directly — no trace of admin involvement

**When to use `delegateToAgent` vs `mention`:**

| | `delegateToAgent` | `sendSpaceMessage` with `mention` |
|-|-------------------|------------------------------------|
| **Who** | Admin only | Any agent |
| **Admin's run** | Canceled and removed | Continues running |
| **Target agent sees** | Original human message | Agent's new message as trigger |
| **Visible in space** | Nothing — silent handoff | Admin's message appears |
| **Use when** | Admin doesn't want to be involved | Admin wants to coordinate or wait for a reply |

---

## Example Conversations

### Simple: admin responds directly

```
Husam: "Good morning!"

→ Admin (Ops-Agent) triggered
→ Ops-Agent: sendSpaceMessage(opsSpace, "Good morning Husam! Here's today's status: ...")
→ Done. One run.
```

### Delegation: admin hands off to specialist

```
Husam: "What's our Q4 budget status?"

→ Admin (Ops-Agent) triggered
→ Ops-Agent reasons: "This is a finance question."
→ Ops-Agent calls delegateToAgent(financeAgentEntityId)
→ Admin's run canceled silently

→ Finance Agent triggered with original message: "What's our Q4 budget status?"
→ Finance Agent: sendSpaceMessage(opsSpace, "Q4 budget: $2.1M allocated, $1.7M spent...")
→ Done. Husam sees Finance Agent respond directly.
```

### Mention + wait: admin coordinates

```
Husam: "Prepare the quarterly business review"

→ Admin (Ops-Agent) triggered
→ Ops-Agent: sendSpaceMessage(opsSpace, "On it. Let me gather the data.",
    mention: financeAgentEntityId, wait: { for: [{ type: "agent" }] })
→ Finance Agent triggered, responds with Q4 numbers
→ Ops-Agent's wait resolves
→ Ops-Agent: sendSpaceMessage(opsSpace, "Now getting metrics.",
    mention: dataAgentEntityId, wait: { for: [{ type: "agent" }] })
→ Data Agent responds with metrics
→ Ops-Agent: sendSpaceMessage(opsSpace, "Here's the quarterly business review: ...")
→ Done. Three runs, clean sequential flow.
```

### Agent chain within a space

```
Manager: "Write a blog post about AI in healthcare"

→ Editor-Agent (admin) triggered
→ Editor-Agent: sendSpaceMessage(contentSpace, "Great topic! Writer, please draft this.",
    mention: writerAgentEntityId, wait: { for: [{ type: "entity", entityId: writerAgentEntityId }] })

→ Writer-Agent triggered, drafts the post
→ Writer-Agent: sendSpaceMessage(contentSpace, "Draft ready. SEO, can you review?",
    mention: seoAgentEntityId, wait: { for: [{ type: "agent" }] })

→ SEO-Agent responds with keyword suggestions
→ Writer-Agent's wait resolves, applies suggestions
→ Writer-Agent: sendSpaceMessage(contentSpace, "Here's the final draft: [blog post]")

→ Editor-Agent's wait resolves
→ Editor-Agent: sendSpaceMessage(contentSpace, "Post looks great. Publishing now.")
→ Done. Four general runs. Natural agent chain via mention + wait.
```

### Cross-space collaboration

```
Husam (Space X): "What's our Q4 budget status?"

→ AI Assistant (admin of Space X) triggered
→ AI Assistant: sendSpaceMessage(spaceY, "What's the current Q4 budget status?",
    mention: financeAgentEntityId, wait: { for: [{ type: "agent" }], timeout: 60 })
→ Finance Agent (Space Y) triggered, responds with budget data
→ AI Assistant's wait resolves
→ AI Assistant: sendSpaceMessage(spaceX, "Here's the Q4 budget: $2.1M allocated...")
→ Done. Two runs. Cross-space request-response in one agent execution.
```

---

## Loop Protection

- Agent can only read/send to spaces where it has membership (validated server-side)
- `wait` has a max timeout (120s)
- Circular dependency detection: if Agent A mentions Agent B with `wait`, and Agent B mentions Agent A with `wait`, Agent A's new run can call `getMyRuns` to detect the loop and break it
- Max tool loop steps (from agent config `loop.maxSteps`) limits total tool calls per run

---

## What This Replaces

| Old Concept | Replaced By |
|-------------|-------------|
| Round-robin picker | Admin agent always receives human messages |
| `mentionAgent` prebuilt tool | Built into `sendSpaceMessage` via `mention` field |
| `routeToAgent` / `delegate` prebuilt tool | `delegateToAgent` (admin-only, clearer semantics) |
| Reply stack | Blocking `wait` on `sendSpaceMessage` |
| Mention chain metadata | Not needed — explicit `mention` + `wait` handles sequencing |
| 4 agent options (respond/mention/delegate/skip) | 3 options: respond (with optional mention/wait), delegate, or skip |

> **See also:** [Single-Run Architecture](./single-run-architecture/) for the full design.
