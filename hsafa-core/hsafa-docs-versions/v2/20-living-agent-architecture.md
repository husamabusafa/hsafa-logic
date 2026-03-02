# Living Agent Architecture

> Agents as persistent processes with continuous consciousness — not request-response functions.

## Problem Statement

Current architecture: every message → new run → fresh `streamText` → system prompt reconstructs context → run completes → agent dies.

This causes:
1. **Duplicate work** — 3 messages arriving in 2 seconds = 3 parallel runs, each unaware of the others
2. **No real continuity** — context is reconstructed from space history in the system prompt, not from the agent's own decision chain
3. **No cross-space unified awareness** — each run only knows what the system prompt tells it about other spaces
4. **No mid-task awareness** — if a message arrives while the agent is working, it can't see it until a new run starts

## Core Idea

Instead of agents being **functions** (called → execute → return → die), they become **processes** (always alive, receiving events, maintaining continuous thought).

One agent = one persistent process = one continuous chain of real `ModelMessage[]` = one entity that experiences everything across all spaces.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                    AGENT PROCESS                         │
│                                                          │
│  ┌──────────┐    ┌───────────────┐    ┌──────────────┐  │
│  │  INBOX   │───▶│  THINK CYCLE  │───▶│     ACT      │  │
│  │ (Redis)  │    │ (streamText)  │    │ (tools/msgs) │  │
│  └──────────┘    └───────────────┘    └──────────────┘  │
│       ▲                │                     │           │
│       │                ▼                     │           │
│       │     ┌───────────────────┐            │           │
│       │     │   CONSCIOUSNESS   │◀───────────┘           │
│       │     │  (ModelMessage[]) │                        │
│       │     │  sliding window   │                        │
│       │     └───────────────────┘                        │
│       │                                                  │
│  SLEEP ◀─── no events ─── LOOP BACK ◀── check inbox ──  │
│    │                                                     │
│    └── wakeup signal (Redis pub/sub) ─────────────────── │
└──────────────────────────────────────────────────────────┘
        ▲
   ┌────┴───────────────────────────────────┐
   │  Space A: message from Husam           │
   │  Space B: message from Ahmad           │
   │  Space C: Agent-B says "done"          │
   │  Timer: scheduled plan fires           │
   │  Service: Jira webhook                 │
   └────────────────────────────────────────┘
```

### The Process Loop (Pseudocode)

```typescript
async function agentProcess(agentId: string) {
  // Load consciousness from DB (last N steps)
  const consciousness: ModelMessage[] = await loadConsciousness(agentId, WINDOW_SIZE);
  
  while (true) {
    // 1. Sleep until inbox has events (zero CPU)
    await waitForWakeup(agentId); // Redis BLPOP or pub/sub
    
    // 2. Drain ALL queued events at once
    const events = await drainInbox(agentId);
    if (events.length === 0) continue;
    
    // 3. Format events as a user message and inject into consciousness
    const inboxMessage: ModelMessage = {
      role: 'user',
      content: formatInboxEvents(events),
    };
    consciousness.push(inboxMessage);
    
    // 4. Think + Act
    const stream = streamText({
      model,
      system: buildSystemPrompt(agentId), // identity, tools, spaces
      messages: consciousness.slice(-WINDOW_SIZE), // sliding window
      tools,
      stopWhen: stepCountIs(MAX_STEPS_PER_CYCLE),
      prepareStep: async ({ stepNumber, messages }) => {
        // Between each tool call, check inbox for urgent events
        const urgent = await peekInbox(agentId);
        if (urgent.length > 0) {
          const urgentEvents = await drainInbox(agentId);
          const injection: ModelMessage = {
            role: 'user',
            content: formatInboxEvents(urgentEvents, { label: 'MID-CYCLE UPDATE' }),
          };
          return {
            messages: [...messages, injection],
          };
        }
        
        // Sliding window: trim if growing too large
        if (messages.length > WINDOW_SIZE) {
          return {
            messages: [
              messages[0], // keep initial system context
              ...messages.slice(-(WINDOW_SIZE - 1)),
            ],
          };
        }
        
        return {};
      },
    });
    
    // 5. Process stream (emit SSE events to spaces, persist messages, etc.)
    await processStream(stream.fullStream, { ... });
    
    // 6. Capture model's response messages and append to consciousness
    const responseMessages = (await stream.response).messages;
    consciousness.push(...responseMessages);
    
    // 7. Persist consciousness snapshot to DB
    await saveConsciousness(agentId, consciousness);
    
    // 8. Loop back → check inbox again
  }
}
```

---

## Key Components

### 1. Inbox (Redis Queue)

Every agent has a Redis list: `inbox:{agentEntityId}`.

All events go here instead of triggering runs:
- Space messages (human or agent)
- Service triggers (Jira, Slack, cron)
- Plan triggers (scheduled tasks)
- System events (agent mentioned, timer fired)

```typescript
interface InboxEvent {
  id: string;
  type: 'space_message' | 'service_trigger' | 'plan_trigger' | 'mention' | 'timer';
  timestamp: string;
  // Space message fields
  spaceId?: string;
  spaceName?: string;
  senderEntityId?: string;
  senderName?: string;
  senderType?: 'human' | 'agent';
  messageContent?: string;
  messageId?: string;
  // Service trigger fields
  serviceName?: string;
  payload?: Record<string, unknown>;
  // Plan trigger fields
  planId?: string;
  planName?: string;
  planInstruction?: string;
}
```

**Push to inbox** (replaces `triggerAllAgents` / `createAndExecuteRun`):

```typescript
async function pushToInbox(agentEntityId: string, event: InboxEvent): Promise<void> {
  await redis.rpush(`inbox:${agentEntityId}`, JSON.stringify(event));
  await redis.publish(`wakeup:${agentEntityId}`, '1'); // wake the process
}
```

### 2. Consciousness (ModelMessage[])

The accumulated `ModelMessage[]` from all think cycles. This is the **real** model message chain — not a system prompt reconstruction.

```typescript
// What the model sees as its continuous experience:

