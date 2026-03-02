# 07 — Messaging

## Overview

Agents have one messaging tool: `send_message({ text })`. It posts a message to the active space. That's it.

In v3, conversational continuity comes from **consciousness**, not from re-reading space history every time. The agent remembers what it said, what others said, and why — because all of that is in its ModelMessage[] array.

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
3. **The message pushes events to all other agent members' inboxes** (sender excluded).
4. The think cycle continues immediately — the agent can send more messages, call other tools, or end.

### Tool Result

```json
{
  "success": true,
  "messageId": "msg-abc-123",
  "status": "delivered"
}
```

---

## How Conversations Work

### v2: Stateless Runs

In v2, every message triggered a fresh run. The agent read space history (with `[SEEN]`/`[NEW]` markers) from scratch each time. Conversational continuity came from context reconstruction.

### v3: Consciousness

In v3, the conversation IS the consciousness. The agent doesn't re-read context — it already has it:

```
Consciousness after 3 cycles:

  [user]  INBOX: [Family] Husam: "Find me hotels in Tokyo"
  [assistant → tool_call] send_message("What's your budget per night?")
  [tool → result] { success: true }
  [assistant] "Asked about budget."

  [user]  INBOX: [Family] Husam: "$150"
  [assistant → tool_call] searchHotels({ city: "Tokyo", maxPrice: 150 })
  [tool → result] { results: [...] }
  [assistant → tool_call] send_message("Found 3 great options: ...")
  [tool → result] { success: true }
  [assistant] "Sent hotel options."

  [user]  INBOX: [Family] Husam: "Book the second one"
  ← agent already KNOWS the full conversation context
  ← it knows it asked about budget, got $150, searched, found 3 options
  ← it can immediately act on "the second one"
```

No `[SEEN]`/`[NEW]` markers needed. No space history reconstruction. The conversation naturally flows through consciousness.

---

## Conversation Patterns

### Pattern 1: Agent Asks, Human Answers

```
Cycle 1:
  INBOX: [Deployments] Sarah: "Deploy v2.1 to production"
  
  Agent thinks: "This affects 3 services. I should confirm."
  → send_message("I'll deploy v2.1. This affects 3 services. Confirm by replying yes.")
  
  Cycle ends.

Cycle 2:
  INBOX: [Deployments] Sarah: "yes"
  
  Agent sees in consciousness:
    - It asked for confirmation (cycle 1)
    - Sarah said yes (cycle 2 inbox)
  
  → deployService({ version: "2.1", target: "production" })
  → send_message("Deployment complete! All 3 services running v2.1.")
  
  Cycle ends.
```

The agent remembers asking the question — it's in consciousness, not reconstructed from space history.

### Pattern 2: Multi-Turn Back-and-Forth

```
Cycle 1:
  INBOX: [Family] Husam: "Help me plan a trip to Tokyo"
  → send_message("When are you thinking of going, and for how long?")

Cycle 2:
  INBOX: [Family] Husam: "First week of April, about 5 days"
  → Consciousness has: "trip to Tokyo" + "when/how long" question
  → send_message("Great timing — cherry blossom season! Here's a rough itinerary: ...")

Cycle 3:
  INBOX: [Family] Husam: "Yes, budget around $150/night for hotels"
  → Consciousness has: "Tokyo, April, 5 days" + itinerary + "$150 budget"
  → searchHotels({ city: "Tokyo", dates: "2026-04-01 to 2026-04-06", maxPrice: 150 })
  → searchFlights({ destination: "NRT", dates: "..." })
  → send_message("Found 3 great options: ...")
```

Each cycle adds to consciousness. By cycle 3, the agent has the full conversation context without any reconstruction.

### Pattern 3: Multi-Agent Discussion

```
Space "Architecture" — Husam, Architect (agent), SecurityBot (agent), DevOps (agent)

Husam: "We need to redesign the auth system"
→ Pushes to 3 inboxes: Architect, SecurityBot, DevOps

Architect wakes:
  → send_message("I'd suggest OAuth2 with JWT.")
  
SecurityBot wakes:
  → send_message("Use short-lived tokens with refresh rotation.")

DevOps wakes:
  → Reads context. Design discussion, not ops yet.
  → skip({ reason: "Architecture design discussion, not ops" })
  → SDK stops at step 0. Cycle rolled back, consciousness unchanged.

Architect's message → pushes to SecurityBot + DevOps inboxes
SecurityBot's message → pushes to Architect + DevOps inboxes

SecurityBot wakes (from Architect's message):
  → Consciousness has: Husam's request + its own response + Architect's proposal
  → send_message("OAuth2 is good. Add PKCE for public clients.")

DevOps wakes (from both messages):
  → Now there are implementation details it CAN act on
  → send_message("I can set up Keycloak. ETA: 2 days.")
```

