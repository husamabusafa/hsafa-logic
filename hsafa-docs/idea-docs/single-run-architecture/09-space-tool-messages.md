# Tool Space Messages — `displayTool` + Auto-Injected `targetSpaceId`

## The Idea

A tool config flag — `displayTool: true`. When set, the gateway **auto-injects** a `targetSpaceId` property into the tool's input schema at build time. The tool creator never touches the input schema for this — just sets `displayTool: true`.

When the AI fills `targetSpaceId`, the gateway streams the tool call to that space as a real message. When the AI omits it, the tool executes silently. The AI decides where — any space it's a member of.

---

## How It Works

```
Tool config has displayTool: true
  → gateway auto-injects targetSpaceId into the tool's inputSchema at build time
  → AI sees targetSpaceId as an optional param, fills it when it wants the tool visible

AI calls tool({ ..., targetSpaceId: "space-X" })
  → gateway sees targetSpaceId in args
  → streams tool input to space-X (like sendSpaceMessage streams text)
  → executes the tool (server, client, or external)
  → streams result to space-X
  → persists as a space message with tool_call part
  → strips targetSpaceId before passing args to execute()
```

If the AI calls `generateImage({ prompt: "a sunset", targetSpaceId: "space-X" })`:
1. Gateway intercepts `targetSpaceId` from the args
2. Emits `tool-call.start` to space-X (card appears: "Generating image...")
3. Streams partial args via `tool-input-delta` (space sees prompt streaming in)
4. Executes the tool on the server (with `targetSpaceId` stripped from args)
5. Emits `tool-call.result` to space-X (card updates with the image)
6. Persists a `SmartSpaceMessage` with a `tool_call` part

If the AI calls `generateImage({ prompt: "a sunset" })` — no `targetSpaceId` — nothing happens in any space. The tool executes normally, invisibly.

**The AI decides.** No targetSpaceId = silent tool call. With targetSpaceId = visible message.

---

## Tool Config

The tool creator just sets `displayTool: true`. No need to manually add `targetSpaceId` to the input schema — the gateway does it automatically:

```json
{
  "name": "generateImage",
  "description": "Generate an image from a text prompt",
  "inputSchema": {
    "type": "object",
    "properties": {
      "prompt": { "type": "string", "description": "Image description" }
    },
    "required": ["prompt"]
  },
  "executionType": "image-generator",
  "execution": { "provider": "dall-e", "quality": "hd" },
  "displayTool": true
}
```

At build time, the gateway transforms this to what the AI sees:

```json
{
  "name": "generateImage",
  "inputSchema": {
    "type": "object",
    "properties": {
      "prompt": { "type": "string", "description": "Image description" },
      "targetSpaceId": { "type": "string", "description": "Space to display this tool call in. MUST be provided first." }
    },
    "required": ["prompt"]
  }
}
```

- `targetSpaceId` is **always optional** by default — the AI can skip it for silent execution
- The gateway **strips** `targetSpaceId` from the args before passing to `execute()` — the tool itself never sees it
- If `displayTool` is `false` or absent, no `targetSpaceId` is injected — the tool can never be a space message

### `displayTool` schema

A new **top-level** property on the tool config (alongside `name`, `executionType`, `execution`, `display`):

```
displayTool: boolean    (default: false)
```

That's it. One boolean. The gateway handles the rest.

### What about `display.customUI`?

Still works. `display.customUI` specifies the client component name for rendering:

```json
{
  "name": "showChart",
  "inputSchema": {
    "properties": {
      "type": { "type": "string" },
      "data": { "type": "array" }
    }
  },
  "executionType": "basic",
  "execution": { "mode": "pass-through" },
  "displayTool": true,
  "display": { "customUI": "Chart" }
}
```

`displayTool` controls whether `targetSpaceId` is injected. `display.customUI` controls what component renders the tool call in the UI. They're independent.

---

## The 4 Cases

### Case 1: Server Tool → Space Message (Image Generator)

```json
{
  "name": "generateImage",
  "description": "Generate an image from a text prompt",
  "inputSchema": {
    "type": "object",
    "properties": {
      "prompt": { "type": "string" }
    },
    "required": ["prompt"]
  },
  "executionType": "image-generator",
  "execution": { "provider": "dall-e", "quality": "hd" },
  "displayTool": true,
  "display": { "customUI": "ImageResult" }
}
```