// Cycle 1: Husam asked about API
{ role: 'user', content: '[INBOX - 1 event]\n1. [Space "Project"] Husam: "Check the API status"\n   → 2s ago' }
{ role: 'assistant', content: [{ type: 'tool-call', toolName: 'readSpaceMessages', ... }] }
{ role: 'tool', content: [{ type: 'tool-result', ... }] }
{ role: 'assistant', content: [{ type: 'tool-call', toolName: 'sendSpaceMessage', input: { spaceId: '...', text: 'API is healthy' } }] }
{ role: 'tool', content: [{ type: 'tool-result', output: { success: true } }] }

// Cycle 2: Ahmad + Agent-B messaged while agent was sleeping
{ role: 'user', content: '[INBOX - 2 events]\n1. [Space "Design"] Ahmad: "What about the UI?"\n   → 3s ago\n2. [Space "Project"] Agent-B: "Migration done"\n   → 1s ago' }
{ role: 'assistant', content: [{ type: 'tool-call', toolName: 'sendSpaceMessage', input: { spaceId: 'project-id', text: 'Migration confirmed, deploying now' } }] }
{ role: 'tool', content: [{ type: 'tool-result', ... }] }
{ role: 'assistant', content: [{ type: 'tool-call', toolName: 'sendSpaceMessage', input: { spaceId: 'design-id', text: 'Mockup looks good, one suggestion...' } }] }
{ role: 'tool', content: [{ type: 'tool-result', ... }] }

// Cycle 3: Husam follows up — agent has FULL real context
{ role: 'user', content: '[INBOX - 1 event]\n1. [Space "Project"] Husam: "Great, deploy it"\n   → 0.5s ago' }
// Agent remembers: it already checked API, migration is done, already told Husam API is healthy
// No duplicate work. Responds with deployment action immediately.
```

**Storage**: `consciousness` JSON column on a new `AgentProcess` table (or reuse Run with status `alive`).

**Persistence**: After each think cycle, the full consciousness array is saved. On gateway restart, the agent process loads consciousness from DB and resumes.

### 3. Inbox Formatting

When the agent wakes up, events are formatted into a user message:

```
[INBOX - 3 new events]

1. [Space "Husam's Project" | spaceId: abc-123] Husam (human): "Can you check the API status?"
   → received 2.1s ago

2. [Space "Design Team" | spaceId: def-456] Ahmad (human): "What do you think about this UI mockup?"
   → received 1.4s ago

3. [Space "Husam's Project" | spaceId: abc-123] Agent-B (agent): "I've finished the database migration."
   → received 0.5s ago

