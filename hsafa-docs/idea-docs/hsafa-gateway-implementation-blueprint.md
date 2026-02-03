# Hsafa Gateway — Implementation Blueprint (Nexus + Entity Runtime)

This document turns the idea in `hsafa-gateway-doc.mdx` into a buildable system design.

It is written to be compatible with the current codebase:

- `hsafa-gateway/` (Express + TypeScript + Prisma + Redis + ws + Vercel AI SDK)
- `react-sdk/` (custom gateway transport via SSE)
- `hsafa-gateway/prisma/schema.prisma` (Entity/Nexus/Run models)
- `vercel-ai-sdk-docs/` (streaming + tools + agents reference)

---

## 1) Goal

Build an **Agent Builder + Distributed Agent Runtime (Gateway)** that supports:

- A shared-context network model:
  - **Nexus** = timeline/context
  - **Entity** = human/agent/system identity
  - **Client** = connection surface (web, mobile, node backend, device)
- Reliable execution:
  - **Runs** (agent executions) with **Steps** (LLM calls) and full event streaming
  - Refresh/reconnect without losing progress
- Distributed tools:
  - Server tools
  - Client/device tools (human-in-the-loop + device execution)
  - External tools (via MCP servers)
- Persistence:
  - Nexus timeline stored in Postgres
  - Run event stream stored in Postgres + Redis for realtime
- Future features:
  - Plans (scheduled runs)
  - Goals
  - Long-term memory

---

## 2) Recommended Tech Stack (matches repo)

### Runtime & API

- **Node.js 20+**
- **TypeScript**
- **Express** (already used)

### AI Engine

- **Vercel AI SDK (`ai`)**
  - `ToolLoopAgent` for multi-step tool loop
  - `convertToModelMessages` for converting UI message format to model messages
- Providers already in `hsafa-gateway/package.json`:
  - `@ai-sdk/openai`
  - `@ai-sdk/anthropic`
  - `@ai-sdk/google`
  - `@ai-sdk/xai`
- **MCP**
  - `@ai-sdk/mcp` as the client to connect to remote tool servers

### Persistence

- **Postgres**
  - Prisma ORM (`@prisma/client`, `prisma`)
- **Redis**
  - Redis Streams for realtime event fanout
  - Pub/Sub channel for “new events available” wakeups

### Realtime

- **SSE** (Server-Sent Events) for run streaming (works well with reconnect)
- **WebSocket (`ws`)** for client/device tool execution

### Validation

- **zod** for agent config schema validation (already used)

---

## 3) Domain Model (authoritative)

From `hsafa-gateway-doc.mdx`:

- **Nexus**
  - Shared context space: a timeline of events/messages
  - Public or private
- **Entity**
  - Unified identity: human/agent/system
  - An agent is an Entity *plus* an Agent config pointer
- **Client**
  - Connection surface (web/mobile/node/device)
  - Not an identity; it’s a channel
- **Run**
  - One execution of one Agent Entity inside one Nexus
  - Triggered by a Nexus event (message, system event, schedule)
- **Step**
  - One LLM call within the run

---

## 4) Prisma Schema Mapping (what you already have)

Your `schema.prisma` already contains the *right high-level* tables:

- `Entity` (human/agent/system)
- `Nexus`
- `NexusMembership`
- `NexusMessage` (timeline)
- `Agent` + `AgentVersion` (control-plane config)
- `Run`
- `RunEvent`
- `ToolCall` + `ToolResult`
- `Client`
- `Memory`
- `Plan`
- `Goal`

### Important mismatches to fix (code vs schema)

The current `hsafa-gateway/src` code is partly from the older “agent ↔ run” model and needs alignment:

- **Run fields mismatch**
  - Schema: `Run(nexusId, agentEntityId, agentVersionId, triggeredById, parentRunId, ...)`
  - Current code uses: `Run(agentId, agentVersionId, ...)`
- **ToolExecutionTarget mismatch**
  - Schema enum: `server | client | external`
  - Current code/tool config uses: `server | device | browser | external`
- **Device model mismatch**
  - `src/lib/websocket.ts` uses `prisma.device.upsert(...)`
  - Schema has **no** `Device` model; it has `Client`

### Recommendation

- Use **`Client`** as the unified “device/browser/mobile/node” connection model.
- Make tool execution target be **`server | client | external`** (schema), and encode client subtype in:
  - `Client.clientType` (e.g. `web`, `mobile`, `node`, `device`)
  - plus `Client.capabilities` JSON
- If you still want separate “Device” as a concept, add a `Device` table and map it to `Client` explicitly. Otherwise, delete the `Device` concept and standardize on `Client`.

---

## 5) Architecture Overview

### 5.1 Control Plane (Agent Builder)

Responsible for:

- Accepting agent configs
- Storing versions (`AgentVersion`)
- Validating config schema
- Optional: publishing “agent updated” event

Current code already supports this:

- `POST /api/agents` creates/returns `agentId` + `agentVersionId` using config hashing.

### 5.2 Execution Plane (Gateway Runtime)

Responsible for:

