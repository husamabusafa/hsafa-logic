# Single-Run Architecture — General Runs + Space Tools + Admin Agent

## Overview

**Runs are general-purpose — not tied to any space.** When a human sends a message in a space, the gateway creates a general run for the admin agent. The agent knows which space triggered it and what the human said, but the run itself is standalone. The agent uses **space tools** (`sendSpaceMessage`, `readSpaceMessages`) to communicate with any space — including the one that triggered it.

This means responding to a human in Space X and sending a message to Space Y are the **exact same operation**: `sendSpaceMessage(spaceId, text)`. Plan runs, human-triggered runs, and service-triggered runs are all identical — general runs that interact with the world through tools.

### Key Design Decisions

- **Entities = Humans + AI Agents only.** External services (Jira, Slack, IoT, etc.) are NOT entities — they trigger agents via API and submit tool results, but have no space membership.
- **3 trigger types:** `space_message`, `plan`, `service` — that's it.
- **Admin agent = regular agent.** Same prompt, same tools. Only difference: human messages go to admin first.
- **One unified tool for all communication:** `sendSpaceMessage` with optional `mention` (trigger an agent) and optional `wait` (block for reply). Replaces the old `sendSpaceMessage` + `sendSpaceMessageAndWait` + `mentionAgent` + `routeToAgent`.
- **Admin can silently delegate:** `delegateToAgent` cancels the admin's run and re-triggers the target agent with the original human message — invisible handoff.
- **Composite messages:** A run produces one message per space. `sendSpaceMessage` adds text parts. Tools configured with `displayTool: true` can add `tool_call` parts when the AI provides `targetSpaceId`.
- **All messages are streamed** — the user never sees a message appear instantly.

---

## Document Structure

1. **[Core Concept: General-Purpose Runs](./01-core-concept.md)** — Entity model (humans + agents only), services as API callers, 3 trigger types, event relay
2. **[Space Tools](./02-space-tools.md)** — `readSpaceMessages`, unified `sendSpaceMessage` (send + mention + wait), `delegateToAgent` (admin-only), `getMyRuns`, concurrent run awareness, loop protection
3. **[Admin Agent](./03-admin-agent.md)** — Admin is a regular agent, triggering rules, `delegateToAgent` for silent handoff
4. **[Client Tool Calling](./04-client-tools.md)** — Browser (React SDK) + Node.js (Node SDK) client tools
5. **[Composite Messages & Display Tools](./05-space-ui.md)** — Composite message model (parts accumulation), `displayTool` + `targetSpaceId` routing, cross-space UI pattern
6. **[Streaming](./06-streaming.md)** — Real LLM streaming via `tool-input-delta` interception, two streaming paths
7. **[Scenarios](./07-scenarios.md)** — Complete end-to-end scenarios (cross-space, multi-agent, service trigger, plan, client tools, agent chains)
8. **[Migration](./08-migration.md)** — What gets removed/added/changed, summary comparison table

---

## Superseded Docs

These older idea-docs have been **updated** to reflect this architecture:

- `multi-agent-triggering.md` — now documents the admin agent + `sendSpaceMessage` with `mention` + `wait` pattern
- `system-prompts.md` — now documents the unified prompt builder with trigger context injection

These docs remain valid and complementary:

- `hsafa-gateway-doc.mdx` — original vision (SmartSpaces + Entities + Clients) — still the foundation
- `hsafa-gateway-implementation-blueprint.md` — tech stack and domain model — still accurate (minus System Entity)
- `agent-config-json.md` — agent config schema — still current
- `tools-design-doc.md` — tools architecture (HTTP, MCP, prebuilt, client) — still current
- `sdk-design-doc.md` — SDK design (Node, React, Python) — still current
- `client-auth-guide.md` — auth flow (secret key, public key + JWT) — still current
- `reasoning-design-doc.md` — reasoning/thinking feature — implemented

---

## Implementation Phases

### Phase 1: Core Runtime Refactor (Gateway)
Refactor `run-runner.ts`, `stream-processor.ts`, `agent-trigger.ts`, `prompt-builder.ts`, `builder.ts` to implement general-purpose runs, unified `sendSpaceMessage` with real streaming, event relay, and admin agent triggering. Remove auto-persist, mention chains, reply stack, System Entity.

### Phase 2: Space Tools + Admin Agent
Implement the 4 prebuilt tools (`readSpaceMessages`, `sendSpaceMessage`, `delegateToAgent`, `getMyRuns`). Add `adminAgentEntityId` to SmartSpace. Build unified prompt builder with admin/non-admin/single-agent variants. Service trigger API (`POST /api/agents/{id}/trigger`).

### Phase 3: Composite Messages + Display Tool Routing
Replace per-tool-call message creation with composite message model (one message per run per space, parts accumulate). Add `displayTool` field to tool config. Auto-inject optional `targetSpaceId` for tools with `displayTool: true`. Update `stream-processor.ts` to route parts to `targetSpaceId` only when provided.

### Phase 4: SDK Updates
Update react-sdk (`useHsafaRuntime`) to handle composite messages, text-delta from tool-input interception, and `targetSpaceId` routing for display tools. Update node-sdk with service trigger support. Update ui-sdk to render composite message parts (text + custom tool UI inline).

### Phase 5: Migration + Cleanup
Remove old code (mentionAgent, routeToAgent, round-robin, reply stack, System Entity type). Run Prisma migrations. Update seeds and test scenarios.