You may address these in any order. Consider priorities and relationships between requests.
```

For mid-cycle injections:

```
[MID-CYCLE UPDATE - 1 new event]

1. [Space "Husam's Project" | spaceId: abc-123] Husam (human): "Actually, cancel that — don't deploy yet."
   → received just now
```

### 4. Sleep / Wakeup

The agent process does **not** poll. It sleeps (blocked, zero CPU) until a wakeup signal arrives:

```typescript
async function waitForWakeup(agentEntityId: string): Promise<void> {
  // Block until a message arrives on the wakeup channel
  // BLPOP on a dedicated wakeup list, or subscribe to pub/sub channel
  await redis.blpop(`wakeup:${agentEntityId}`, 0); // 0 = block forever
}
```

Wakeup signals come from:
- **Message received** in any of the agent's spaces
- **Service trigger** via API
- **Plan timer** fires
- **Another agent mentions** this agent
- **Self-scheduled timer** (agent can set timers to wake itself up)

### 5. Run Model Mapping

Instead of creating a new Run per event, the Living Agent uses **one persistent Run** per agent:

| Field | Value |
|-------|-------|
| `status` | `alive` (processing), `sleeping` (idle), `paused` (waiting for client tool) |
| `triggerType` | `process` (new type) |
| `modelMessages` | The full consciousness array (JSON) |
| `metadata.cycleCount` | Number of think cycles completed |
| `metadata.lastCycleAt` | Timestamp of last think cycle |
| `metadata.totalTokensUsed` | Running token count |

Or, introduce a new `AgentProcess` model:

```prisma
model AgentProcess {
  id              String   @id @default(uuid())
  agentId         String   @unique
  agentEntityId   String   @unique
  status          String   @default("sleeping") // sleeping | alive | paused
  consciousness   Json     @default("[]") // ModelMessage[]
  cycleCount      Int      @default(0)
  totalInputTokens  BigInt @default(0)
  totalOutputTokens BigInt @default(0)
  lastCycleAt     DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  agent       Agent  @relation(fields: [agentId], references: [id])
  agentEntity Entity @relation(fields: [agentEntityId], references: [id])
}
```

### 6. Consciousness Compaction (Long-Term Memory)

Over hundreds of cycles, the consciousness grows. A sliding window keeps the last N messages, but old messages are **compacted** — not just dropped:

```typescript
async function compactConsciousness(
  agentId: string,
  consciousness: ModelMessage[],
  windowSize: number,
): Promise<ModelMessage[]> {
  if (consciousness.length <= windowSize) return consciousness;
  
  // Split into old (to compact) and recent (to keep)
  const splitPoint = consciousness.length - windowSize;
  const oldMessages = consciousness.slice(0, splitPoint);
  const recentMessages = consciousness.slice(splitPoint);
  
  // Summarize old messages using a lightweight model
  const { text: summary } = await generateText({
    model: compactionModel, // gpt-4o-mini — cheap, fast
    system: 'Summarize this agent activity log into a compact memory. Include: key decisions made, important facts learned, pending commitments, relationships between entities, and anything the agent should remember.',
    prompt: JSON.stringify(oldMessages),
  });
  
  // Store the summary as a system message at the start
  const compactedMemory: ModelMessage = {
    role: 'user',
    content: `[COMPACTED MEMORY — cycles 1-${splitPoint}]\n${summary}`,
  };
  
  // Also persist the full old messages to a separate archive table
  await archiveConsciousness(agentId, oldMessages);
  
  return [compactedMemory, ...recentMessages];
}
```

**How it appears to the model**:

```
[COMPACTED MEMORY — cycles 1-200]
Over 200 cycles: helped Husam debug API issues in "Project Space" (resolved — API was returning 500 due to missing env var). Coordinated with Agent-B on database migration (completed successfully). Reviewed Ahmad's UI mockup in "Design Space" (approved with 2 changes: header font size, button color). Deployed v2.1 to production. Husam prefers concise answers. Ahmad likes detailed explanations.

[INBOX - 1 event]  ← cycle 201
1. [Space "Project"] Husam: "Can you check on the v2.2 release?"
...
```

The model has a compressed understanding of everything that happened before, plus full detail for recent events.

---

## Scenarios

### Scenario 1: Simple Question-Answer

```
State: Agent is SLEEPING

