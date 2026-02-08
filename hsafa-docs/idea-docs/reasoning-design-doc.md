# Hsafa Reasoning — Design Document

This document defines how AI agent reasoning (thinking/chain-of-thought) is surfaced end-to-end: from the gateway's model config, through SSE streaming, the SDKs, and finally the UI.

---

## 0) Current State

### What Already Works

**Gateway (`hsafa-gateway/`):**
- `types.ts` — `ReasoningConfigSchema` supports `enabled`, `effort`, `budgetTokens`, `includeThoughts`, `summary`, `systemMessageMode`, `forceReasoning`
- `model-resolver.ts` — Merges reasoning config into provider-specific options (OpenAI `reasoningEffort`/`reasoningSummary`, Anthropic `thinking.budgetTokens`, Google `thinkingConfig`, xAI `reasoningEffort`)
- `run-runner.ts` — Already streams `reasoning-start`, `reasoning-delta`, `reasoning-end` events during a Run. Final reasoning text is stored in the assistant message as `{ type: 'reasoning', text: '...' }` in the `parts` array within `metadata.uiMessage`

**React SDK (`react-sdk/`):**
- `types.ts` — `EventType` includes `'reasoning.delta'` (the SSE event name)

**Run Events streamed to Redis:**
```
reasoning-start  → { id }
reasoning-delta  → { id, delta }
reasoning-end    → { id }
```

### What's Missing

| Layer | Gap |
|-------|-----|
| **Prisma schema** | No `showAgentReasoning` flag on SmartSpace to control whether reasoning is visible to end users |
| **Seed / Agent config** | Demo agent uses `gpt-4o-mini` — needs upgrade to `gpt-5` with reasoning enabled |
| **react-sdk `useHsafaRuntime`** | Does NOT handle `reasoning-start`/`reasoning-delta`/`reasoning-end` SSE events. `StreamingMessage` has no `reasoning` field. `convertMessage()` ignores reasoning parts from persisted messages |
| **react-sdk types** | `ContentPart` union only has `TextContentPart` and `ToolCallContentPart` — no `ReasoningContentPart` |
| **ui-sdk** | No reasoning UI component. `HsafaThread` doesn't pass `Reasoning`/`ReasoningGroup` to `MessagePrimitive.Parts` |
| **use-case-app** | `thread.tsx` `AssistantMessage` doesn't render reasoning |

---

## 1) SmartSpace `showAgentReasoning` Column

Add a boolean column to the `SmartSpace` model so each space can independently control whether agent reasoning is shown to end users.

```prisma
model SmartSpace {
  id                   String   @id @default(uuid()) @db.Uuid
  name                 String?
  description          String?
  metadata             Json?    @db.JsonB
  showAgentReasoning   Boolean  @default(false) @map("show_agent_reasoning")
  createdAt            DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt            DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
  // ... relations unchanged
}
```

**Behavior:**
- `false` (default) — Reasoning events are streamed but the UI hides the collapsible reasoning section
- `true` — Reasoning is displayed in a collapsible "Thinking…" block above the assistant's text response

The flag is returned in the SmartSpace API responses so the frontend can read it without extra calls.

---

## 2) Agent Model Upgrade to GPT-5

Update the demo agent seed config to use `gpt-5` with reasoning enabled:

```json
{
  "model": {
    "provider": "openai",
    "name": "gpt-5",
    "api": "responses",
    "temperature": 0.7,
    "maxOutputTokens": 16000,
    "reasoning": {
      "enabled": true,
      "effort": "medium",
      "summary": "auto"
    }
  }
}
```

GPT-5 via the OpenAI Responses API natively supports reasoning. The existing `model-resolver.ts` will automatically map `reasoning.effort` → `providerOptions.openai.reasoningEffort` and `reasoning.summary` → `providerOptions.openai.reasoningSummary`.

---

## 3) React SDK Changes

### 3a) New Type: `ReasoningContentPart`

```typescript
// react-sdk/src/runtime/useHsafaRuntime.ts

export interface ReasoningContentPart {
  type: 'reasoning';
  text: string;
}

export type ContentPart = TextContentPart | ToolCallContentPart | ReasoningContentPart;
```

### 3b) Streaming State: Add `reasoning` to `StreamingMessage`

```typescript
interface StreamingMessage {
  id: string;
  entityId: string;
  text: string;
  reasoning: string;  // ← NEW: accumulated reasoning text
  toolCalls: Array<{ ... }>;
  isStreaming: boolean;
}
```

### 3c) SSE Event Handlers

Handle reasoning events in the SSE subscription:

