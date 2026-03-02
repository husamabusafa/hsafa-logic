# 03 — Consciousness

## Overview

Consciousness is the agent's continuous memory — a `ModelMessage[]` array that persists across every think cycle. Unlike v2 where context was rebuilt from scratch each run (system prompt with space history), v3's consciousness **is** the history. The LLM sees it as one long interaction it walked through, with tool calls it made and results it received.

---

## What Is Consciousness?

Consciousness is an array of `ModelMessage` objects — the same format the Vercel AI SDK uses internally:

```typescript
type ModelMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | ContentPart[] }
  | { role: 'assistant'; content: string | ContentPart[] }
  | { role: 'tool'; content: ToolResultPart[] };
```

After each think cycle, the SDK returns `response.messages` — the new messages generated during that cycle (assistant messages with tool calls, tool result messages). These are appended to consciousness.

---

## How Consciousness Grows

### Cycle 1: Agent wakes, responds to Husam

```
consciousness = [
  { role: 'system', content: '...' },                           // system prompt (identity, instructions, spaces)

  // Inbox event — injected as user message
  { role: 'user', content: 'INBOX (1 event):\n[Family] Husam (human): "Hello!"' },
  
  // Agent's response — from streamText response.messages
  { role: 'assistant', content: [
    { type: 'tool-call', toolCallId: 'tc-001', toolName: 'send_message', args: { text: 'Hi Husam!' } }
  ]},
  { role: 'tool', content: [
    { type: 'tool-result', toolCallId: 'tc-001', result: { success: true, messageId: 'msg-001' } }
  ]},
  { role: 'assistant', content: 'Greeted Husam.' },              // internal reasoning (final text)
]
```

### Cycle 2: Agent wakes, responds to Ahmad

```
consciousness = [
  // ... everything from cycle 1 ...

  // New inbox event
  { role: 'user', content: 'INBOX (1 event):\n[Support] Ahmad (human): "Need the report"' },
  
  // Agent's response
  { role: 'assistant', content: [
    { type: 'tool-call', toolCallId: 'tc-002', toolName: 'enter_space', args: { spaceId: 'space-support' } }
  ]},
  { role: 'tool', content: [
    { type: 'tool-result', toolCallId: 'tc-002', result: { success: true, spaceName: 'Support' } }
  ]},
  { role: 'assistant', content: [
    { type: 'tool-call', toolCallId: 'tc-003', toolName: 'send_message', args: { text: "Here's the report, Ahmad" } }
  ]},
  { role: 'tool', content: [
    { type: 'tool-result', toolCallId: 'tc-003', result: { success: true, messageId: 'msg-002' } }
  ]},
  { role: 'assistant', content: 'Sent report to Ahmad.' },
]
```

### Cycle 3: Agent wakes, Husam asks about Ahmad

```
consciousness = [
  // ... everything from cycles 1 and 2 ...

  // New inbox event
  { role: 'user', content: 'INBOX (1 event):\n[Family] Husam (human): "Did you talk to Ahmad?"' },
  
  // Agent already KNOWS it talked to Ahmad — it's right there in consciousness
  // No need to re-read context, no [SEEN]/[NEW] markers, no system prompt reconstruction
]
```

The agent sees its entire history as **things it already did**. It knows it greeted Husam (cycle 1), sent the report to Ahmad (cycle 2), and can now answer Husam's question naturally.

---

## The System Prompt

The first message in consciousness is always the system prompt. It contains **static** information:

```
IDENTITY:
  name: "ProjectAssistant"
  entityId: "entity-abc-123"

YOUR SPACES:
  - "Family" (id: space-family) — Husam (human), Muhammad (human), You
  - "Support" (id: space-support) — Ahmad (human), You
  - "Daily Reports" (id: space-reports) — You, Sarah (human)

GOALS:
  - Complete Q4 revenue analysis (active)
  - Maintain daily report pipeline (long-term)

MEMORIES:
  - Sarah prefers charts over tables
  - Q4 deadline is Feb 28

PLANS:
  - "Daily Report" (recurring, cron: 0 9 * * *, next: 2026-02-19T09:00:00Z)

INSTRUCTIONS:
  - Your text output is internal reasoning — never shown to anyone. Keep it brief.
  - Use send_message to communicate. Use enter_space to switch spaces.
  - If you have nothing to contribute after reading an inbox event, do nothing.
  - You are a living agent with continuous consciousness. Everything above this line
    is your persistent memory — tool calls you made, messages you sent, events you processed.
```

The system prompt is **refreshed** at the start of each cycle to update dynamic fields (current time, spaces list, goals, memories, plans). The rest of consciousness (all the ModelMessages from previous cycles) stays as-is.

---

## Sliding Window

Consciousness grows with every cycle. Without limits, it would exceed the model's context window. The **sliding window** keeps consciousness within a token budget.

### Window Strategy

