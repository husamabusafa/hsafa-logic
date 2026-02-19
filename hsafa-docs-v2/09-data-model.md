# 09 — Data Model

## Overview

This document describes the schema changes needed for v2. The changes are minimal — the core data model (entities, spaces, messages, runs, goals, memories, plans) remains the same. The changes reflect the removal of admin agent logic and the addition of active space state + reply waiting.

---

## Schema Changes

### 1. SmartSpace — Remove Admin Agent

**Remove:**

```prisma
// REMOVE these from SmartSpace model:
adminAgentEntityId   String?  @map("admin_agent_entity_id") @db.Uuid
adminAgent           Entity?  @relation("AdminAgent", fields: [adminAgentEntityId], references: [id])
```

**Remove from Entity:**

```prisma
// REMOVE this relation from Entity model:
adminSpaces      SmartSpace[] @relation("AdminAgent")
```

**Why:** No admin agent concept in v2. All agents are equal. Triggering is mention-based.

---

### 2. RunStatus — Add `waiting_reply`

**Change:**

```prisma
enum RunStatus {
  queued
  running
  waiting_tool
  waiting_reply    // ← NEW: paused on send_message(wait: true)
  completed
  failed
  canceled
}
```

**Why:** Distinguishes between waiting for a UI tool result (`waiting_tool`) and waiting for a space message reply (`waiting_reply`).

---

### 3. Run — Add `activeSpaceId`

**Add:**

```prisma
model Run {
  // ... existing fields ...

  activeSpaceId     String?  @map("active_space_id") @db.Uuid  // ← NEW: set by enter_space tool

  // ... existing relations ...
}
```

**Why:** Tracks which space the agent is currently "in" during the run. Set by `enter_space`, used by `send_message` and visible tool result routing.

**Note:** `activeSpaceId` is **not** a foreign key relation — it's updated frequently during a run and doesn't need referential integrity enforcement. It's validated at the application level (membership check in `enter_space`).

---

### 4. Run Metadata — Wait State

When a run enters `waiting_reply`, the wait state is stored in run metadata (JSON):

```json
{
  "waitState": {
    "spaceId": "space-abc",
    "messageId": "msg-xyz",
    "toolCallId": "call-123",
    "waitingFor": [
      {
        "entityId": "entity-designer",
        "entityName": "Designer",
        "entityType": "agent",
        "responded": false
      }
    ],
    "startedAt": "2026-02-18T12:34:00Z",
    "timeout": 300000,
    "replies": []
  }
}
```

When replies arrive:

```json
{
  "waitState": {
    "spaceId": "space-abc",
    "messageId": "msg-xyz",
    "toolCallId": "call-123",
    "waitingFor": [
      { "entityId": "entity-designer", "entityName": "Designer", "entityType": "agent", "responded": true }
    ],
    "startedAt": "2026-02-18T12:34:00Z",
    "timeout": 300000,
    "replies": [
      {
        "entityId": "entity-designer",
        "entityName": "Designer",
        "text": "Looks good, approved!",
        "messageId": "msg-reply-1",
        "timestamp": "2026-02-18T12:34:45Z"
      }
    ]
  }
}
```

**Why metadata, not a table?** Wait state is transient — it's only needed while the run is paused. Once the run resumes, the replies become part of the tool result. No need for a separate table.

---

## Unchanged Models

These models are **unchanged** in v2:

| Model | Notes |
|-------|-------|
| `Entity` | Same (minus `adminSpaces` relation). EntityType stays `human`/`agent`. |
| `SmartSpaceMembership` | **Extended** — see below. |
| `SmartSpaceMessage` | Same. Messages still have `role`, `content`, `metadata`, `seq`. |
| `Agent` | Same. Config JSON structure changes (see tool visibility), but the model itself doesn't. |
| `RunEvent` | Same. Streaming events still stored here. |
| `ToolCall` / `ToolResult` | Same. May be used less (client tool flow unchanged). |
| `Client` | Same. |
| `Memory` | Same. |
| `Plan` | Same. |
| `Goal` | Same. |

### SmartSpaceMembership — Add `lastProcessedMessageId`

**Add:**

```prisma
model SmartSpaceMembership {
  // ... existing fields ...

  lastProcessedMessageId  String?  @map("last_processed_message_id") @db.Uuid  // ← NEW
}
```

**Why:** Tracks the last message the agent processed in this space. Used by the gateway when building the space history block to mark messages as `[SEEN]` or `[NEW]`. Updated after each run completes. Enables agents to focus on what's new without re-processing old context.

---

## Agent Config JSON Changes

The `configJson` stored in the Agent model changes:

### Tool Schema Changes

**Remove:**
```json
{
  "displayTool": true
}
```

**Add:**
```json
{
  "visibility": "visible | hidden | result-only"
}
```

### Full Tool Example (v2)

```json
{
  "name": "fetchWeather",
  "description": "Get current weather for a city",
  "executionType": "gateway",
  "visibility": "visible",
  "inputSchema": {
    "type": "object",
    "properties": {
      "city": { "type": "string" }
    },
    "required": ["city"]
  },
  "execution": {
    "url": "https://api.weather.com/current?city={{input.city}}",
    "method": "GET",
    "timeout": 10000
  }
}
```

### Removed from Tool Config

| Field | Reason |
|-------|--------|
| `displayTool` | Replaced by `visibility` |
| `display.mode` (`full`/`minimal`/`hidden`) | Replaced by top-level `visibility` |

### Kept

| Field | Notes |
|-------|-------|
| `display.customUI` | Still used for space tools (client-rendered UI component name) |
| `display.showInput` | Optional: whether to show tool input in space |
| `display.showOutput` | Optional: whether to show tool output in space |

---

## Migration SQL

```sql
-- 1. Add waiting_reply to RunStatus enum
ALTER TYPE "RunStatus" ADD VALUE 'waiting_reply' AFTER 'waiting_tool';

-- 2. Add activeSpaceId to runs
ALTER TABLE "runs" ADD COLUMN "active_space_id" UUID;

-- 3. Remove adminAgentEntityId from smart_spaces
ALTER TABLE "smart_spaces" DROP COLUMN IF EXISTS "admin_agent_entity_id";
```

Or via Prisma migration:

```bash
npx prisma migrate dev --name v2-schema-changes
```

---

## Entity Relationship Diagram (v2)

```
Entity (human | agent)
  ├── SmartSpaceMembership → SmartSpace
  ├── SmartSpaceMessage
  ├── Run
  │     ├── activeSpaceId → (SmartSpace, not FK)
  │     ├── RunEvent
  │     ├── ToolCall → ToolResult
  │     └── SmartSpaceMessage (produced by run)
  ├── Client
  ├── Memory
  ├── Plan
  └── Goal

Agent
  ├── Entity (1:1)
  ├── Run
  └── configJson (AgentConfig)
```

Key change from v1: no `SmartSpace.adminAgent → Entity` relation.