t=0.0s  Husam sends "What's 2+2?" in Space A
        → pushToInbox(agentEntityId, { type: 'space_message', ... })
        → Redis wakeup signal

t=0.0s  Agent process wakes up
        Drains inbox → 1 event
        Formats: [INBOX - 1 event] Husam: "What's 2+2?"
        Appends to consciousness
        
t=0.0s  streamText starts → model sees full consciousness
        Agent calls sendSpaceMessage("4")
        Response streams to Husam instantly

t=0.8s  streamText finishes
        Response messages appended to consciousness
        Consciousness saved to DB
        Agent checks inbox → empty → goes back to SLEEPING

TOTAL LATENCY: Same as current architecture (~0.8s for simple response)
```

### Scenario 2: Batched Messages (The Killer Feature)

```
State: Agent is processing Husam's "Check the API" request (ALIVE)

t=0.0s  Agent starts think cycle for Husam's request
t=0.1s  Agent calls readSpaceMessages for API logs
t=0.3s  Ahmad sends "What about the UI?" in Space B
        → pushed to inbox (agent is busy, not sleeping)
t=0.4s  Agent-B sends "Migration done" in Space A
        → pushed to inbox
t=0.5s  API check tool returns result
t=0.6s  Agent calls sendSpaceMessage(Space A, "API is healthy")
t=0.8s  Think cycle finishes

t=0.8s  Agent loops back → drains inbox → 2 events!
        Formats: [INBOX - 2 events]
        1. Ahmad in "Design": "What about the UI?" (0.5s ago)
        2. Agent-B in "Project": "Migration done" (0.4s ago)
        
        Agent thinks: "Ahmad asked about UI, Agent-B says migration done.
        The migration is related to what I just told Husam. Let me update
        Husam with the migration news AND respond to Ahmad."
        
t=0.8s  Agent calls sendSpaceMessage(Space A, "Also — Agent-B confirmed migration is done!")
t=1.0s  Agent calls sendSpaceMessage(Space B, "The mockup looks good, here's my feedback...")
t=1.5s  Think cycle finishes → inbox empty → SLEEPING

RESULT: 
- Zero duplicate work (migration info combined with API check)
- Ahmad's message handled 1.2s after sending (fast)
- Agent naturally cross-referenced information across spaces
```

### Scenario 3: Mid-Cycle Interruption

```
State: Agent is running a complex 5-tool operation for Husam

t=0.0s  Agent starts: read data → analyze → generate report → ...
t=0.5s  Tool #1 (readSpaceMessages) returns
t=0.5s  prepareStep fires → checks inbox → empty → continue
t=0.8s  Tool #2 (analyzeData) returns
t=0.8s  prepareStep fires → checks inbox → 1 URGENT event!
        Husam: "Stop! Wrong dataset. Use the Q3 data instead."
        
        prepareStep injects:
        [MID-CYCLE UPDATE - 1 event]
        Husam in "Project": "Stop! Wrong dataset. Use the Q3 data instead."
        
t=0.8s  Model sees the interruption, adjusts plan:
        "User corrected the dataset. I'll switch to Q3 data."
        Calls readSpaceMessages to get Q3 data, continues from there.

RESULT: Agent didn't waste time finishing with wrong data.
        No need to cancel + restart. Natural course correction.
```

### Scenario 4: Multi-Agent Conversation

```
Agent-A (Product Manager) and Agent-B (Engineer) in Space "Planning"

t=0.0s  Husam: "@Agent-A I need a feature spec for dark mode"
        → pushed to Agent-A's inbox

