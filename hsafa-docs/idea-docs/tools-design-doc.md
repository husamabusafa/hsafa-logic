# Hsafa Tools — Design Document

This document defines the full tools architecture for Hsafa Logic. It covers the two tool categories, their execution model, access control, the "Set Goals" prebuilt tool as the first implementation, and how the SDKs handle tool result submission.

---

## 0) PREREQUISITE — Wire Tools into ToolLoopAgent (must do first)

### Current State

The gateway has `tool-builder.ts`, `tool-resolver.ts`, and `mcp-resolver.ts` — but **none of them are called**. The `builder.ts` creates the `ToolLoopAgent` without any `tools` property:

```typescript
// builder.ts (current — NO tools)
const agent = new ToolLoopAgent({
  model,
  instructions: validatedConfig.agent.system,
  stopWhen: stepCountIs(validatedConfig.loop?.maxSteps ?? 5),
  ...modelSettings,
});
```

Per the Vercel AI SDK docs, `ToolLoopAgent` accepts `tools: Record<string, Tool>` in the constructor. Tools with an `execute` function run automatically in the loop; tools **without** `execute` stop the loop (used for client tools).

### What Must Change

**`builder.ts`** must resolve tools and pass them to `ToolLoopAgent`:

```typescript
import { resolveTools } from './tool-resolver.js';
import { resolveMCPClients } from './mcp-resolver.js';

export interface BuildAgentOptions {
  config: AgentConfig;
  runContext?: PrebuiltToolContext; // needed for prebuilt tools
}

export async function buildAgent(options: BuildAgentOptions): Promise<BuildAgentResult> {
  const { config, runContext } = options;
  // ... validation ...

  // 1. Resolve static tools (basic, request, compute, ai-agent, image-generator, prebuilt)
  const staticTools = resolveTools(validatedConfig.tools, runContext);

  // 2. Resolve MCP tools
  const mcpClients = await resolveMCPClients(validatedConfig.mcp);
  const mcpTools = extractMCPTools(mcpClients);

  // 3. Merge all tools
  const allTools = { ...staticTools, ...mcpTools };

  // 4. Pass to ToolLoopAgent
  const agent = new ToolLoopAgent({
    model,
    instructions: validatedConfig.agent.system,
    tools: allTools,
    toolChoice: validatedConfig.loop?.toolChoice ?? 'auto',
    stopWhen: stepCountIs(validatedConfig.loop?.maxSteps ?? 5),
    ...modelSettings,
  });

  return { agent, config: validatedConfig, mcpClients };
}
```

**`run-runner.ts`** must pass `runContext` to `buildAgent()`:

```typescript
const built = await buildAgent({
  config,
  runContext: {
    runId,
    agentEntityId: run.agentEntityId,
    smartSpaceId: run.smartSpaceId,
    agentId: run.agentId,
  },
});
```

### Client Tools & the Agent Loop

When a client tool (no `execute`) is called, the `ToolLoopAgent` loop **stops** — the AI SDK returns the tool call in the result but doesn't execute it. The run-runner already streams `tool-input-available` events. The client sees the event, executes locally, and POSTs the result back.

To **resume** after receiving a client tool result, the gateway calls `executeRun()` again with the tool result injected into the message history (already done in `tool-results.ts` → `executeRun()`). This is a fresh agent invocation with the full history including the tool result — not a true "resume" of the paused step, but it works correctly because the message history contains the tool call + result, and the AI SDK's `convertToModelMessages` handles it.

### Compatibility with Vercel AI SDK