- Managing Nexuses and memberships
- Accepting a Nexus event (e.g. a human message)
- Creating Runs for eligible Agent Entities
- Executing the agent loop (LLM + tools)
- Streaming events
- Persisting timeline + run events

---

## 6) Data Flow (end-to-end)

### 6.1 Human message triggers agents in a Nexus

1. Client posts a message to the Nexus
2. Gateway writes a `NexusMessage` (seq ordered)
3. Gateway finds Agent Entities that are members of that Nexus
4. For each Agent Entity, gateway creates a `Run`:
   - `nexusId = the nexus`
   - `agentEntityId = that agent entity`
   - `agentVersionId = latest or pinned`
   - `triggeredById = human entity`
   - `status = queued`
5. Gateway executes each Run (async background)
6. Gateway emits `RunEvent` records and streams them
7. Agent may append new `NexusMessage` entries as it responds

### 6.2 Cross-Nexus execution (leave request example)

- A Run can create a child Run in a different Nexus
- Link with `parentRunId`
- Always write “origin metadata”:
  - `Run.metadata.origin = { fromRunId, fromNexusId, intent }`

---

## 7) API Surface (proposed)

Your current gateway API is run-centric. The Nexus model needs a Nexus-centric API.

### 7.1 Entities

- `POST /api/entities`
  - Create or upsert human/system entity
- `GET /api/entities/:entityId`
- `POST /api/entities/agents`
  - Create an Agent Entity (type=agent) linked to `Agent`

### 7.2 Clients (connections)

- `POST /api/clients/register`
  - Body:
    - `entityId`
    - `clientKey` (stable)
    - `clientType` (`web|mobile|node|device`)
    - `capabilities` (json)

This returns `clientId`.

### 7.3 Nexuses

- `POST /api/nexuses`
- `GET /api/nexuses/:nexusId`
- `POST /api/nexuses/:nexusId/members`
  - add Entity membership
- `GET /api/nexuses/:nexusId/messages?afterSeq=&limit=`
- `POST /api/nexuses/:nexusId/messages`
  - append a message/event

**Important**: `POST /api/nexuses/:nexusId/messages` is the canonical entry point that triggers Runs.

### 7.4 Runs

Keep these (they already exist and are useful for debugging/history):

- `GET /api/runs?agentEntityId=&nexusId=&limit=&offset=`
- `GET /api/runs/:runId`
- `GET /api/runs/:runId/events`
- `GET /api/runs/:runId/stream` (SSE)
- `POST /api/runs/:runId/tool-results`

Optional:

- `POST /api/runs/:runId/cancel`

---

## 8) Streaming & Reconnect Strategy

### 8.1 What the React SDK expects today

Your `react-sdk/src/hooks/useHsafaGateway.ts` connects to:

- `GET {gatewayUrl}/api/runs/:runId/stream`
- It expects:
  - SSE event name: `hsafa`
  - Event JSON: `{ id, type, ts, data }`

This is **custom**, and it works.

### 8.2 How this maps to Vercel AI SDK streaming docs

Vercel AI SDK describes a standardized UI message stream protocol with header:

- `x-vercel-ai-ui-message-stream: v1`

You have two paths:

- **Path A (recommended short-term): keep current custom run stream**
  - It’s already integrated with your React SDK.
  - You still use AI SDK internally for model + tool loop.

- **Path B (optional, later): provide an AI-SDK-compatible stream endpoint**
  - Add `POST /api/chat` that returns `toUIMessageStreamResponse()`.
  - This would integrate with `@ai-sdk/react` `useChat()` directly.
  - This requires changing the React SDK transport.

This blueprint assumes **Path A** now.

### 8.3 RunEvent types (canonical)

Use these as your stable event contract:

- `run.created`
- `run.started`
- `run.waiting_tool`
- `run.completed`
- `run.failed`
- `step.start`
- `step.finish`
- `text.delta`
- `reasoning.start`
- `reasoning.delta`
- `tool.input.start`
- `tool.input.delta`
- `tool.call`
- `tool.result`
- `stream.finish`
- `stream.error`
- `message.user`
- `message.assistant`
- `message.tool`

This matches the current gateway runtime streaming approach in `src/routes/runs.ts`.

---

## 9) Execution Engine (Run runner)

### 9.1 Inputs

To execute a Run, the runner must load:

- `Run`
- `AgentVersion.configJson`
- **Context messages**:
  - In the Nexus model: load recent `NexusMessage` for `run.nexusId`
  - Also include any run-specific tool messages/results

### 9.2 Message format recommendation

Standardize on **AI SDK UI Message** structure internally (the same shape your React SDK already uses):

- `role: 'user' | 'assistant' | 'tool'`
- `parts: [{ type: 'text', text: '...' }, { type: 'tool-call', ... }, ...]`

Then you can:

- persist to `NexusMessage.metadata` as JSON
- convert to model messages via `convertToModelMessages(...)`

### 9.3 Running the agent

Build agent:

- `buildAgent({ config })` returns `ToolLoopAgent`

Run loop:

- `built.agent.stream({ messages })`
- Iterate `fullStream` and emit events:
  - `text-delta` -> `text.delta`
  - `reasoning-delta` -> `reasoning.delta`
  - `tool-call` -> persist `ToolCall`, emit `tool.call`
  - `tool-result` -> persist `ToolResult`, emit `tool.result`