t=0.0s  Agent-A wakes, processes inbox
        Agent-A calls sendSpaceMessage(Space "Planning", "I'll draft the spec. 
        @Agent-B, what's the technical complexity?")
        → message posted → pushed to Agent-B's inbox

t=0.5s  Agent-B wakes, processes inbox
        Consciousness shows: Agent-A asked about dark mode complexity
        Agent-B calls sendSpaceMessage(Space "Planning", "Medium complexity. 
        Need to update theme provider + 3 component libraries. ~2 days.")
        → pushed to Agent-A's inbox

t=1.0s  Agent-A wakes, processes inbox
        Consciousness shows: full conversation — Husam's request, own question, Agent-B's answer
        Agent-A calls sendSpaceMessage(Space "Planning", "Here's the spec:
        1. Dark mode toggle (2 days — Agent-B confirmed)
        2. Theme persistence (0.5 days)
        3. User preference sync (1 day)
        Total: 3.5 days")

Each agent maintains its own continuous consciousness.
The conversation is natural — like humans chatting.
```

### Scenario 5: Proactive Behavior (Self-Scheduled Wakeup)

```
Agent has a scheduled task: check server health every hour

t=0     Agent sets timer: pushToInbox in 1 hour
t=3600  Timer fires → inbox event: { type: 'timer', ... }
        Agent wakes → consciousness shows the timer event
        Agent checks server health, finds issue
        Agent calls sendSpaceMessage(Space "Ops", "⚠️ Server CPU at 95%")
        Agent sets next timer
        Agent goes back to SLEEPING

No human triggered this. The agent is proactive.
```

### Scenario 6: Client Tool (Waiting for Human Input)

```
t=0.0s  Agent needs human confirmation (confirmAction tool)
        Think cycle hits client tool (no execute function)
        streamText stops (AI SDK behavior)
        
        Agent process enters PAUSED state
        Pending tool call persisted to DB
        UI shows confirmation dialog to human
        
t=5.0s  Human clicks "Confirm"
        Tool result submitted via REST API
        → pushed to inbox as special event: { type: 'tool_result', ... }
        → wakeup signal
        
t=5.0s  Agent wakes, drains inbox
        Sees tool result event
        Injects tool result into consciousness:
        { role: 'tool', content: [{ type: 'tool-result', ... }] }
        
        Continues think cycle from where it left off
        Full consciousness intact — knows exactly what it was doing

RESULT: Same UX as current waiting_tool, but fits naturally into the process model.
```

### Scenario 7: Gateway Restart Recovery

```
t=0     Gateway crashes or restarts

t=1     Gateway starts up
        Loads all AgentProcess records where status != 'dead'
        For each agent: 
          - Load consciousness from DB
          - Check inbox (Redis persisted)
          - If inbox has events → start think cycle immediately
          - If inbox empty → enter SLEEPING state

RESULT: Agents resume exactly where they left off.
        Consciousness is fully persisted. Zero data loss.
```

---

## Technical Feasibility with Vercel AI SDK v6

### ✅ Manual Agent Loop — FULLY SUPPORTED

The SDK's [Manual Agent Loop](cookbook/05-node/55-manual-agent-loop.mdx) pattern is exactly what the Living Agent needs:

```typescript
// From SDK docs:
const messages: ModelMessage[] = [{ role: 'user', content: '...' }];

while (true) {
  const result = streamText({ model, messages, tools });
  const responseMessages = (await result.response).messages;
  messages.push(...responseMessages);
  // ... handle tool calls, add tool results, loop
}
```

The Living Agent wraps this pattern with:
- `messages` = `consciousness` (persisted across cycles)
- The outer `while(true)` = the process loop with inbox/wakeup
- `responseMessages` captured and appended to consciousness after each cycle

### ✅ `response.messages` — Model Messages Capture

The SDK provides `(await result.response).messages` which returns the full `ModelMessage[]` chain that the model generated. This is exactly what we need to append to consciousness:

```typescript
// After each think cycle:
const responseMessages = (await streamResult.response).messages;
consciousness.push(...responseMessages);
```

These include:
- `{ role: 'assistant', content: [{ type: 'tool-call', ... }] }`
- `{ role: 'tool', content: [{ type: 'tool-result', ... }] }`  
- `{ role: 'assistant', content: [{ type: 'text', text: '...' }] }`

All in the correct AI SDK v6 format. Pass them back to the next `streamText` call and the model continues seamlessly.

### ✅ `prepareStep` — Mid-Cycle Inbox Injection

The SDK's `prepareStep` callback runs **between each tool call step**:

```typescript
prepareStep: async ({ stepNumber, messages }) => {
  // Check inbox for urgent events
  const urgent = await peekInbox(agentEntityId);
  if (urgent.length > 0) {
    const events = await drainInbox(agentEntityId);
    return {
      messages: [...messages, {
        role: 'user',
        content: formatInboxEvents(events, { label: 'MID-CYCLE UPDATE' }),
      }],
    };
  }
  
  // Sliding window management
  if (messages.length > WINDOW_SIZE) {
    return {
      messages: [messages[0], ...messages.slice(-(WINDOW_SIZE - 1))],
    };
  }
  
  return {};
}
```

From the SDK docs: `prepareStep` can return modified `messages`, `model`, `tools`, `activeTools`, `toolChoice`. This gives us:
- **Mid-cycle event injection** — inject new inbox events between tool calls
- **Context window management** — trim old messages to stay within token limits
- **Dynamic model switching** — use cheaper model for simple responses, stronger for complex

### ✅ `stopWhen` — Cycle Step Limits

```typescript
stopWhen: stepCountIs(MAX_STEPS_PER_CYCLE), // e.g., 30 steps max per cycle
```

Prevents a single think cycle from running forever. After the limit, the agent completes the cycle and loops back to check inbox.

### ✅ `fullStream` — Real-Time Streaming

`streamText.fullStream` emits events across all steps within a cycle. The existing `stream-processor.ts` works unchanged:
- `text-delta` → stream to spaces
- `tool-call` → emit visible tool events
- `tool-input-delta` → partial arg streaming for display tools

### ✅ Tools Without `execute` — Client Tool Pause

Tools without an `execute` function stop the SDK loop automatically. This maps perfectly to client tools (confirmAction, etc.). The agent process enters PAUSED state until the tool result arrives via inbox.

### ✅ `ModelMessage` Type — Serializable

`ModelMessage` from the AI SDK is a plain JSON-serializable type. It can be stored in a Postgres JSON column and loaded back:

```typescript
// Save
await prisma.agentProcess.update({
  where: { agentEntityId },
  data: { consciousness: consciousness as any },
});

// Load
const process = await prisma.agentProcess.findUnique({ where: { agentEntityId } });
const consciousness: ModelMessage[] = process.consciousness as ModelMessage[];
```

### ⚠️ Caveat: Token Accumulation

Each cycle sends the full consciousness window to the LLM. A 100-message window could be 50k+ tokens of input per cycle. Mitigations:

1. **Sliding window** — only send last N messages (e.g., 100)
2. **Compaction** — summarize old messages into compact memory
3. **`prepareStep` trimming** — dynamically adjust window based on token count
4. **Model routing** — use cheap model for simple responses, expensive for complex

With GPT-4o at $2.50/M input tokens: 50k tokens/cycle × 100 cycles/day = $12.50/day per agent. Not cheap, but the user said cost is not a concern.

---

## What Changes from Current Architecture

### Replaced

| Current | Living Agent |
|---------|-------------|
| `agent-trigger.ts` → `createAndExecuteRun()` | `pushToInbox()` |
| `run-runner.ts` → `executeRun()` | `agentProcess()` loop |
| `prompt-builder.ts` → system prompt with reconstructed history | System prompt (identity only) + consciousness (real messages) |
| Run per message | One persistent process per agent |
| `triggerAllAgents()` | `pushToInbox()` for each agent |

### Unchanged

| Component | Why |
|-----------|-----|
| `stream-processor.ts` | Still intercepts `fullStream` events — same interface |
| `smartspace-events.ts` | Still emits Redis pub/sub events to spaces |
| `smartspace-db.ts` | Still persists messages to DB |
| All prebuilt tools (`sendSpaceMessage`, `readSpaceMessages`, etc.) | Still work — called during think cycles |
| React SDK (`useHsafaRuntime.ts`) | Still listens to space SSE — doesn't care about run model |
| UI SDK | Unchanged |
| REST API routes | Messages route pushes to inbox instead of triggering |

### New Components

| Component | Purpose |
|-----------|---------|
| `agent-process.ts` | The main process loop |
| `inbox.ts` | Redis inbox queue management |
| `consciousness.ts` | Load/save/compact consciousness |
| `process-manager.ts` | Start/stop/restart agent processes, handle gateway lifecycle |
| `AgentProcess` Prisma model | Persist consciousness + process state |

---

## Database Schema Changes

```prisma
model AgentProcess {
  id                String   @id @default(uuid())
  agentId           String   @unique
  agentEntityId     String   @unique
  status            String   @default("sleeping") // sleeping, alive, paused
  consciousness     Json     @default("[]")
  compactedMemory   String?  @db.Text // compressed summary of old cycles
  cycleCount        Int      @default(0)
  totalInputTokens  BigInt   @default(0)
  totalOutputTokens BigInt   @default(0)
  lastCycleAt       DateTime?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  agent       Agent  @relation(fields: [agentId], references: [id])
  agentEntity Entity @relation(fields: [agentEntityId], references: [id])

  @@map("agent_processes")
}

// Optional: archive old consciousness for debugging/replay
model ConsciousnessArchive {
  id              String   @id @default(uuid())
  agentProcessId  String
  fromCycle       Int
  toCycle         Int
  messages        Json     // archived ModelMessage[]
  summary         String?  @db.Text
  createdAt       DateTime @default(now())

  agentProcess AgentProcess @relation(fields: [agentProcessId], references: [id])

  @@map("consciousness_archives")
}
```

---

## Process Lifecycle Management

### Gateway Startup

```typescript
// In index.ts
async function startAllAgentProcesses() {
  const processes = await prisma.agentProcess.findMany({
    where: { status: { not: 'dead' } },
  });
  
  for (const proc of processes) {
    spawnAgentProcess(proc.agentEntityId); // non-blocking
  }
}
```

### Agent Creation

When a new agent is created via API, an `AgentProcess` record is created and the process is spawned:

```typescript
// In agents.ts route, after creating agent + entity
await prisma.agentProcess.create({
  data: { agentId: agent.id, agentEntityId: entity.id },
});
spawnAgentProcess(entity.id);
```

### Agent Deletion

```typescript
await killAgentProcess(agentEntityId); // abort + cleanup
await prisma.agentProcess.update({
  where: { agentEntityId },
  data: { status: 'dead' },
});
```

### Horizontal Scaling

For multi-instance deployments, each gateway instance claims agents via a Redis lock:

```typescript
async function claimAgent(agentEntityId: string, instanceId: string): Promise<boolean> {
  // SET NX with TTL — only one instance runs each agent
  const claimed = await redis.set(
    `process-lock:${agentEntityId}`,
    instanceId,
    'NX',
    'EX',
    30, // 30s TTL, refresh while alive
  );
  return claimed === 'OK';
}
```

---

## Implementation Order

1. **`inbox.ts`** — Redis inbox queue (push, drain, peek, wakeup)
2. **`consciousness.ts`** — Load/save/compact consciousness to/from DB
3. **`AgentProcess` Prisma model** — Schema + migration
4. **`agent-process.ts`** — The main process loop (replaces run-runner for process agents)
5. **`process-manager.ts`** — Lifecycle management (spawn, kill, restart)
6. **Update `smart-spaces.ts` messages route** — `pushToInbox` instead of `triggerAllAgents`
7. **Update `agents.ts` trigger route** — `pushToInbox` instead of `createAndExecuteRun`
8. **Compaction** — Implement consciousness compaction with summarization
9. **Mid-cycle injection** — Wire `prepareStep` inbox checking
10. **Gateway startup/shutdown** — Process lifecycle hooks in `index.ts`
11. **Proactive timers** — Prebuilt tool for self-scheduling wakeups
12. **Monitoring** — Token usage tracking, cycle metrics, consciousness size alerts

---

## Open Questions

1. **Coexistence**: Should traditional runs and living agents coexist? (e.g., some agents are "living", others are request-response)
2. **Consciousness size**: What's the optimal window size? 50? 100? 200 messages? Depends on token budget.
3. **Compaction frequency**: Every N cycles? When consciousness exceeds M tokens? Both?
4. **Multi-instance**: Redis-based lock vs. dedicated process registry?
5. **Client tools**: When paused for client tool, should the agent be able to process other inbox events in parallel?

---

## Summary

The Living Agent architecture transforms agents from stateless functions into stateful processes. The key innovations:

1. **Inbox batching** — Multiple messages become one think cycle, eliminating duplicate work
2. **Real consciousness** — ModelMessage[] chain persists across cycles, not reconstructed from history
3. **Mid-cycle awareness** — `prepareStep` checks inbox between tool calls for urgent events
4. **Proactive behavior** — Self-scheduled timers allow agents to act without being triggered
5. **Natural multi-space** — All spaces feed one inbox, agent handles everything with full cross-space context

Technically feasible with Vercel AI SDK v6: uses the Manual Agent Loop pattern, `response.messages` for consciousness capture, `prepareStep` for mid-cycle injection, and `stopWhen` for cycle limits. All existing infrastructure (stream-processor, space tools, SSE, React SDK) works unchanged.
