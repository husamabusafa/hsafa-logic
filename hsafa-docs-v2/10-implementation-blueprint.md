# 10 — Implementation Blueprint

## Overview

This document provides a concrete, ordered implementation plan for v2. Each step is self-contained — the system should compile and work (with reduced functionality) after each step.

---

## Ship Order (13 Steps)

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

**Goal:** Remove `spaceId` and `mention` params. Add `wait` param. Read active space from run state. Parse `@mentions` from text.

**Rename:** `send-space-message.ts` → `send-message.ts`

**New signature:**
```json
{
  "text": "string (required)",
  "wait": "boolean (optional, default false)"
}
```

**Logic:**
```typescript
execute: async (input, context) => {
  const { text, wait } = input;
  
  // 1. Get activeSpaceId from run metadata
  const run = await prisma.run.findUnique({ where: { id: context.runId } });
  const spaceId = run.activeSpaceId;
  if (!spaceId) return { error: 'No active space. For plan/service triggers call enter_space first. For space_message triggers this should have been auto-set.' };
  
  // 2. Parse @mentions from text
  const mentions = parseMentions(text, spaceMembers);
  
  // 3. Post message to space (with streaming)
  const dbMessage = await createSmartSpaceMessage({ ... });
  
  // 4. Trigger mentioned agents
  for (const mention of mentions) {
    await triggerByMention({ spaceId, targetEntityId: mention.entityId, ... });
  }
  
  // 5. If wait: true, return __waitSignal (handled by run-runner)
  if (wait && mentions.length > 0) {
    return {
      __waitSignal: true,
      messageId: dbMessage.id,
      waitingFor: mentions.map(m => ({ entityId: m.entityId, entityName: m.name })),
      spaceId,
    };
  }
  
  return { success: true, messageId: dbMessage.id };
}
```

**Helper function:** `parseMentions(text, spaceMembers)` — extracts `@Name` patterns, resolves against space members.

**Update registry.ts:** Change import from `send-space-message.js` to `send-message.js`. Change registration key from `sendSpaceMessage` to `sendMessage`.

---

### Step 3b: Create `send-reply.ts` Prebuilt Tool

**Goal:** Same as `send_message` but resumes `waiting_reply` runs instead of triggering new ones.

**New file:** `hsafa-gateway/src/agent-builder/prebuilt-tools/send-reply.ts`

**Logic:**
```typescript
execute: async (input, context) => {
  const { text, wait } = input;

  // 1. Get activeSpaceId from run state
  const run = await prisma.run.findUnique({ where: { id: context.runId } });
  const spaceId = run.activeSpaceId;
  if (!spaceId) return { error: 'No active space. For plan/service triggers call enter_space first. For space_message triggers this should have been auto-set.' };

  // 2. Parse @mentions from text
  const mentions = parseMentions(text, spaceMembers);

  // 3. Post message to space (same streaming pipeline as send_message)
  const dbMessage = await createSmartSpaceMessage({ ... });

  // 4. For each mention: check for waiting_reply run, resume or trigger new
  for (const mention of mentions) {
    const waitingRun = await findWaitingReplyRun({
      spaceId,
      waitingForEntityId: mention.entityId,
      replierEntityId: context.agentEntityId,
    });

    if (waitingRun) {
      // Resume the waiting run — inject reply as tool result, no new run
      await resumeWaitingRun(waitingRun.id, {
        reply: { entityId: context.agentEntityId, entityName: context.agentName, text, messageId: dbMessage.id }
      });
    } else {
      // No waiting run — trigger new run (same as send_message)
      await triggerByMention({ spaceId, targetEntityId: mention.entityId, ... });
    }
  }

  // 5. If wait: true, pause this run (same as send_message)
  if (wait) {
    return {
      __waitSignal: true,
      messageId: dbMessage.id,
      waitingFor: mentions.length > 0
        ? mentions.map(m => ({ entityId: m.entityId, entityName: m.name }))
        : [{ type: 'any' }],  // any entity
      spaceId,
    };
  }

  return { success: true, messageId: dbMessage.id };
}
```

**Register in `registry.ts`:** `await import('./send-reply.js');` with key `sendReply`.

---

### Step 4: Refactor `get-space-messages.ts` → `read-messages.ts`

