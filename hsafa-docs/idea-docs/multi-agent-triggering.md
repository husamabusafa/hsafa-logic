> **⚠️ SUPERSEDED** — This document describes the old mention-chain / reply-stack / round-robin model. It has been fully replaced by the **Single-Run Architecture** (`single-run-architecture/`). In the new model: human messages always go to the **admin agent**, agents use `sendSpaceMessage` with an optional `mention` field (+ optional `wait`) for agent-to-agent collaboration, and `delegateToAgent` provides silent handoff. No reply stack, no round-robin, no `mentionAgent` prebuilt tool. See `single-run-architecture/03-admin-agent.md` and `single-run-architecture/02-space-tools.md`.

---

# Multi-Agent Triggering — Mention Chain (DEPRECATED)

## Problem

When a human sends a message in a multi-agent space, **all agents** get triggered simultaneously. Each agent responds, and each response re-triggers the others, creating a cascade of redundant messages. It doesn't feel like a group chat — it feels like every person in the room shouting at once.

## Design: Pick One → Mention Chain

### Core Idea

A non-agent message (human or service) triggers **one** agent. That agent decides what to do. If it responds, it can **mention** another agent to hand off the conversation — and only that mentioned agent runs next. The chain continues until an agent responds (or skips) **without mentioning** anyone **and** there are no agents waiting on the reply stack.

### Flow

```
Human sends message
       │
       ▼
  Pick ONE agent            ← round-robin, last-spoke, or relevance-based
       │
       ▼
  Agent evaluates
       │
  ┌────┼────────────┐
  │    │             │
  ▼    ▼             ▼
Skip  Respond        Delegate
  │   (post msg)     (silent, hand off)
  │      │                │
  │      │                ▼
  │      │           Target agent runs
  │      │           (same 3 choices)
  │      │
  │   Mentioned another
  │   agent in response?
  │      │
  │   ┌──┴───┐
  │   │      │
  │  Yes     No
  │   │      │
  │   ▼      │
  │  That    │
  │  agent   │
  │  runs    │
  │  next    │
  │          │
  └────┬─────┘
       │
       ▼
  Reply stack empty?
       │
  ┌────┴────┐
  │         │
  No       Yes
  │         │
  ▼         ▼
 Pop agent  Done.
 from stack Chain stops.
 Re-trigger
 (same 3
  choices)
```

### Three Outcomes per Agent

1. **Respond** — The agent posts a message. If the response **mentions another agent** (via a structured annotation, not just text), that agent gets triggered next. If no mention → check reply stack (pop waiting agent, or stop if empty).

2. **Delegate** — The agent has nothing to say itself, but knows who should handle it. Calls `delegate(targetAgentEntityId, reason)`. Current run canceled silently (no message posted). Target agent gets a run with the delegation context. The delegated agent inherits the delegator's position — if someone was waiting for the delegator on the reply stack, they'll now be waiting for the delegated agent instead.

3. **Skip** — The agent decides it has nothing to add. No message posted. System checks reply stack — if an agent is waiting, it gets re-triggered (it will see that the mentioned agent skipped and can act accordingly). If stack is empty, nobody responds.

### How Mentions Work

When an agent responds, it can call `mentionAgent` to trigger another agent next:

```
Agent A responds: "Here's the summary. @Research Agent can you find sources for this?"
                                        ^^^^^^^^^^^^^^^^
                                        Parsed as a mention → triggers Research Agent
```

**Implementation**: A prebuilt tool `mentionAgent`:

```json
{
  "name": "mentionAgent",
  "description": "After your response, trigger another agent to continue the conversation. Set expectReply=true if you need to continue your task after they respond — you will be automatically re-triggered when they finish.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "targetAgentEntityId": {
        "type": "string",
        "description": "Entity ID of the agent to trigger next"
      },
      "reason": {
        "type": "string",
        "description": "Brief context for why this agent should respond"
      },
      "expectReply": {
        "type": "boolean",
        "description": "If true, you will be re-triggered after the target agent finishes (respond or skip). Use when you need their output to continue your task.",
        "default": false
      }
    },
    "required": ["targetAgentEntityId"]
  }
}
```