| Feature | AI SDK Support | How We Use It |
|---------|---------------|--------------|
| `tool()` with `execute` | ✅ Auto-runs in loop | Server tools (prebuilt, request, compute, etc.) |
| `tool()` without `execute` | ✅ Stops loop | Client tools (basic no-execution mode) |
| `jsonSchema()` for input | ✅ Alternative to Zod | Agent configs define JSON schemas, not Zod |
| `ToolLoopAgent` with `tools` | ✅ Constructor param | Must wire in (currently missing) |
| `toolChoice` | ✅ auto/required/none | From agent config `loop.toolChoice` |
| `fullStream` events | ✅ tool-call, tool-result, etc. | Already consumed in run-runner |
| `experimental_context` | ⚠️ Experimental, can break | **Not used** — we use closures instead |
| `onInputStart/Delta/Available` hooks | ✅ On `tool()` | Could use for finer streaming control |
| `dynamicTool()` | ✅ For unknown schemas | Could use for MCP tools |

---

## 1) Two Categories of Tools

### Prebuilt Tools

Server-side tools that the **AI agent executes autonomously** during a Run. They give the agent real capabilities — reading/writing data, setting goals, managing memory, scheduling plans, etc.

**Key properties:**
- Executed **on the gateway** — no client involvement
- Defined in agent config JSON under `tools[]`
- Input/output is **hidden from public key** clients (the browser user cannot see what the agent read/wrote)
- Input/output is **visible to secret key** clients (backend admin, dashboards, debugging)
- The agent calls them like any other tool — the gateway intercepts and executes server-side
- Results flow back into the AI loop automatically (no `addToolResult` needed)

**Use cases:**
- `setGoals` — Agent sets/updates its own goals
- `getGoals` — Agent reads its current goals
- `setMemory` / `getMemory` — Agent manages long-term memory
- `createPlan` / `getPlan` — Agent schedules future executions
- `queryKnowledge` — Agent searches a knowledge base
- `sendNotification` — Agent sends push/email notifications

**Execution flow:**
```
User message → Agent Run starts → LLM decides to call `setGoals`
  → Gateway executes tool server-side (DB write)
  → Result returned to LLM (next step)
  → LLM continues reasoning with the result
  → Final response streamed to client
```

**Access control for streamed events:**

| Event | Public Key (browser) | Secret Key (backend) |
|-------|---------------------|---------------------|
| `tool-input-start` | toolName only | toolName + full details |
| `tool-input-delta` | hidden | full partial JSON |
| `tool-input-available` | `{ toolCallId, toolName }` | `{ toolCallId, toolName, input }` |
| `tool-output-available` | `{ toolCallId, toolName }` | `{ toolCallId, toolName, output }` |

This means the browser client knows a prebuilt tool was called (for loading state / UI indicators), but cannot see what data was read or written. The secret key holder (admin dashboard, server-side monitoring) sees everything.

### Additional Tools (Client/External Tools)

Tools that execute **outside the gateway** — on a React app, a Node.js backend, a robot, a mobile device, etc. The client subscribes to the SmartSpace stream, sees `tool-input-available`, executes locally, and POSTs the result back.

**Key properties:**
- Execution target is `client` or `external` (not `server`)
- The Run **pauses** (`waiting_tool` status) until the result is submitted
- Input/output is visible to the executing client (it needs the input to execute)
- Can return data from the client back to the agent
- Can be used to show custom UI (e.g., approval dialogs, forms, custom components)
- SDK handles the subscribe → execute → submit flow automatically

**Use cases:**
- `getUserApproval` — Show approval UI in React, return user choice
- `getDomComponents` — Read DOM elements from browser
- `fillActiveInput` — Fill a form field in the browser
- `executeRobotAction` — Send command to a physical robot via Node.js
- `fetchClientData` — Get data only available on the client
- `showCustomChart` — Render a chart component, return confirmation

**Execution flow:**
```
Agent Run → LLM calls `getUserApproval` → Gateway emits `tool-input-available`
  → Run status → `waiting_tool`
  → Client SDK sees event, shows approval UI
  → User clicks "Approve"
  → SDK calls `client.tools.submitResult()` or `client.tools.submitRunResult()`
  → Gateway receives result, emits `tool-output-available`
  → Run resumes, LLM gets the result
  → Agent continues reasoning
```

---

## 2) Tool Classification in Agent Config

Tools are classified by `executionType`. We add a new execution type `prebuilt` for server-side prebuilt tools.

