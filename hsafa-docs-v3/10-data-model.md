# 11 — Data Model

## Overview

v3 introduces two new tables (`AgentConsciousness`, `InboxEvent`) and removes run-coordination fields. The core data model (entities, spaces, messages, goals, memories, plans) remains the same as v2.

---

## New Tables

### 1. AgentConsciousness

Stores the agent's persistent consciousness — the `ModelMessage[]` array that carries forward across think cycles.

```prisma
model AgentConsciousness {
  id              String   @id @default(uuid()) @db.Uuid
  agentEntityId   String   @unique @map("agent_entity_id") @db.Uuid
  messages        Json     // ModelMessage[] serialized as JSON
  cycleCount      Int      @default(0) @map("cycle_count")
  tokenEstimate   Int      @default(0) @map("token_estimate")
  lastCycleAt     DateTime @default(now()) @map("last_cycle_at")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")
  
  entity          Entity   @relation(fields: [agentEntityId], references: [id])
  
  @@map("agent_consciousness")
}
```

| Field | Type | Description |
|-------|------|-------------|
| `agentEntityId` | UUID (unique) | One consciousness per agent |
| `messages` | JSON | `ModelMessage[]` — the full consciousness array |
| `cycleCount` | Int | How many think cycles have completed |
| `tokenEstimate` | Int | Estimated token count for budget tracking |
| `lastCycleAt` | DateTime | When the last think cycle completed |

### Usage

- **Loaded** at process startup: `loadConsciousness(agentEntityId)`
- **Saved** after each think cycle: `saveConsciousness(agentEntityId, messages, cycleCount)`
- **On crash recovery**: loaded from DB — agent resumes from last saved state

---

### 2. InboxEvent (Optional — Redis-Only Alternative)

If using Redis Streams instead of Redis Lists for the inbox, this table tracks acknowledged events for crash recovery:

```prisma
model InboxEvent {
  id              String   @id @default(uuid()) @db.Uuid
  agentEntityId   String   @map("agent_entity_id") @db.Uuid
  eventId         String   @map("event_id")
  eventType       String   @map("event_type") // space_message, plan, service
  data            Json
  processedAt     DateTime? @map("processed_at")
  createdAt       DateTime @default(now()) @map("created_at")
  
  entity          Entity   @relation(fields: [agentEntityId], references: [id])
  
  @@unique([agentEntityId, eventId])
  @@map("inbox_events")
}
```

**Note:** This table is optional. The primary inbox mechanism uses Redis (Lists or Streams). This DB table is only needed if you want durable event tracking for crash recovery beyond what Redis provides.

---

## Schema Changes from v2

### Removed

```prisma
// REMOVE from Run model:
activeSpaceId     String?  @map("active_space_id") @db.Uuid
```

**Why:** `activeSpaceId` was run-level state in v2. In v3, the active space is process-level state held in memory during the think cycle — not persisted per-run.

### Removed from SmartSpaceMembership

```prisma
// REMOVE:
lastProcessedMessageId  String?  @map("last_processed_message_id") @db.Uuid
```

**Why:** In v2, this tracked which messages the agent had processed in each space (for `[SEEN]`/`[NEW]` markers). In v3, consciousness tracks everything the agent has seen — no per-space tracking needed.

**Keep:**

```prisma
// KEEP for human unread indicators:
lastSeenMessageId       String?  @map("last_seen_message_id") @db.Uuid
```

Humans still need unread badges and "new messages" dividers in the chat UI.

---

## Unchanged Models

These models are **unchanged** from v2:

| Model | Notes |
|-------|-------|
| `Entity` | Same. EntityType stays `human`/`agent`. |
| `SmartSpace` | Same. No admin agent. |
| `SmartSpaceMembership` | Same (minus `lastProcessedMessageId`). |
| `SmartSpaceMessage` | Same. Messages still have `role`, `content`, `metadata`, `seq`. |
| `Agent` | Same. Config JSON structure unchanged. |
| `Memory` | Same. Key-value store per agent. |
| `Plan` | Same. Scheduling unchanged. |
| `Goal` | Same. Goals unchanged. |
| `Client` | Same. |

### Run Model — Simplified

The Run model still exists for tracking think cycle metadata (for admin dashboards, billing, debugging), but it's simplified:

```prisma
model Run {
  id                String    @id @default(uuid()) @db.Uuid
  agentId           String    @map("agent_id") @db.Uuid
  agentEntityId     String    @map("agent_entity_id") @db.Uuid
  status            RunStatus @default(running)
  cycleNumber       Int       @map("cycle_number")
  
  // Trigger context (from inbox event)
  triggerType       String?   @map("trigger_type")
  triggerSpaceId    String?   @map("trigger_space_id") @db.Uuid
  triggerEntityId   String?   @map("trigger_entity_id") @db.Uuid
  triggerMessageId  String?   @map("trigger_message_id") @db.Uuid
  triggerPayload    Json?     @map("trigger_payload")
  
  // Metrics
  inboxEventCount   Int       @default(0) @map("inbox_event_count")
  stepCount         Int       @default(0) @map("step_count")
  promptTokens      Int       @default(0) @map("prompt_tokens")
  completionTokens  Int       @default(0) @map("completion_tokens")
  durationMs        Int       @default(0) @map("duration_ms")
  
  startedAt         DateTime  @default(now()) @map("started_at")
  completedAt       DateTime? @map("completed_at")
  
  agent             Agent     @relation(fields: [agentId], references: [id])
  entity            Entity    @relation(fields: [agentEntityId], references: [id])
  
  @@map("runs")
}

enum RunStatus {
  running
  waiting_tool
  completed
  failed
  
  @@map("run_status")
}
```

