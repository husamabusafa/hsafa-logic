# 04 — Think Cycle

## Overview

A think cycle is one `streamText()` call — the agent's unit of work. When the agent wakes, it drains the inbox, injects events into consciousness, and makes a single `streamText` call that handles everything: reasoning, tool calls, multi-step execution, and communication. The SDK manages the internal loop (tool call → result → next step → ...) automatically.

---

## The streamText Call

```typescript
const result = streamText({
  model: defaultModel,
  messages: consciousness,
  tools: agentTools,
  system: undefined, // system prompt is already the first message in consciousness
  stopWhen: [
    stepCountIs(MAX_STEPS),
    tokenBudgetExceeded,
  ],
  prepareStep: async ({ stepNumber, steps }) => {
    return prepareStepConfig(agentId, stepNumber, steps);
  },
  onStepFinish: async ({ stepType, usage }) => {
    // Per-step telemetry, token tracking
    await logStepMetrics(agentId, stepType, usage);
  },
  experimental_telemetry: {
    isEnabled: true,
    functionId: `agent-${agentId}-cycle-${cycleCount}`,
    metadata: { agentId, cycleCount: String(cycleCount) },
  },
});
```

### What Happens Inside

The SDK runs an internal loop:

```
Step 0: Model reads consciousness + inbox events → calls enter_space
Step 1: Model reads tool result → calls send_message("Hi Husam!")
Step 2: Model reads tool result → calls enter_space(another space)
Step 3: Model reads tool result → calls send_message("Report ready")
Step 4: Model reads all results → produces final text (internal reasoning)
        → finishReason: 'end-turn' → cycle complete
```

Each step is one model generation. The SDK accumulates tool calls and results internally between steps. The `fullStream` emits events across ALL steps — the stream processor intercepts them for real-time streaming to spaces.

### One Call, Multiple Actions

A single think cycle can:
- Read from multiple spaces (`enter_space` + `read_messages`)
- Send messages to multiple spaces
- Call custom tools (weather, Jira, etc.)
- Set memories, goals, plans
- All in one `streamText` call

---

## prepareStep — Dynamic Per-Step Configuration

The `prepareStep` callback runs before each step, enabling dynamic behavior within a cycle:

```typescript
async function prepareStepConfig(
  agentId: string,
  stepNumber: number,
  steps: StepResult[]
): Promise<PrepareStepResult> {
  const config: PrepareStepResult = {};
  
  // 1. Mid-cycle inbox awareness — lightweight preview of pending events
  //    (See "Mid-Cycle Inbox Awareness" section below for full strategies)
  if (stepNumber > 0) {
    const pending = await redis.lrange(`inbox:${agentId}`, 0, -1);
    if (pending.length > 0) {
      const previews = pending.map(raw => {
        const e = JSON.parse(raw);
        const snippet = (e.data.content || '').slice(0, 50);
        return `  [${e.data.spaceName || e.type}] ${e.data.senderName || 'system'}: "${snippet}..."`;
      });
      config.messages = [{
        role: 'user',
        content: `[INBOX PREVIEW — ${pending.length} waiting]\n${previews.join('\n')}`,
      }];
    }
  }
  
  // 2. Tool phase gates
  const toolConfig = getToolPhase(stepNumber, steps);
  if (toolConfig.activeTools) config.activeTools = toolConfig.activeTools;
  if (toolConfig.toolChoice) config.toolChoice = toolConfig.toolChoice;
  
  return config;
}
```

### Mid-Cycle Inbox Awareness

By default, the agent only sees inbox events at the start of a cycle. But new events may arrive while the agent is working — a correction, a cancellation, or related context. `prepareStep` can give the agent **awareness of pending events at every step**, so it can adapt mid-cycle.

#### Strategy 1: No Awareness (Simplest)

The agent only processes events at the start of each cycle. New events wait in the inbox for the next cycle.

```typescript
// No mid-cycle inbox check
prepareStep: async () => ({})
```

**Pro:** Simple, predictable. **Con:** Agent can't react to corrections or cancellations mid-cycle.

#### Strategy 2: Lightweight Inbox Preview (Recommended)

The agent sees a **preview** of pending inbox events at every step — just sender name, source space, and first few words. Enough for awareness without the cost of full processing.