**Flow:**
1. AI calls `generateImage({ prompt: "a sunset over mountains", targetSpaceId: "space-X" })`
2. Gateway sees `targetSpaceId` → starts streaming to space-X
3. Space-X shows card: **"generateImage"** — streaming input...
4. Gateway strips `targetSpaceId`, executes image generation with `{ prompt: "a sunset over mountains" }`
5. Result arrives → gateway emits `tool-call.result` to space-X
6. Space card updates: shows the generated image
7. Gateway persists message with `tool_call` part in space-X
8. AI gets the normal result and continues

**Without targetSpaceId:** AI calls `generateImage({ prompt: "a sunset" })` → tool executes silently, no space sees it.

### Case 2: UI Form → Space Message (Client Tool)

```json
{
  "name": "showApprovalForm",
  "description": "Show an approval form. The run pauses until someone submits.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "amount": { "type": "number" },
      "reason": { "type": "string" }
    },
    "required": ["amount", "reason"]
  },
  "executionType": "basic",
  "execution": null,
  "displayTool": true,
  "display": { "customUI": "ApprovalForm" }
}
```

**Flow:**
1. AI calls `showApprovalForm({ amount: 50000, reason: "Q4 campaign", targetSpaceId: "finance-space" })`
2. `execution: null` → client tool → run pauses (`waiting_tool`)
3. Gateway sees `targetSpaceId` → emits tool call to finance-space
4. Finance space renders `ApprovalForm` component with the args
5. User fills form, clicks submit → `POST /api/runs/:runId/tool-results`
6. Gateway stores result, resumes run
7. AI sees `{ approved: true, approvedBy: "Ahmad" }` and continues

**Key:** The AI sent the form to **finance-space**, not the trigger space. The AI chose where.

### Case 3: External Request → Space Message

```json
{
  "name": "fetchWeatherData",
  "description": "Get current weather for a city",
  "inputSchema": {
    "type": "object",
    "properties": {
      "city": { "type": "string" }
    },
    "required": ["city"]
  },
  "executionType": "request",
  "execution": {
    "url": "https://api.weather.com/v1/current?city={{city}}",
    "method": "GET"
  },
  "displayTool": true
}
```

**Flow:**
1. AI calls `fetchWeatherData({ city: "New York", targetSpaceId: "ops-space" })`
2. Gateway sees `targetSpaceId` → emits `tool-call.start` to ops-space
3. Ops-space shows: **"fetchWeatherData"** — running...
4. Gateway strips `targetSpaceId`, executes HTTP request with `{ city: "New York" }`
5. Response arrives → gateway emits `tool-call.result` to ops-space
6. Space card updates with the weather data

**Without targetSpaceId:** AI calls `fetchWeatherData({ city: "New York" })` → silent API call, result goes only to the AI.

### Case 4: Static UI → Space Message (Display Only)

```json
{
  "name": "showChart",
  "description": "Display a chart",
  "inputSchema": {
    "type": "object",
    "properties": {
      "type": { "type": "string", "enum": ["bar", "line", "pie"] },
      "data": { "type": "array" },
      "title": { "type": "string" }
    },
    "required": ["type", "data"]
  },
  "executionType": "basic",
  "execution": { "mode": "pass-through" },
  "displayTool": true,
  "display": { "customUI": "Chart" }
}
```

**Flow:**
1. AI calls `showChart({ type: "bar", data: [...], title: "Q4 Revenue", targetSpaceId: "leadership-space" })`
2. `pass-through` → immediate result (input echoed back) — no waiting
3. Gateway sees `targetSpaceId` → emits tool call + result to leadership-space
4. Leadership space renders `Chart` component with the data
5. AI continues immediately

**Key:** AI sent the chart to leadership-space, not trigger space. Could send the same chart to multiple spaces with separate calls.

---

## Cross-Space Example

The AI is triggered from Husam's space. It generates an image, shows it in the design space, and shows an approval form in the finance space — all in one run:

```
Trigger: Husam says "Create a campaign banner and get finance approval for $50K"

1. AI calls generateImage({ prompt: "campaign banner...", targetSpaceId: "design-space" })
   → Design space sees the image generating and appearing

2. AI calls showApprovalForm({ amount: 50000, reason: "Campaign budget", targetSpaceId: "finance-space" })
   → Finance space sees the approval form, run pauses

3. Finance user approves → run resumes

4. AI calls sendSpaceMessage({ spaceId: "husams-space", text: "Done! Banner created and budget approved." })
   → Husam sees the response in his space
```

