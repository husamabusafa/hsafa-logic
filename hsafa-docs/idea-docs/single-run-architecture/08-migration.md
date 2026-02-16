# Migration from Current Architecture

## What Gets Removed

- `goToSpace` prebuilt tool and all related code
- `buildGoToSpaceMessages()` in `prompt-builder.ts`
- `isGoToSpaceRun` logic in `run-runner.ts`
- GoToSpace-related metadata fields (`originSmartSpaceId`, `originSmartSpaceName`, etc.)
- **Auto-persist of assistant messages** — `run-runner.ts` no longer creates a `SmartSpaceMessage` when the LLM finishes generating text. The agent explicitly sends messages via `sendSpaceMessage`.
- `smartSpaceId` as a required field on `Run` — runs are general, `smartSpaceId` becomes optional (only used for legacy/backward compatibility)
- Round-robin picker (`pickOneAgent` with `lastPickedAgentIndex`)
- Plan-run-specific message building (`buildPlanRunMessages`) — plan runs use the same prompt builder as all other runs
- **`sendSpaceMessageAndWait`** as a separate prebuilt tool — merged into `sendSpaceMessage` with `wait` option
- **`mentionAgent`** prebuilt tool — replaced by `mention` field on `sendSpaceMessage`
- **`routeToAgent`** prebuilt tool — replaced by redesigned `delegateToAgent`
- **Reply stack** and mention chain metadata — replaced by explicit blocking `wait` on `sendSpaceMessage`
- **System Entity** type — external services are no longer entities. They trigger agents via API.
- Multi-agent-specific prompt (4 options: respond/mention/delegate/skip) — replaced by unified prompt for all agents

## What Gets Added

- **Trigger context** on `Run` model — `triggerType` (`space_message` | `plan` | `service`), `triggerSpaceId`, `triggerMessageContent`, `triggerSenderEntityId`, `triggerServiceName`, `triggerPayload`, etc.
- **Service trigger API** — `POST /api/agents/{agentId}/trigger` for external services to trigger agents directly (not through spaces)
- **Event relay** — gateway relays run streaming events to the trigger space's SSE channel
- `readSpaceMessages` prebuilt tool
- `sendSpaceMessage` prebuilt tool (unified: send + optional `mention` + optional `wait`, with real streaming via tool-input-delta interception)
- `delegateToAgent` prebuilt tool (admin-only — silent handoff, cancels admin's run, re-triggers target agent with original human message)
- `getMyRuns` prebuilt tool (concurrent run awareness)
- `adminAgentEntityId` field on SmartSpace model
- Real streaming via `tool-input-delta` interception in `stream-processor.ts` for `sendSpaceMessage`
- `emitToSpace` function for streaming tool-input text deltas to target space SSE channels
- Concurrent run notice in system prompt (via `prompt-builder.ts`)
- **Composite message model** — one message per run per space, parts accumulate (text, tool_call, tool-card). Replaces per-tool-call message creation.
- **Display tool routing** — add top-level `displayTool` flag on tools. For tools with `displayTool: true`, gateway auto-injects optional `targetSpaceId` so the AI can route tool calls to a specific space.

## What Stays the Same

- Run lifecycle (queued → running → completed/failed/canceled/waiting_tool)
- Client tool execution flow (waiting_tool → submit result → resume)
- `skipResponse` prebuilt tool
- All existing tools (HTTP, compute, MCP, image-gen, etc.)
- SSE infrastructure (Redis pub/sub, client subscriptions)
- Goals and memory prebuilt tools

## What Changes

- **`run-runner.ts`** — No longer auto-persists assistant messages to a space. The run just executes and completes. Composite messages are built incrementally by `sendSpaceMessage` (text parts) and routed display tool calls (tool_call parts) during the run. On run completion, composite messages are finalized. No more mention chain handling, reply stack, or delegate signal processing.
- **`prompt-builder.ts`** — Single unified prompt builder for ALL agents (admin and non-admin). Same structure: agent identity, space members, trigger context. No more separate admin/non-admin/multi-agent/goToSpace/plan-specific builders.
- **`agent-trigger.ts`** — `triggerOneAgent` always triggers admin agent for human messages. Agent messages with `mention` trigger the mentioned agent. Agent messages without `mention` trigger nobody. New `triggerFromService` for service triggers.
- **`builder.ts`** — Inject `sendSpaceMessage` (unified), `readSpaceMessages`, `getMyRuns` for all agents. Inject `delegateToAgent` only for admin agent. For tools with `displayTool: true`, auto-inject optional `targetSpaceId` into input schema. Strip `targetSpaceId` before passing args to `execute`.
- **`stream-processor.ts`** — LLM text output is logged but NOT emitted to any space. Intercepts `tool-input-delta` for `sendSpaceMessage` calls and streams the `text` field to the target space in real-time. Detects `delegateToAgent` signal (cancel admin run, re-trigger target agent). No more mention chain or reply stack signal detection.
- **Entity model** — Only `human` and `agent` entity types. `system` type removed. Services interact via API without entity records.
- **`useHsafaRuntime` (react-sdk)** — Handles `text-delta` events from `sendSpaceMessage` tool-input interception (same event shape as direct run streaming). Run events received via relay are attributed to the agent entity.

---

# Summary — Why This Design

| Concern | Old (Space-Bound Runs) | New (General Runs + Space Tools) |
|---------|------------------------|----------------------------------|
| Run model | Run belongs to a space | Run is standalone — interacts with spaces via tools |
| Responding to user | Automatic (text → message in space) | Explicit: `sendSpaceMessage(spaceId, text)` |
| Talking to another space | Different mechanism (goToSpace) | Same: `sendSpaceMessage(otherSpaceId, text)` |
| Cross-space request-response | Impossible | Native: `sendSpaceMessage` with `mention` + `wait` |
| Multi-space orchestration | 1 space per child run | Unlimited per run |
| Plan runs | Special case (no space context) | Same model as everything else |
| Service triggers | System entity sends message in space | Direct API trigger — no entity needed |
| Who responds first? | Random (round-robin) | Deterministic (admin agent) |
| Agent-to-agent | mention chain + reply stack + delegate | `sendSpaceMessage` with `mention` + optional `wait`. Admin silent handoff via `delegateToAgent` |
| Agent prompt | 4 options + multi-agent-specific + goToSpace + plan | One unified prompt for all agents. Respond, delegate, or skip. |
| Entity types | Human + Agent + System | Human + Agent only. Services are API callers. |
| Streaming | Auto for same-space, nothing for cross-space | Event relay + real LLM streaming via tool-input-delta — everywhere |
| Client tools | Works within same space only | Works via event relay + `targetSpaceId` routing — any run, any space |
| Concurrent runs | No awareness | `getMyRuns` + system prompt notice |
| Space tools | 5 tools (send, sendAndWait, read, getMyRuns, routeToAgent) | 4 tools (sendSpaceMessage unified, readSpaceMessages, delegateToAgent admin-only, getMyRuns) |
| Messages | One message per LLM response | Composite message per run per space (text + UI + tool-card parts) |
| Tool routing/display | All tools visible as cards | Explicit routing: tool appears only when `displayTool: true` and call includes `targetSpaceId`; otherwise internal |
| Code complexity | 3+ prompt builders, mention chain, reply stack, delegate/route signals | 1 prompt builder, 1 run type, 4 space tools |
