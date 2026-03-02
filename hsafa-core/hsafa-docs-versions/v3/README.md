# Hsafa Gateway v3 — Living Agent Architecture

Architecture docs for the Living Agent version of Hsafa Gateway.

## Core Idea

AI agents are **persistent living processes** — not stateless request-response functions. An agent sleeps, wakes when events arrive in its inbox, thinks using a continuous consciousness (ModelMessage[]), acts through tools, and goes back to sleep. The consciousness carries forward across every cycle, giving the agent true continuity of self.

## What Changed from v2

| v2 | v3 |
|----|-----|
| Stateless runs — every message triggers a fresh run | Living process — persistent loop with inbox, sleep/wake |
| System prompt history with `[SEEN]`/`[NEW]` markers | Consciousness (`ModelMessage[]`) — continuous memory across cycles |
| Multiple concurrent runs per agent | One process, one inbox, one consciousness |
| `absorb_run` for run coordination | No concurrent runs — inbox batches events naturally |
| Context rebuilt from scratch every run | Consciousness persists and grows, compacted when needed |
| One model per agent | One model per agent (configurable per agent) |
| No middleware | Composable middleware stack (RAG, guardrails, caching, logging) |
| Run = unit of work | Think cycle = unit of work (one `streamText` call per wakeup) |

## What Stays the Same

- **Spaces** — shared context environments for communication
- **Tools** — generic, space-agnostic capabilities with execution types and visibility
- **`enter_space` + `send_message`** — stateful space context, one messaging tool
- **Plans** — scheduled/conditional self-triggers
- **Services** — external system triggers
- **Memories & Goals** — persistent agent state
- **All-agent triggering** — every message triggers all other agent members (sender excluded)
- **Streaming** — SSE + Redis Pub/Sub for real-time delivery
- **Tool visibility** — `visible: true/false` controls space posting

## Documents

| # | Document | Description |
|---|----------|-------------|
| 00 | [Core Philosophy](./00-core-philosophy.md) | Vision, primitives, the Living Agent paradigm |
| 01 | [Living Agent Process](./01-living-agent-process.md) | The process loop: inbox, sleep/wake, think cycles |
| 02 | [Inbox & Triggers](./02-inbox-and-triggers.md) | How events enter the inbox: space messages, plans, services |
| 03 | [Consciousness](./03-consciousness.md) | ModelMessage[], sliding window, compaction, semantic memory |
| 04 | [Think Cycle](./04-think-cycle.md) | The streamText call, prepareStep, tool phases, stopping conditions |
| 05 | [Spaces & Active Context](./05-spaces-and-context.md) | `enter_space`, stateful space context, space switching |
| 06 | [Tool System](./06-tool-system.md) | Execution types, visibility, configuration, MCP |
| 07 | [Messaging](./07-messaging.md) | `send_message`, conversations, multi-agent discussion |
| 08 | [Streaming & Events](./09-streaming-and-events.md) | SSE, Redis Pub/Sub, event types, deduplication |
| 09 | [Prebuilt Tools Reference](./10-prebuilt-tools-reference.md) | All built-in tools with input/output schemas |
| 10 | [Data Model](./11-data-model.md) | Schema, consciousness storage, inbox tables |
| 11 | [Examples & Scenarios](./12-examples-and-scenarios.md) | Real-world flows with full traces |
| 12 | [Human-Like Behavior](./13-human-like-behavior.md) | How the architecture produces natural behavior |
