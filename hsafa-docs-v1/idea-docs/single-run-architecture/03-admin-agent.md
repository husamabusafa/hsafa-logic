# Admin Agent — A Regular Agent That Receives Human Messages First

## No Special Agent Type

The admin agent is **not** a special agent class. It is a regular agent — same system prompt structure, same tools, same capabilities as any other agent (HR Agent, Finance Agent, etc.).

The **only** difference: human messages in the space go to the admin agent first.

That's it. No special "admin prompt". No silent routing logic. The admin agent is just the first responder for human messages. The only admin-exclusive tool is `delegateToAgent` — a silent handoff that cancels the admin's run and re-triggers the target agent with the original human message.

---

## Triggering Rules

These are the complete rules for which agent gets triggered when a message is posted in a space:

### Human Messages → Admin Agent

When a human sends a message, the **admin agent** is always triggered. The admin reads the message, reasons about it, and decides what to do:

1. **Respond directly** — use `sendSpaceMessage` to reply
2. **Delegate** — call `delegateToAgent(targetAgentEntityId)` to silently hand off. Admin's run is canceled and removed. The target agent gets a **new run** with the **original human message** as the trigger — as if the admin was never involved.
3. **Mention + wait** — use `sendSpaceMessage` with `mention` + `wait` to get another agent's input, then continue reasoning/responding
4. **Do nothing** — if the message doesn't need a response, simply don't call `sendSpaceMessage`. The run completes silently.

### Agent Messages → Mentioned Agent Only

When an agent sends a message (via `sendSpaceMessage`):

- **With `mention`** → the mentioned agent is triggered with a `space_message` trigger (senderType: agent)
- **Without `mention`** → **no agent is triggered**. The message is posted to the space for humans to read. This is how agents send informational messages, status updates, or final responses.

### No Other Triggering

- Agent messages NEVER trigger the admin agent
- Agent messages NEVER trigger round-robin
- Only explicit mentions trigger agents from agent messages
- Human messages ALWAYS go to admin — no randomness

---

## `adminAgentEntityId` on SmartSpace

```prisma
model SmartSpace {
  // ... existing fields
  adminAgentEntityId String? @map("admin_agent_entity_id")
  adminAgent         Entity? @relation("AdminAgent", fields: [adminAgentEntityId], references: [id])
}
```

When a space has `adminAgentEntityId` set, all human messages trigger that specific agent. If not set, falls back to single-agent behavior (trigger the only agent).

---

## System Prompt — Nearly Identical for All Agents

Every agent gets the same prompt structure. The only small difference: the admin agent in a multi-agent space gets a brief explanation of `delegateToAgent`.

### Admin Agent (multi-agent space)

```
You are [Agent Name].
[Agent's system instruction from config — their role, personality, expertise]

SPACE: "[Space Name]"
MEMBERS:
- Husam (human)
- Finance Agent (agent, entity: xxx) — handles budgets, expenses
- Data Agent (agent, entity: yyy) — handles data queries, reporting
- You (admin, entity: zzz)

TRIGGER: This run was triggered by a message from Husam in "Engineering Ops":
"What's our Q4 budget status?"

You are the admin agent for this space — human messages come to you first. You can:
- Respond directly using sendSpaceMessage
- Delegate to another agent using delegateToAgent(entityId) — your run will be silently canceled and the target agent will receive the original human message as their trigger
- Mention another agent using sendSpaceMessage with mention — your message will appear in the space and the mentioned agent will be triggered
- If no response is needed, simply do nothing — your run will complete silently

Use sendSpaceMessage to respond when ready.
```

### Non-Admin Agent (multi-agent space)

```
You are [Agent Name].
[Agent's system instruction from config — their role, personality, expertise]

SPACE: "[Space Name]"
MEMBERS:
- Husam (human)
- Ops Agent (admin, agent, entity: xxx) — operations coordinator
- Data Agent (agent, entity: yyy) — handles data queries, reporting
- You (entity: zzz)

TRIGGER: This run was triggered by a message from Ops Agent (agent) in "Engineering Ops":
"Finance, can you pull the Q4 numbers?"
Mention reason: "Need Q4 financial data for the weekly report"

Use sendSpaceMessage to respond when ready. You can mention other agents to trigger them.
```