### 9.4 Waiting for client tools

When `tool.call.executionTarget !== 'server'`:

- Update Run status to `waiting_tool`
- Emit `run.waiting_tool`
- Dispatch tool call to a target `Client`:
  - choose `Client` by `capabilities` and `clientType`
  - set `ToolCall.targetClientId`
  - push to WebSocket (online) or Redis inbox (offline)

When `ToolResult` arrives:

- Persist `ToolResult`
- Emit `tool.result`
- Resume Run execution:
  - append a `message.tool` event
  - call runner again with updated history

---

## 10) Tool System Design

### 10.1 Tool visibility modes (from idea doc)

Add `visibility` to tool calls (in `ToolCall` metadata):

- `internal` (Main Tools)
  - never written into the Nexus timeline
  - only stored as Run events
- `entity-visible`
  - written into the Nexus timeline as an assistant tool-call part
  - optionally targeted to specific Entities

### 10.2 Execution target

Use:

- `server` (gateway executes)
- `client` (a connected Client executes)
- `external` (MCP server or external URL/service executes)

### 10.3 External tools

Two categories:

- MCP tools (recommended)
  - gateway uses `@ai-sdk/mcp` to connect and load tools
- Request tools
  - gateway executes outgoing HTTP requests (careful with auth + SSRF)

---

## 11) Nexus Timeline Persistence

`NexusMessage` should be the canonical timeline.

### 11.1 Sequencing

Schema uses `seq BigInt` unique per `nexusId`.

Implementation approach:

- Use a Postgres transaction:
  - `SELECT max(seq) FOR UPDATE` for that nexus
  - insert new message with `seq = max + 1`

### 11.2 Mapping messages

- For simple text messages:
  - `role` = `user|assistant|system|tool`
  - `content` = text
- For rich UI messages:
  - store full structure in `metadata`:
    - `metadata.uiMessage = { id, role, parts, createdAt, ... }`

---

## 12) Plans, Goals, Memory (minimum viable)

### 12.1 Plans

Use `Plan` table as the source of truth.

Scheduler worker options:

- **BullMQ** (Redis) with repeatable jobs
- **pg-boss** (Postgres)
- Simple polling loop (acceptable for MVP)

Flow:

- Scheduler finds due plans (`nextRunAt <= now AND status=active`)
- Scheduler writes a Nexus event or directly creates a Run

### 12.2 Goals

- Keep as structured state, not prompt text
- Inject into agent system prompt in a controlled section

### 12.3 Memory

Start with:

- `Memory(content TEXT, topic, metadata)`
- Retrieval MVP:
  - naive keyword matching by `topic`
  - later upgrade to embeddings + pgvector

---

## 13) Security & Identity (minimum viable)

Even for MVP, define:

- **Gateway API auth**
  - Bearer token from your app
- **Entity identity**
  - map your app’s user id -> `Entity.externalId`
- **Client identity**
  - stable `clientKey` signed into a token
  - never trust `clientKey` without verification
- **Authorization**
  - only members of a Nexus can read/write
  - private Nexuses must enforce membership checks

---

## 14) Implementation Plan (phased)

### Phase 1 — Align runtime with schema (must-do)

- Replace `agentId`-centric Run creation with Nexus model:
  - create `Entity` for agents
  - create `Nexus` and memberships
  - create `Run` with `nexusId` + `agentEntityId`
- Standardize ToolExecutionTarget:
  - map current `browser/device` to `client`
  - keep `external` and `server`
- Fix WebSocket “device” to use `Client` model

### Phase 2 — Nexus APIs + Triggering

- Add `/api/nexuses/*` endpoints
- Implement `POST /api/nexuses/:id/messages` trigger logic

### Phase 3 — Distributed tools (client execution)

- Implement tool call routing:
  - select target client by capabilities
  - inbox persistence
  - resume flow

### Phase 4 — Plans + Memory

- Add scheduler worker
- Add memory tools as internal tools

---

## 15) Notes on Existing Code (quick audit)

### What is already good

- Run streaming pipeline:
  - Redis Stream + pub/sub + Postgres `RunEvent` persistence
- Agent building:
  - `ToolLoopAgent`
  - MCP tool loading
- React SDK:
  - robust run re-hydration logic
  - tool call handling for browser/UI tools

### What must be refactored

- `runs.ts` currently assumes `Run.agentId` exists (it doesn’t in schema)
- Tool execution targets and enum values must match schema
- WebSocket device registration currently depends on a missing Prisma model

---

## 16) Definition of Done (MVP)

- You can create a Nexus, add Entities, and post a user message
- Agent Entities in that Nexus trigger Runs
- Runs stream incremental events to the UI with reconnect support
- Tools can execute:
  - on server
  - on a client (browser/device) and resume correctly
- All timeline messages are persisted and reload correctly

---

## Status

- **Blueprint created**. Next step is to implement the Phase 1 alignment changes in `hsafa-gateway` (code + schema enum alignment + WebSocket client model).