```typescript
stream.on('reasoning-start', (event: StreamEvent) => {
  // No-op — the reasoning-delta handler creates entries as needed
});

stream.on('reasoning-delta', (event: StreamEvent) => {
  const runId = event.runId || (event.data.runId as string);
  const delta = (event.data.delta as string) || '';
  if (!runId || !delta) return;

  setStreamingMessages((prev) => {
    const exists = prev.some((sm) => sm.id === runId);
    if (!exists) {
      return [...prev, {
        id: runId,
        entityId: event.entityId || '',
        text: '',
        reasoning: delta,
        toolCalls: [],
        isStreaming: true,
      }];
    }
    return prev.map((sm) =>
      sm.id === runId ? { ...sm, reasoning: sm.reasoning + delta } : sm
    );
  });
});

stream.on('reasoning-end', (event: StreamEvent) => {
  // No-op — reasoning is part of streaming message, finalized on run.completed
});
```

### 3d) Message Conversion: Include Reasoning from Persisted Messages

Update `convertMessage()` to extract reasoning parts from `metadata.uiMessage.parts`:

```typescript
function convertMessage(msg: SmartSpaceMessage, currentEntityId?: string): ThreadMessageLike | null {
  // ... existing role logic ...

  const content: ContentPart[] = [];

  // Check for structured parts in metadata (includes reasoning + tool calls)
  const uiMessage = (msg.metadata as any)?.uiMessage;
  if (uiMessage?.parts && Array.isArray(uiMessage.parts)) {
    for (const part of uiMessage.parts) {
      if (part.type === 'reasoning' && part.text) {
        content.push({ type: 'reasoning', text: part.text });
      } else if (part.type === 'text' && part.text) {
        content.push({ type: 'text', text: part.text });
      } else if (part.type === 'tool-call') {
        content.push({
          type: 'tool-call',
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          args: part.args,
          result: part.result,
        });
      }
    }
  }

  // Fallback to plain content if no structured parts
  if (content.length === 0) {
    const text = msg.content || '';
    if (!text.trim()) return null;
    content.push({ type: 'text', text });
  }

  return {
    id: msg.id,
    role,
    content,
    createdAt: new Date(msg.createdAt),
    metadata: { custom: { entityId: msg.entityId || undefined, isOtherHuman } },
  };
}
```

### 3e) Streaming → ThreadMessageLike: Include Reasoning

```typescript
const streaming = streamingMessages
  .filter((sm) => sm.isStreaming && (sm.text.trim() || sm.reasoning.trim()))
  .map((sm): ThreadMessageLike => {
    const content: ContentPart[] = [];

    // Reasoning comes first (displayed above text)
    if (sm.reasoning) {
      content.push({ type: 'reasoning', text: sm.reasoning });
    }

    if (sm.text) {
      content.push({ type: 'text', text: sm.text });
    }

    for (const tc of sm.toolCalls) {
      content.push({ ... });
    }

    return { id: sm.id, role: 'assistant', content, ... };
  });
```

---

## 4) UI — Reasoning Component

Based on `@assistant-ui/react`'s `MessagePrimitive.Parts`, we pass `Reasoning` and `ReasoningGroup` component props. The assistant-ui framework automatically renders them when it encounters `{ type: 'reasoning' }` parts in the message content.

### Pattern from assistant-ui-docs

```tsx
<MessagePrimitive.Parts
  components={{
    Text: TextWithCaret,
    Reasoning: ReasoningPart,
    ReasoningGroup: ReasoningGroupPart,
  }}
/>
```

### Reasoning UI Component (ui-sdk)

Create `ui-sdk/src/components/HsafaReasoning.tsx`:

```tsx
"use client";

import { useState, type FC, type ReactNode } from "react";

// Standalone reasoning component (no Radix/shadcn dependency)
// Renders a collapsible "Thinking…" block with streaming support

interface ReasoningPartProps {
  text: string;
  status: { type: string };
}

export const ReasoningPart: FC<ReasoningPartProps> = ({ text }) => {
  return <div style={{ whiteSpace: 'pre-wrap' }}>{text}</div>;
};

interface ReasoningGroupProps {
  children: ReactNode;
  startIndex: number;
  endIndex: number;
}

export const ReasoningGroup: FC<ReasoningGroupProps> = ({ children }) => {
  const [open, setOpen] = useState(true);

  return (
    <div style={{
      borderRadius: '0.5rem',
      border: '1px solid #e5e7eb',
      marginBottom: '0.5rem',
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.5rem 0.75rem',
          background: '#f9fafb',
          border: 'none',
          cursor: 'pointer',
          fontSize: '0.8rem',
          color: '#6b7280',
        }}
      >
        <span style={{
          transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
          transition: 'transform 0.15s',
          display: 'inline-block',
        }}>▶</span>
        Thinking…
      </button>
      {open && (
        <div style={{
          padding: '0.5rem 0.75rem',
          fontSize: '0.8rem',
          color: '#6b7280',
          lineHeight: 1.5,
        }}>
          {children}
        </div>
      )}
    </div>
  );
};
```

