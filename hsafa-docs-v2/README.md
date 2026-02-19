# Hsafa Gateway v2 — Design Documentation

Architecture docs for the next generation of Hsafa Gateway.

## Core Idea

Make AI agents behave like humans: they enter spaces, read context, send messages, wait for replies, use tools, and manage their own schedules. No special-case logic — everything is built on mentions, spaces, and context awareness.

## Documents

| # | Document | Description |
|---|----------|-------------|
| 00 | [Core Philosophy](./00-core-philosophy.md) | Vision, primitives, design principles, v1 → v2 diff |
| 01 | [Trigger System](./01-trigger-system.md) | Mentions, 2-entity auto-trigger, plans, services |
| 02 | [Spaces & Active Context](./02-spaces-and-context.md) | `enter_space`, stateful context, space switching |
| 03 | [Tool System](./03-tool-system.md) | Execution types, visibility, built-in tools, MCP |
| 04 | [Messaging & Waiting](./04-messaging-and-waiting.md) | `send_message`, `wait`, reply resolution, conversation loops |
| 05 | [Context Model](./05-context-model.md) | Structured timeline, no role-based history, trigger context |
| 06 | [Run Awareness](./06-run-awareness.md) | Concurrent runs, `waiting_reply`, deduplication, limits |
| 07 | [Human-Like Behavior](./07-human-like-behavior.md) | Intent, memory, continuity, the seven pillars |
| 08 | [Data Model](./09-data-model.md) | Schema changes, migration SQL, agent config changes |
| 09 | [Implementation Blueprint](./10-implementation-blueprint.md) | 13-step ordered build plan, test scenarios |
| 10 | [Examples & Scenarios](./11-examples-and-scenarios.md) | 10 real-world flows with full trace |
| 11 | [Context Continuity](./13-context-continuity.md) | How agents always know the full context of their actions |

## Key Removals from v1

- Admin agent
- `delegateToAgent` tool
- `skipResponse` tool
- `spaceId` in tool parameters
- `displayTool` + `targetSpaceId` injection
- Role-based `user`/`assistant` history

## Key Additions in v2

- `enter_space` — stateful space context
- `send_message(wait: true)` — pause run until replies arrive
- `@AgentName` mention parsing in message text
- 2-entity space auto-trigger
- `waiting_reply` run status
- Structured chronological event context
- Per-tool `visibility` configuration