Non-admin agents do NOT have the `delegateToAgent` tool.

### Single-Agent Space

```
You are [Agent Name].
[Agent's system instruction from config — their role, personality, expertise]

SPACE: "[Space Name]"
MEMBERS:
- Husam (human)
- You (entity: zzz)

TRIGGER: This run was triggered by a message from Husam in "Personal Assistant":
"What's our Q4 budget status?"

Use sendSpaceMessage to respond when ready.
```

Single-agent spaces have no `delegateToAgent` tool (no other agents to delegate to). The agent is always triggered directly by human messages.

### The Difference is Minimal

The admin agent's config might say: *"You are an operations coordinator. Route technical questions to specialists when appropriate."* — but that's just the agent's system instruction, not a system-level distinction.

A non-admin agent might say: *"You are a finance specialist. Answer budget and expense questions."* — same structure.

The only system-level difference is: admin gets `delegateToAgent` in their toolset and the brief instruction about delegation in the prompt. Everything else is identical.

---

## How the Admin Handles Different Situations

### Admin can handle it directly
```
Husam: "Good morning!"

Admin Agent (Ops Coordinator) reasons: "Simple greeting, I can handle this."
→ sendSpaceMessage(opsSpace, "Good morning Husam! Here's today's quick status: ...")
```

### Admin delegates to a specialist
```
Husam: "What's our Q4 budget status?"

Admin Agent reasons: "This is a finance question. Finance Agent should handle this directly."
→ delegateToAgent(financeAgentEntityId)
```

Admin's run is silently canceled and removed. Gateway creates a NEW run for Finance Agent with the original trigger:
```
Trigger: { type: "space_message", spaceId: opsSpace, messageContent: "What's our Q4 budget status?", senderName: "Husam", senderType: "human" }
```
Finance Agent sees Husam's message directly — no admin involvement visible. The human experience is seamless.

### Admin passes and waits (needs the answer to continue)
```
Husam: "Prepare the quarterly business review"

Admin Agent reasons: "I need data from Finance and Data agents to compile this."
→ sendSpaceMessage(opsSpace, "On it. Let me gather the data.",
     mention: financeAgentEntityId, wait: { for: [{ type: "agent" }] })
→ [Finance Agent responds with Q4 numbers]
→ sendSpaceMessage(opsSpace, "Now getting the metrics.",
     mention: dataAgentEntityId, wait: { for: [{ type: "agent" }] })
→ [Data Agent responds with metrics]
→ sendSpaceMessage(opsSpace, "Here's the quarterly business review: ...")
```

### Admin does nothing
```
Husam: "Thanks!"

Admin Agent reasons: "No action needed."
→ Run completes silently. No message sent.
```

---

## Spaces With Only One Agent

If a space has one agent, that agent IS the admin automatically. Human messages trigger it directly. No mention routing needed.

---

## What This Eliminates

| Old Concept | Replaced By |
|-------------|-------------|
| `routeToAgent` prebuilt tool | `delegateToAgent` (same idea, clearer name) |
| `mentionAgent` prebuilt tool | Built into `sendSpaceMessage` via `mention` field |
| Special admin prompt | Same prompt structure as all agents |
| Reply stack | Blocking `wait` on `sendSpaceMessage` |
| Mention chain metadata | Not needed — explicit `mention` + `wait` handles sequencing |
| Round-robin picker | Admin agent always receives human messages |
| 4 agent options (respond/mention/delegate/skip) | 3 options: respond (with optional mention/wait), delegate, or do nothing |

## `delegateToAgent` vs `mention`

| | `delegateToAgent` | `sendSpaceMessage` with `mention` |
|-|-------------------|------------------------------------|
| **Who** | Admin only | Any agent |
| **Admin's run** | Canceled and removed | Continues running |
| **Target agent sees** | Original human message as trigger | Agent's new message as trigger |
| **Visible in space** | Nothing — silent handoff | Admin's message appears in the space |
| **Use when** | Admin doesn't want to be involved at all | Admin wants to coordinate, add context, or wait for a reply |