```typescript
prepareStep: async ({ stepNumber }) => {
  if (stepNumber === 0) return {}; // step 0 already has the inbox events
  
  const pending = await redis.lrange(`inbox:${agentId}`, 0, -1);
  if (pending.length === 0) return {};
  
  const previews = pending.map(raw => {
    const e = JSON.parse(raw);
    const sender = e.data.senderName || e.type;
    const space = e.data.spaceName || '';
    const snippet = (e.data.content || e.data.instruction || e.data.serviceName || '').slice(0, 50);
    return `  ${space ? `[${space}] ` : ''}${sender}: "${snippet}..."`;
  });
  
  return {
    messages: [{
      role: 'user',
      content: `[INBOX PREVIEW — ${pending.length} new event(s) waiting]\n${previews.join('\n')}\n(These will be fully processed in your next cycle. If any are urgent or change your current task, adapt accordingly.)`,
    }],
  };
}
```

The agent sees something like:

```
[INBOX PREVIEW — 2 new event(s) waiting]
  [Family] Husam: "Actually cancel that, I changed my mi..."
  [Support] Ahmad: "The deadline moved to Friday..."
(These will be fully processed in your next cycle. If any are urgent or change your current task, adapt accordingly.)
```

The agent can then:
- **See a correction** → stop current work, end cycle early, let next cycle handle it
- **See an urgent message** → finish quickly and prioritize the next cycle
- **See related context** → factor it into the current response
- **See irrelevant events** → ignore and continue working

**Pro:** Awareness at minimal token cost (~50 tokens per preview). Agent can adapt. **Con:** One Redis read per step.

#### Strategy 3: Full Injection (Urgent Only)

For truly urgent events (marked via a separate priority queue), drain and inject them fully mid-cycle:

```typescript
prepareStep: async ({ stepNumber }) => {
  const urgentEvents = await redis.lrange(`inbox:${agentId}:urgent`, 0, -1);
  if (urgentEvents.length === 0) return {};
  
  await redis.del(`inbox:${agentId}:urgent`);
  return {
    messages: [{
      role: 'user',
      content: `[URGENT — new events injected mid-cycle]\n${formatInboxEvents(urgentEvents.map(e => JSON.parse(e)))}`,
    }],
  };
}
```

**Pro:** Full awareness of critical events. **Con:** Requires a separate urgency classification mechanism.

#### Combining Strategies

The recommended approach combines **preview + urgent injection**:

```typescript
prepareStep: async ({ stepNumber }) => {
  if (stepNumber === 0) return {};
  
  // 1. Check for urgent events — inject fully
  const urgent = await redis.lrange(`inbox:${agentId}:urgent`, 0, -1);
  if (urgent.length > 0) {
    await redis.del(`inbox:${agentId}:urgent`);
    return {
      messages: [{
        role: 'user',
        content: `[URGENT]\n${formatInboxEvents(urgent.map(e => JSON.parse(e)))}`,
      }],
    };
  }
  
  // 2. Otherwise, lightweight preview of normal inbox
  const pending = await redis.lrange(`inbox:${agentId}`, 0, -1);
  if (pending.length === 0) return {};
  
  const previews = pending.map(raw => {
    const e = JSON.parse(raw);
    const snippet = (e.data.content || '').slice(0, 50);
    return `  [${e.data.spaceName || e.type}] ${e.data.senderName || 'system'}: "${snippet}..."`;
  });
  
  return {
    messages: [{
      role: 'user',
      content: `[INBOX PREVIEW — ${pending.length} waiting]\n${previews.join('\n')}`,
    }],
  };
}
```

This gives the agent **constant situational awareness** — lightweight previews for normal events, full injection for urgent ones. The agent always knows what's coming next and can adapt its behavior accordingly.

---

## Tool Phase Gates

`prepareStep` can restrict which tools are available at each step, creating structured phases:

```typescript
function getToolPhase(stepNumber: number, steps: StepResult[]): {
  activeTools?: string[];
  toolChoice?: ToolChoice;
} {
  // Phase 1 (steps 0-1): OBSERVE — only reading tools
  if (stepNumber <= 1) {
    return {
      activeTools: ['enter_space', 'read_messages', 'get_my_runs'],
      toolChoice: 'required', // force the agent to gather info
    };
  }
  
  // Phase 2 (steps 2-6): THINK + ACT — all tools
  if (stepNumber <= 6) {
    return { toolChoice: 'auto' };
  }
  
  // Phase 3 (steps 7+): RESPOND — only communication tools
  return {
    activeTools: ['send_message', 'enter_space', 'set_memories', 'set_goals'],
    toolChoice: 'auto',
  };
}
```

