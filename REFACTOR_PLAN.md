# Gateway Refactor Plan

## Executive Summary

After reviewing every file in `hsafa-gateway/src/` and the Vercel AI SDK v6 docs, here's a comprehensive refactor plan focused on **reducing complexity, leveraging SDK features, and improving scalability**.

---

## 1. REPLACE `streamText` with `ToolLoopAgent` Class

**Current state**: `agent-process.ts` calls raw `streamText()` with manual `stopWhen`, `prepareStep`, and tool wiring. The agent is rebuilt from scratch each cycle.

**Proposed**: Use the AI SDK's `ToolLoopAgent` class.

### Why
- `ToolLoopAgent` encapsulates model + tools + instructions + loop control into a **reusable, instantiated object**
- Supports `generate()` and `stream()` — same capabilities, less boilerplate
- Built-in `prepareStep`, `stopWhen`, `onStepFinish` — all already used by the gateway
- `callOptionsSchema` + `prepareCall` enable **per-cycle dynamic configuration** (inject inbox events, cycle context) with type safety

### Concrete changes
```ts
// builder.ts returns a ToolLoopAgent instance instead of { tools, model, ... }
const agent = new ToolLoopAgent({
  model: resolveModel(config),
  instructions: baseSystemPrompt,  // static part
  tools: { ...prebuilt, ...custom },
  stopWhen: stepCountIs(maxSteps),
  callOptionsSchema: z.object({
    inboxEvents: z.string(),       // formatted inbox
    cycleCount: z.number(),
    systemPrompt: z.string(),      // dynamic refresh
  }),
  prepareCall: ({ options, ...settings }) => ({
    ...settings,
    instructions: options.systemPrompt,
  }),
  prepareStep: async ({ stepNumber, messages }) => {
    // mid-cycle inbox awareness (existing logic)
  },
  providerOptions: { openai: { parallelToolCalls: false } },
});
```

Then in `agent-process.ts`:
```ts
const result = agent.stream({
  prompt: formatInboxEvents(allEvents),
  options: { systemPrompt, cycleCount, inboxEvents: formatted },
});
```

### Impact
- **Eliminates**: Manual `streamText` call assembly, redundant tool/model passing every cycle
- **Enables**: Agent instance caching (rebuild only on config change via `configHash`)
- **Lines removed**: ~40 from agent-process.ts

---

## 2. USE Provider Registry for Model Resolution

**Current state**: `builder.ts` has a 40-line `resolveModel()` switch statement creating providers inline with `createOpenAI()`, `createAnthropic()`, etc.

**Proposed**: Use `createProviderRegistry` + `customProvider` from the AI SDK.

```ts
// src/agent-builder/model-registry.ts (new, ~30 lines)
import { createProviderRegistry, customProvider, gateway } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
// ...

export const registry = createProviderRegistry({
  openai: createOpenAI({ apiKey: process.env.OPENAI_API_KEY }),
  anthropic: createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY }),
  google: createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_API_KEY }),
  xai: createXai({ apiKey: process.env.XAI_API_KEY }),
  openrouter: createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY }),
});

// Usage: registry.languageModel('openai:gpt-4o')
```

Then `resolveModel` becomes a one-liner:
```ts
const model = registry.languageModel(`${config.model.provider}:${config.model.model}`);
```

### Impact
- **Eliminates**: 40-line switch, per-call provider instantiation
- **Enables**: String-based model references in agent config (e.g. `"openai:gpt-5"`)
- **Enables**: `customProvider` for model aliases (e.g. `"fast"` → `"openai:gpt-4o-mini"`)

---

## 3. USE Language Model Middleware

**Current state**: Reasoning extraction, logging, and provider-specific quirks are handled ad-hoc in `stream-processor.ts` and `agent-process.ts`.

**Proposed**: Use `wrapLanguageModel` with composable middleware.

### Concrete middlewares to implement

1. **Logging middleware** — Log every LLM call (model, tokens, latency) to a structured log or telemetry sink. Replaces scattered `console.log` statements.

2. **Default settings middleware** — Apply `temperature`, `maxOutputTokens`, reasoning config per-model via `defaultSettingsMiddleware`. Eliminates manual `temperature:`, `maxOutputTokens:` passing in `streamText`.

3. **Cost tracking middleware** — Custom middleware in `wrapGenerate`/`wrapStream` that accumulates token usage and writes to the Run record. Cleaner than the current post-hoc `result.totalUsage` approach.