### Existing execution types (unchanged):
- `basic` — Frontend tool (no-execution, static, pass-through)
- `request` — HTTP request to external API
- `image-generator` — Image generation
- `ai-agent` — Sub-agent execution
- `waiting` — Pause execution
- `compute` — Server-side computation

### New execution type:
- `prebuilt` — Server-side prebuilt tool (gateway-managed)

```json
{
  "name": "setGoals",
  "description": "Set or update your goals. Use this to track what you're working toward.",
  "executionType": "prebuilt",
  "execution": {
    "action": "setGoals"
  }
}
```

The `execution.action` maps to a registered server-side handler. The `inputSchema` is **auto-provided** by the prebuilt tool registry — agents don't need to specify it (similar to how `image-generator` auto-provides a `prompt` schema).

---

## 3) Prebuilt Tool Registry (Gateway)

The gateway maintains a registry of prebuilt tool handlers. Each handler:
- Defines its `inputSchema` (auto-injected into the tool definition)
- Has access to the **run context** (runId, agentEntityId, smartSpaceId)
- Executes server-side with direct DB access
- Returns a result that flows back to the LLM

### Registry Interface

```typescript
// hsafa-gateway/src/agent-builder/prebuilt-tools/registry.ts

interface PrebuiltToolContext {
  runId: string;
  agentEntityId: string;
  smartSpaceId: string;
  agentId: string;
}

interface PrebuiltToolHandler {
  /** Auto-injected into tool definition if not provided */
  inputSchema: Record<string, unknown>;
  /** Description auto-injected if not provided in agent config */
  defaultDescription: string;
  /** Execute the tool server-side */
  execute: (input: unknown, context: PrebuiltToolContext) => Promise<unknown>;
}

// Map of action name → handler
const prebuiltToolRegistry: Map<string, PrebuiltToolHandler>;
```

### How it integrates with the Agent Builder

During `buildAgent()`, when processing tools with `executionType: "prebuilt"`:

1. Look up `execution.action` in the registry
2. Inject the handler's `inputSchema` if not provided in agent config
3. Inject the handler's `defaultDescription` if not provided
4. Create an AI SDK `tool()` with an `execute` function that:
   - Calls the registry handler with the run context
   - Records the ToolCall in DB (`executionTarget: 'server'`)
   - Records the ToolResult in DB
   - Returns the result to the LLM loop

```typescript
// In builder.ts, when processing prebuilt tools:

import { tool } from 'ai';
import { prebuiltToolRegistry } from './prebuilt-tools/registry.js';

function buildPrebuiltTool(toolConfig: ToolConfig, runContext: PrebuiltToolContext) {
  const handler = prebuiltToolRegistry.get(toolConfig.execution.action);
  if (!handler) throw new Error(`Unknown prebuilt tool: ${toolConfig.execution.action}`);

  return tool({
    description: toolConfig.description || handler.defaultDescription,
    parameters: toolConfig.inputSchema || handler.inputSchema,
    execute: async (input) => {
      // Record tool call
      await prisma.toolCall.create({
        data: {
          runId: runContext.runId,
          callId: `prebuilt-${Date.now()}`,
          toolName: toolConfig.name,
          args: input,
          executionTarget: 'server',
          status: 'completed',
          seq: BigInt(Date.now()),
          completedAt: new Date(),
        },
      });

      // Execute handler
      const result = await handler.execute(input, runContext);

      // Record result
      await prisma.toolResult.create({
        data: {
          runId: runContext.runId,
          callId: `prebuilt-${Date.now()}`,
          result: result,
          source: 'server',
        },
      });

      return result;
    },
  });
}
```

---

## 4) First Prebuilt Tool: `setGoals`

### Purpose

Allows the agent to set, update, and manage its own goals. Goals persist across Runs and SmartSpaces — they are tied to the agent Entity.

### Database Model (already exists)

