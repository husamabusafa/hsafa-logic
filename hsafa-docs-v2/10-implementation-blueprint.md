# 10 — Implementation Blueprint

## Overview

This document provides a concrete, ordered implementation plan for v2. Each step is self-contained — the system should compile and work (with reduced functionality) after each step.

---

## Ship Order (11 Steps)

### Step 1: Schema Migration

**Goal:** Add `waiting_reply` status, `activeSpaceId` column, remove `adminAgentEntityId`.

**Files:**
- `hsafa-gateway/prisma/schema.prisma`

**Changes:**
1. Add `waiting_reply` to `RunStatus` enum.
2. Add `activeSpaceId String? @map("active_space_id") @db.Uuid` to `Run` model.
3. Remove `adminAgentEntityId` and `adminAgent` relation from `SmartSpace`.
4. Remove `adminSpaces` relation from `Entity`.

**Commands:**
```bash
cd hsafa-gateway
npx prisma migrate dev --name v2-schema-changes
npx prisma generate
```

**Verify:** `npx tsc --noEmit` passes (will have errors from code still referencing removed fields — that's expected, fixed in later steps).

---

### Step 2: Create `enter_space` Prebuilt Tool

**Goal:** Agent can set its active space context.

**New file:** `hsafa-gateway/src/agent-builder/prebuilt-tools/enter-space.ts`

**Logic:**
```typescript
registerPrebuiltTool('enterSpace', {
  inputSchema: {
    type: 'object',
    properties: {
      spaceId: { type: 'string', description: 'Space ID to enter.' }
    },
    required: ['spaceId']
  },
  defaultDescription: 'Set the active space. All subsequent messages and visible tool results go to this space.',
  execute: async (input, context) => {
    // 1. Validate agent is a member of the space
    // 2. Update run's activeSpaceId in DB
    // 3. Return { success: true, spaceId, spaceName }
  }
});
```

**Register in:** `registry.ts` — add `await import('./enter-space.js');`

---

### Step 3: Refactor `send-space-message.ts` → `send-message.ts`

**Goal:** Remove `spaceId` and `mention` params. Add `wait` and `messageId` params. Read active space from run state. No mention parsing.

**Rename:** `send-space-message.ts` → `send-message.ts`

**New signature:**
```json
{
  "text": "string (required)",
  "messageId": "string (optional — if provided, acts as a reply and resumes waiting runs)",
  "wait": "boolean (optional, default false)"
}
```

**Logic:**
```typescript
execute: async (input, context) => {
  const { text, messageId, wait } = input;
  
  // 1. Get activeSpaceId from run state
  const run = await prisma.run.findUnique({ where: { id: context.runId } });
  const spaceId = run.activeSpaceId;
  if (!spaceId) return { error: 'No active space. Call enter_space first.' };
  
  // 2. Post message to space (with streaming)
  const dbMessage = await createSmartSpaceMessage({ ... });
  
  // 3. Trigger all other agent members (sender excluded, chain depth incremented)
  const currentRun = await prisma.run.findUnique({ where: { id: context.runId } });
  await triggerAllAgents({
    spaceId,
    senderEntityId: context.agentEntityId,
    senderName: context.agentName,
    senderType: 'agent',
    messageContent: text,
    messageId: dbMessage.id,
    senderExpectsReply: !!wait,
    chainDepth: (currentRun.metadata?.chainDepth ?? 0) + 1,
  });
  
  // 4. If messageId provided: check for waiting_reply runs to resume
  if (messageId) {
    const waitingRuns = await prisma.run.findMany({
      where: { status: 'waiting_reply' },
      // Filter: waitState.messageId === messageId (JSON query)
    });
    for (const wr of waitingRuns) {
      await resumeWaitingRun(wr.id, {
        reply: { entityId: context.agentEntityId, entityName: context.agentName, text, messageId: dbMessage.id }
      });
    }
  }
  
  // 5. If wait: true, return __waitSignal (handled by run-runner)
  if (wait) {
    return {
      __waitSignal: true,
      messageId: dbMessage.id,
      spaceId,
    };
  }
  
  return { success: true, messageId: dbMessage.id };
}
```

**No mention parsing.** Triggering is automatic — every message triggers all other agent members (sender excluded), with chain depth protection.

**Update registry.ts:** Change import from `send-space-message.js` to `send-message.js`. Change registration key from `sendSpaceMessage` to `sendMessage`.

---

### Step 4: Refactor `get-space-messages.ts` → `read-messages.ts`

**Goal:** Default to active space. Optional `spaceId` for reading other spaces.

**Rename:** `get-space-messages.ts` → `read-messages.ts`

**New signature:**
```json
{
  "spaceId": "string (optional — defaults to active space)",
  "limit": "number (optional, default 50)",
  "offset": "number (optional, for paging back)"
}
```

**Logic:**
```typescript
execute: async (input, context) => {
  let targetSpaceId = input.spaceId;
  if (!targetSpaceId) {
    const run = await prisma.run.findUnique({ where: { id: context.runId } });
    targetSpaceId = run.activeSpaceId;
  }
  if (!targetSpaceId) return { error: 'No active space and no spaceId provided.' };
  // ... rest same as v1
}
```

**Update registry.ts:** Change import and key from `getSpaceMessages` to `readMessages`.

---

### Step 5: Delete Removed Prebuilt Tools

**Delete:**
- `hsafa-gateway/src/agent-builder/prebuilt-tools/delegate-agent.ts`
- `hsafa-gateway/src/agent-builder/prebuilt-tools/skip-response.ts`
- `hsafa-gateway/src/agent-builder/prebuilt-tools/mention-agent.ts`
- `hsafa-gateway/src/agent-builder/prebuilt-tools/send-reply.ts` (if it exists — merged into send-message)

**Update `registry.ts`:**
- Remove all imports for deleted tools.

---

### Step 6: Refactor `agent-trigger.ts`

**Goal:** Replace all triggering logic with simple "trigger all other agent members."

**Remove:**
- `triggerAdminAgent` function
- `triggerByMentions` / `triggerMentionedAgent` function
- `autoTriggerIfTwoEntity` function
- All mention parsing, pair tracking

**Add:**

```typescript
const MAX_CHAIN_DEPTH = 5;

/**
 * Trigger ALL other agent members of a space.
 * Called for ANY message (human or agent). Sender is excluded.
 */
export async function triggerAllAgents(options: {
  spaceId: string;
  senderEntityId: string;
  senderName: string;
  senderType: 'human' | 'agent';
  messageContent: string;
  messageId: string;
  senderExpectsReply: boolean;
  chainDepth: number;
}): Promise<void> {
  // 1. Chain depth check — if at max, no triggers
  if (options.chainDepth >= MAX_CHAIN_DEPTH) return;
  
  // 2. Load all agent members of the space, EXCLUDE the sender
  const agentMembers = await prisma.smartSpaceMembership.findMany({
    where: {
      smartSpaceId: options.spaceId,
      entity: { type: 'agent' },
      entityId: { not: options.senderEntityId },  // exclude sender
    },
    include: { entity: true }
  });
  
  // 3. For each agent: dedup check (agentEntityId + messageId)
  // 4. For each agent: createAndExecuteRun with space_message trigger
  for (const member of agentMembers) {
    await createAndExecuteRun({
      agentEntityId: member.entityId,
      triggerType: 'space_message',
      triggerSpaceId: options.spaceId,
      triggerMessageId: options.messageId,
      triggerMessageContent: options.messageContent,
      triggerSenderEntityId: options.senderEntityId,
      triggerSenderName: options.senderName,
      senderExpectsReply: options.senderExpectsReply,
      chainDepth: options.chainDepth,  // passed to run metadata
      activeSpaceId: options.spaceId,  // auto-entry
    });
  }
}
```

**Update route handler** (`smart-spaces.ts` message route):
```typescript
// After persisting message:
await triggerAllAgents({
  spaceId, senderEntityId, senderName,
  senderType: senderEntity.type,  // 'human' or 'agent'
  messageContent, messageId,
  senderExpectsReply: false,
  chainDepth: 0,  // human messages start at 0
});
```

**In `send_message` tool** (when agent sends a message):
```typescript
// After posting message to space:
await triggerAllAgents({
  ...messageDetails,
  senderEntityId: context.agentEntityId,
  senderType: 'agent',
  chainDepth: currentRun.chainDepth + 1,  // increment from parent run
});
```

---

### Step 7: Refactor `run-runner.ts`

**Goal:** Remove delegate handling. Add `waiting_reply` handling. Track active space.

**Remove:**
- Delegate signal handling
- `delegateToAgent` import
- Mention-related chain metadata

**Add after processStream:**
```typescript
// Handle wait signal from send_message
if (waitSignal) {
  await prisma.run.update({
    where: { id: runId },
    data: {
      status: 'waiting_reply',
      metadata: {
        ...runMeta,
        waitState: {
          spaceId: waitSignal.spaceId,
          messageId: waitSignal.messageId,
          toolCallId: waitSignal.toolCallId,
          startedAt: new Date().toISOString(),
          timeout: 300000,
          reply: null,
        },
      },
    },
  });
  await emitEvent('run.waiting_reply', {});
  await emitAgentStatus(run.agentEntityId, 'inactive', { runId });
  return;
}
```

**Add resume logic:**
When `executeRun` is called on a `waiting_reply` run:
1. Read `waitState` from metadata.
2. Inject the reply as a tool result (the `send_message` tool call gets the reply data as its result).
3. Continue execution with fresh AI invocation (system prompt history approach).

---

### Step 8: Refactor `stream-processor.ts`

**Goal:** Remove displayTool routing. Use active space for all space-directed events.

**Remove:**
- `displayToolSpaces` map
- `displayToolNames` set (replaced by `visibleToolNames`)
- `stripRoutingFields` function
- `DelegateAgentSignal` type and detection
- `MentionAgentSignal` type and detection

**Change:**
- Visible tool events → emit to `activeSpaceId` from options
- `visibleToolNames` computed from `tool.visible` boolean config

**New options shape:**
```typescript
options?: {
  agentEntityId?: string;
  activeSpaceId?: string;
  visibleToolNames?: Set<string>;  // from tool config visible: true
}
```

---

### Step 9: Refactor `prompt-builder.ts` and `builder.ts`

**Goal:** Structured context model. Remove admin/multi-agent branching. Simplify tool injection.

**prompt-builder.ts — Remove:**
- Admin agent instructions block
- `isAdminAgent` / `isMultiAgentSpace` conditionals
- Mention instructions ("include @AgentName")

**prompt-builder.ts — Update instructions:**
```typescript
systemParts.push('INSTRUCTIONS:');
systemParts.push('- Your text output is internal reasoning. Keep it brief.');
systemParts.push('- Use send_message to communicate. The trigger space is already active — call enter_space only to switch spaces.');
systemParts.push('- Use read_messages to load conversation history.');
systemParts.push('- If you have nothing to contribute, end this run without sending a message.');
systemParts.push('- Set wait=true to pause until a reply arrives.');
systemParts.push('- Provide messageId to reply to a specific message and resume any waiting run.');
```

**builder.ts — Remove:**
- `displayToolNames` set and `targetSpaceId` injection loop
- `isMultiAgent` / `isAdmin` prebuilt tool filtering
- `delegateToAgent` conditional

**builder.ts — Change:**
- All prebuilt tools injected unconditionally.
- `visibleToolNames` computed from `tool.visible === true` (boolean, not string mode).

---

### Step 10: Implement Reply Detection

**Goal:** When a message arrives in a space, check if any `waiting_reply` run is waiting in that space. If so, record the reply and resume the run.

**New file:** `hsafa-gateway/src/lib/reply-detector.ts`

**Logic (called from message route after persisting a message):**
```typescript
export async function checkForWaitingRuns(options: {
  spaceId: string;
  senderEntityId: string;
  senderName: string;
  messageContent: string;
  messageId: string;
}): Promise<void> {
  // 1. Find runs with status = 'waiting_reply' that have waitState.spaceId = spaceId
  // 2. For each: check sender is different from the waiting agent
  // 3. If match: record reply, resume the run (call executeRun)
  // 4. Handle timeout separately (via a scheduled job or TTL check)
}
```

**Wire into message route** (`smart-spaces.ts`):
```typescript
// After persisting message and triggering agents:
await checkForWaitingRuns({ spaceId, senderEntityId, senderName, messageContent, messageId });
```

**Also wire into `send_message` tool:** When `messageId` is provided, directly check for matching `waitState.messageId` and resume (explicit reply mechanism).

---

### Step 11: Update SDKs

**react-sdk/src/types.ts:**
- Remove `adminAgentEntityId` from SmartSpace type
- Add `waiting_reply` to run status union
- Add `activeSpaceId` to Run type

**node-sdk/src/types.ts:**
- Same changes

**react-sdk/src/runtime/useHsafaRuntime.ts:**
- Handle `run.waiting_reply` event (if needed for UI)
- No other changes (streaming logic is the same)

**ui-sdk:**
- Remove `adminAgentEntityId` from any provider props
- No other changes

---

## Compile Verification Order

After all steps:
```bash
cd hsafa-gateway && npx tsc --noEmit    # ✅
cd react-sdk && npx tsc --noEmit        # ✅
cd node-sdk && npx tsc --noEmit         # ✅
cd ui-sdk && npx tsc --noEmit           # ✅
cd use-case-app && npx tsc --noEmit     # ✅
```

---

## Test Scenarios

| Scenario | Expected Behavior |
|----------|-------------------|
| Human sends message in space with 1 agent | Agent triggered (chainDepth=0) |
| Human sends message in space with 3 agents | All 3 agents triggered (independent runs, chainDepth=0) |
| Agent sends message in space with 2 other agents | Both other agents triggered (sender excluded, chainDepth incremented) |
| Chain depth reaches MAX_CHAIN_DEPTH | Message posted but no agents triggered |
| Agent calls `send_message("thoughts?", wait: true)` | Run pauses, resumes when any entity replies |
| Agent calls `send_message("Approved.", messageId: "msg-xyz")` | Resumes waiting run whose waitState.messageId = msg-xyz |
| Wait timeout | Run resumes with `status: "timeout"` result |
| Plan triggers agent | No active space initially, agent must `enter_space` |
| Agent enters Space A, sends message, enters Space B, sends message | Messages go to correct spaces |
| Concurrent runs: same agent triggered twice by different messages | Both runs execute, each sees the other in context |
| Agent calls visible tool after `enter_space` | Tool result posted to active space |
| Agent has nothing to say | Run ends without sending a message — no skipResponse tool needed |
| Same message triggers same agent twice (dedup) | Second trigger is dropped (agentEntityId + messageId key) |