**Goal:** Default to active space. Optional `spaceId` for reading other spaces.

**Rename:** `get-space-messages.ts` → `read-messages.ts`

**New signature:**
```json
{
  "spaceId": "string (optional — defaults to active space)",
  "limit": "number (optional, default 50)"
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

**Update `registry.ts`:**
- Remove `await import('./delegate-agent.js');`
- Remove `await import('./skip-response.js');` (if present — may already be removed)

---

### Step 6: Refactor `agent-trigger.ts`

**Goal:** Replace admin-based triggering with mention-based + 2-entity auto-trigger.

**Remove:**
- `triggerAdminAgent` function entirely
- `delegateToAgent` function entirely

**Add:**

```typescript
/**
 * Parse @mentions from message text and trigger each mentioned agent.
 */
export async function triggerByMentions(options: {
  spaceId: string;
  senderEntityId: string;
  senderName: string;
  senderType: 'human' | 'agent';
  messageContent: string;
}): Promise<void> {
  // 1. Load space members (agents only)
  // 2. Parse @Name patterns from messageContent
  // 3. Resolve each @Name to an agent entity ID via displayName match
  // 4. For each resolved agent: call createAndExecuteRun with space_message trigger
  //    → set activeSpaceId = spaceId on the run record (auto-entry)
  // 5. Self-mention blocked, depth limit enforced
}

/**
 * Check if space qualifies for auto-trigger (1 human + 1 agent).
 * If so, trigger the agent.
 */
export async function autoTriggerIfTwoEntity(options: {
  spaceId: string;
  senderEntityId: string;
  senderName: string;
  messageContent: string;
}): Promise<boolean> {
  // 1. Count total members in space
  // 2. If total_members === 2: trigger the OTHER entity (skip sender)
  //    Works for: human+agent, agent+agent, human+human
  // 3. Otherwise: return false
}
```

**Update route handler** (`smart-spaces.ts` message route):
```typescript
// Old: await triggerAdminAgent({ ... });
// New:
const autoTriggered = await autoTriggerIfTwoEntity({ spaceId, senderEntityId, senderName, messageContent });
if (!autoTriggered) {
  await triggerByMentions({ spaceId, senderEntityId, senderName, senderType: 'human', messageContent });
}
```

---

### Step 7: Refactor `run-runner.ts`

**Goal:** Remove delegate handling. Add `waiting_reply` handling. Track active space.

**Remove:**
- Section 6 (delegate signal handling)
- `delegateSignal` from processStream destructuring
- `delegateToAgent` import

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
          waitingFor: waitSignal.waitingFor,
          startedAt: new Date().toISOString(),
          timeout: 300000,
          replies: [],
        },
      },
    },
  });
  await emitEvent('run.waiting_reply', { waitingFor: waitSignal.waitingFor });
  await emitAgentStatus(run.agentEntityId, 'inactive', { runId });
  return;
}
```

**Add resume logic:**
When `executeRun` is called on a `waiting_reply` run:
1. Read `waitState` from metadata.
2. Inject the replies as a tool result (the `send_message` tool call gets the reply data as its result).
3. Continue execution.

---

### Step 8: Refactor `stream-processor.ts`

**Goal:** Remove displayTool routing. Use active space for all space-directed events.

**Remove:**
- `displayToolSpaces` map
- `displayToolNames` map
- `stripRoutingFields` function (or simplify — no routing fields)
- `DelegateAgentSignal` type and detection
- `persistDisplayToolMessage` for display tools (keep for space/client tools)

**Change:**
- `options.displayTools` → remove parameter
- `msgStreams` → read space from run's `activeSpaceId` (passed in options), not from tool args
- Visible tool events → emit to `activeSpaceId` from options

**New options shape:**
```typescript
options?: {
  agentEntityId?: string;
  activeSpaceId?: string;       // replaces targetSpaceId + displayTools
  visibleToolNames?: Set<string>;  // from tool config visibility
}
```

---

### Step 9: Refactor `prompt-builder.ts`

**Goal:** Structured context model. Remove admin/multi-agent branching.

**Remove:**
- Admin agent instructions block
- `isAdminAgent` / `isMultiAgentSpace` conditionals

**Refactor `buildModelMessages`:**

