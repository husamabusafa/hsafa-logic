# System Prompts — Unified Prompt Builder

## Overview

The gateway builds **one unified system prompt** for all agents. The only variations are:

1. **Trigger context** — what caused this run (`space_message`, `plan`, or `service`)
2. **Admin vs non-admin** — admin agents get the `delegateToAgent` tool and a brief explanation of delegation

The agent's LLM text output is **internal** (reasoning/planning). All visible communication happens through `sendSpaceMessage`.

---

## Prompt Structure

Every agent — admin or not, regardless of trigger type — gets the same structure:

```
You are [Agent Name].
[Agent's system instruction from config — their role, personality, expertise]

SPACE: "[Space Name]"
MEMBERS:
- Husam (human)
- Finance Agent (agent, entity: xxx) — handles budgets, expenses
- You (entity: zzz)

TRIGGER: [trigger context — see below]

[Admin instruction — only if admin in multi-agent space]

Use sendSpaceMessage to respond when ready.

GOALS:
- ...

MEMORIES:
- ...

PLANS (your scheduled triggers):
- ...

⚠ You currently have N other active runs:
- run-xyz (plan: Morning Report, running, started 30s ago)
Use getMyRuns for full details if needed. Avoid duplicating work already in progress.
```

---

## Trigger Context Variations

### `space_message` — A message in a space

```
TRIGGER: This run was triggered by a message from Husam in "Husam's Chat":
"What's our Q4 budget status?"

Use sendSpaceMessage to respond when ready.
```

When triggered by an agent mention:
```
TRIGGER: This run was triggered by a message from Ops Agent (agent) in "Engineering Ops":
"Finance, can you pull the Q4 numbers?"
Mention reason: "Need Q4 financial data for the weekly report"

Use sendSpaceMessage to respond when ready.
```

### `plan` — A scheduled plan

```
TRIGGER: This run was triggered by your scheduled plan "Morning Report".
Use sendSpaceMessage to post updates to the relevant spaces.
```

### `service` — An external service

```
TRIGGER: This run was triggered by service "Jira":
{ "event": "ticket_created", "ticketId": "PROJ-123", "priority": "critical", ... }

Use sendSpaceMessage to post updates or alerts to the relevant spaces.
```

---

## Admin Agent Prompt (Multi-Agent Space)

The admin agent gets a brief additional instruction:

```
You are the admin agent for this space — human messages come to you first. You can:
- Respond directly using sendSpaceMessage
- Delegate to another agent using delegateToAgent(entityId) — your run will be silently canceled and the target agent will receive the original human message as their trigger
- Mention another agent using sendSpaceMessage with mention — your message will appear in the space and the mentioned agent will be triggered
- If no response is needed, simply do nothing — your run will complete silently
```

Non-admin agents do NOT see `delegateToAgent` in their toolset or prompt.

---

## Single-Agent Space Prompt

```
You are [Agent Name].
[Agent's system instruction from config]

SPACE: "[Space Name]"
MEMBERS:
- Husam (human)
- You (entity: zzz)

TRIGGER: This run was triggered by a message from Husam in "Personal Assistant":
"What's our Q4 budget status?"

Use sendSpaceMessage to respond when ready.
```

No `delegateToAgent`, no admin instruction. The agent is always triggered directly.

---

## Shared Context (All Prompts)

All system prompts include the same agent context blocks:

- **Current time** — ISO timestamp of when the run starts
- **Goals** — Active (non-completed) goals, ordered by priority
- **Memories** — Last 50 memories, ordered by most recently updated
- **Plans** — Active plans (pending/running) with next run time and remaining time
- **Concurrent run notice** — If the agent has other active runs, a brief summary is injected

The order is always: Goals → Memories → Plans → Concurrent run notice (if any).

---

## Comparison: Old vs New

| Aspect | Old (3 Prompt Types) | New (Unified) |
|--------|---------------------|---------------|
| **Prompt types** | Regular, Cross-Space, Plan — 3 separate builders | One builder with trigger context injection |
| **Agent's text output** | Auto-posted as a message in the space | Internal reasoning only — agent uses `sendSpaceMessage` |
| **Cross-space** | Required a separate child run | Same run — `sendSpaceMessage(otherSpaceId, text)` |
| **Plan runs** | Special case (no space, must use separate tool to interact) | Same model — general run, uses `sendSpaceMessage` |
| **Service triggers** | System entity sends message in space | Direct API trigger — no entity or space needed |
| **Who responds first?** | Random (round-robin) | Deterministic (admin agent) |
| **Conversation history** | Included as user/assistant turns | Agent reads history via `readSpaceMessages` when needed |
| **Admin prompt** | Separate multi-agent prompt with 4 options | Same structure as all agents, just adds `delegateToAgent` |

---

## Key Design Points

- **No space-bound runs.** Runs are general-purpose. The agent is not "in" a space — it interacts with spaces via tools.
- **No auto-persist.** The LLM's text output is internal. The agent must explicitly call `sendSpaceMessage` to communicate.
- **One prompt builder.** `prompt-builder.ts` builds the same structure for admin, non-admin, single-agent, multi-agent, all trigger types.
- **Concurrent run awareness.** The prompt includes a notice if the agent has other active runs, so it can avoid duplicate work.

> **See also:** [Single-Run Architecture](./single-run-architecture/) for the full design.