```prisma
model Goal {
  id          String   @id @default(uuid()) @db.Uuid
  entityId    String   @map("entity_id") @db.Uuid
  description String   @db.Text
  priority    Int      @default(0)
  isLongTerm  Boolean  @default(false) @map("is_long_term")
  isCompleted Boolean  @default(false) @map("is_completed")
  metadata    Json?    @db.JsonB
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  entity Entity @relation(fields: [entityId], references: [id], onDelete: Cascade)
}
```

### Input Schema

```json
{
  "type": "object",
  "properties": {
    "goals": {
      "type": "array",
      "description": "Goals to set or update. Each goal has a description and optional metadata.",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "description": "Existing goal ID to update. Omit to create a new goal."
          },
          "description": {
            "type": "string",
            "description": "What you want to achieve."
          },
          "priority": {
            "type": "number",
            "description": "Priority level (0 = lowest). Higher = more important."
          },
          "isLongTerm": {
            "type": "boolean",
            "description": "true for long-term/ongoing goals, false for short-term."
          },
          "isCompleted": {
            "type": "boolean",
            "description": "Mark as completed."
          }
        },
        "required": ["description"]
      }
    },
    "clearExisting": {
      "type": "boolean",
      "description": "If true, remove all existing goals before setting new ones. Default: false."
    }
  },
  "required": ["goals"]
}
```

### Handler Implementation

```typescript
// hsafa-gateway/src/agent-builder/prebuilt-tools/set-goals.ts

import { prisma } from '../../lib/db.js';
import type { PrebuiltToolHandler, PrebuiltToolContext } from './registry.js';

interface GoalInput {
  id?: string;
  description: string;
  priority?: number;
  isLongTerm?: boolean;
  isCompleted?: boolean;
}

interface SetGoalsInput {
  goals: GoalInput[];
  clearExisting?: boolean;
}

export const setGoalsHandler: PrebuiltToolHandler = {
  defaultDescription: 'Set or update your goals. Use this to track objectives, priorities, and progress.',
  
  inputSchema: { /* ... the JSON schema above ... */ },

  async execute(input: unknown, context: PrebuiltToolContext) {
    const { goals, clearExisting } = input as SetGoalsInput;
    const { agentEntityId } = context;

    // Optionally clear existing goals
    if (clearExisting) {
      await prisma.goal.deleteMany({
        where: { entityId: agentEntityId },
      });
    }

    const results = [];

    for (const goal of goals) {
      if (goal.id) {
        // Update existing goal
        const updated = await prisma.goal.update({
          where: { id: goal.id },
          data: {
            description: goal.description,
            priority: goal.priority ?? 0,
            isLongTerm: goal.isLongTerm ?? false,
            isCompleted: goal.isCompleted ?? false,
          },
        });
        results.push({ action: 'updated', id: updated.id, description: updated.description });
      } else {
        // Create new goal
        const created = await prisma.goal.create({
          data: {
            entityId: agentEntityId,
            description: goal.description,
            priority: goal.priority ?? 0,
            isLongTerm: goal.isLongTerm ?? false,
            isCompleted: goal.isCompleted ?? false,
          },
        });
        results.push({ action: 'created', id: created.id, description: created.description });
      }
    }

    // Return current state of all goals
    const allGoals = await prisma.goal.findMany({
      where: { entityId: agentEntityId },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });

    return {
      success: true,
      goalsModified: results,
      currentGoals: allGoals.map(g => ({
        id: g.id,
        description: g.description,
        priority: g.priority,
        isLongTerm: g.isLongTerm,
        isCompleted: g.isCompleted,
      })),
      totalGoals: allGoals.length,
    };
  },
};
```

### Agent Config Example

