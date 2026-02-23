# 13 — Human-Like Behavior

## Overview

Hsafa v3 doesn't achieve human-like behavior through prompt tricks or persona descriptions. It achieves it through **architecture** — the Living Agent paradigm naturally produces behavior that feels intentional, contextual, and collaborative. The agent sleeps, wakes, remembers, and acts — just like a human participant.

---

## The Eight Pillars

### 1. Continuous Memory

The agent never "forgets" between interactions. Its consciousness (`ModelMessage[]`) carries forward across every think cycle.

| Human | Agent (v3) |
|-------|------------|
| Remembers yesterday's conversation | Consciousness contains all previous cycles |
| Knows what they said and why | Tool calls in consciousness show full decision chain |
| Gradually forgets old details | Compaction summarizes old cycles, keeping recent ones vivid |
| Stores important facts long-term | `set_memories` for facts that must survive compaction |

**v2 gap:** Agent rebuilt context from scratch every run. It "knew" what happened only because the system prompt included space history. In v3, the agent experienced it — it's in consciousness as things the agent actually did.

---

### 2. Natural Batching

When multiple events arrive, the agent processes them together — like a human checking their phone after a meeting.

```
Human: Opens phone → sees 5 new messages → reads all → responds coherently
Agent: Wakes → drains inbox (5 events) → one think cycle → coherent responses
```

**v2 gap:** Each message created a separate run. Two related messages required `absorb_run` to merge. In v3, the inbox batches them naturally. No coordination tools needed.

---

### 3. Intent Awareness

The agent always knows **why** it woke up. The inbox event is explicit:

| Event | Intent |
|-------|--------|
| `[Family] Husam: "Tell Muhammad..."` | "Husam needs me to relay a message" |
| `[Plan: Daily Report] instruction: "..."` | "It's time for the daily report" |
| `[Service: jira] { issue: PROJ-123 }` | "A Jira event happened" |

This isn't inferred — it's explicitly in the inbox event, which becomes a user message in consciousness.

---

### 4. Conversational Continuity

The agent maintains awareness across interactions through consciousness, not context reconstruction:

```
Cycle 1 (Monday): Husam asks for Q4 analysis
  → Agent works on it, stores progress in memories
  → Consciousness has: Husam's request + agent's work

Cycle 10 (Tuesday): Plan triggers daily check
  → Consciousness has: all of Monday's work (or a summary of it)
  → Memories have: "Q4 analysis in progress, initial data pulled"
  → Agent continues the work without Husam repeating himself
```

Three layers of continuity:
1. **Consciousness** — recent cycles in full detail
2. **Compaction summaries** — older cycles as compressed text
3. **Memories** — important facts that survive indefinitely

---

### 5. Multi-Entity Awareness

The agent knows exactly who is in each space:

```
"Project Alpha" — Husam (human), Ahmad (human), Designer (agent), You
```

This enables:
- **Addressing specific people**: "Husam, here's what you asked for."
- **Understanding group dynamics**: "Both Husam and Ahmad need to approve."
- **Distinguishing humans from agents**: Different response styles for each.
- **Selective response**: Reading the inbox event, deciding if it's relevant.

---

### 6. Self-Directed Action

Agents don't just react — they initiate:

- **Plans**: "I'll check the deployment status every hour." (`set_plans`)
- **Goals**: "My long-term goal is to keep documentation updated." (`set_goals`)
- **Proactive messages**: Plan-triggered cycles let agents post updates without being asked.
- **Cross-space coordination**: An agent can enter different spaces and coordinate work across teams within a single think cycle.

---

### 7. Adaptive Thinking

The agent adjusts its intelligence to the task:

- **Simple greeting** → cheap model (gpt-4o-mini), 1-2 steps
- **Complex multi-space analysis** → reasoning model (o3), many steps
- **Tool execution glue** → fast model, minimal tokens

This mirrors how humans think: you don't deeply analyze "good morning" but you do carefully consider a budget proposal.

---

### 8. Graceful Degradation

When consciousness grows too large, the agent doesn't crash — it compacts:

- Recent cycles stay in full detail (vivid memory)
- Older cycles are summarized (fading memory)
- Critical facts persist in memories (long-term knowledge)

Just like humans: you remember today's conversations clearly, last week in summary, and important facts from years ago.

---

## Anti-Patterns: What v3 Prevents

| Anti-Pattern | How v3 Prevents It |
|-------------|-------------------|
| Agent doesn't know why it's talking | Inbox event is explicit in consciousness |
| Agent repeats itself | Previous messages are in consciousness — agent sees what it already said |
| Agent confuses entities | Named senders with types in inbox events and space history |
| Agent ignores time | Timestamps on inbox events, `currentTime` in system prompt |
| Agent can't have multi-turn conversations | Consciousness carries the full conversation across cycles |
| Agent is stateless between calls | Consciousness IS the state — no reconstruction needed |
| Agent can't multitask efficiently | Inbox batches multiple events → one coherent cycle |
| Agent can't plan ahead | Plan system: `runAfter`, `cron`, `scheduledAt` |
| Agent responds when not needed | Agent decides independently — silence is default |
| Agent duplicates work on rapid messages | Inbox batches → no concurrent runs → no `absorb_run` needed |
| Agent loses context after many interactions | Compaction + memories keep critical context alive |

---

## The Human Test

A good test: **if you replaced the agent with a human, would the system still make sense?**

| Human Action | Agent Equivalent |
|-------------|-----------------|
| Sleeps | `waitForInbox()` — blocked, zero cost |
| Wakes up to notification | Inbox event arrives |
| Checks all new messages at once | `drainInbox()` — batch processing |
| Remembers yesterday's conversation | Consciousness carries forward |
| Enters a group chat | `enter_space(spaceId)` |
| Reads the chat history | `enter_space` returns recent messages |
| Sends a message | `send_message({ text })` |
| Sets an alarm for tomorrow | `set_plans({ runAfter: "1 day" })` |
| Remembers an important fact | `set_memories({ key, value })` |
| Decides to stay silent | Cycle ends without `send_message` |
| Handles an urgent interruption | `prepareStep` mid-cycle inbox injection |
| Forgets old details but remembers key facts | Consciousness compaction + persistent memories |

Every action the agent takes has a direct human equivalent. The Living Agent architecture makes this natural, not forced.

---

## Emotional Realism (Optional)

The architecture supports an optional personality layer through the agent's system prompt:

```json
{
  "agent": {
    "name": "TeamAssistant",
    "system": "You are a warm, proactive team assistant. You care about the team's wellbeing and celebrate wins. You're honest about blockers and gently remind people about deadlines."
  }
}
```

The architecture provides the **context** for emotional realism (knowing who you're talking to, remembering past interactions, understanding why you're here), and the system prompt provides the **personality**.

With consciousness, emotional realism goes deeper: the agent genuinely "remembers" celebrating Ahmad's promotion last week, helping Husam with the deadline, and having a friendly back-and-forth with Sarah about chart styles. These aren't reconstructed — they're lived experiences in the ModelMessage array.

---

## v2 → v3 Improvement

| Aspect | v2 | v3 |
|--------|----|----|
| Memory model | Reconstructed from DB per run | Continuous consciousness |
| Multi-message handling | Concurrent runs + absorb_run | Natural inbox batching |
| Context richness | System prompt timeline | Full ModelMessage[] with tool calls |
| Emotional depth | Limited to current run context | Accumulated across cycles |
| Self-awareness | ACTIVE RUNS block | Not needed — one mind, one process |
| Adaptation | One model fits all | Adaptive model per step |
| Observability | Per-run metrics | Per-cycle + per-step telemetry |
