# 07 — Human-Like Behavior

## Overview

Hsafa v2 doesn't achieve human-like behavior through prompt tricks or persona descriptions. It achieves it through **architecture** — the system's structure naturally produces behavior that feels intentional, contextual, and collaborative.

---

## The Seven Pillars

### 1. Intent Awareness

The agent always knows **why** it is running.

| Trigger | Intent |
|---------|--------|
| Husam mentions the agent in "Project Alpha" | "Husam needs something from me in Project Alpha" |
| Daily Report plan fires at 9am | "It's time for the daily report" |
| Jira webhook triggers with payload | "A Jira event happened that I need to process" |

This isn't inferred — it's explicitly provided in the trigger context. The agent never asks "why am I here?" because the architecture tells it.

**v1 gap**: In v1, the agent received role-based history and had to infer intent from the last user message. In multi-agent spaces, it was unclear whether the agent was being addressed or just overhearing.

**v2 fix**: The trigger block explicitly states who triggered the agent and what they said. Mentions make intent unambiguous.

---

### 2. Context Continuity

The agent maintains awareness across interactions:

- **Within a run**: The agent remembers everything it has done so far (tool calls, messages sent, replies received).
- **Across runs**: The agent has access to memories, goals, and run history from previous executions.
- **Across spaces**: Cross-space origin annotations explain why the agent said something in a different space.

**Example of continuity:**

```
Run 1 (Monday): Husam asks for Q4 analysis
  → Agent sets memory: "Q4 analysis requested, initial data pulled"
  → Agent sets goal: "Complete Q4 revenue breakdown"

Run 2 (Tuesday): Plan triggers daily check
  → Agent sees goal: "Complete Q4 revenue breakdown"
  → Agent sees memory: "Q4 analysis requested, initial data pulled"
  → Agent continues the work without Husam repeating himself
```

---

### 3. Conversation Memory

The agent reads space history as a chronological timeline. It sees:

- What it said before (and why — via origin annotations)
- What others said
- The temporal gaps between messages
- The flow of conversation

This means the agent can:

- **Not repeat itself**: "I already answered this — see my message from 2 hours ago."
- **Follow up**: "Last time you mentioned X — is that still the case?"
- **Acknowledge delays**: "Sorry for the delay — I see you asked this 3 hours ago."

---

### 4. Multi-Entity Awareness

The agent knows exactly who is in each space:

```
"Project Alpha" — Husam (human), Ahmad (human), Designer (agent), You
```

This enables:

- **Addressing specific people**: "Husam, here's what you asked for."
- **Knowing who to mention**: "@Designer can you review this?"
- **Understanding group dynamics**: "Both Husam and Ahmad need to approve."
- **Avoiding confusion**: The agent knows whether a message came from a human or another agent.

---

### 5. Parallel Collaboration

Agents can work simultaneously on different tasks:

```
Run 1: Processing Husam's request in "Project Alpha"
Run 2: Responding to Ahmad in "Support"
Run 3: Executing daily report plan
```

Each run is independent but aware of the others. The agent can:

- Avoid duplicating work ("I'm already handling this in another run").
- Prioritize ("Run 1 is urgent — let me focus there").
- Coordinate ("My other run already pulled this data — I can reference it").

---

### 6. Waiting & Patience

The `wait` mechanism makes agents patient — like humans who ask a question and wait for an answer:

```
Agent: "@Designer can you review the mockup?" (wait: true)
  ... agent waits ...
Designer: "Looks great, ship it!"
Agent: "Perfect, deploying now."
```

Without wait, agents are fire-and-forget. With wait, they can:

- Have **real conversations** (ask → wait → respond → ask again).
- **Block on dependencies** ("I need the data before I can proceed").
- **Collaborate** ("Let me check with the team and get back to you").

---

### 7. Self-Directed Action

Agents don't just react — they can initiate:

- **Plans**: "I'll check the deployment status every hour."
- **Goals**: "My long-term goal is to keep the documentation updated."
- **Proactive messages**: Plan-triggered runs let agents post updates, reminders, or reports without being asked.
- **Cross-space coordination**: An agent can enter different spaces and coordinate work across teams.

---

## Emotional Realism (Optional)

The architecture supports an optional personality layer through the agent's system prompt. This isn't enforced by the architecture — it's a configuration choice:

```json
{
  "agent": {
    "name": "TeamAssistant",
    "system": "You are a warm, proactive team assistant. You care about the team's wellbeing and celebrate wins. You're honest about blockers and gently remind people about deadlines."
  }
}
```

The architecture provides the **context** for emotional realism (knowing who you're talking to, what happened before, why you're here), and the system prompt provides the **personality**.

---

## Anti-Patterns: What v2 Prevents

| Anti-Pattern | How v2 Prevents It |
|-------------|-------------------|
| Agent doesn't know why it's talking | Trigger context is always explicit |
| Agent repeats itself | Timeline history with its own previous messages |
| Agent confuses entities | Named senders with types, not generic "user" role |
| Agent ignores time | Timestamps on every message |
| Agent can't wait | `send_message(wait: true)` enables real pauses |
| Agent is stateless | Goals, memories, run history persist across runs |
| Agent can't multitask | Concurrent runs with mutual awareness |
| Agent can't plan ahead | Plan system with cron and one-time schedules |

---

## The Human Test

A good test for whether the architecture is working: **if you replaced the agent with a human, would the system still make sense?**

- A human enters a space → `enter_space`
- A human reads the chat history → `read_messages`
- A human sends a message → `send_message`
- A human waits for a reply → `send_message(wait: true)`
- A human @mentions someone → `@AgentName` in text
- A human uses a tool → tool call
- A human sets a reminder → `set_plans`
- A human remembers something → `set_memories`

Every action the agent takes has a direct human equivalent. That's the goal.