Three spaces, one run. The AI decided where everything goes.

---

## Multi-Agent Visibility

When a tool message is persisted as a `SmartSpaceMessage`, it becomes part of the space's conversation history:

- **Other agents see it.** When another agent calls `readSpaceMessages` on that space, the tool message appears with its input and output.
- **Mentioning works.** AI can `sendSpaceMessage` with `mention` after the tool call — the mentioned agent sees the tool message in context.
- **No special handling.** Tool messages are just messages.

```
Agent A calls generateImage({ prompt: "dashboard mockup", targetSpaceId: "design-space" })
  → appears as tool_call message in design-space

Agent A calls sendSpaceMessage({ spaceId: "design-space", text: "Review this mockup", mention: agentB })
  → Agent B triggered, reads design-space messages, sees the image + the text
  → Agent B responds based on the image
```

---

## Gateway Behavior: `targetSpaceId` Injection + Stripping

### At build time (injection)

When the gateway builds a tool with `displayTool: true`:

1. Clone the tool's `inputSchema`
2. Add `targetSpaceId` to `properties`:
   ```json
   "targetSpaceId": {
     "type": "string",
     "description": "Space to display this tool call in. MUST be provided first."
   }
   ```
3. Do NOT add `targetSpaceId` to `required` — it's always optional
4. Pass the modified schema to the AI SDK

The tool creator's original `inputSchema` is untouched. The injection only happens in the schema the AI sees.

### At runtime (stripping)

The gateway must **strip `targetSpaceId`** from the tool args before passing to `execute()`:

1. During `tool-input-delta` processing: parse partial JSON, extract `targetSpaceId` for routing
2. On `tool-call` complete: remove `targetSpaceId` from the input before the AI SDK calls `execute()`
3. The tool's execute function never sees `targetSpaceId` — it gets clean args

**Variable interpolation:** For `request` tools, `targetSpaceId` must be excluded from `{{variable}}` interpolation — it's a routing field, not data.

---

## What Already Exists (Baseline)

| Piece | Status | File |
|-------|--------|------|
| `display` field on tool config | ✅ Exists | `types.ts` → `ToolDisplaySchema` |
| Visible tool events to space | ✅ Works | `stream-processor.ts` |
| Client tool → `waiting_tool` → resume | ✅ Works | `run-runner.ts`, `tool-results.ts` |
| `tool-input-delta` streaming + partial JSON | ✅ Works | `stream-processor.ts` |
| SSE events for tool lifecycle | ✅ Works | `useHsafaRuntime.ts` |
| `submitToolResult` REST endpoint | ✅ Works | `POST /api/runs/:runId/tool-results` |
| `useToolResult` hook | ✅ Works | `react-sdk/src/hooks/useToolResult.ts` |
| `displayTool` config flag | ❌ Not yet | — |
| `targetSpaceId` auto-injection | ❌ Not yet | — |
| `targetSpaceId` stripping from args | ❌ Not yet | — |
| Persist tool call as space message | ❌ Not yet | — |
| Input streaming for non-sendSpaceMessage tools | ❌ Not yet | — |

---

## Implementation Plan

### Step 1: Add `displayTool` to tool config schema

**File: `hsafa-gateway/src/agent-builder/types.ts`**

Add `displayTool` as a top-level optional boolean on `ToolConfigSchema`:

```typescript
export const ToolConfigSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  inputSchema: z.record(z.unknown()).optional(),
  executionType: z.enum(['basic', 'request', 'image-generator', ...]).optional(),
  execution: z.unknown().optional(),
  display: ToolDisplaySchema.optional(),
  displayTool: z.boolean().optional(),  // NEW
});
```

### Step 2: Auto-inject `targetSpaceId` into input schema at build time

**File: `hsafa-gateway/src/agent-builder/builder.ts`**

For every tool with `displayTool: true`, inject `targetSpaceId` into the input schema before passing to the AI SDK:

