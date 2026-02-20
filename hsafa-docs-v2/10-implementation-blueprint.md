# 10 — Implementation Blueprint

## Overview

This document provides a concrete, ordered implementation plan for v2. Each step is self-contained — the system should compile and work (with reduced functionality) after each step.

**Key architectural change:** Runs are stateless. There is no `waiting_reply` status, no reply detection, no `waitState` metadata. Every message triggers fresh runs. Conversational continuity comes from context (`[SEEN]`/`[NEW]` markers, memories, goals).

---

## Ship Order (9 Steps)

### Step 1: Schema Migration

**Goal:** Add `activeSpaceId` column, `lastProcessedMessageId` / `lastSeenMessageId` on membership, remove `adminAgentEntityId`.

**Files:**
- `hsafa-gateway/prisma/schema.prisma`

**Changes:**
1. Add `activeSpaceId String? @map("active_space_id") @db.Uuid` to `Run` model.
2. Add `lastProcessedMessageId String? @map("last_processed_message_id") @db.Uuid` to `SmartSpaceMembership`.
3. Add `lastSeenMessageId String? @map("last_seen_message_id") @db.Uuid` to `SmartSpaceMembership`.
4. Remove `adminAgentEntityId` and `adminAgent` relation from `SmartSpace`.
5. Remove `adminSpaces` relation from `Entity`.

**Note:** No `waiting_reply` status added. RunStatus enum stays as-is (`queued`, `running`, `waiting_tool`, `completed`, `failed`, `canceled`).

**Commands:**
```bash
cd hsafa-gateway
npx prisma migrate dev --name v2-schema-changes
npx prisma generate
```

---

### Step 2: Create `enter_space` Prebuilt Tool

**Goal:** Agent can set its active space context and load history.

**New file:** `hsafa-gateway/src/agent-builder/prebuilt-tools/enter-space.ts`

**Logic:**
```typescript
registerPrebuiltTool('enterSpace', {
  inputSchema: {
    type: 'object',
    properties: {
      spaceId: { type: 'string', description: 'Space ID to enter.' },
      limit: { type: 'number', description: 'Number of recent messages to load. Default: 20.' }
    },
    required: ['spaceId']
  },
  defaultDescription: 'Set the active space. All subsequent messages and visible tool results go to this space.',
  execute: async (input, context) => {
    // 1. Validate agent is a member of the space
    // 2. Update run's activeSpaceId in DB
    // 3. Load last N messages with [SEEN]/[NEW] markers
    // 4. Return { success: true, spaceId, spaceName, history, totalMessages }
  }
});
```

**Register in:** `registry.ts` — add `await import('./enter-space.js');`

---

### Step 3: Refactor `send-space-message.ts` → `send-message.ts`

**Goal:** Simplify to `send_message({ text })`. Remove `spaceId`, `mention`, `wait`, `messageId` params. Read active space from run state.

**Rename:** `send-space-message.ts` → `send-message.ts`

**New signature:**
```json
{
  "text": "string (required)"
}
```

**Logic:**
```typescript
execute: async (input, context) => {
  const { text } = input;
  
  // 1. Get activeSpaceId from run state
  const run = await prisma.run.findUnique({ where: { id: context.runId } });
  const spaceId = run.activeSpaceId;
  if (!spaceId) return { error: 'No active space. Call enter_space first.' };
  
  // 2. Post message to space (with streaming)
  const dbMessage = await createSmartSpaceMessage({ ... });
  
  // 3. Trigger all other agent members (sender excluded)
  await triggerAllAgents({
    spaceId,
    senderEntityId: context.agentEntityId,
    senderName: context.agentName,
    senderType: 'agent',
    messageContent: text,
    messageId: dbMessage.id,
  });
  
  // 4. Return success — run continues immediately
  return { success: true, messageId: dbMessage.id, status: 'delivered' };
}
```