```json
{
  "version": "1.0",
  "agent": {
    "name": "goal-aware-assistant",
    "description": "An assistant that tracks goals and works toward them.",
    "system": "You are a helpful assistant that actively tracks goals.\nWhen the user asks you to do something that implies a goal, use the setGoals tool to record it.\nReview your goals periodically and work toward completing them.\nMark goals as completed when done."
  },
  "model": {
    "provider": "openai",
    "name": "gpt-4o",
    "temperature": 0.7,
    "maxOutputTokens": 1500
  },
  "loop": {
    "maxSteps": 10,
    "toolChoice": "auto"
  },
  "tools": [
    {
      "name": "setGoals",
      "executionType": "prebuilt",
      "execution": {
        "action": "setGoals"
      }
    },
    {
      "name": "getGoals",
      "executionType": "prebuilt",
      "execution": {
        "action": "getGoals"
      }
    }
  ],
  "runtime": {
    "response": {
      "type": "ui-message-stream"
    }
  }
}
```

---

## 5) Streaming Event Access Control

### Problem

Prebuilt tools operate on sensitive internal data (goals, memory, plans). The browser user shouldn't see the raw input/output — only that a tool was called. But the secret key holder (admin) needs full visibility for debugging and monitoring.

### Solution: Filter events based on auth type

The gateway already streams events via Redis → SSE. We add a filter layer in the SSE endpoints:

```typescript
// When emitting tool events for prebuilt tools:

function filterToolEvent(event: StreamEvent, authType: 'secret_key' | 'public_key_jwt'): StreamEvent {
  const isPrebuilt = event.data?.executionTarget === 'server';
  
  if (!isPrebuilt || authType === 'secret_key') {
    // Secret key sees everything, non-prebuilt tools are always visible
    return event;
  }

  // Public key: strip input/output from prebuilt tool events
  if (event.type === 'tool-input-available') {
    return {
      ...event,
      data: {
        toolCallId: event.data.toolCallId,
        toolName: event.data.toolName,
        // input stripped
      },
    };
  }

  if (event.type === 'tool-output-available') {
    return {
      ...event,
      data: {
        toolCallId: event.data.toolCallId,
        toolName: event.data.toolName,
        // output stripped
      },
    };
  }

  if (event.type === 'tool-input-delta') {
    // Completely skip delta events for prebuilt tools on public key
    return null; // filtered out
  }

  return event;
}
```

### What the browser sees

When the agent calls `setGoals`:

```
event: tool-input-start
data: { "toolCallId": "tc_123", "toolName": "setGoals" }

event: tool-input-available
data: { "toolCallId": "tc_123", "toolName": "setGoals" }

// (tool executes server-side, no waiting)

event: tool-output-available
data: { "toolCallId": "tc_123", "toolName": "setGoals" }
```

The browser UI can show a "Setting goals..." indicator, but never sees the actual goal data.

### What the admin sees

```
event: tool-input-start
data: { "toolCallId": "tc_123", "toolName": "setGoals" }

event: tool-input-delta
data: { "toolCallId": "tc_123", "partialInput": { "goals": [{ "description": "Help user..." }] } }

event: tool-input-available
data: { "toolCallId": "tc_123", "toolName": "setGoals", "input": { "goals": [...], "clearExisting": false } }

event: tool-output-available
data: { "toolCallId": "tc_123", "toolName": "setGoals", "output": { "success": true, "goalsModified": [...] } }
```

---

## 6) SDK Tool Result Handling

### Current state (already implemented)

Both SDKs already have tool result submission:

**Node SDK (`@hsafa/node`):**
```typescript
// Submit via SmartSpace endpoint
await client.tools.submitResult(smartSpaceId, {
  runId, toolCallId, result, source: 'client'
});

// Submit via Run endpoint
await client.tools.submitRunResult(runId, {
  callId, result, source: 'client', clientId
});
```

**React SDK (`@hsafa/react-sdk`):**
```typescript
const { submit, submitToRun, isSubmitting } = useToolResult();

await submit(smartSpaceId, { runId, toolCallId, result });
await submitToRun(runId, { callId, result });
```

### What needs to be added for Additional Tools

The SDKs need **automatic tool handling** — subscribing to the stream, detecting `tool-input-available` for tools the client can handle, executing them, and submitting results automatically.

#### React SDK: `useAutoToolHandler`