Each agent independently processes inbox events and contributes when relevant. Agents that have nothing to add call `skip()` — the SDK stops immediately and the cycle is fully rolled back (no consciousness update, no run record, no cost beyond the skip decision). See [Think Cycle — Skip Cycle](04-think-cycle.md#skip-cycle--skip-tool) for details.

### Pattern 4: Batched Events (v3 Advantage)

In v2, rapid messages created multiple concurrent runs requiring `absorb_run`. In v3:

```
[00:00] Ahmad: "Option A"    → inbox
[00:01] Sarah: "Option B"    → inbox
[00:02] Husam: "Option A"    → inbox

VoteBot wakes at [00:02]:
  INBOX (3 events):
    [Team Vote] Ahmad: "Option A"
    [Team Vote] Sarah: "Option B"
    [Team Vote] Husam: "Option A"
  
  Agent processes all 3 in one cycle:
  → send_message("Vote results: Option A wins 2-1 (Ahmad + Husam vs Sarah).")
```

No `absorb_run`. No race conditions. One inbox, one cycle, one coherent response.

### Pattern 5: Long-Running Workflow with Memory

For workflows that span many cycles, the agent uses **memories and goals** to track state beyond the consciousness window:

```
Cycle N (triggered by: "Generate the Q4 report"):
  1. Pulls revenue data, user metrics
  2. send_message("Started the Q4 report. I need budget numbers from Finance.")
  3. set_memories([{ key: "q4_report", value: "waiting for budget. Revenue $2.1M, users 45K" }])
  4. set_goals([{ id: "q4", description: "Complete Q4 report", status: "active" }])

[Later — Finance: "Budget is $500K"]

Cycle N+K:
  INBOX: [Finance] Finance: "Budget is $500K"
  
  System prompt has:
    MEMORIES: q4_report = "waiting for budget. Revenue $2.1M, users 45K"
    GOALS: "Complete Q4 report" (active)
  
  Consciousness has (if within window): the original request + partial work
  
  → Generates full report
  → send_message("Q4 Report: Revenue $2.1M, Users 45K, Budget $500K. [full analysis]")
  → set_goals([{ id: "q4", status: "completed" }])
  → delete_memories(["q4_report"])
```

Even if the original cycle has been compacted out of consciousness, the memories and goals persist in the system prompt.

---

## Deciding When to Respond

Agents don't always need to respond. In multi-entity spaces, the agent will receive inbox events for **every** message — most of which are not directed at it. The system prompt instructs:

```
In multi-entity spaces, you will receive many messages that are not directed at you
and are better handled by another agent or human in the space.

If after reading the inbox events you determine:
  - The message is not addressed to you (by name, role, or context)
  - Another agent or human is better suited to respond
  - You have nothing useful to contribute

Call the skip() tool immediately. Do NOT send any messages first.
```

### How the Agent Decides

The agent reads the inbox events and reasons:
- Is this addressed to me? (Name mentioned, or relevant to my role)
- Can I add value? (Do I have relevant tools/knowledge?)
- Has this already been handled? (Check consciousness for prior responses)
- Is another agent better suited? (Check space members in system prompt)

If the answer is "no useful contribution," the agent calls `skip()`.

### `skip()` = Full Rollback

The `skip` tool has **no `execute` function**, so the SDK stops the loop immediately at step 0. The gateway then detects the `skip` tool call structurally (no text parsing) and **erases the entire cycle** — no consciousness update, no run record, no cycle count increment, no compaction. From the agent's perspective, the skip never happened. This prevents irrelevant events from polluting consciousness with noise.

This is different from v2's "silence" (where the agent ended the cycle without sending a message but still consumed a full run). In v3, a skip is virtually free (~20 output tokens for the tool call) and leaves zero trace.

See [Think Cycle — Skip Cycle](04-think-cycle.md#skip-cycle--skip-tool) for the full implementation.

---

## Interactive UI Tools (Still Pause)

Interactive `space` tools (forms, approval buttons, file pickers) still pause the think cycle. This is different from chat-level conversation:

- **Interactive tool pause** = waiting for structured UI input from a rendered component. The think cycle pauses because the tool needs a specific result.
- **Chat messages** = handled by inbox events across cycles. No pausing.

```
Think Cycle:
  1. Agent calls confirmDeployment({ service: "api", version: "2.1", env: "production" })
     → Tool UI rendered in active space
     → Think cycle pauses (tool has no execute function)

  [User clicks "Approve"]
     → Tool result submitted to gateway
     → Think cycle resumes

  2. Agent proceeds with deployment.
  Cycle ends.
```

---

## Removed Concepts

| v2 | v3 |
|----|-----|
| `[SEEN]`/`[NEW]` markers for conversational context | Not needed — consciousness tracks all history |
| Space history rebuilt in system prompt each run | Space history via `enter_space` tool results in consciousness |
| `absorb_run` for batching rapid messages | Inbox batches naturally |
| Multiple concurrent runs per conversation | One cycle per wakeup |