4. **Guardrail middleware** (future) — Content filtering, PII detection, output validation — all composable and model-agnostic.

```ts
const model = wrapLanguageModel({
  model: registry.languageModel(`${provider}:${modelName}`),
  middleware: [
    loggingMiddleware,
    defaultSettingsMiddleware({ settings: { temperature, maxOutputTokens } }),
    costTrackingMiddleware(runId),
  ],
});
```

### Impact
- **Eliminates**: Settings scattered across `builder.ts`, `agent-process.ts`
- **Enables**: Per-agent middleware stacks (the `middleware: []` field already exists in `AgentConfigSchema`)

---

## 4. USE `onInputStart`/`onInputDelta`/`onInputAvailable` Tool Hooks

**Current state**: `stream-processor.ts` (437 lines) manually intercepts `tool-input-start`, `tool-input-delta`, `tool-call`, `tool-result` from `fullStream` and does partial JSON parsing + event emission.

**Proposed**: Move per-tool streaming logic into the tool definitions themselves using AI SDK's tool lifecycle hooks.

```ts
// send-message.ts
tool({
  description: '...',
  inputSchema,
  onInputStart: () => {
    // emit space.message.streaming start
  },
  onInputDelta: ({ inputTextDelta }) => {
    // partial JSON parse, emit text deltas
  },
  onInputAvailable: ({ input }) => {
    // emit final args
  },
  execute: async ({ text }) => {
    // persist + emit space.message
  },
});
```

### Impact
- **Eliminates**: The entire `ActiveToolStream` tracking system in stream-processor
- **Eliminates**: Manual `partial-json` parsing from a generic stream loop
- **stream-processor.ts**: Reduced from ~437 to ~150 lines (only handle finish/error, collect toolCalls)
- **Each tool owns its streaming** — much cleaner separation of concerns

---

## 5. USE `experimental_context` for AgentProcessContext

**Current state**: Every tool receives `AgentProcessContext` via closure in the tool factory function. This means tools are rebuilt per-agent and can't be shared.

**Proposed**: Pass `AgentProcessContext` via `experimental_context` on the `streamText`/`agent.stream()` call. Tools read it from `execute`'s second arg.

```ts
// In agent-process.ts
agent.stream({
  prompt: inboxMessage,
  experimental_context: context, // AgentProcessContext
});

// In any tool:
execute: async (args, { experimental_context }) => {
  const ctx = experimental_context as AgentProcessContext;
  ctx.setActiveSpaceId(spaceId);
  // ...
}
```

### Why this matters
- Tools become **stateless factory functions** that don't close over context
- Tools can be **shared across agents** (prebuilt tools built once, not per-agent)
- `buildPrebuiltTools()` no longer needs `ctx` — becomes a pure, cacheable function

### Impact
- **Eliminates**: Per-agent tool rebuilding (13 prebuilt tools rebuilt for every agent)
- **Eliminates**: `ctx` parameter threading through every factory function
- **Enables**: Global tool singleton pattern

---

## 6. FIX: Persist `activeSpaceId` Across Cycles

**Current state**: `activeSpaceId` is reset to `null` at the start of every cycle. But consciousness (ModelMessage[]) carries forward — the agent *remembers* being in a space from the previous cycle.

**Problem**: The agent finishes cycle N inside Space A, cycle N+1 starts, consciousness still has full memory of operating in Space A, agent calls `send_message` → **fails** because `activeSpaceId` is `null`. The agent doesn't see cycle boundaries — it sees a continuous stream of steps. Resetting runtime state that the agent's memory still references creates a disconnect.

**Proposed**: Persist `activeSpaceId` as part of the agent's runtime state:

```ts
// Option A: Store on AgentConsciousness record
model AgentConsciousness {
  // ... existing fields
  activeSpaceId String? @map("active_space_id") @db.Uuid
}

// Option B: Store in consciousness metadata (no schema change)
// Save at cycle end:
await saveConsciousness(agentEntityId, messages, { activeSpaceId });
// Restore at cycle start:
context.activeSpaceId = consciousness.metadata?.activeSpaceId ?? null;
```

At cycle start, restore `activeSpaceId` from the persisted value. Only reset it if the agent explicitly leaves a space or the space no longer exists.

### Impact
- **Fixes**: Agent confusion when consciousness remembers being in a space but runtime doesn't
- **Aligns**: Runtime state with consciousness continuity
- **Eliminates**: Redundant `enter_space` calls at the start of every cycle

---