```typescript
// Identity
systemParts.push(`IDENTITY:`);
systemParts.push(`  name: "${agentDisplayName}"`);
systemParts.push(`  entityId: "${run.agentEntityId}"`);
systemParts.push(`  currentTime: "${new Date().toISOString()}"`);

// Trigger (same as v1 formatTriggerContext, no admin logic)

// Active space
if (activeSpaceId) {
  systemParts.push(`ACTIVE SPACE: "${activeSpaceName}" (id: ${activeSpaceId})`);
} else {
  systemParts.push(`ACTIVE SPACE: none (call enter_space to set one)`);
}

// Space history as timeline
for (const msg of messages) {
  const ts = msg.createdAt.toISOString();
  const sender = msg.entity?.displayName || 'Unknown';
  const type = msg.entity?.type || 'unknown';
  const isTrigger = msg.id === triggerMessageId;
  systemParts.push(`  [${ts}] ${sender} (${type}): "${msg.content}"${isTrigger ? '  ← TRIGGER' : ''}`);
}

// Spaces list with [ACTIVE] tag

// Agent context (goals, memories, plans — unchanged)

// Active runs (with details, not just count)

// Instructions (simplified — no admin/multi-agent branching)
systemParts.push('INSTRUCTIONS:');
systemParts.push('- Your text output is internal reasoning. Keep it brief.');
systemParts.push('- Use send_message to communicate. The trigger space is already active — call enter_space only to switch to a different space.');
systemParts.push('- Use read_messages to load conversation history.');
systemParts.push('- Include @AgentName in your message to trigger another agent.');
systemParts.push('- Set wait=true to pause until replies arrive.');
```

---

### Step 10: Refactor `builder.ts`

**Goal:** Remove displayTool injection, remove admin/multi-agent filtering.

**Remove:**
- `displayToolNames` set
- `targetSpaceId` injection loop
- `isMultiAgent` / `isAdmin` prebuilt tool filtering
- `delegateToAgent` conditional

**Change:**
- All prebuilt tools are injected unconditionally (no admin/multi-agent gates).
- `visibleToolNames` computed from `tool.visibility` config (not `display.mode`).

---

### Step 11: Refactor `run-context.ts`

**Goal:** Remove admin detection. Add active runs detail.

**Remove:**
- `isAdminAgent` computation and field
- `isMultiAgentSpace` computation and field
- `adminAgentEntityId` references

**Change `otherActiveRunCount`** → **`activeRuns`** (array with details):
```typescript
activeRuns: Array<{
  runId: string;
  status: string;
  triggerType: string | null;
  triggerSummary: string | null;
  activeSpaceId: string | null;
  waitingFor?: Array<{ entityId: string; entityName: string }>;
}>;
```

---

### Step 12: Implement Reply Detection

**Goal:** When a message arrives in a space, check if any `waiting_reply` run is waiting for this sender. If so, record the reply and potentially resume the run.

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
  // 2. For each: check if senderEntityId is in waitState.waitingFor
  // 3. If match: append reply to waitState.replies, mark entity as responded
  // 4. If all waitingFor entities have responded: resume the run (call executeRun)
  // 5. Handle timeout separately (via a scheduled job or TTL check)
}
```

**Wire into message route** (`smart-spaces.ts`):
```typescript
// After persisting message and triggering mentions:
await checkForWaitingRuns({ spaceId, senderEntityId, senderName, messageContent, messageId });
```

---

### Step 13: Update SDKs

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
| Human sends message in 2-entity space (no mention) | Agent auto-triggered |
| Human sends `@Agent1 help` in multi-agent space | Only Agent1 triggered |
| Human sends `@Agent1 and @Agent2 check this` | Both agents triggered (independent runs) |
| Agent calls `send_message("@Agent2 review", wait: true)` | Agent2 triggered, run pauses, resumes when Agent2 replies |
| Agent calls `send_message("thoughts?", wait: true)` (no mention) | Run pauses, resumes when any human replies |
| Wait timeout | Run resumes with `status: "timeout"` result |
| Plan triggers agent | No active space initially, agent must `enter_space` |
| Agent enters Space A, sends message, enters Space B, sends message | Messages go to correct spaces |
| Concurrent runs: same agent triggered twice | Both runs execute, each sees the other in context |
| Agent calls visible tool after `enter_space` | Tool result posted to active space |