```typescript
// react-sdk/src/hooks/useAutoToolHandler.ts

interface ToolHandler {
  (input: unknown): Promise<unknown> | unknown;
}

interface UseAutoToolHandlerOptions {
  smartSpaceId: string;
  /** Map of toolName → handler function */
  tools: Record<string, ToolHandler>;
}

function useAutoToolHandler({ smartSpaceId, tools }: UseAutoToolHandlerOptions) {
  const client = useHsafaClient();

  useEffect(() => {
    // Subscribe to SmartSpace stream
    const stream = client.spaces.subscribe(smartSpaceId);

    stream.on('tool-input-available', async (event) => {
      const { toolCallId, toolName, input, runId } = event.data;
      
      const handler = tools[toolName];
      if (!handler) return; // Not our tool

      try {
        const result = await handler(input);
        await client.tools.submitResult(smartSpaceId, {
          runId, toolCallId, result, source: 'client'
        });
      } catch (error) {
        await client.tools.submitResult(smartSpaceId, {
          runId, toolCallId,
          result: { error: error.message },
          source: 'client'
        });
      }
    });

    return () => stream.close();
  }, [client, smartSpaceId, tools]);
}
```

#### Node SDK: `onToolCall` helper

```typescript
// node-sdk — usage pattern

const stream = client.spaces.subscribe(smartSpaceId);

stream.on('tool-input-available', async (event) => {
  const { toolCallId, toolName, input, runId } = event.data;

  if (toolName === 'executeRobotAction') {
    const result = await robot.execute(input);
    await client.tools.submitResult(smartSpaceId, {
      runId, toolCallId, result, source: 'client'
    });
  }
});
```

#### UI SDK: Integration with `HsafaChatProvider`

The UI SDK's `HsafaChatProvider` should accept a `tools` prop for automatic client tool handling:

```tsx
<HsafaChatProvider
  gatewayUrl={GATEWAY_URL}
  publicKey={PUBLIC_KEY}
  jwt={session.token}
  entityId={session.user.entityId}
  defaultSpaceId={initialSpaceId}
  tools={{
    getUserApproval: async ({ action, amount }) => {
      // Show approval dialog, wait for user
      return { approved: true };
    },
    showChart: async ({ data, chartType }) => {
      // Render chart component
      return { displayed: true };
    },
  }}
>
  {children}
</HsafaChatProvider>
```

---

## 7) Changes Required

### Gateway (`hsafa-gateway/`)

1. **New files:**
   - `src/agent-builder/prebuilt-tools/registry.ts` — Prebuilt tool registry
   - `src/agent-builder/prebuilt-tools/set-goals.ts` — `setGoals` handler
   - `src/agent-builder/prebuilt-tools/get-goals.ts` — `getGoals` handler

2. **Modified files:**
   - `src/agent-builder/types.ts` — Add `prebuilt` execution type + schema
   - `src/agent-builder/builder.ts` — Pass run context to builder, wire prebuilt tools into ToolLoopAgent
   - `src/lib/run-runner.ts` — Pass run context (runId, agentEntityId, smartSpaceId) to buildAgent
   - SSE streaming endpoints — Add event filtering based on auth type for prebuilt tool events

3. **Schema addition to `types.ts`:**
   ```typescript
   export const PrebuiltExecutionSchema = z.object({
     action: z.string(), // maps to registry key
   });
   ```
   
   Add to `ToolSchema` discriminated union:
   ```typescript
   z.object({
     name: z.string(),
     description: z.string().optional(),
     inputSchema: z.unknown().optional(), // auto-injected from registry
     executionType: z.literal('prebuilt'),
     execution: PrebuiltExecutionSchema,
   }),
   ```

### Run Runner Changes

Currently `buildAgent()` doesn't receive run context. For prebuilt tools, it needs:

```typescript
// run-runner.ts — pass context to builder
const built = await buildAgent({
  config,
  runContext: {
    runId,
    agentEntityId: run.agentEntityId,
    smartSpaceId: run.smartSpaceId,
    agentId: run.agentId,
  },
});
```