### The Reply Stack

When `expectReply: true` is used, the system maintains a **reply stack** — a list of agents waiting to be triggered back. This enables dynamic multi-hop chains:

```
Reply stack: []

1. HR Agent mentions Finance Agent (expectReply: true)
   → stack: [HR]
   → Finance Agent runs

2. Finance Agent mentions Data Agent (expectReply: true)
   → stack: [HR, Finance]
   → Data Agent runs

3. Data Agent responds (no mention)
   → stack: [HR, Finance]
   → Pop Finance from stack → Finance Agent re-triggered
   
4. Finance Agent responds (no mention)
   → stack: [HR]
   → Pop HR from stack → HR Agent re-triggered

5. HR Agent responds (no mention)
   → stack: []
   → Chain stops. Done.
```

Each agent picks up where it left off, seeing the full conversation including what the agents it asked have said.

### Chain Rules

| Event | What happens next |
|-------|-------------------|
| Human/service message | Pick ONE agent → run |
| Agent responds **with mention** (`expectReply: false`) | Mentioned agent runs. Chain continues from them. |
| Agent responds **with mention** (`expectReply: true`) | Mentioned agent runs. After they finish, **caller is re-triggered**. |
| Agent responds **without mention** | Pop reply stack → re-trigger waiting agent. If stack empty → **chain stops**. |
| Agent delegates | Target agent runs (no message posted by delegator). Inherits delegator's position in reply stack. |
| Agent skips | Pop reply stack → re-trigger waiting agent. If stack empty → **no one responds**. |

### Loop Protection

- **Max chain depth**: configurable (default 10). Total agent runs in one chain, including re-triggers.
- **No self-mention**: agent cannot mention itself.
- **No circular mentions**: agent A cannot mention agent B if B already mentioned A earlier in the same chain (prevents A→B→A loops). Re-triggers from the reply stack are allowed — they are system-initiated, not agent-initiated.
- **Reply stack max size**: configurable (default 5). Prevents unbounded nesting.

### Reply Stack — Storage

The reply stack is stored in the **chain metadata** passed between runs:

```json
{
  "chainId": "uuid",
  "chainDepth": 3,
  "replyStack": [
    { "entityId": "hr-agent-id", "reason": "waiting for salary data" },
    { "entityId": "finance-agent-id", "reason": "waiting for raw data" }
  ],
  "mentionedPairs": ["hr->finance", "finance->data"]
}
```

### Picking the First Agent

For v1, keep it simple:

- **Round-robin**: rotate which agent evaluates first per space (stored in space metadata).
- Later: relevance-based (match message against agent descriptions).

### Changes Needed

#### `agent-trigger.ts`
- Replace `triggerAgentsInSmartSpace()` with `triggerOneAgent()` — picks one agent, creates a run at depth 0.
- New function `triggerMentionedAgent(targetEntityId, chain)` — creates a run for the mentioned agent with chain context.

#### New prebuilt tool: `mentionAgent`
- Does NOT cancel the run (unlike delegate — the agent still posts its message).
- After the run completes, `run-runner.ts` checks if `mentionAgent` was called.
- If yes → trigger that specific agent with chain metadata.
- If no → done, no further triggering.

#### Existing prebuilt tool: `delegate` (repurposed)
- Same as before: cancels current run, spawns run for target agent.
- The delegator posts no message.

#### `prompt-builder.ts`
- System prompt includes: "You are the agent evaluating this message. You can respond, delegate to another agent, or skip."
- List of other agents in the space with their names, descriptions, and entity IDs.
- For chain runs: "You were mentioned by [Agent Name]: [reason]" or "Delegated to you by [Agent Name]: [reason]".

#### `run-runner.ts`
- After agent completes: check if `mentionAgent` was called in the tool calls.
  - Yes → `triggerMentionedAgent()` with chain tracking.
  - No → done. Do NOT call `triggerAgentsInSmartSpace()`.