**No waiting, no reply detection, no messageId threading.**

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
- `hsafa-gateway/src/agent-builder/prebuilt-tools/send-reply.ts` (if it exists)

**No `continue_waiting` or `resume_run` to implement** — these don't exist in the stateless model.

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
// In-memory debounce timers: Map<"agentEntityId:spaceId", NodeJS.Timeout>
const debounceTimers = new Map<string, NodeJS.Timeout>();

// Pending trigger context per agent+space (always the latest message)
const pendingTriggers = new Map<string, TriggerOptions>();

const TRIGGER_DEBOUNCE_MS = 2000; // 2 seconds default

/**
 * Schedule triggering ALL other agent members of a space.
 * Uses debounce: rapid messages are batched into a single run per agent.
 */
export async function triggerAllAgents(options: {
  spaceId: string;
  senderEntityId: string;
  senderName: string;
  senderType: 'human' | 'agent';
  messageContent: string;
  messageId: string;
}): Promise<void> {
  // 1. Load all agent members of the space, EXCLUDE the sender
  const agentMembers = await prisma.smartSpaceMembership.findMany({
    where: {
      smartSpaceId: options.spaceId,
      entity: { type: 'agent' },
      entityId: { not: options.senderEntityId },
    },
    include: { entity: true }
  });

  // 2. For each agent: debounce the trigger
  for (const member of agentMembers) {
    const key = `${member.entityId}:${options.spaceId}`;

    // Store latest trigger context (overwrites previous)
    pendingTriggers.set(key, {
      agentEntityId: member.entityId,
      spaceId: options.spaceId,
      messageId: options.messageId,
      messageContent: options.messageContent,
      senderEntityId: options.senderEntityId,
      senderName: options.senderName,
    });

    // Reset debounce timer
    const existing = debounceTimers.get(key);
    if (existing) clearTimeout(existing);

    debounceTimers.set(key, setTimeout(async () => {
      debounceTimers.delete(key);
      const trigger = pendingTriggers.get(key);
      pendingTriggers.delete(key);
      if (!trigger) return;

      // Dedup check: agentEntityId + messageId
      // Create run with the latest trigger message
      // All messages from the debounce window are [NEW] in space history
      await createAndExecuteRun({
        agentEntityId: trigger.agentEntityId,
        triggerType: 'space_message',
        triggerSpaceId: trigger.spaceId,
        triggerMessageId: trigger.messageId,
        triggerMessageContent: trigger.messageContent,
        triggerSenderEntityId: trigger.senderEntityId,
        triggerSenderName: trigger.senderName,
        activeSpaceId: trigger.spaceId,  // auto-entry
      });
    }, TRIGGER_DEBOUNCE_MS));
  }
}
```

**Update route handler** (`smart-spaces.ts` message route):
```typescript
// After persisting message:
await triggerAllAgents({
  spaceId, senderEntityId, senderName,
  senderType: senderEntity.type,
  messageContent, messageId,
});
```

---

### Step 7: Refactor `run-runner.ts`

**Goal:** Remove delegate handling. Track active space. Update `lastProcessedMessageId` after run completes.

**Remove:**
- Delegate signal handling
- `delegateToAgent` import
- Mention-related chain metadata
- All `waiting_reply` / wait signal handling
- All resume logic

**Add after run completes:**
```typescript
// Update lastProcessedMessageId for the agent in this space
if (run.activeSpaceId) {
  const latestMessage = await prisma.smartSpaceMessage.findFirst({
    where: { smartSpaceId: run.activeSpaceId },
    orderBy: { seq: 'desc' },
    select: { id: true }
  });
  if (latestMessage) {
    await prisma.smartSpaceMembership.updateMany({
      where: {
        smartSpaceId: run.activeSpaceId,
        entityId: run.agentEntityId,
      },
      data: { lastProcessedMessageId: latestMessage.id }
    });
  }
}
```

This powers the `[SEEN]`/`[NEW]` markers in the next run's context.

---

### Step 8: Refactor `prompt-builder.ts`, `builder.ts`, `stream-processor.ts`

**prompt-builder.ts — Remove:**
- Admin agent instructions block
- `isAdminAgent` / `isMultiAgentSpace` conditionals
- Mention instructions
- Wait/reply instructions

**prompt-builder.ts — Update instructions:**
```typescript
systemParts.push('INSTRUCTIONS:');
systemParts.push('- Your text output is internal reasoning. Keep it brief.');
systemParts.push('- Use send_message to communicate. The trigger space is already active — call enter_space only to switch spaces.');
systemParts.push('- Use read_messages to load conversation history.');
systemParts.push('- If you have nothing to contribute, end this run without sending a message.');
systemParts.push('- Runs are stateless. Use set_memories and set_goals to persist state across runs.');
```

**prompt-builder.ts — Add [SEEN]/[NEW] markers:**
```typescript
// When building space history, use lastProcessedMessageId to mark messages
const membership = await prisma.smartSpaceMembership.findFirst({
  where: { smartSpaceId: spaceId, entityId: agentEntityId }
});
const lastProcessedSeq = membership?.lastProcessedMessageId
  ? (await prisma.smartSpaceMessage.findUnique({ where: { id: membership.lastProcessedMessageId } }))?.seq
  : 0;