This forces the agent into an **Observe → Think → Respond** pattern, preventing it from responding before gathering all context.

---

## Stopping Conditions

The cycle ends when any stopping condition is met:

### Built-in: stepCountIs

```typescript
stopWhen: stepCountIs(MAX_STEPS) // default: 20
```

### Custom: Token Budget

```typescript
const tokenBudgetExceeded: StopCondition = ({ steps }) => {
  const totalTokens = steps.reduce(
    (acc, step) => acc + (step.usage?.inputTokens ?? 0) + (step.usage?.outputTokens ?? 0),
    0
  );
  return totalTokens > 50_000; // 50K tokens per cycle max
};
```

### Custom: Task Completion

```typescript
const hasRespondedToAll: StopCondition = ({ steps }) => {
  const sendCalls = steps.flatMap(s => s.toolCalls)
    .filter(tc => tc.toolName === 'send_message');
  return sendCalls.length >= currentInboxSize;
};
```

### Natural Completion

The model can also stop naturally by producing text without tool calls (`finishReason: 'end-turn'`). This is the normal way a cycle ends — the agent has nothing more to do.

### Interactive Tool Pause

If the agent calls a `space` tool (e.g., approval dialog), the SDK stops the loop because the tool has no `execute` function. The process waits for the tool result to be submitted, then the cycle can resume.

---

## Stream Processing

During the think cycle, `fullStream` emits events across all steps. The stream processor intercepts these for real-time delivery:

```typescript
async function processStream(result: StreamTextResult): Promise<void> {
  for await (const event of result.fullStream) {
    switch (event.type) {
      case 'tool-call':
        if (event.toolName === 'send_message') {
          // Stream message text to the active space via Redis
          await streamToSpace(activeSpaceId, event);
        } else if (isVisibleTool(event.toolName)) {
          // Stream visible tool input/output to space
          await streamToolToSpace(activeSpaceId, event);
        }
        break;
        
      case 'tool-call-streaming-start':
      case 'tool-call-delta':
        // Stream partial tool inputs for real-time UI
        await streamPartialToSpace(activeSpaceId, event);
        break;
    }
  }
}
```

The stream processor is identical to v2 — it works unchanged because `fullStream` emits events across ALL steps in the SDK's internal loop.

---

## After the Cycle

When `streamText` completes:

```typescript
// 1. Get new messages from the cycle
const newMessages = (await result.response).messages;

// 2. Append to consciousness
consciousness.push(...newMessages);

// 3. Track usage
const usage = await result.totalUsage;
await trackUsage(agentId, cycleCount, usage);

// 4. Compact if needed
consciousness = await compactConsciousness(consciousness);

// 5. Persist
await saveConsciousness(agentId, consciousness);

// 6. Loop back to sleep
```

---

## Telemetry

Every cycle is traced via OpenTelemetry:

```typescript
experimental_telemetry: {
  isEnabled: true,
  functionId: `agent-${agentId}-cycle-${cycleCount}`,
  metadata: {
    agentId,
    cycleCount: String(cycleCount),
    inboxSize: String(events.length),
    consciousnessTokens: String(estimateTokens(consciousness)),
  },
}
```

This gives full observability:
- **Per-cycle traces** — duration, token usage, step count
- **Per-step spans** — which tool was called, args, result, latency
- **`msToFirstChunk`** — time to first response token
- **`avgCompletionTokensPerSecond`** — throughput tracking

Wire to any OpenTelemetry backend (Datadog, Langfuse, etc.) for consciousness replay.

---

## Comparison to v2 Run Execution

| v2 | v3 |
|----|-----|
| `streamText` with system prompt containing all context | `streamText` with consciousness (persistent ModelMessage[]) |
| `messages: []` (empty — all context in system prompt) | `messages: consciousness` (full history) |
| `prepareStep` checks for cancellation | `prepareStep` does model selection, tool phases, inbox injection |
| `stopWhen: stepCountIs(MAX)` | Multiple stop conditions (steps, budget, completion) |
| One model per run | Adaptive model per step |
| Run ends → context discarded | Cycle ends → consciousness persisted and carried forward |
| `response.messages` used for nothing | `response.messages` appended to consciousness |
