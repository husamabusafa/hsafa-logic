# Streaming Everything (Real LLM Streaming — No Simulation)

## Requirement

The user must NEVER see a message appear instantly (non-streaming). Every message that appears in a space must stream in real-time, with tool calls visible as they happen. **No simulated/proxy streaming** — all streaming comes from actual LLM token generation.

## The Key Insight: Tool Input Streaming

The AI SDK streams tool arguments token by token via `tool-input-delta` events. When the agent calls `sendSpaceMessage(spaceId, "Here's the budget...")`, the LLM generates the `text` argument character by character. The `stream-processor.ts` already receives these deltas and parses partial JSON from them.

**We intercept `tool-input-delta` events for `sendSpaceMessage` calls, extract new characters from the `text` field, and relay them to the target space's SSE channel in real-time.**

This is REAL LLM streaming. The tokens flowing to the user are the actual tokens the model is generating — not a simulation.

## How It Works

The AI SDK `fullStream` emits these events as the LLM generates a `sendSpaceMessage` tool call:

```
tool-input-start   → { id: "call-123", toolName: "sendSpaceMessage" }
tool-input-delta   → { id: "call-123", delta: '{"spaceId":"spa' }
tool-input-delta   → { id: "call-123", delta: 'ce-X","text":"Her' }
tool-input-delta   → { id: "call-123", delta: "e's the Q4 budg" }
tool-input-delta   → { id: "call-123", delta: 'et: $2.1M alloca' }
tool-input-delta   → { id: "call-123", delta: 'ted..."}' }
tool-call          → { toolCallId: "call-123", toolName: "sendSpaceMessage", input: { spaceId: "space-X", text: "Here's the Q4 budget: $2.1M allocated..." } }
tool-result        → { toolCallId: "call-123", output: { messageId: "msg-456", sent: true } }
```

The `stream-processor.ts` already accumulates these deltas and parses partial JSON. We add logic to:

1. Detect that the tool is `sendSpaceMessage`
2. Parse the partial JSON on each delta to extract the current `text` value
3. Diff against the previous `text` value to get new characters
4. Emit those new characters as `text-delta` events to the target space's SSE channel

## Implementation: Stream Processor Enhancement

```typescript
// In stream-processor.ts — inside the tool-input-delta handler

// Track streaming state per sendSpaceMessage call
const spaceMessageStreams = new Map<string, {
  targetSpaceId: string | null;
  previousText: string;
  started: boolean;
}>();

// On tool-input-start for sendSpaceMessage
if (toolName === 'sendSpaceMessage') {
  spaceMessageStreams.set(id, { targetSpaceId: null, previousText: '', started: false });
}

// On tool-input-delta for tracked calls
const streamState = spaceMessageStreams.get(id);
if (streamState && partialInput && typeof partialInput === 'object') {
  const partial = partialInput as Record<string, unknown>;

  // Extract spaceId as soon as it's available
  if (!streamState.targetSpaceId && typeof partial.spaceId === 'string') {
    streamState.targetSpaceId = partial.spaceId;
  }

  // Stream new text characters to the target space
  if (streamState.targetSpaceId && typeof partial.text === 'string') {
    const currentText = partial.text;
    const newChars = currentText.slice(streamState.previousText.length);

    if (newChars) {
      // Emit streaming start on first text characters
      if (!streamState.started) {
        await emitToSpace(streamState.targetSpaceId, 'text-delta-start', {
          toolCallId: id,
          entityId: agentEntityId,
        });
        streamState.started = true;
      }

      // Emit REAL text-delta to the target space — these are actual LLM tokens
      await emitToSpace(streamState.targetSpaceId, 'text-delta', {
        toolCallId: id,
        entityId: agentEntityId,
        delta: newChars,
      });
    }
    streamState.previousText = currentText;
  }
}

// On tool-call complete — add text part to the run's composite message for this space
if (toolName === 'sendSpaceMessage') {
  const { spaceId, text } = input;
  // Get or create the composite message for this run + space
  const compositeMsg = await getOrCreateCompositeMessage({
    runId,
    smartSpaceId: spaceId,
    entityId: agentEntityId,
  });
  // Append a text part
  await appendPart(compositeMsg.id, { type: 'text', text });
  // Emit text-end so the client knows this text part is complete
  await emitToSpace(spaceId, 'text-delta-end', {
    toolCallId: id,
    entityId: agentEntityId,
    compositeMessageId: compositeMsg.id,
  });
  spaceMessageStreams.delete(id);
}

// On tool-call complete — add tool_call part for visible tools
if (toolName !== 'sendSpaceMessage' && getToolVisibility(toolName) !== 'hidden') {
  const targetSpaceId = input.targetSpaceId || triggerSpaceId;
  if (targetSpaceId) {
    const compositeMsg = await getOrCreateCompositeMessage({
      runId,
      smartSpaceId: targetSpaceId,
      entityId: agentEntityId,
    });
    await appendPart(compositeMsg.id, {
      type: 'tool_call',
      toolName,
      toolCallId,
      args: stripRoutingFields(input),
      result: null, // filled in when tool result arrives
      visibility: getToolVisibility(toolName),
    });
  }
}

// On run.completed — finalize all composite messages for this run
// (mark as complete, no more parts will be added)
```