for (const msg of messages) {
  const marker = msg.seq <= lastProcessedSeq ? '[SEEN]' : '[NEW]';
  // Format: [marker] [msgId] [timestamp] SenderName (type): "content"
}
```

**builder.ts — Remove:**
- `displayToolNames` set and `targetSpaceId` injection loop
- `isMultiAgent` / `isAdmin` prebuilt tool filtering
- `delegateToAgent` conditional

**builder.ts — Change:**
- All prebuilt tools injected unconditionally.
- `visibleToolNames` computed from `tool.visible === true`.

**stream-processor.ts — Remove:**
- `displayToolSpaces` map
- `DelegateAgentSignal` / `MentionAgentSignal` types
- `stripRoutingFields` function

**stream-processor.ts — Change:**
- Visible tool events → emit to `activeSpaceId` from options.

---

### Step 9: Update SDKs

**react-sdk/src/types.ts:**
- Remove `adminAgentEntityId` from SmartSpace type
- Add `activeSpaceId` to Run type
- No `waiting_reply` status (not needed)

**node-sdk/src/types.ts:**
- Same changes

**react-sdk/src/runtime/useHsafaRuntime.ts:**
- No `run.waiting_reply` event handling needed
- No other changes (streaming logic is the same)

**ui-sdk:**
- Remove `adminAgentEntityId` from any provider props

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
| Human sends message in space with 1 agent | Agent triggered |
| Human sends message in space with 3 agents | All 3 agents triggered (independent runs) |
| Agent sends message in space with 2 other agents | Both other agents triggered (sender excluded) |
| Agent sends message, human replies | New run triggered for agent; context shows `[SEEN]` question + `[NEW]` reply |
| Multi-turn conversation (3 exchanges) | 3 separate runs; each sees full conversation in `[SEEN]`/`[NEW]` context |
| Agent uses `set_memories` to store state, next run reads it | Memories persist and appear in next run's context |
| Plan triggers agent | No active space initially, agent must `enter_space` |
| Agent enters Space A, sends message, enters Space B, sends message | Messages go to correct spaces |
| Concurrent runs: same agent triggered twice by different messages | Both runs execute, each sees the other in context |
| Agent calls visible tool after `enter_space` | Tool result posted to active space |
| Agent has nothing to say | Run ends without sending a message — no skipResponse tool needed |
| Same message triggers same agent twice (dedup) | Second trigger is dropped (agentEntityId + messageId key) |
| 3 agents in a space discuss a topic | Natural conversation flow; agents decide when to stay silent |
