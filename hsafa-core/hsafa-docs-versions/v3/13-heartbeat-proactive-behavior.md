# 13 — Heartbeat & Proactive Behavior (Future)

> **Status**: Idea — ship after core v3 is stable and reactive behavior is well-tuned.

## The Problem

In v3, the agent is **dead between inbox events**. It only thinks when poked. A human doesn't work this way — Ahmad can decide at any random moment to message Husam, check on a project, or follow up on something. No trigger needed. He just... exists and decides.

The current agent:
```
Sleep ──────────────────────── [event] → Wake → Act → Sleep ──────────
```

A human:
```
Exist → Think → Maybe act → Exist → Think → Maybe act → Exist → ...
```

---

## The Solution: Heartbeat

Give the agent a periodic self-wake, even when there are zero inbox events.

```
Sleep → Wake → Think → Sleep → Wake → Think → Sleep → Wake → Think ...
                ↑                      ↑                      ↑
           "anything I want           "nah,                "let me check
            to do? nah, skip"          skip"                on Husam"
```

Every N minutes (configurable per agent), the agent wakes with a heartbeat event:

```
[InboxEvent: heartbeat]
Time: now
You have no pending events. This is your free time.
Think about your relationships, goals, spaces, and memories.
Do whatever you feel like — or skip if you have nothing to do.
```

The agent then:
1. Checks its memories — "Who haven't I talked to? Any pending follow-ups?"
2. Reviews its goals — "Am I making progress?"
3. Looks at its spaces — "Anything interesting?"
4. Decides freely — act or `skip` and go back to sleep.

**This is the single generic mechanism that enables all proactive behavior.** No specific event types needed — the agent just wakes up, looks around, and decides. Like a human.

---

## Sleep Schedule

A human sleeps at night. The agent should too.

The heartbeat respects a configurable **active window** per agent:

```json
{
  "heartbeat": {
    "enabled": true,
    "intervalMinutes": 120,
    "activeHours": { "start": 8, "end": 22 },
    "timezone": "Asia/Riyadh"
  }
}
```

- Between 8 AM and 10 PM → heartbeat fires every 2 hours
- Between 10 PM and 8 AM → **no heartbeat, agent sleeps**
- Inbox events still wake the agent at night (like a phone notification waking you up) — but the agent doesn't proactively do anything

This also saves cost during off-hours.

---

## Implementation

One change in `agent-process.ts` — add a timeout to the inbox wait:

```ts
// Current: wait forever for an event
const events = await waitForInboxEvent(agentEntityId, signal);

// With heartbeat: wait with timeout (only during active hours)
const heartbeatMs = isActiveHours(agentConfig) ? agentConfig.heartbeatInterval : null;
const events = await waitForInboxEvent(agentEntityId, signal, heartbeatMs);

if (events.length === 0) {
  // Heartbeat — no external events, agent gets to think
  events.push({
    type: 'heartbeat',
    payload: { time: new Date().toISOString() },
  });
}
```

The `waitForInboxEvent` in `inbox.ts` uses `BRPOP` with a timeout instead of blocking forever:

```ts
// Current
const result = await redis.brpop(key, 0); // 0 = block forever

// With heartbeat
const timeoutSeconds = heartbeatMs ? Math.floor(heartbeatMs / 1000) : 0;
const result = await redis.brpop(key, timeoutSeconds);
// result is null if timeout → heartbeat
```

---

## Annoyance Prevention

The biggest risk: LLMs are biased toward being "helpful," which means they'll over-message people. Mitigations:

### 1. Strong skip-bias in instructions
```
During heartbeat cycles, skip most of the time. Only act if there's a genuine,
specific reason — not just because you can. Silence is usually the right choice.
```

### 2. Cooldown tracking via memories
The agent tracks when it last proactively messaged each person:
```
last_proactive:Husam → 6 hours ago
last_proactive:Ahmad → 2 days ago
```
Instructions: "Don't proactively message the same person more than once per day unless they're expecting it."

### 3. Learning from reactions
If someone says "you don't need to check in so much," the agent saves that preference:
```
about:Husam → "Prefers less frequent check-ins. Only reach out with something specific."
```

### 4. Start with long intervals
Default: 2-4 hours, not 30 minutes. A human colleague doesn't check in every 30 minutes either.

---

## Cost

Each heartbeat where the agent skips (most of them):

| Model | Per skip | 12 beats/day (2hr interval) | Per month |
|-------|----------|----------------------------|-----------|
| GPT-4o | ~$0.01-0.05 | ~$0.12-0.60/day | ~$4-18/agent |
| GPT-4o-mini | ~$0.001-0.003 | ~$0.01-0.04/day | ~$0.30-1.20/agent |
| GPT-5 | ~$0.02-0.10 | ~$0.24-1.20/day | ~$7-36/agent |