```typescript
const displayToolNames = new Set<string>();

for (const t of configTools) {
  if (t.displayTool === true) {
    displayToolNames.add(t.name);

    // Auto-inject targetSpaceId into inputSchema
    const schema = (t.inputSchema as any) || { type: 'object', properties: {} };
    if (!schema.properties) schema.properties = {};
    schema.properties.targetSpaceId = {
      type: 'string',
      description: 'Space to display this tool call in. MUST be provided first.',
    };
    // Do NOT add to required — always optional
    t.inputSchema = schema;
  }
}
```

Return `displayToolNames` in `BuildAgentResult`. Pass it to `processStream`.

### Step 3: Strip `targetSpaceId` from tool args before execute

**File: `hsafa-gateway/src/agent-builder/tool-builder.ts`**

For tools with `displayTool: true`, wrap `execute()` to strip `targetSpaceId`:

```typescript
// In buildTool, when displayTool is true:
const originalExecute = execute;
execute = async (input: unknown, opts) => {
  const cleaned = { ...(input as Record<string, unknown>) };
  delete cleaned.targetSpaceId;
  return originalExecute(cleaned, opts);
};
```

### Step 4: Stream tool events to the target space

**File: `hsafa-gateway/src/lib/stream-processor.ts`**

Extend the stream processor to handle display tools:

```typescript
// New option:
displayTools?: Set<string>;

// Track per-tool-call target space (extracted from partial JSON)
const toolTargetSpaces = new Map<string, string>();  // toolCallId → targetSpaceId

// On tool-input-delta: extract targetSpaceId from partial args
if (displayTools?.has(currentToolName) && partial) {
  const targetSpaceId = (partial as any).targetSpaceId;
  if (typeof targetSpaceId === 'string' && !toolTargetSpaces.has(id)) {
    toolTargetSpaces.set(id, targetSpaceId);
    // Start streaming to this space
    await emitSmartSpaceEvent(targetSpaceId, 'tool-call.start', {
      toolCallId: id, toolName: currentToolName
    }, spaceCtx);
  }
  
  // Stream partial args (excluding targetSpaceId) to the target space
  const targetSpace = toolTargetSpaces.get(id);
  if (targetSpace) {
    const cleanPartial = { ...partial };
    delete (cleanPartial as any).targetSpaceId;
    await emitSmartSpaceEvent(targetSpace, 'tool-input-delta', {
      toolCallId: id, partialArgs: cleanPartial
    }, spaceCtx);
  }
}

// On tool-call complete: emit full args to target space
const targetSpace = toolTargetSpaces.get(toolCallId);
if (targetSpace) {
  const cleanArgs = { ...(input as any) };
  delete cleanArgs.targetSpaceId;
  await emitSmartSpaceEvent(targetSpace, 'tool-call', {
    toolCallId, toolName, args: cleanArgs
  }, spaceCtx);
}

// On tool-result: emit result to target space
if (targetSpace) {
  await emitSmartSpaceEvent(targetSpace, 'tool-call.result', {
    toolCallId, toolName, output
  }, spaceCtx);
}
```

### Step 5: Persist tool call as a space message

After `tool-result` completes for a tool with a target space:

```typescript
import { createSmartSpaceMessage } from './smartspace-db.js';

if (targetSpace) {
  const customUI = toolDisplayConfigs?.get(toolName)?.customUI;

  const msg = await createSmartSpaceMessage({
    smartSpaceId: targetSpace,
    entityId: agentEntityId,
    role: 'assistant',
    content: null,
    metadata: {
      uiMessage: {
        parts: [{
          type: 'tool_call',
          toolCallId,
          toolName,
          args: cleanArgs,
          result: output,
          status: 'complete',
          customUI,
        }]
      },
      runId,
    },
  });

  await emitSmartSpaceEvent(targetSpace, 'smartSpace.message', {
    message: { id: msg.id, role: 'assistant', parts: msg.metadata.uiMessage.parts },
    streamId: toolCallId,
  }, spaceCtx);
}
```

For client tools: persist immediately with `status: 'waiting'`, update on result submission.

### Step 6: Handle `waiting_tool` space messages

**File: `hsafa-gateway/src/lib/tool-results.ts`**

When a tool result is submitted for a client tool that was sent to a space:

1. Store the result in run metadata (existing — unchanged)
2. Find the persisted `SmartSpaceMessage` for this `toolCallId` → update `status: 'complete'` and add `result`
3. Emit `tool-call.result` to the target space
4. Resume the run (existing — unchanged)