## 7. SIMPLIFY Consciousness System

**Current state**: `consciousness.ts` (342 lines) manages a growing `ModelMessage[]`, manually handles compaction with cycle extraction, timestamp parsing, and summary generation.

**Problems identified**:
- `estimateTokens` uses `chars/4` heuristic — inaccurate for non-English, tool JSON
- Compaction is fragile: relies on `isCycleStart` detecting `"INBOX ("` prefix
- `refreshSystemPrompt` scans the entire array every cycle
- System prompt is message[0], which means consciousness is tightly coupled to message format

### Proposed simplifications

**a) Split system prompt from consciousness**
The system prompt is not part of the agent's memory — it's configuration. Pass it as `instructions` on the ToolLoopAgent, not as `messages[0]`.

**b) Token-based retention instead of cycle-count based**
Current compaction keeps the last `minRecentCycles = 10` cycles in full detail. This is wrong — cycles vary wildly in size (a skip = 3 messages, a multi-tool cycle = 15+ messages). 10 short cycles might be 2k tokens; 10 long cycles might be 40k tokens. The retention window should be based on **token budget**, not cycle count:

```ts
// Walk backwards through cycles, keep as many as fit in the recent-detail budget
const recentBudget = maxTokens * 0.7; // 70% for recent full-detail, 30% for summaries + system prompt
let recentTokens = 0;
let splitIndex = cycles.length;

for (let i = cycles.length - 1; i >= 0; i--) {
  const cycleTokens = estimateTokens(cycles[i].messages);
  if (recentTokens + cycleTokens > recentBudget) break;
  recentTokens += cycleTokens;
  splitIndex = i;
}
// Everything before splitIndex → summarize
// Everything from splitIndex onward → keep in full
```

This naturally adapts: short cycles → more kept in full, long cycles → fewer kept. The token budget is the only constraint that matters — `minRecentCycles` is eliminated entirely.

**c) Use `prepareStep` for context window management**
Instead of a separate `compactConsciousness` function, use the SDK's built-in `prepareStep` to trim messages when they exceed budget:
```ts
prepareStep: async ({ messages }) => {
  if (estimateTokens(messages) > maxTokens) {
    return { messages: compactMessages(messages) };
  }
  return {};
}
```