---

## Two Streaming Paths

### 1. Event Relay (Run → Trigger Space)

The gateway relays run events to the trigger space's SSE channel in real-time. These events build the **composite message** — one message per run per space, with parts accumulating as the agent executes:

```
run.created         → client creates empty composite message bubble
reasoning-delta     → reasoning text accumulates (collapsible, if showAgentReasoning is on)
tool-input-start    → for visible tools (minimal/full): tool card part appears
tool-input-delta    → for sendSpaceMessage: text part streams. For visible tools: args stream
tool-output-available → for visible tools: result appears. For client tools: UI renders inline
run.waiting_tool    → client tool waiting for user input (UI part in composite message)
run.completed       → composite message finalized
```

All parts accumulate into one composite message. The agent's LLM text output (not from `sendSpaceMessage`) is internal reasoning — not posted as a space message.

### 2. Real Streaming (sendSpaceMessage → Target Space)

When the agent calls `sendSpaceMessage`, the `text` argument streams directly from the LLM to the target space via `tool-input-delta` interception. This adds a **text part** to the composite message:

```
LLM generates tool args     → tool-input-delta events fire
stream-processor intercepts  → extracts new text chars via partial JSON diff
emits text-delta to space    → target space subscribers see REAL token streaming (new text part)
tool-call completes          → text part finalized in composite message
```

**No simulation. No artificial delays. Actual LLM token speed.**

---

## The Full Picture: What the User Sees

All parts stream into a single composite message:

```
Husam: What's the Q4 budget?

AI Assistant (one composite message, parts appear in order):
  [thinking...] (reasoning, if showAgentReasoning is on)
  [tool: readSpaceMessages ✓] (if visibility is minimal/full)
  Here's the Q4 budget: $2.1M allocated, $1.7M spent... (text part, REAL LLM streaming)
  [Budget Chart] (client tool UI part, rendered inline)
  Would you like me to break this down by department? (text part, REAL LLM streaming)
```

Reasoning and visible tool cards appear first as the agent works. Text parts stream at actual LLM token speed. Client tool UI renders inline between text parts. All in one message bubble.

## What About `sendSpaceMessage` with `wait`?

Same real streaming for the message text. The `text` argument streams via `tool-input-delta` into the target space. If `wait` is provided, the tool then blocks waiting for a reply. If `mention` is also provided, the mentioned agent creates its own general run, which also uses `sendSpaceMessage` with real streaming for its response. The wait resolves when the reply arrives.

## Client-Side Handling (react-sdk)

The `useHsafaRuntime` hook already handles `text-delta` events. The only change: these events can now also come from `sendSpaceMessage` tool-input interception (not just from a run's direct text-delta). The event shape is identical:

```typescript
// Already exists — works for both direct run streaming AND sendSpaceMessage streaming
stream.on('text-delta', (event) => {
  const runId = event.runId || event.data.runId;
  const delta = event.data.delta;
  // ... append to streaming message (existing code)
});
```

For `sendSpaceMessage`-originated text-deltas, the event includes the `entityId` of the sending agent, so the client knows which agent's bubble to show. The `toolCallId` is also included for deduplication when the `smartSpace.message` event arrives with the persisted version.

## Why This Works for Multiple Tool Calls

The AI SDK tool loop continues after each tool call. An agent can call multiple tools in one run, and all visible parts accumulate into composite messages:

```
Step 1: Agent calls readSpaceMessages(financeSpace) → hidden (internal)
Step 2: Agent calls sendSpaceMessage(spaceX, "Here's the budget...") → text part streams to Space X
Step 3: Agent calls showBudgetChart({ data: [...] }) → UI part in Space X (trigger space, default)
Step 4: Agent calls sendSpaceMessage(spaceX, "Want a breakdown?") → text part appended to Space X message
Step 5: Agent calls showApprovalForm({ targetSpaceId: spaceY, amount: 50000 }) → UI part routed to Space Y
Step 6: Agent calls sendSpaceMessage(spaceY, "FYI, budget reviewed") → text part in Space Y message
Step 7: Agent finishes (text output = internal summary, not posted)
```

Space X gets one composite message with 3 parts: [text, chart, text]. Space Y gets a separate composite message with 2 parts: [approval form, text]. Tool calls can be routed to any space via `targetSpaceId` (auto-injected by gateway). Each `sendSpaceMessage` call streams independently. Client tool parts render inline.

See [Composite Messages & Tool Visibility](./05-space-ui.md) for the full model including routing rules.