**Changes from v2:**
- Added `cycleNumber` — which think cycle this corresponds to
- Added `inboxEventCount` — how many events were processed
- Added usage tracking fields (`promptTokens`, `completionTokens`, `durationMs`, `stepCount`)
- Removed `activeSpaceId` — not needed (process-level state)
- Removed `canceled` status — no concurrent runs to cancel
- Removed `queued` status — no run queue

A Run record is created at the start of each think cycle and updated when the cycle completes. It serves as an audit log and billing record, not as active state management.

---

## Agent Config JSON

The `configJson` stored in the Agent model changes slightly for v3:

### New Fields

```json
{
  "version": "3.0",
  "consciousness": {
    "maxTokens": 100000,
    "minRecentCycles": 10,
    "compactionStrategy": "summarize"
  },
  "adaptiveModel": {
    "cheap": "gpt-4o-mini",
    "standard": "gpt-4o",
    "reasoning": "o3"
  },
  "middleware": ["rag", "guardrails", "logging"]
}
```

### Full Agent Config Example (v3)

```json
{
  "version": "3.0",
  "agent": {
    "name": "ProjectAssistant",
    "description": "Manages project tasks, coordinates with team members.",
    "system": "You are ProjectAssistant, a proactive and organized project manager."
  },
  "model": {
    "provider": "openai",
    "name": "gpt-4o",
    "api": "responses",
    "temperature": 0.5,
    "maxOutputTokens": 8000,
    "reasoning": {
      "enabled": true,
      "effort": "medium",
      "summary": "auto"
    }
  },
  "consciousness": {
    "maxTokens": 100000,
    "minRecentCycles": 10,
    "compactionStrategy": "summarize"
  },
  "adaptiveModel": {
    "cheap": "gpt-4o-mini",
    "standard": "gpt-4o",
    "reasoning": "o3"
  },
  "loop": {
    "maxSteps": 20,
    "maxTokensPerCycle": 50000,
    "toolChoice": "auto"
  },
  "middleware": ["rag", "logging"],
  "tools": [
    {
      "name": "fetchJiraTickets",
      "description": "Fetch Jira tickets with filters",
      "executionType": "gateway",
      "visible": true,
      "inputSchema": {
        "type": "object",
        "properties": {
          "project": { "type": "string" },
          "status": { "type": "string" }
        },
        "required": ["project"]
      },
      "execution": {
        "url": "https://jira.company.com/api/search",
        "method": "GET",
        "headers": { "Authorization": "Bearer ${env.JIRA_TOKEN}" },
        "timeout": 15000
      }
    },
    {
      "name": "confirmDeployment",
      "description": "Show deployment confirmation dialog",
      "executionType": "space",
      "visible": true,
      "inputSchema": {
        "type": "object",
        "properties": {
          "service": { "type": "string" },
          "version": { "type": "string" },
          "environment": { "type": "string" }
        },
        "required": ["service", "version", "environment"]
      },
      "display": {
        "customUI": "deploymentConfirmation"
      }
    }
  ],
  "mcp": {
    "servers": [
      {
        "name": "github-tools",
        "url": "https://mcp.github.com",
        "transport": "http",
        "headers": { "Authorization": "Bearer ${env.GITHUB_TOKEN}" },
        "allowedTools": ["list_prs", "create_issue"]
      }
    ]
  }
}
```

---

## Entity Relationship Diagram (v3)

```
Entity (human | agent)
  ├── SmartSpaceMembership → SmartSpace
  ├── SmartSpaceMessage
  ├── AgentConsciousness (1:1 for agents)
  ├── Run (think cycle audit records)
  ├── Client
  ├── Memory
  ├── Plan
  └── Goal

Agent
  ├── Entity (1:1)
  ├── AgentConsciousness (via entity)
  ├── Run (think cycle records)
  └── configJson (AgentConfig with consciousness + adaptive model settings)
```

---

## Migration SQL

```sql
-- 1. Create agent_consciousness table
CREATE TABLE "agent_consciousness" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "agent_entity_id" UUID UNIQUE NOT NULL REFERENCES "entities"("id"),
  "messages" JSONB NOT NULL DEFAULT '[]',
  "cycle_count" INTEGER NOT NULL DEFAULT 0,
  "token_estimate" INTEGER NOT NULL DEFAULT 0,
  "last_cycle_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Remove lastProcessedMessageId from memberships (agents use consciousness now)
ALTER TABLE "smart_space_memberships" DROP COLUMN IF EXISTS "last_processed_message_id";

-- 3. Remove activeSpaceId from runs (process-level state, not persisted)
ALTER TABLE "runs" DROP COLUMN IF EXISTS "active_space_id";

-- 4. Add cycle tracking fields to runs
ALTER TABLE "runs" ADD COLUMN "cycle_number" INTEGER DEFAULT 0;
ALTER TABLE "runs" ADD COLUMN "inbox_event_count" INTEGER DEFAULT 0;
ALTER TABLE "runs" ADD COLUMN "step_count" INTEGER DEFAULT 0;
ALTER TABLE "runs" ADD COLUMN "prompt_tokens" INTEGER DEFAULT 0;
ALTER TABLE "runs" ADD COLUMN "completion_tokens" INTEGER DEFAULT 0;
ALTER TABLE "runs" ADD COLUMN "duration_ms" INTEGER DEFAULT 0;

-- 5. Optional: inbox events table for crash recovery
CREATE TABLE "inbox_events" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "agent_entity_id" UUID NOT NULL REFERENCES "entities"("id"),
  "event_id" VARCHAR NOT NULL,
  "event_type" VARCHAR NOT NULL,
  "data" JSONB NOT NULL,
  "processed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("agent_entity_id", "event_id")
);
```

Or via Prisma migration:

```bash
npx prisma migrate dev --name v3-living-agent
```
