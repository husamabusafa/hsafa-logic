# Hsafa Gateway v2 — Design Documentation

Architecture docs for the next generation of Hsafa Gateway.

## Core Idea

Make AI agents behave like humans: they enter spaces, read context, send messages, use tools, and manage their own schedules. No special-case logic — everything is built on spaces, tools, and context awareness. Runs are stateless — every message triggers a fresh run with full context.

## Documents

| # | Document | Description |
|---|----------|-------------|
| 00 | [Core Philosophy](./00-core-philosophy.md) | Vision, primitives, design principles, v1 → v2 diff |
| 01 | [Trigger System](./01-trigger-system.md) | All-agent triggering, plans, services |
| 02 | [Spaces & Active Context](./02-spaces-and-context.md) | `enter_space`, stateful context, space switching |
| 03 | [Tool System](./03-tool-system.md) | Execution types, `visible: true/false`, built-in tools, MCP |
| 04 | [Messaging & Conversations](./04-messaging-and-waiting.md) | `send_message({ text })`, stateless runs, context-driven conversations |
| 05 | [Context Model](./05-context-model.md) | Structured timeline, no role-based history, trigger context |
| 06 | [Run Awareness](./06-run-awareness.md) | Concurrent runs, deduplication, limits |
| 07 | [Human-Like Behavior](./07-human-like-behavior.md) | Intent, memory, continuity, the seven pillars |
| 08 | [Data Model](./09-data-model.md) | Schema changes, migration SQL, agent config changes |
| 09 | [Implementation Blueprint](./10-implementation-blueprint.md) | 9-step ordered build plan, test scenarios |
| 10 | [Examples & Scenarios](./11-examples-and-scenarios.md) | 10 real-world flows with full trace |
| 11 | [Streaming & Redis](./12-streaming-and-redis.md) | SSE events, Redis Pub/Sub, resumable streams, dedup |
| 12 | [Context Continuity](./13-context-continuity.md) | How agents always know the full context of their actions |
| 13 | [Prebuilt Tools Reference](./14-prebuilt-tools-reference.md) | All built-in tools with input/output schemas |

## Key Removals from v1

- Admin agent
- `delegateToAgent` tool
- `skipResponse` tool
- `mentionAgent` tool
- `send_reply` tool
- `wait: true` / `messageId` on `send_message`
- `waiting_reply` run status
- `continue_waiting` / `resume_run` tools
- `@mention`-based triggering
- Proactive router
- `spaceId` in tool parameters
- `displayTool` + `targetSpaceId` injection
- Tool visibility modes (`visible`/`hidden`/`result-only`)
- Role-based `user`/`assistant` history

## Key Additions in v2

- **All-agent triggering** — every message triggers all other agent members (sender excluded)
- **Trigger debounce** — rapid messages batched into a single run per agent (2s default window)
- `enter_space` — stateful space context
- **Stateless runs** — every message triggers a fresh run, context provides conversational continuity
- `send_message({ text })` — one tool, one parameter
- Structured chronological event context with `[SEEN]`/`[NEW]` markers
- Simple `visible: true/false` tool configuration