```
┌────────────────────────────────────────────────────────┐
│  System Prompt (always kept)                           │
├────────────────────────────────────────────────────────┤
│  [Compacted Summary] (if old messages were trimmed)    │
├────────────────────────────────────────────────────────┤
│  ... older cycles (may be trimmed) ...                 │
│                                                        │
│  Cycle N-5: inbox event + agent response               │
│  Cycle N-4: inbox event + agent response               │
│  Cycle N-3: inbox event + agent response               │
│  Cycle N-2: inbox event + agent response               │
│  Cycle N-1: inbox event + agent response               │
│  Cycle N (current): inbox event                        │
│                                                        │
│  ← keep recent cycles, trim oldest first               │
└────────────────────────────────────────────────────────┘
```

### Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `maxConsciousnessTokens` | 100,000 | Maximum tokens in consciousness |
| `minRecentCycles` | 10 | Always keep at least the last N cycles |

### When Compaction Triggers

After each cycle, `compactConsciousness()` checks the token count:

```typescript
async function compactConsciousness(consciousness: ModelMessage[]): Promise<ModelMessage[]> {
  const tokenCount = estimateTokens(consciousness);
  
  if (tokenCount <= MAX_CONSCIOUSNESS_TOKENS) {
    return consciousness; // No compaction needed
  }
  
  // Keep: system prompt + last N cycles (full detail)
  const systemPrompt = consciousness[0];
  const recentCycles = extractLastNCycles(consciousness, MIN_RECENT_CYCLES);
  const oldCycles = extractOlderCycles(consciousness, MIN_RECENT_CYCLES);
  
  // For old cycles, keep only the agent's final text (self-summary) from each cycle.
  // The agent already summarizes what it did at the end of every cycle as its
  // internal reasoning text — no separate summarization model needed.
  const summaries = extractCycleSummaries(oldCycles);
  
  return [
    systemPrompt,
    { role: 'user', content: `[EARLIER CYCLES — self-summaries]\n${summaries.join('\n')}` },
    ...recentCycles,
  ];
}

function extractCycleSummaries(cycles: ModelMessage[]): string[] {
  // Each cycle ends with an assistant text message — the agent's own summary.
  // Extract just those, discarding the full tool calls and results.
  return cycles
    .filter(m => m.role === 'assistant' && typeof m.content === 'string')
    .map(m => m.content as string);
}
```

---

## Compaction Strategies

### Default: Self-Summary Compaction

The agent's own final text output at the end of each cycle naturally serves as a summary of what it did. The system prompt instructs the agent to end each cycle with a brief summary:

```
After completing your actions, end with a brief summary of what you did.
Format: "Responded to [who] about [topic]. [Key actions taken]. [What's pending]."
```

When compaction triggers, old cycles are replaced with just these self-summaries — no extra LLM call needed:

```
Before compaction (50 cycles, 100K tokens):
  Cycle 1: [inbox event] + [tool calls] + [tool results] + [self-summary]
  Cycle 2: [inbox event] + [tool calls] + [tool results] + [self-summary]
  ...

After compaction:
  [EARLIER CYCLES — self-summaries]
  Cycle 1: "Searched hotels in Tokyo for Husam. Sent 3 options. Waiting for his pick."
  Cycle 2: "Booked Hotel Sunroute Plaza, March 15-20. Confirmed with Husam."
  ...
  Cycle 40: "Reminded Husam about checkout tomorrow."
  
  Cycle 41-50: FULL (recent, kept intact)
```

This is the primary compaction strategy — zero cost, zero latency, and the summaries are high-quality because the agent wrote them itself with full context.

### Advanced: Semantic Relevance

Use embeddings to keep the **most relevant** old messages, not just the most recent:

```typescript
async function semanticCompaction(
  consciousness: ModelMessage[],
  currentInbox: InboxEvent[]
): Promise<ModelMessage[]> {
  // Embed the current inbox events
  const { embedding: queryEmbedding } = await embed({
    model: embeddingModel,
    value: formatInboxEvents(currentInbox),
  });
  
  // Embed each old cycle
  const oldCycles = extractOlderCycles(consciousness, MIN_RECENT_CYCLES);
  const { embeddings } = await embedMany({
    model: embeddingModel,
    values: oldCycles.map(c => JSON.stringify(c.content).slice(0, 500)),
  });
  
  // Rank by relevance to current inbox
  const ranked = oldCycles.map((cycle, i) => ({
    cycle,
    similarity: cosineSimilarity(queryEmbedding, embeddings[i]),
  })).sort((a, b) => b.similarity - a.similarity);
  
  // Keep top-K most relevant (full detail) + self-summaries for the rest
  const relevant = ranked.slice(0, TOP_K).map(r => r.cycle);
  const rest = ranked.slice(TOP_K).map(r => r.cycle);
  const summaries = extractCycleSummaries(rest);
  
  return [
    consciousness[0], // system prompt
    { role: 'user', content: `[EARLIER CYCLES — self-summaries]\n${summaries.join('\n')}` },
    ...relevant,
    ...extractLastNCycles(consciousness, MIN_RECENT_CYCLES),
  ];
}
```