**d) Replace character-based token estimation**
Use `@anthropic-ai/tokenizer` or `tiktoken` for accurate counts. Or use the `usage` data from previous steps (available in `prepareStep`'s `steps` parameter).

### Impact
- **Eliminates**: `refreshSystemPrompt` function entirely
- **Eliminates**: System-prompt-as-first-message coupling
- **Simplifies**: Compaction trigger (move to prepareStep)

---

## 8. ELIMINATE Polling in `waitForPendingResult`

**Current state**: `builder.ts` lines 245-275 — `waitForPendingResult` polls Prisma every 500ms for up to 30s waiting for external tool results. **This is the worst pattern in the codebase.**

```ts
while (Date.now() < deadline) {
  const pending = await prisma.pendingToolCall.findUnique({ ... });
  if (pending?.status === 'resolved') return pending.result;
  await new Promise(r => setTimeout(r, 500));
}
```

### Proposed: Redis pub/sub with Promise resolution

```ts
async function waitForPendingResult(toolCallId: string, timeoutMs: number): Promise<unknown | null> {
  return new Promise((resolve) => {
    const channel = `tool-result:${toolCallId}`;
    const subscriber = createBlockingRedis();
    
    const timer = setTimeout(() => {
      subscriber.unsubscribe(channel);
      subscriber.disconnect();
      resolve(null);
    }, timeoutMs);

    subscriber.subscribe(channel);
    subscriber.on('message', (_ch, msg) => {
      clearTimeout(timer);
      subscriber.disconnect();
      resolve(JSON.parse(msg));
    });
  });
}
```

Then in `runs.ts` tool-results endpoint, after resolving the PendingToolCall:
```ts
await redis.publish(`tool-result:${callId}`, JSON.stringify(result));
```

### Impact
- **Eliminates**: 60 DB queries per tool wait (500ms × 30s)
- **Reduces**: DB load by ~98% for external tools
- **Latency**: Result arrives instantly instead of up to 500ms polling delay

---

## 9. CONSOLIDATE Duplicate Space Member Queries

**Current state**: Space membership and member lists are queried redundantly:
- `prompt-builder.ts` queries all memberships + entities (lines 29-68)
- `enter-space.ts` queries memberships for enum (line 25-33)
- `send-message.ts` queries agent members for inbox push (lines 72-79)
- `agent-process.ts` queries full agent with nested memberships (lines 72-94)
- `emitAgentStatus` queries memberships (line 396-399)

### Proposed: Cached SpaceMembershipService

```ts
class SpaceMembershipService {
  private cache = new Map<string, { members: Member[]; expiresAt: number }>();
  
  async getMembersForAgent(agentEntityId: string): Promise<SpaceMembership[]> { ... }
  async getAgentMembersInSpace(spaceId: string, excludeEntityId?: string): Promise<string[]> { ... }
  
  invalidate(spaceId: string) { ... }  // Called on member add/remove
}
```

### Impact
- **Eliminates**: 5+ redundant DB queries per cycle
- **Enables**: Cache invalidation on membership change (already have the route)

---

## 10. REMOVE Dead/Redundant Code

### Files/features to remove

| Item | Reason | Lines saved |
|------|--------|-------------|
| `leave-space.ts` prebuilt tool | With `activeSpaceId` persisting (#6), agent can just `enter_space` a different one. Explicit "leave" is never the right action. | ~40 |
| `get_plans` prebuilt tool | Plans are already in the system prompt. Agent never needs to query separately. | ~40 |
| `get_memories` prebuilt tool | Memories are already in the system prompt. Agent never needs to query separately. | ~40 |
| `tool-call-utils.ts` | After moving streaming to tool hooks (#4), this can be inlined | ~73 |
| `skip.ts` prebuilt tool | Replaced by unified `done` tool with optional summary. No more rollback — every cycle is real. | ~27 |
| `DEBUG` console.logs in `smart-spaces.ts` | Debug artifacts left in production code | ~5 |

### Tools to KEEP (reconsidered)

| Tool | Why keep |
|------|----------|
| `peek_inbox` | `prepareStep` tells the agent *how many* events are pending, but `peek_inbox` lets the agent *read and evaluate* them mid-cycle. Critical for long cycles where urgent events (user says "stop", priority change) arrive while the agent is mid-task. Agent decides when to check — gives it agency. |
| `read_messages` | `enter_space` returns the last 20 messages for quick context, but agents investigating long threads or searching for specific older messages need pagination. Without this, the agent is blind to anything beyond the last 20. |

### Total: ~225 lines of dead code removed

---

## 11. RESTRUCTURE: Extract Space Interaction Layer

**Current state**: Space message persistence, SSE emission, and inbox push are duplicated across `send-message.ts` (prebuilt tool) and `smart-spaces.ts` (route).

### Proposed: `SpaceService` class

```
src/services/
  space-service.ts     — sendMessage, getHistory, getMembers (shared logic)
  inbox-service.ts     — pushEvent, drain, peek (already exists as inbox.ts)
  consciousness-service.ts — load, save, compact
```

Both the prebuilt tool and the HTTP route call `spaceService.sendMessage()`.

### Impact
- **Eliminates**: Duplicated message persistence + SSE emission + inbox push logic
- **Enables**: Consistent behavior regardless of entry point

---

## 12. ADD: MCP Server Support via `createMCPClient`

**Current state**: `AgentConfigSchema` has an `mcp` field but it's not wired. No MCP client code exists.

**Proposed**: Use `@ai-sdk/mcp`'s `createMCPClient`:

```ts
// In builder.ts
if (config.mcp?.servers) {
  for (const server of config.mcp.servers) {
    const client = await createMCPClient({
      transport: { type: server.transport ?? 'http', url: server.url },
    });
    const mcpTools = await client.tools({
      schemas: server.allowedTools ? ... : undefined,
    });
    Object.assign(tools, mcpTools);
    // Track client for cleanup
  }
}
```

### Impact
- **Enables**: Connecting agents to external MCP tool servers
- **Fills**: The existing but unimplemented `mcp` config field

---

## 13. IMPROVE: Error Recovery

**Current state**: Crash recovery in `agent-process.ts` catches errors, rolls back consciousness, marks events failed, and waits 5s. But:
- No exponential backoff
- No distinction between transient (API timeout) vs permanent (config error) failures
- No circuit breaker — a bad agent config loops forever

### Proposed

```ts
// Error classification
const isTransient = (err: Error) =>
  err.message.includes('timeout') ||
  err.message.includes('rate limit') ||
  err.message.includes('503');

// Exponential backoff with jitter
const backoff = Math.min(5000 * Math.pow(2, consecutiveFailures), 60_000);
const jitter = Math.random() * 1000;
await new Promise(r => setTimeout(r, backoff + jitter));
```

> **Note**: The circuit breaker (kill process after N failures) is replaced by **Graceful Degradation (#21)** — the agent never permanently shuts down. Instead it falls back to a simpler model, then rests and retries.

---

## 14. ADD: Telemetry via AI SDK's Built-in Support

The AI SDK has built-in OpenTelemetry support via the `experimental_telemetry` option:

```ts
streamText({
  model,
  experimental_telemetry: {
    isEnabled: true,
    functionId: 'agent-cycle',
    metadata: { agentId, cycleNumber, runId },
  },
});
```

This gives free integration with any OTEL-compatible backend (Datadog, Grafana, etc.) for:
- Per-call latency
- Token usage
- Tool call frequency
- Error rates

---

# Living Agent Philosophy — Make It Human

The following changes align the system with the core philosophy: **agents are living beings, not typical AI chatbots**. They should think until done, remember deeply, act proactively, build relationships, and never arbitrarily shut down. Cost is not a concern — power is.

---

## 15. REPLACE Step Limits with Natural Completion (`done` tool)

**Current state**: `DEFAULT_MAX_STEPS = 5` in `agent-process.ts`. The agent is killed after 5 tool calls regardless of whether it finished its work. This is the single most anti-human feature in the system.

**Problem**: If someone asks the agent to check two spaces, compare messages, and respond — that's already 5+ steps (enter_space A, read, enter_space B, read, compare, send_message). The agent gets cut off mid-thought.

**How the `done` tool works**:

The AI SDK stops the loop when a tool with **no `execute` function** is called. The `done` tool is the agent's way of saying "I'm finished" — whether it did work or decided there was nothing to do.

```ts
// New prebuilt tool: done.ts (replaces skip.ts)
done: tool({
  description: 'Call this when you are finished with this cycle. If you accomplished something, provide a summary. If there was nothing to do, just call done without a summary.',
  inputSchema: z.object({
    summary: z.string().optional().describe('Brief summary of what you accomplished (omit if nothing to do)'),
  }),
  // No execute — SDK stops the loop immediately
}),
```

**This replaces the `skip` tool entirely.** There is no more rollback — every cycle is real:
- Agent did work → `done({ summary: "Replied to Husam about..." })` → run saved, consciousness updated
- Agent decided nothing to do → `done({})` → run saved (metadata: `no_action`), consciousness updated
- Both are valid cycles. The agent remembers evaluating the inbox and deciding, which prevents re-processing the same events.

**In agent-process.ts**, replace the stop condition:

```ts
// BEFORE (hard ceiling — anti-human)
stopWhen: stepCountIs(maxSteps),

// AFTER (agent decides + safety net)
stopWhen: [
  hasToolCall('done'),      // Primary: agent decides it's finished
  stepCountIs(50),          // Safety net only — should never trigger
],
```

**The agent loop with `done`**:
```
// Agent has work to do:
Step 0: Read inbox → "Husam asked a question in Space A"
Step 1: enter_space(Space A) → gets conversation history
Step 2: send_message({ text: "Here's my answer..." })
Step 3: done({ summary: "Replied to Husam's question about X" })
→ SDK stops. Cycle saved.

// Agent has nothing to do:
Step 0: Read inbox → "[Space A] bot: ping"
Step 1: done({})  // no summary — nothing was worth doing
→ SDK stops. Cycle saved. Agent remembers seeing the bot ping.
```

### Impact
- **Eliminates**: Arbitrary step ceiling that cuts agents off mid-thought
- **Eliminates**: The `skip` tool and its full rollback mechanism (run deletion, consciousness restore, cycle revert)
- **Enables**: Complex multi-step tasks (cross-space operations, multi-tool workflows)
- **Preserves**: Every cycle as a real record — even "no action" cycles are tracked
- **Safety**: `stepCountIs(50)` remains as emergency brake

---

## 16. REMOVE All Cost-Based Ceilings

Since cost is not a concern, remove every artificial limitation that exists only to save tokens/money:

| Constant | Current | Proposed | Where |
|----------|---------|----------|-------|
| `DEFAULT_MAX_STEPS` | `5` | Removed (use `done` tool) | `agent-process.ts` |
| `HISTORY_LIMIT` | `20` | `100` | `enter-space.ts` |
| `DEFAULT_CONTEXT_COUNT` | `15` | `50` | `inbox.ts` |
| `Math.min(limit, 200)` | cap at 200 | Remove cap | `read-messages.ts` |
| `DEFAULT_MAX_TOKENS` | `100_000` | `200_000` | `consciousness.ts` |
| `maxOutputTokens` | Set from config | Don't set default — let model use what it needs | `agent-process.ts` |
| `MAX_STARTUP_MESSAGES` | `120 → full wipe` | Use compaction (see #17) | `agent-process.ts` |

These limits make the agent **dumber** by restricting how much it can see, think, and remember. A human can read an entire conversation, think as long as needed, and remember years of interactions. The agent should too.

### Impact
- **Agent sees full conversations** (100 messages on enter, 50 context on inbox events)
- **Agent thinks until done** (no step ceiling)
- **Agent remembers more** (200k token consciousness window)
- **Agent can produce long, detailed responses** (no output token cap)

---

## 17. FIX: Compaction Instead of Amnesia

**Current state**: If consciousness exceeds 120 messages at startup, the entire history is **wiped**:

```ts
// agent-process.ts line 98-105
if (consciousness.length > MAX_STARTUP_MESSAGES) {
  consciousness = [];
  cycleCount = 0;
}
```

**Problem**: A human with too many memories doesn't get total amnesia. The agent loses everything — all relationships, all context, all learned behavior. This is catastrophic.

**Fix**: Replace the wipe with forced compaction:

```ts
if (consciousness.length > MAX_STARTUP_MESSAGES) {
  console.log(`[agent-process] ${agentName} consciousness large (${consciousness.length}), compacting...`);
  consciousness = compactConsciousness(consciousness, maxTokens);
  await saveConsciousness(agentEntityId, consciousness, cycleCount);
  // Agent keeps compressed history — no amnesia
}
```

The compaction system already exists. Use it instead of destroying everything.

### Impact
- **Eliminates**: Total memory loss on large consciousness
- **Preserves**: Agent personality, relationships, learned behavior across compaction
- **Aligns**: With human memory — fading details, not erasure

---

## 18. ADD: Self-Initiated Actions (Proactive Behavior)

**Current state**: The agent is purely reactive — it ONLY acts when inbox events arrive. The instructions explicitly say "RESPOND TO THE ACTUAL MESSAGE" and nothing about taking initiative.

**Problem**: Humans don't just sit silently waiting for someone to talk to them. They:
- Follow up when someone hasn't responded
- Check on tasks they started
- Proactively share information
- Set mental reminders to revisit things

**How it differs from Plans**:

| Aspect | Plans (existing `set_plans`) | Self-Initiated Reminders (new) |
|--------|-----|------|
| **Who creates** | User configures or agent when asked | Agent spontaneously decides during any cycle |
| **Why** | Scheduled recurring tasks, deadlines | Context-driven follow-ups, curiosity |
| **Weight** | Full plan: name, instruction, cron, DB record, BullMQ job, visible in PLANS section | Lightweight: just reason + delay |
| **Analogy** | Calendar event | Mental note |
| **Example** | "Send weekly report every Monday" | "Husam said he'd try this — I'll check in 1 hour" |

Plans = **external schedule** (alarm clock set by someone).
Self-initiated = **internal motivation** (human thinking ahead).

The agent CAN already use `set_plans` with `runAfter: "30 minutes"` for this, but it's heavyweight — requires a plan name, creates a DB record, shows in the system prompt PLANS section. A quick self-reminder needs less friction.

**Proposed**: New `set_reminder` prebuilt tool:

```ts
// set-reminder.ts — lightweight self-initiated follow-up
set_reminder: tool({
  description: 'Set a self-reminder to follow up on something later. Use this proactively when you want to check back on a conversation, task, or person.',
  inputSchema: z.object({
    reason: z.string().describe('What to follow up on'),
    delay: z.string().describe('When to remind you: "30 minutes", "2 hours", "1 day"'),
    spaceId: z.string().optional().describe('Space context for the reminder (optional)'),
  }),
  execute: async ({ reason, delay, spaceId }) => {
    const fireAt = parseRunAfter(delay);
    if (!fireAt) return { error: 'Invalid delay format' };
    
    // Lightweight plan — auto-named, auto-cleaned after firing
    const plan = await prisma.plan.create({
      data: {
        entityId: ctx.agentEntityId,
        name: `reminder: ${reason.slice(0, 50)}`,
        instruction: reason,
        scheduledAt: fireAt,
        nextRunAt: fireAt,
        isRecurring: false,
        status: 'pending',
        metadata: { type: 'self_reminder', spaceId },
      },
    });
    await enqueuePlan({ id: plan.id, entityId: ctx.agentEntityId, ... });
    return { success: true, willRemindAt: fireAt.toISOString() };
  },
}),
```

**Proactive instructions** (add to prompt-builder core instructions):
```
You can act proactively. If someone says they'll be back later, set a reminder to check in.
If you started a task for someone, follow up on the result.
If a conversation goes quiet, consider checking if they need help.
You are not just reactive — you care about the people you interact with.
```

### Impact
- **Enables**: Agent-initiated follow-ups, check-ins, proactive behavior
- **Transforms**: Agent from passive responder to active participant
- **Uses**: Existing plan scheduler infrastructure (no new scheduling system)
- **Feels**: Human — the agent remembers to come back

---

## 19. ADD: Relationship Memory

**Current state**: The agent treats all entities identically. It has key-value memories but no structured understanding of its relationships.

**Problem**: A human remembers who they talk to most, what topics they discuss with each person, and adjusts their style accordingly. The agent doesn't.

**Proposed**: Use the existing memory system with **instructions** that encourage relationship tracking. No schema change needed — just guidance in the prompt:

```
RELATIONSHIP AWARENESS:
After meaningful interactions, update your memories about the people you interact with.
Track: who they are, what they care about, how they prefer to communicate,
what you've helped them with, and when you last spoke.
Use memory keys like "about:Husam", "about:Ahmad" for per-person context.
```

The agent will naturally create memories like:
```
about:Husam → "My creator. Prefers direct, concise answers. Building the Hsafa platform. Often works late."
about:Ahmad → "Colleague. Interested in technical topics. I sent him a story last week."
```

Over time, this builds a **relationship model** that makes the agent's responses more personalized and contextual. The agent remembers that Husam likes concise answers while Ahmad prefers detailed explanations.

### Impact
- **No code changes** — just prompt instructions + existing memory tools
- **Enables**: Personalized responses per-person
- **Builds**: Long-term relationship context that survives compaction (stored as memories, not consciousness)
- **Feels**: Like the agent actually knows you

---

## 20. ADD: Attention Prioritization

**Current state**: When multiple inbox events arrive, they're processed as a flat list in FIFO order. The agent sees:
```
INBOX (5 events, now=...)
1. [Space A] random-bot: "ping"
2. [Space B] Husam: "Hey Atlas, I need help urgently"
3. [Space A] random-bot: "pong"
4. [Space C] Ahmad: "Did you finish the report?"
5. [Plan fired] "Weekly summary"
```

The agent processes these sequentially with no sense of priority.

**Problem**: A human would immediately see "Husam needs urgent help" and handle that first. They'd deprioritize the bot pings and handle the report question after the urgent request.

**Proposed**: Sort/annotate inbox events before injecting them into consciousness. In `inbox.ts`:

```ts
function prioritizeEvents(events: InboxEvent[]): InboxEvent[] {
  return events.sort((a, b) => {
    // Direct mentions/name references → highest priority
    const aDirectMention = isDirectMention(a);
    const bDirectMention = isDirectMention(b);
    if (aDirectMention && !bDirectMention) return -1;
    if (!aDirectMention && bDirectMention) return 1;
    
    // Human messages → higher than bot/agent messages
    const aHuman = isFromHuman(a);
    const bHuman = isFromHuman(b);
    if (aHuman && !bHuman) return -1;
    if (!aHuman && bHuman) return 1;
    
    // Keep original order within same priority
    return 0;
  });
}
```

Also add priority annotations to `formatInboxEvents`:
```
INBOX (5 events, now=...)
[PRIORITY] [Space B] Husam: "Hey Atlas, I need help urgently"
[Space C] Ahmad: "Did you finish the report?"
[Plan fired] "Weekly summary"
[low] [Space A] random-bot: "ping"
[low] [Space A] random-bot: "pong"
```

### Impact
- **Agent handles urgent matters first** — like a human would
- **Human messages get priority over bot messages**
- **Direct mentions get priority over ambient events**
- **Lightweight**: Just sorting + annotations, no architecture change

---

## 21. IMPROVE: Graceful Degradation Instead of Circuit Breaker

**Current state** (proposed in #13): After 5 consecutive failures, the agent process exits. This is like a human dying after 5 mistakes.

**Better approach**: Humans adapt when things go wrong — they try simpler approaches, take breaks, ask for help.

```ts
// Instead of circuit breaker → kill process:
if (consecutiveFailures >= 3 && consecutiveFailures < 5) {
  // Try a simpler/cheaper model (still works, just less capable)
  console.log(`[agent-process] ${agentName} switching to fallback model after ${consecutiveFailures} failures`);
  built.model = registry.languageModel('openai:gpt-4o-mini');
}

if (consecutiveFailures >= 5) {
  // Long rest — but don't die
  console.warn(`[agent-process] ${agentName} resting for 5 minutes after ${consecutiveFailures} failures`);
  await new Promise(r => setTimeout(r, 300_000)); // 5 minute rest
  consecutiveFailures = 0; // Fresh start after rest
  built.model = originalModel; // Try original model again
  // Process continues — never exits
}
```

The agent **never permanently shuts down**. It degrades gracefully:
1. First 2 failures: Exponential backoff (existing)
2. 3-4 failures: Switch to simpler model
3. 5+ failures: Long rest, then retry with original model

### Impact
- **Eliminates**: Permanent agent death from transient errors
- **Enables**: Self-healing behavior
- **Aligns**: With human resilience — rest and retry, don't give up

---

## Priority Order (Ship Sequence)

| # | Change | Impact | Effort | Risk |
|---|--------|--------|--------|------|
| 1 | Persist activeSpaceId (#6) | Fixes agent confusion bug | Small | Low |
| 2 | Natural completion / `done` tool (#15) | Unleashes agent capability | Small | Low |
| 3 | Remove cost-based ceilings (#16) | Agent sees/thinks/remembers more | Small | Low |
| 4 | Compaction instead of amnesia (#17) | Preserves agent identity | Small | Low |
| 5 | Eliminate polling (#8) | Critical perf fix | Small | Low |
| 6 | Provider registry (#2) | Clean foundation | Small | Low |
| 7 | Remove dead code (#10) | Reduce surface area | Small | Low |
| 8 | Relationship memory (#19) | Personalized responses | Small | Low |
| 9 | Proactive instructions + `set_reminder` (#18) | Agent takes initiative | Small | Low |
| 10 | Attention prioritization (#20) | Human-like triage | Small | Low |
| 11 | Extract SpaceService (#11) | Eliminate duplication | Medium | Low |
| 12 | Tool lifecycle hooks (#4) | Major simplification | Medium | Medium |
| 13 | ToolLoopAgent (#1) | Architecture upgrade | Medium | Medium |
| 14 | experimental_context (#5) | Enable tool sharing | Small | Low |
| 15 | Middleware stack (#3) | Cross-cutting concerns | Medium | Low |
| 16 | Consciousness simplification (#7) | Reduce fragility | Medium | Medium |
| 17 | Graceful degradation (#21) | Agent never dies | Small | Low |
| 18 | Membership cache (#9) | Perf improvement | Small | Low |
| 19 | MCP support (#12) | New capability | Medium | Low |
| 20 | Telemetry (#14) | Observability | Small | Low |

### Removed from plan
| Item | Reason |
|------|--------|
| `needsApproval` | Agents are autonomous — they act like humans, never stop to ask permission. Pausing for approval contradicts the living agent philosophy. |
| Structured output | Adds overhead to every cycle, constrains model output, and the reasoning feature already provides visibility into agent thinking. |

---

## What NOT to Change

- **Inbox system** (Redis BRPOP + Postgres dual-write) — solid architecture, well-implemented
- **Plan scheduler** (BullMQ) — correct tool for the job
- **Process manager** — simple and effective
- **Auth middleware** — clean, correct
- **Prisma schema** — well-structured, no changes needed
- **SSE streaming model** (Redis pub/sub → Express SSE) — works well

---

## Estimated Impact

- **Lines removed**: ~650-800 (dead code + consolidation)
- **Lines added**: ~500 (registry, middleware, service layer, done tool, set_reminder, prioritization, graceful degradation)
- **Net**: ~150-300 lines lighter
- **DB queries per cycle**: Reduced from ~15-20 to ~5-8
- **External tool latency**: From 0-500ms polling delay to <5ms pub/sub
- **Agent coherence**: No more activeSpaceId desync across cycles
- **Agent capability**: No step ceiling, 5x more conversation history, 2x consciousness window
- **Agent personality**: Relationship memory, proactive follow-ups, attention prioritization
- **Agent resilience**: Never permanently shuts down — degrades gracefully
- **Maintainability**: Each component has a single responsibility