```typescript
// builder.ts — accept and use run context
export interface BuildAgentOptions {
  config: AgentConfig;
  runContext?: PrebuiltToolContext; // optional for backward compat
}
```

### React SDK (`react-sdk/`)

- Add `useAutoToolHandler` hook
- Export from barrel

### Node SDK (`node-sdk/`)

- No code changes needed — already has `tools.submitResult()` and `spaces.subscribe()`
- Add usage examples to README

### UI SDK (`ui-sdk/`)

- Add `tools` prop to `HsafaChatProvider` and `HsafaChat`
- Wire `useAutoToolHandler` internally

---

## 8) Future Prebuilt Tools (Roadmap)

| Tool | Action | Description |
|------|--------|-------------|
| `setGoals` | `setGoals` | Set/update agent goals |
| `getGoals` | `getGoals` | Read current goals |
| `setMemory` | `setMemory` | Store long-term memory |
| `getMemory` | `getMemory` | Retrieve memories by topic |
| `createPlan` | `createPlan` | Schedule a future execution |
| `getPlan` | `getPlan` | Read scheduled plans |
| `searchKnowledge` | `searchKnowledge` | Search knowledge base (RAG) |
| `sendNotification` | `sendNotification` | Send notification to user |
| `getSpaceContext` | `getSpaceContext` | Read SmartSpace metadata and members |
| `updateSpaceMetadata` | `updateSpaceMetadata` | Update SmartSpace metadata |

---

## 9) Implementation Order

### Phase 0: Wire Tools into ToolLoopAgent (PREREQUISITE)
1. Update `builder.ts` to call `resolveTools()` and pass tools to `ToolLoopAgent`
2. Update `builder.ts` to call `resolveMCPClients()` and merge MCP tools
3. Pass `toolChoice` from agent config to `ToolLoopAgent`
4. Update `run-runner.ts` to pass `runContext` to `buildAgent()`
5. Test with an existing agent config that has tools (e.g. `02-support-agent-http-tools.json`)
6. Verify `tool-call` / `tool-result` events appear in the `fullStream`

### Phase 1: Prebuilt Tool Base
1. Create prebuilt tool registry (`registry.ts`)
2. Add `prebuilt` execution type to `types.ts` + `ToolSchema` discriminated union
3. Add prebuilt tool branch in `tool-builder.ts` (closure over `runContext`)
4. Implement `setGoals` handler
5. Implement `getGoals` handler
6. Add event filtering for prebuilt tools in SSE endpoints (strip input/output for public key)
7. Test with a goal-aware agent config

### Phase 2: SDK Auto Tool Handling
1. Add `useAutoToolHandler` to react-sdk
2. Add `tools` prop to UI SDK's `HsafaChatProvider`
3. Wire automatic tool handling in ui-sdk
4. Test with a basic client tool (e.g., `getUserApproval`)

### Phase 3: More Prebuilt Tools
1. `setMemory` / `getMemory`
2. `createPlan` / `getPlan`
3. Knowledge search (RAG integration)

---

## 10) Summary

| Aspect | Prebuilt Tools | Additional Tools |
|--------|---------------|-----------------|
| **Runs on** | Gateway (server-side) | Client (React/Node/device) |
| **Execution type** | `prebuilt` | `basic` (no-execution mode) |
| **Run pauses?** | No — executes inline | Yes — `waiting_tool` until result |
| **Input visible to public key?** | No (toolName only) | Yes (client needs it) |
| **Output visible to public key?** | No (toolName only) | Yes (client produced it) |
| **Input/output visible to secret key?** | Yes (full) | Yes (full) |
| **SDK handles result?** | Not needed — server-side | Yes — `submitResult()` / `useAutoToolHandler` |
| **DB tracking** | ToolCall + ToolResult (source: server) | ToolCall + ToolResult (source: client) |
| **Config** | `executionType: "prebuilt"` | `executionType: "basic"`, `execution: null` |