### use-case-app Integration

In `use-case-app/components/assistant-ui/thread.tsx`, add the Reasoning components to `MessagePrimitive.Parts`:

```tsx
import { ReasoningPart, ReasoningGroup } from "./reasoning";

// In AssistantMessage:
<MessagePrimitive.Parts
  components={{
    Text: TextWithCaret,
    Reasoning: ReasoningPart,
    ReasoningGroup: ReasoningGroupPart,
  }}
/>
```

The reasoning block appears **above** the text response as a collapsible "Thinking…" section. During streaming it auto-expands; after completion the user can collapse/expand it.

---

## 5) Data Flow Summary

```
OpenAI GPT-5 (with reasoning)
  │
  ▼  reasoning tokens streamed
Gateway run-runner.ts
  │  emits: reasoning-start → reasoning-delta × N → reasoning-end
  │  stores: { type: 'reasoning', text } in message parts
  ▼
Redis SSE → SmartSpace stream
  │
  ▼
react-sdk useHsafaRuntime
  │  reasoning-delta → StreamingMessage.reasoning += delta
  │  convertMessage() → extracts reasoning from metadata.uiMessage.parts
  │  builds ThreadMessageLike with { type: 'reasoning', text } content parts
  ▼
ui-sdk useHsafaChatRuntime → useExternalStoreRuntime
  │
  ▼
@assistant-ui/react MessagePrimitive.Parts
  │  sees { type: 'reasoning' } → renders Reasoning component
  │  groups consecutive reasoning parts → renders ReasoningGroup
  ▼
User sees collapsible "Thinking…" block above response
```

---

## 6) SmartSpace `showAgentReasoning` Usage

The flag controls **UI rendering only** — reasoning events are always streamed (they're needed for the final message parts). The frontend reads `showAgentReasoning` from the SmartSpace object:

```tsx
// In the Thread component or a wrapper
const showReasoning = currentSpace?.showAgentReasoning ?? false;

<MessagePrimitive.Parts
  components={{
    Text: TextWithCaret,
    ...(showReasoning ? {
      Reasoning: ReasoningPart,
      ReasoningGroup: ReasoningGroupPart,
    } : {}),
  }}
/>
```

If `showAgentReasoning` is `false`, reasoning parts are simply not rendered — no component is passed, so `MessagePrimitive.Parts` skips them.

---

## 7) Changes Required

### Gateway (`hsafa-gateway/`)

1. **Prisma schema** — Add `showAgentReasoning Boolean @default(false)` to SmartSpace
2. **Migration** — `npx prisma migrate dev --name add-show-agent-reasoning`
3. **Seed** — Update demo agent model to `gpt-5` with reasoning config
4. **SmartSpace routes** — `showAgentReasoning` is auto-included in responses (Prisma returns all fields by default)
5. **SmartSpace create/update** — Accept `showAgentReasoning` in request body

### React SDK (`react-sdk/`)

1. **`types.ts`** — Add `showAgentReasoning?: boolean` to `SmartSpace` interface
2. **`runtime/useHsafaRuntime.ts`** — 
   - Add `ReasoningContentPart` type
   - Add `reasoning` field to `StreamingMessage`
   - Handle `reasoning-start`, `reasoning-delta`, `reasoning-end` SSE events
   - Update `convertMessage()` to extract reasoning from persisted messages
   - Include reasoning in streaming → ThreadMessageLike conversion

### UI SDK (`ui-sdk/`)

1. **New file** — `src/components/HsafaReasoning.tsx` (standalone reasoning component)
2. **`src/index.ts`** — Export reasoning components
3. **`src/components/HsafaThread.tsx`** — Pass Reasoning/ReasoningGroup to MessagePrimitive.Parts

### Use-case-app (`use-case-app/`)

1. **`components/assistant-ui/thread.tsx`** — Add Reasoning components to AssistantMessage

### SDK Types (`react-sdk/`, `node-sdk/`)

1. **`SmartSpace` type** — Add `showAgentReasoning?: boolean`
2. **`CreateSmartSpaceParams`** — Add `showAgentReasoning?: boolean`
3. **`UpdateSmartSpaceParams`** — Add `showAgentReasoning?: boolean`

---

## 8) Implementation Order

1. Add `showAgentReasoning` to Prisma schema + migrate
2. Update seed: model → `gpt-5`, reasoning enabled
3. Add `ReasoningContentPart` + `showAgentReasoning` to react-sdk types
4. Wire reasoning SSE events in `useHsafaRuntime`
5. Update `convertMessage()` for persisted reasoning parts
6. Create `HsafaReasoning.tsx` in ui-sdk
7. Wire into `HsafaThread` and use-case-app `thread.tsx`
8. Test end-to-end with GPT-5 reasoning enabled