- Handle `delegate` same as `skipResponse` but spawn a new run for the target.

### Example Conversations

#### Simple: one agent responds

```
حسام: "good morning!"

→ Demo Agent picked first (round-robin)
→ Demo Agent responds: "Good morning حسام!"
  → no mention, stack empty
→ Chain stops. 1 message. Research Agent never runs.
```

#### Hand-off: delegate to the right agent

```
حسام: "what's the weather like?"

→ Research Agent picked first (round-robin)
→ Research Agent calls delegate(Demo Agent, "has MCP tools for weather")
→ Research Agent's run canceled silently

→ Demo Agent runs
→ Demo Agent responds with weather data from MCP
  → no mention, stack empty
→ Chain stops. 1 agent message total.
```

#### Fire-and-forget mention: two agents both respond

```
حسام: "research quantum computing and make me an image about it"

→ Demo Agent picked first (round-robin)
→ Demo Agent responds: "Here's the image!" + generateImage
  → calls mentionAgent(Research Agent, "user wants research too", expectReply: false)
→ Demo Agent's message posted

→ Research Agent triggered
→ Research Agent responds: "Here's what I found..."
  → no mention, stack empty
→ Chain stops. 2 messages total.
```

#### Reply stack: agent needs another agent's output to continue

```
حسام: "prepare the monthly payroll report"

→ HR Agent picked first
  stack: []
→ HR Agent responds: "I'll prepare the report. Let me get the salary data first."
  → calls mentionAgent(Finance Agent, "need January salary sheet", expectReply: true)
  stack: [HR]

→ Finance Agent triggered
→ Finance Agent responds: "Here's the salary data: ..."
  → no mention
  stack: [HR] → pop HR
→ HR Agent re-triggered

→ HR Agent responds: "Here's the complete payroll report based on the salary data..."
  → no mention, stack empty
→ Chain stops. 3 messages total.
```

#### Nested reply stack: multi-hop request chain

```
حسام: "prepare the quarterly business review"

→ HR Agent picked first
  stack: []
→ HR Agent responds: "I'll compile the review. Getting financial data first."
  → calls mentionAgent(Finance Agent, "need Q4 numbers", expectReply: true)
  stack: [HR]

→ Finance Agent triggered
→ Finance Agent responds: "I need the raw data first."
  → calls mentionAgent(Data Agent, "need Q4 raw sales data", expectReply: true)
  stack: [HR, Finance]

→ Data Agent triggered
→ Data Agent responds: "Here's the Q4 raw data: ..."
  → no mention
  stack: [HR, Finance] → pop Finance
→ Finance Agent re-triggered

→ Finance Agent responds: "Here are the Q4 financials based on the data: ..."
  → no mention
  stack: [HR] → pop HR
→ HR Agent re-triggered

→ HR Agent responds: "Here's the complete quarterly business review: ..."
  → no mention, stack empty
→ Chain stops. 5 messages total. Each agent got exactly what it needed.
```

#### Cross-space collaboration (via goToSpace + mention)

```
[In HR Space]
HR Agent triggered by plan: "monthly check-in with finance"

→ HR Agent calls goToSpace(Finance Space, "need to ask about budget status")
→ [In Finance Space] HR Agent posts: "Hey, what's the status on this month's budget?"
  → calls mentionAgent(Finance Agent, "need budget update", expectReply: true)

→ Finance Agent responds: "Budget is 80% allocated, here's the breakdown..."
  → no mention
→ HR Agent re-triggered in Finance Space
→ HR Agent responds: "Thanks, I'll factor this into the report."
  → no mention, stack empty
→ Chain stops.
```

### Benefits

- **No cascade** — each step in the chain is intentional and directed
- **Natural group chat** — agents hand off to each other like real people
- **Request-response built in** — `expectReply: true` lets agents ask for things and continue after
- **Dynamic nesting** — reply stack supports arbitrary depth (with configurable max)
- **Self-regulating** — chain stops naturally when no one is mentioned and stack is empty
- **Works cross-space** — goToSpace + mention enables inter-space agent collaboration