### Step 7: React SDK — handle `tool-input-delta`

**File: `react-sdk/src/runtime/useHsafaRuntime.ts`**

Add a handler for `tool-input-delta` to stream tool args:

```typescript
stream.on('tool-input-delta', (e: StreamEvent) => {
  const toolCallId = e.data?.toolCallId as string;
  const partialArgs = e.data?.partialArgs as Record<string, unknown>;
  if (!toolCallId) return;
  setToolCalls(prev => prev.map(tc =>
    tc.toolCallId === toolCallId ? { ...tc, args: partialArgs } : tc
  ));
});
```

### Step 8: Update tool docs

**File: `hsafa-docs/hsafa-tools/tool.md`**

Document `displayTool`:

```markdown
### `displayTool` (optional)

When `true`, the gateway auto-injects a `targetSpaceId` parameter into the tool's input schema. The AI can then provide a space ID to display the tool call as a message in that space.

- The AI sees `targetSpaceId` as an optional parameter
- If the AI provides `targetSpaceId`, the tool call streams to that space as a real message
- If the AI omits `targetSpaceId`, the tool executes silently
- The gateway strips `targetSpaceId` before executing — the tool never sees it
- Works with all execution types: basic, request, image-generator, etc.
```

---

## Message Format in DB

Tool space message stored in `SmartSpaceMessage.metadata.uiMessage`:

```json
{
  "parts": [
    {
      "type": "tool_call",
      "toolCallId": "call_abc123",
      "toolName": "generateImage",
      "args": { "prompt": "a sunset over mountains" },
      "result": { "success": true, "images": [{ "url": "data:image/png;base64,..." }] },
      "status": "complete",
      "customUI": "ImageResult"
    }
  ]
}
```

For client tools waiting for input:

```json
{
  "parts": [
    {
      "type": "tool_call",
      "toolCallId": "call_def456",
      "toolName": "showApprovalForm",
      "args": { "amount": 50000, "reason": "Q4 campaign" },
      "result": null,
      "status": "waiting",
      "customUI": "ApprovalForm",
      "runId": "run_xyz"
    }
  ]
}
```

Note: `targetSpaceId` is NOT in `args` — it was stripped by the gateway. `args` only contains the tool's actual data.

---

## SSE Event Sequence (Space Stream)

For a server-executed tool with `targetSpaceId`:

```
tool-call.start     → { toolCallId, toolName }
tool-input-delta    → { toolCallId, partialArgs }           (repeated, targetSpaceId stripped)
tool-call           → { toolCallId, toolName, args }        (full args, targetSpaceId stripped)
tool-call.result    → { toolCallId, toolName, output }      (execution done)
smartSpace.message  → { message: {...}, streamId }          (persisted, dedup)
```

For a client tool with `targetSpaceId`:

```
tool-call.start     → { toolCallId, toolName }
tool-input-delta    → { toolCallId, partialArgs }           (repeated)
tool-call           → { toolCallId, toolName, args }        (full args — UI renders)
smartSpace.message  → { message: {..., status: "waiting"} } (persisted)
  ... user interacts ...
tool-call.result    → { toolCallId, toolName, output }      (user submitted)
smartSpace.message  → { message: {..., status: "complete"} } (updated)
```

---

## What Doesn't Change

- **Tool execution** — all execution types work the same. Gateway just adds space streaming when `targetSpaceId` is present in args.
- **`sendSpaceMessage`** — unchanged. Still the way agents send text messages.
- **`waiting_tool` flow** — unchanged. Client tools still pause and resume the same way.
- **Run stream** — still gets all events via `emitEvent`. Space events are additional.
- **Auth** — agent membership in target space is validated before emitting.

---

## Ship Order

1. **`displayTool` flag** — add to tool config schema
2. **Auto-inject `targetSpaceId`** — builder injects into inputSchema for displayTool tools
3. **Strip `targetSpaceId` from args** — tool-builder wraps execute to remove it
4. **Stream tool events to target space** — stream-processor extracts `targetSpaceId` from partial JSON, emits to that space
5. **Persist as space message** — create `SmartSpaceMessage` on tool result
6. **Client tool space messages** — persist with `waiting` status, update on result
7. **React SDK: `tool-input-delta`** — stream tool args to UI
8. **Tool docs** — document `displayTool` and update per-type docs with examples
