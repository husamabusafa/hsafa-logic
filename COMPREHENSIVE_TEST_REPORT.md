# Hsafa & Spaces — Comprehensive Test Report

**Date:** June 2025  
**Scope:** Full codebase analysis of Hsafa Core (v5) and Spaces service  
**Method:** Static code analysis of all critical paths, architecture review, and behavioral reasoning

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Critical Bugs](#3-critical-bugs)
4. [Functional Testing — Haseef Communication](#4-functional-testing--haseef-communication)
5. [Multi-Haseef (3+) Group Behavior](#5-multi-haseef-3-group-behavior)
6. [Performance & Latency Analysis](#6-performance--latency-analysis)
7. [Cost & Token Usage Analysis](#7-cost--token-usage-analysis)
8. [UI/UX — Online Status Indicators](#8-uiux--online-status-indicators)
9. [Spaces & Group Features](#9-spaces--group-features)
10. [Recommendations](#10-recommendations)

---

## 1. Executive Summary

The Hsafa Core and Spaces system is a well-architected agent platform with clean separation between the generic Core engine and the Spaces communication service. The V5 protocol (Redis Streams for actions, HTTP for events/tools, Pub/Sub for results) is solid and scalable.

However, the analysis uncovered **1 critical bug, 2 high-severity issues, and several medium/low findings** that must be addressed before production use.

### Severity Overview

| Severity | Count | Summary |
|----------|-------|---------|
| **CRITICAL** | 1 | Consciousness pruning broken — haseefs will crash permanently after enough cycles |
| **HIGH** | 2 | No programmatic loop prevention for haseef-to-haseef; stale online SET entries |
| **MEDIUM** | 4 | Ephemeral Redis connections per tool call; enter_space overhead; no persistent cost tracking; no sidebar online indicators |
| **LOW** | 2 | Missing presence cleanup job; syncTools called redundantly at bootstrap |

---

## 2. Architecture Overview

### Message Flow (Human → Haseef Response)

```
Human sends message
  → POST /api/smart-spaces/:id/messages
  → Postgres write (SmartSpaceMessage)
  → SSE broadcast (space.message)
  → notifyNewMessage() → handleInboxMessage()
  → Build formattedContext (recent messages, members, space info)
  → pushSenseEvent() → HTTP POST to Core /api/haseefs/:id/events
  → Core: pushToInbox() → Postgres upsert + Redis LPUSH

Haseef process wakes (BRPOP)
  → drainInbox() → formatInboxEvents() → inject as user message
  → Fetch config, tools, memories, archives
  → buildSystemPrompt() → streamText() with toolChoice: 'required'
  → Tool calls: spaces_enter_space → spaces_send_message → done
  → Each tool: Redis XADD → action-listener XREADGROUP → executeAction()
  → submitActionResult() → Redis Pub/Sub → syncDispatch resolves
  → save consciousness → update run record → emit run.finished
```

### Key Design Decisions (Correct)

- **`toolChoice: 'required'`** — Forces tool calls, prevents invisible bare text output
- **`stopWhen: [hasToolCall('done')]`** — Clean cycle termination
- **Self-message skip** (`sense-events.ts:131`) — Haseef won't trigger itself
- **Dual-write inbox** — Redis (fast wakeup) + Postgres (durability/recovery)
- **`run.finished` in finally block** — Prevents permanent "thinking" indicator

---

## 3. Critical Bugs

### BUG-1: Consciousness Pruning is Broken (CRITICAL)

**Location:** `hsafa-core/core/src/lib/consciousness.ts:152` vs `hsafa-core/core/src/lib/inbox.ts:306`

**The Problem:**

Consciousness pruning relies on detecting cycle boundaries. The `isCycleStart()` function checks:

```typescript
// consciousness.ts:151-153
function isCycleStart(content: string): boolean {
  return content.startsWith('SENSE EVENTS (');
}
```

But `formatInboxEvents()` no longer produces that prefix:

```typescript
// inbox.ts:304-306
// Natural framing — no mechanical header, just the events
return blocks.join('\n\n');
```

The formatted context from Spaces starts with `[YOU ARE: name]`, NOT `SENSE EVENTS (`.

**Impact Chain:**
1. `isCycleStart()` always returns `false`
2. `extractCycles()` finds no cycle boundaries → returns 0 or 1 cycles
3. `pruneConsciousness()` line 235: `if (cycles.length <= 1) return messages;` → no pruning
4. Consciousness grows without bound: ~7 messages per cycle × unlimited cycles
5. Eventually exceeds model context window → LLM call fails
6. Consciousness rolls back (`agent-process.ts:278`) but all previous cycles' data remains
7. Haseef is permanently stuck — can't process events, can't prune

**Time to Failure:** With a 200k token budget and ~500 tokens per cycle, approximately **400 cycles** (could be days or hours depending on activity). The haseef has no recovery path without manual intervention.

**Fix:**

Option A — Restore the prefix in `formatInboxEvents()`:
```typescript
// inbox.ts — add prefix header back
const header = `SENSE EVENTS (${sorted.length} event${sorted.length !== 1 ? 's' : ''})`;
return [header, ...blocks].join('\n\n');
```

Option B — Update `isCycleStart()` to match new format:
```typescript
function isCycleStart(content: string): boolean {
  return content.startsWith('SENSE EVENTS (') || content.startsWith('[YOU ARE:');
}
```

**Recommendation:** Option A is safer — it maintains a reliable, unique prefix that won't accidentally match other user messages.

---

### BUG-2: Stale Online SET Entries After Crash (HIGH)

**Location:** `hsafa-spaces/server/src/lib/smartspace-events.ts:57-103`

**The Problem:**

Two Redis structures track online status:
- **Online SET** (`smartspace:{spaceId}:online`) — no TTL, only cleaned by `markOffline()`
- **Presence key** (`smartspace:{spaceId}:presence:{entityId}`) — 120s TTL, refreshed by keepalive

If Core crashes mid-run (before `run.finished`), the haseef entity stays in the online SET forever. The presence key expires after 120s, but **nothing removes the entity from the SET**.

For human users, the SSE disconnect handler calls `markOffline()`, which works correctly. But haseefs don't have SSE connections — their online status is managed by the stream bridge, which only cleans up on `run.finished`.

**Impact:** After a crash, haseefs appear permanently online in all their spaces until the Spaces server restarts and the Redis keys are cleared.

**Fix:** Add a periodic presence cleanup job:
```typescript
setInterval(async () => {
  for (const spaceId of activeSpaceIds) {
    const onlineEntities = await redis.smembers(ONLINE_SET_KEY(spaceId));
    for (const entityId of onlineEntities) {
      const alive = await redis.exists(PRESENCE_KEY(spaceId, entityId));
      if (!alive) {
        await redis.srem(ONLINE_SET_KEY(spaceId), entityId);
        await emitSmartSpaceEvent(spaceId, { type: "user.offline", entityId });
      }
    }
  }
}, 60_000);
```

---

## 4. Functional Testing — Haseef Communication

### 4.1 Sense Event Quality — GOOD

The `buildFormattedContext()` function in `sense-events.ts:523-567` produces well-structured context:

```
[YOU ARE: Atlas]
[DIRECT SPACE with Husam (human)]
[space: "Chat", 1-on-1, members: Atlas (You) [agent], Husam [human]]
[recent conversation in "Chat"]:
  Husam [messageId:abc]: "Hello!"
  You [messageId:def]: "Hi there!"
>>> NEW MESSAGE from Husam (human) in "Chat" (spaceId:xyz)[messageId:ghi]: "How are you?"
```

**Strengths:**
- Clear `[YOU ARE: name]` identity anchor prevents identity confusion
- "You" labeling for the haseef's own past messages in recent conversation
- `messageId` tags enable proper `replyTo` threading
- `isDirect` / `isGroupSpace` flags inform communication style
- `directWith` field tells the haseef exactly who they're talking to
- Member list with types helps haseefs understand who's in the space

### 4.2 Prompt Instructions — GOOD with Caveats

The `SCOPE_INSTRUCTIONS` in `manifest.ts:22-34` are concise and clear:

```
Use spaces_send_message to reply. Your text output is internal thought — only tool calls reach people.
You must call spaces_enter_space before interacting with any space.
In group spaces, respond when addressed. In 1-on-1 with another haseef, avoid infinite loops.
```

**Concern:** The infinite loop prevention for haseef-to-haseef communication is entirely prompt-based (see BUG-3 below).

### 4.3 Tool Call Flow — CORRECT

The `toolChoice: 'required'` + `stopWhen: [hasToolCall('done')]` pattern ensures:
- Every cycle produces tool calls (no invisible text output)
- Every cycle ends with `done` (clean exit signal)
- Maximum 50 steps safety limit prevents runaway cycles

The tool execution chain (Core XADD → Spaces XREADGROUP → execute → submit result) is reliable with per-action error handling and always-submit-result guarantees (`action-listener.ts:94-108`).

### 4.4 Conversation Continuity — GOOD

Consciousness persistence works correctly:
- Messages accumulate across cycles in `HaseefConsciousness`
- System prompt is regenerated each cycle (fresh memories, archives)
- Consciousness is saved atomically after each successful cycle
- Failed cycles roll back consciousness (no stacking of failed messages)

**However:** This depends on BUG-1 being fixed — without pruning, consciousness will grow until failure.

---

## 5. Multi-Haseef (3+) Group Behavior

### BUG-3: No Programmatic Loop Prevention (HIGH)

**Location:** `hsafa-spaces/server/src/lib/service/sense-events.ts:130-231`

**The Problem:**

When a message is sent in a group space, `handleInboxMessage()` triggers ALL other haseefs in that space:

```
Space with: Haseef A, Haseef B, Haseef C, Human

1. Human sends "Hello everyone"
   → Triggers: A, B, C (3 haseefs wake)

2. A responds "Hi!"
   → Triggers: B, C (A is skipped — self-message filter)

3. B responds "Hey!"
   → Triggers: A, C

4. C responds "Hello!"
   → Triggers: A, B

5. A responds to B and C → Triggers: B, C
   ... exponential cascade continues
```

The only protection is the prompt instruction: *"In group spaces, respond when addressed."* LLMs are unreliable at following this — especially when they see a greeting directed at "everyone."

**Impact:**
- Runaway message storms in group spaces
- Rapid token consumption and cost accumulation
- Each haseef enters its own cycle simultaneously (no coordination)
- Conversations become chaotic and unnatural

**Recommended Fixes (implement at least 2):**

1. **Cooldown per haseef per space** — After responding, impose a 10-30s delay before the same haseef can be triggered again in the same space:
   ```typescript
   const lastResponseTime = new Map<string, number>(); // key: `${haseefId}:${spaceId}`
   const COOLDOWN_MS = 15_000;
   
   // In handleInboxMessage, before pushing sense event:
   const key = `${conn.haseefId}:${spaceId}`;
   const lastTime = lastResponseTime.get(key) ?? 0;
   if (Date.now() - lastTime < COOLDOWN_MS) {
     console.log(`[spaces-service] COOLDOWN: skip ${conn.haseefName} in ${spaceId}`);
     continue;
   }
   ```

2. **Agent-to-agent message detection** — When the sender is an agent, only trigger haseefs that are explicitly mentioned or addressed:
   ```typescript
   if (senderType === 'agent' && isGroupSpace) {
     // Only trigger if the message mentions this haseef by name
     const mentioned = content.toLowerCase().includes(conn.haseefName.toLowerCase());
     if (!mentioned) continue;
   }
   ```

3. **Max responses per space per minute** — Global rate limit on how many haseef responses can occur in a space within a time window.

4. **Circuit breaker** — If a space has had more than N haseef messages in the last M seconds, stop triggering haseefs and let the space "cool down."

---

## 6. Performance & Latency Analysis

### 6.1 Full Response Latency Breakdown

| Step | Operation | Est. Latency |
|------|-----------|-------------|
| 1 | Human message → Postgres write | 5-15ms |
| 2 | SSE broadcast + inbox handler | 2-5ms |
| 3 | Fetch recent messages + members + space metadata | 15-40ms |
| 4 | pushSenseEvent (HTTP POST to Core) | 10-30ms |
| 5 | Redis LPUSH + Postgres upsert (dual-write) | 5-15ms |
| 6 | BRPOP wakeup + drainInbox | 1-5ms |
| 7 | Fetch haseef config + tools + scopes | 10-25ms |
| 8 | Select memories + search archive | 20-100ms |
| 9 | Build system prompt | 1-3ms |
| 10 | LLM call (first token) | 500-3000ms |
| 11 | enter_space tool dispatch + execute | 50-150ms |
| 12 | send_message tool dispatch + execute | 30-100ms |
| 13 | done tool (local) | <1ms |
| 14 | Save consciousness + update run | 10-30ms |
| **Total** | | **~700ms - 3.5s** |

**LLM inference (step 10) dominates** at 60-85% of total latency. Everything else is overhead.

### 6.2 Bottleneck: Ephemeral Redis Connections Per Sync Tool Call

**Location:** `hsafa-core/core/src/lib/action-dispatch.ts:72`

Every sync tool call creates a new Redis connection (`redis.duplicate()`), subscribes, waits for result, then disconnects. With 2 sync tool calls per cycle (enter_space + send_message), that's **2 ephemeral Redis connections created and destroyed per response**.

**Fix:** Use a connection pool or a single long-lived subscriber with per-action routing:
```typescript
// Instead of redis.duplicate() per action, use a shared subscriber
// with action result routing by actionId
const sharedSub = redis.duplicate(); // one connection
const pendingActions = new Map<string, (result: unknown) => void>();

sharedSub.on('message', (channel, message) => {
  const actionId = channel.replace('action_result:', '');
  const resolver = pendingActions.get(actionId);
  if (resolver) {
    pendingActions.delete(actionId);
    resolver(JSON.parse(message));
  }
});
```

### 6.3 Bottleneck: enter_space Required Every Cycle

**Location:** `hsafa-spaces/server/src/lib/service/stream-bridge.ts:131`

`enteredSpace` is cleared on every `run.started`, forcing the haseef to call `enter_space` at the start of every cycle. This adds:
- 1 extra LLM output tool call (~50 tokens)
- 1 Redis XADD + XREADGROUP round trip
- 3 Prisma queries (membership check + space info + members)
- 1 submitActionResult HTTP call

**Fix:** Consider auto-entering the trigger space on `run.started` when the event contains `spaceId`. The haseef can still call `enter_space` to switch spaces, but the default should be the trigger space:
```typescript
// In bridgeStreamEvent, on run.started:
if (triggerSpaceId) {
  conn.activeSpace = { spaceId: triggerSpaceId, spaceName: /* lookup */ };
}
```

This would save ~100-200ms per cycle and reduce token usage.

### 6.4 Bottleneck: Redundant syncTools at Bootstrap

**Location:** `hsafa-spaces/server/src/lib/service/index.ts:75-100`

Tools are synced twice at bootstrap:
1. In `setupHaseefConnection()` line 187 — for each haseef
2. In the re-sync loop at line 96-100 — for all connected haseefs

The second sync is meant to catch tool definition changes across deploys, but it's redundant when the first sync just ran.

**Fix:** Remove the re-sync loop or add a `skipIfFresh` flag.

---

## 7. Cost & Token Usage Analysis

### 7.1 Per-Message Token Budget (GPT-4o baseline)

| Component | First Cycle | After 50 Cycles | After 200 Cycles |
|-----------|------------|-----------------|------------------|
| System prompt | ~3,000 | ~3,000 | ~3,000 |
| Consciousness history | 0 | ~20,000 | ~80,000 |
| Sense event (new message) | ~300 | ~300 | ~300 |
| **Total input tokens** | **~3,300** | **~23,300** | **~83,300** |
| Output (3 tool calls) | ~200 | ~200 | ~200 |
| **Total output tokens** | **~200** | **~200** | **~200** |

### 7.2 Cost Per Message (GPT-4o pricing: $2.50/M input, $10/M output)

| Stage | Input Cost | Output Cost | **Total** |
|-------|-----------|-------------|-----------|
| First cycle | $0.008 | $0.002 | **$0.010** |
| After 50 cycles | $0.058 | $0.002 | **$0.060** |
| After 200 cycles | $0.208 | $0.002 | **$0.210** |
| Near 200k budget | $0.500 | $0.002 | **$0.502** |

### 7.3 Cost Impact Over Long Conversations

For a haseef with 100 messages/day:

| Period | Cumulative Messages | Avg Cost/Message | **Period Cost** |
|--------|-------------------|-----------------|-----------------|
| Day 1 | 100 | ~$0.03 | ~$3.00 |
| Week 1 | 700 | ~$0.15 | ~$105 |
| Month 1 | 3,000 | Stuck (BUG-1) | N/A |

**Key insight:** Without consciousness pruning (BUG-1), costs accelerate linearly and the haseef dies before reaching a month. With pruning fixed, costs stabilize at the budget ceiling — approximately **$0.50/message at steady state**.

### 7.4 enter_space Overhead Cost

The mandatory `enter_space` call per cycle adds:
- ~50 output tokens (tool call arguments)
- ~200 input tokens (tool result with members list)
- Per message: ~$0.001 extra
- Per 100 messages/day: ~$0.10/day
- Per month: ~$3.00/month per haseef

### 7.5 Cost Tracking Gap

**Location:** `hsafa-core/core/src/lib/model-middleware.ts:55`

```typescript
const haseefTokenUsage = new Map<string, { input: number; output: number; calls: number }>();
```

This is an **in-memory Map** — all usage data is lost on server restart. There is no persistent cost tracking.

**Fix:** Persist token usage to the Run record or a dedicated UsageLog table:
```sql
-- Add to Run model:
inputTokens  Int?
outputTokens Int?
```

---

## 8. UI/UX — Online Status Indicators

### 8.1 Correct Behaviors ✓

| Behavior | Status | Location |
|----------|--------|----------|
| Online count excludes current user | ✅ Correct | `chat-view.tsx:170-172` |
| 1-on-1 avatar shows OTHER member's status | ✅ Correct | `chat-view.tsx:459-464` |
| Typing indicator filters out self | ✅ Correct | `chat-view.tsx:156-168` |
| Typing auto-clears after 5s | ✅ Correct | `use-space-chat.ts:349-357` |
| Haseefs go online only during active runs | ✅ Correct | `stream-bridge.ts:140-152` |
| Haseefs go offline after run.finished | ✅ Correct | `stream-bridge.ts:252-257` |
| SSE disconnect marks human offline | ✅ Correct | `space-stream.ts:132-143` |
| Keepalive refreshes presence TTL | ✅ Correct | `space-stream.ts:122-129` |

### 8.2 Issues Found

**ISSUE-UI-1: No Online Indicators in Sidebar (MEDIUM)**

**Location:** `hsafa-spaces/react_app/src/components/spaces-sidebar.tsx:126-131`

The `SpaceItem` component renders an `Avatar` but never passes the `isOnline` prop. Users must click into a space to see who's online.

**Fix:** Pass `isOnline` from the SSE-connected state. This requires either:
- A global presence subscription (not per-space), or
- Pre-fetching online status for sidebar spaces on load

**ISSUE-UI-2: No Presence Cleanup Job (see BUG-2)**

Haseef entities can appear stuck as "online" after crashes.

### 8.3 Typing Indicator Behavior — GOOD

- Typing starts when a message tool begins (`tool.started` with `isMessageTool`)
- Typing stops when the message tool completes (`tool.done`)
- Typing heartbeat every 3s keeps the indicator alive during long tool execution
- Client auto-clears after 5s if no new typing event (prevents stuck indicators)
- Typing does NOT start during model reasoning phase (only when tool starts)

---

## 9. Spaces & Group Features

### 9.1 Space Creation — CORRECT ✓

| Feature | Status | Location |
|---------|--------|----------|
| Create space without participants (API key) | ✅ Works | `smart-spaces.ts:35-56` |
| Create space with members (JWT, frontend) | ✅ Works | `smart-spaces.ts:206-281` |
| Creator is always owner | ✅ Correct | `smart-spaces.ts:238-244` |
| Members notified via `handleMembershipChanged` | ✅ Correct | `smart-spaces.ts:266-274` |
| Haseefs auto-discover new spaces | ✅ Correct | `index.ts:241-271` |
| Tools re-synced on membership change | ✅ Correct | `index.ts:262-267` |
| Direct space metadata (`isDirect`) | ✅ Correct | `smart-spaces.ts:233` |

### 9.2 Multi-Haseef Group Support — FUNCTIONAL but Risky

| Feature | Status | Notes |
|---------|--------|-------|
| Multiple haseefs in one space | ✅ Works | Via membership, each gets sense events |
| Each haseef gets own sense events | ✅ Correct | `sense-events.ts:130` iterates connections |
| Self-message filter | ✅ Correct | `sense-events.ts:131-133` |
| Per-haseef "You" labeling | ✅ Correct | `sense-events.ts:139-145` |
| Space member list in context | ✅ Correct | `sense-events.ts:148-153` |
| Conversation cascade prevention | ❌ Missing | See BUG-3 |
| Agent-to-agent mention filtering | ❌ Missing | All haseefs trigger on all messages |

### 9.3 Dynamic Haseef Connection — CORRECT ✓

The `connectNewHaseef()` function (`index.ts:199-231`) properly handles runtime haseef creation:
- Creates entity if needed
- Resolves spaces
- Stores connection
- Syncs tools
- Creates Redis consumer group for action stream

### 9.4 Space Metadata Updates — CORRECT ✓

When space name/description changes, `reSyncAllHaseefsInSpace()` re-syncs tools for all haseefs in that space so their prompts show updated info.

---

## 10. Recommendations

### Priority 1 — Fix Critical Bugs (Do Immediately)

| # | Issue | Fix | Effort |
|---|-------|-----|--------|
| 1 | **Consciousness pruning broken** (BUG-1) | Add `SENSE EVENTS (N)` prefix back to `formatInboxEvents()` | 1 line |
| 2 | **No loop prevention** (BUG-3) | Add cooldown + agent-sender mention filter in `handleInboxMessage()` | ~30 lines |
| 3 | **Stale online SET** (BUG-2) | Add periodic presence cleanup job in `smartspace-events.ts` | ~20 lines |

### Priority 2 — Performance Optimizations (Next Sprint)

| # | Issue | Fix | Savings |
|---|-------|-----|---------|
| 4 | Ephemeral Redis per sync action | Shared subscriber with action routing | ~10ms/cycle |
| 5 | Mandatory enter_space every cycle | Auto-enter trigger space on run.started | ~150ms/cycle + ~$3/mo/haseef |
| 6 | Redundant syncTools at bootstrap | Skip second sync | Startup time |

### Priority 3 — Observability & Cost Control (Important)

| # | Issue | Fix |
|---|-------|-----|
| 7 | No persistent cost tracking | Add `inputTokens`/`outputTokens` to Run model |
| 8 | No cost alerts | Add threshold alerting when haseef approaches budget |
| 9 | No sidebar online indicators | Add global presence state to sidebar |

### Priority 4 — Group Communication Quality (Polish)

| # | Enhancement | Description |
|---|-------------|-------------|
| 10 | Smart triggering in groups | Only trigger haseefs when mentioned, addressed, or asked a question |
| 11 | Response coordination | Add brief random delay (1-5s) before triggering haseefs in groups to avoid simultaneous responses |
| 12 | Conversation turn-taking | Prompt enhancement: "In group spaces with other haseefs, wait for others to respond before speaking again" |

---

## Appendix A: Files Reviewed

### Hsafa Core (`hsafa-core/core/src/`)
- `index.ts` — Express server, routes, process startup
- `agent-builder/prompt-builder.ts` — System prompt construction
- `agent-builder/builder.ts` — Haseef builder (model + tools)
- `agent-builder/types.ts` — Type definitions
- `agent-builder/prebuilt-tools/registry.ts` — Prebuilt tool registry
- `agent-builder/prebuilt-tools/done.ts` — Cycle termination tool
- `lib/agent-process.ts` — Main think loop
- `lib/stream-processor.ts` — AI stream processing
- `lib/consciousness.ts` — Consciousness management + pruning
- `lib/inbox.ts` — Event inbox system
- `lib/tool-builder.ts` — Scoped tool construction
- `lib/action-dispatch.ts` — Redis action dispatch
- `lib/model-registry.ts` — LLM provider registry
- `lib/model-middleware.ts` — Logging + cost tracking
- `lib/process-manager.ts` — Process lifecycle
- `prisma/schema.prisma` — Database schema

### Spaces Service (`hsafa-spaces/server/src/`)
- `lib/service/index.ts` — Bootstrap + connection management
- `lib/service/manifest.ts` — Scope instructions + tool definitions
- `lib/service/tool-handlers.ts` — Tool execution (all 16 tools)
- `lib/service/action-listener.ts` — Redis Streams consumer
- `lib/service/stream-bridge.ts` — Run event bridging + online/typing
- `lib/service/sense-events.ts` — Sense event pushing + formatted context
- `lib/service/core-api.ts` — Core HTTP helpers
- `lib/service/types.ts` — Shared state + connection types
- `lib/service/inbox.ts` — Inbox handler interface
- `lib/smartspace-events.ts` — Online presence + typing + seen
- `routes/smart-spaces.ts` — Space CRUD routes
- `routes/space-stream.ts` — SSE endpoint
- `prisma/schema.prisma` — Database schema

### React App (`hsafa-spaces/react_app/src/`)
- `lib/use-space-chat.ts` — Chat hook with SSE
- `components/chat-view.tsx` — Chat UI + typing/online indicators
- `components/spaces-sidebar.tsx` — Sidebar space list
- `components/ui/avatar.tsx` — Avatar with online dot