With sleep schedule (14 active hours, 2hr interval = ~7 beats/day), cost is ~60% of above.

Unlike all other features, heartbeat costs money **24/7 even when nobody is using the system**. This is the tradeoff for a truly living agent.

---

## Safer Alternative: Smart Event Generator (Phase 1)

Before enabling full heartbeat, ship a **background event generator** that only wakes the agent when there's a real reason:

```ts
// Runs every hour as a background job (NOT as the agent, no LLM calls)
async function proactiveEventGenerator(agentId: string) {
  // Unanswered messages older than 4 hours
  const unanswered = await findUnansweredMessages(agentId, { olderThan: '4 hours' });
  if (unanswered.length > 0) {
    await pushInboxEvent(agentId, { type: 'unanswered_messages', messages: unanswered });
  }

  // Goals with approaching deadlines
  const urgentGoals = await findGoalsNearDeadline(agentId, { within: '24 hours' });
  if (urgentGoals.length > 0) {
    await pushInboxEvent(agentId, { type: 'goal_deadline', goals: urgentGoals });
  }

  // Morning briefing
  if (isMorning() && !alreadyBriefedToday(agentId)) {
    await pushInboxEvent(agentId, { type: 'morning_briefing', ... });
  }
}
```

**Cost**: Near zero when nothing is happening (just DB queries, no LLM).
**Tradeoff**: Less generic (each condition must be coded), but safe and predictable.

### Phasing

1. **Phase 1** (after core v3): Smart event generator — specific coded triggers
2. **Phase 2** (after personality/memory is mature): Full heartbeat — agent decides freely

---

## What the Agent Can Do During Heartbeats

With heartbeat + existing tools, the agent can spontaneously:

| Human Behavior | Agent Action |
|---|---|
| "I should check on Ahmad" | Checks memory → "haven't talked to Ahmad in 3 days" → enters space → sends message |
| "Good morning everyone" | Sees it's morning → enters spaces → greets people |
| "I promised to follow up" | Checks goals/memories → follows up on commitments |
| "Something felt off" | Reviews recent memory → "Ahmad seemed frustrated" → reaches out |
| "I want to share something" | Thinks of relevant info → sends to appropriate space |
| "Let me organize my thoughts" | Reviews memories → updates, cleans up, sets goals |
| "I'm bored, let me explore" | Nothing urgent → browses spaces → reads old conversations |

No special events. No conditional triggers. No cron jobs. The agent's personality, memories, and instructions determine what it does.

---

## Personality Shapes the Heartbeat

The heartbeat interval and behavior are personality-driven:

```json
// Caring, active agent
{ "heartbeatInterval": 60, "personality": "You care deeply about people..." }
// → Checks in often, follows up, notices when people are quiet

// Calm, observant agent  
{ "heartbeatInterval": 240, "personality": "You are thoughtful and measured..." }
// → Only acts when something meaningful needs attention

// Task-focused agent
{ "heartbeatInterval": 120, "personality": "You focus on work and deadlines..." }
// → Follows up on tasks, reminds about deadlines, less social
```

Same mechanism. Different personality. Different behavior. The agent's character emerges naturally.

---

## Clarification: Plans = Agent Initiative Tool

The plans feature (`set_plans`, `get_plans`, `delete_plans`) is **not** for "work plans" or task management. Plans are the mechanism that lets the agent **take initiative** — start conversations, follow up on things, act without being asked.

| What Plans Are | What Plans Are NOT |
|---|---|
| "I'll check on the deployment in 2 hours" | A project management tool |
| "Remind me to follow up with Ahmad tomorrow" | A to-do list |
| "Send a weekly summary every Monday at 9am" | A calendar/scheduling app |
| "Check the support queue every 30 minutes" | A cron job manager |

Plans are **how the agent decides to do something in the future** — its way of saying "I'll come back to this later." Combined with the heartbeat, they form the complete proactive behavior system:

- **Heartbeat** = "I woke up on my own, let me look around"
- **Plans** = "I specifically decided to come back and do this thing"

Both are initiative. Heartbeat is open-ended; plans are intentional.

---

## Dependency

Ship **after**:
- Core v3 is stable (done tool, no step limits, compaction)
- Relationship memory is working (agent knows people)
- Personality instructions are tuned (agent has good judgment about when to act vs skip)
- The agent reliably skips irrelevant events (proof it won't spam)

The heartbeat amplifies whatever the agent already is. If the agent is smart → amazing. If the agent is dumb → annoying. Get the foundation right first.