This ensures that when Husam asks about the API discussion from 200 cycles ago, the agent remembers it — because it was semantically relevant.

### Advanced: Layered Compaction

Multiple compression levels for different time horizons, all using the agent's own self-summaries:

```
Recent (last 10 cycles):     Full ModelMessage[] — exact tool calls, results, reasoning
Medium (cycles 11-50):       Self-summary per cycle — "Responded to Ahmad about report. Sent draft."
Old (cycles 50+):            Grouped self-summaries — "Cycles 50-80: Handled support tickets for Ahmad, Husam, Sara. Key decisions: ..."
```

This mirrors human memory: vivid for recent events, fading to summaries for older ones. No separate LLM call needed — the agent already wrote the summaries as part of its natural reasoning.

---

## Persistence

Consciousness is persisted to the database after every think cycle.

### Storage Model

```prisma
model AgentConsciousness {
  id              String   @id @default(uuid()) @db.Uuid
  agentEntityId   String   @unique @map("agent_entity_id") @db.Uuid
  messages        Json     // ModelMessage[] serialized as JSON
  cycleCount      Int      @default(0) @map("cycle_count")
  tokenEstimate   Int      @default(0) @map("token_estimate")
  lastCycleAt     DateTime @default(now()) @map("last_cycle_at")
  updatedAt       DateTime @updatedAt @map("updated_at")
  
  entity          Entity   @relation(fields: [agentEntityId], references: [id])
  
  @@map("agent_consciousness")
}
```

### Load / Save

```typescript
async function loadConsciousness(agentEntityId: string): Promise<ModelMessage[]> {
  const record = await prisma.agentConsciousness.findUnique({
    where: { agentEntityId },
  });
  if (!record) return [buildSystemPrompt(agentEntityId)];
  return record.messages as ModelMessage[];
}

async function saveConsciousness(
  agentEntityId: string,
  consciousness: ModelMessage[],
  cycleCount: number
): Promise<void> {
  await prisma.agentConsciousness.upsert({
    where: { agentEntityId },
    create: {
      agentEntityId,
      messages: consciousness as any,
      cycleCount,
      tokenEstimate: estimateTokens(consciousness),
    },
    update: {
      messages: consciousness as any,
      cycleCount,
      tokenEstimate: estimateTokens(consciousness),
      lastCycleAt: new Date(),
    },
  });
}
```

### Crash Recovery

If the process crashes mid-cycle:
1. The last saved consciousness is loaded on restart
2. Any inbox events that were drained but not processed remain lost (they were already popped from Redis)
3. However, the source events (space messages) are still in the DB — a recovery mechanism can re-push unprocessed messages to the inbox

To mitigate data loss, the inbox can use Redis Streams instead of Lists, which support acknowledgment:
- `XREADGROUP` to read events
- `XACK` after successful processing
- Unacknowledged events are re-delivered on restart

---

## System Prompt Refresh

The system prompt (first message in consciousness) is refreshed at the start of each cycle to reflect current state:

```typescript
function refreshSystemPrompt(consciousness: ModelMessage[], agentId: string): ModelMessage[] {
  const newSystemPrompt = buildSystemPrompt(agentId); // reads spaces, goals, memories, plans from DB
  return [newSystemPrompt, ...consciousness.slice(1)];
}
```

This ensures:
- Current time is accurate
- Space membership is up-to-date
- Goals and memories reflect latest changes
- Plans show correct next-run times

The rest of consciousness (all previous cycles) is untouched.

---

## What Consciousness Replaces

| v2 Mechanism | v3 Replacement |
|-------------|----------------|
| System prompt with `[SEEN]`/`[NEW]` markers | Consciousness already contains everything the agent saw |
| `lastProcessedMessageId` per space | Not needed — inbox events are in consciousness |
| Space history rebuilt from DB every run | Space context entered via `enter_space` tool; history in consciousness |
| `ACTIVE RUNS` block | Not needed — one process, no concurrent runs |
| Trigger block in system prompt | Inbox events are user messages in consciousness |
| Cross-space origin annotations | Tool calls in consciousness show the full decision chain |

---

## Key Properties

1. **Continuity** — The agent never "forgets" between cycles. Every previous action is right there in the ModelMessage array.

2. **Self-awareness** — The agent can see its own past tool calls and reasoning. It knows WHY it sent a message, not just THAT it sent one.

3. **Efficiency** — Context isn't rebuilt from scratch. Only new inbox events and the refreshed system prompt are added.

4. **Graceful degradation** — When consciousness is compacted, old details are summarized, not lost entirely. Important facts survive in memories.

5. **Model-native format** — Consciousness uses the exact `ModelMessage[]` format the SDK expects. No conversion needed.
