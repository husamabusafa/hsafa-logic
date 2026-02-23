# Hsafa Gateway v3 — Core Philosophy

## Vision

Hsafa v3 is built on one fundamental insight: **an AI agent is not a function that runs and stops — it is a living entity that sleeps, wakes, thinks, acts, and remembers.**

The system removes the stateless request-response model of v2 and replaces it with a **persistent agent process** that maintains continuous consciousness. An agent in v3 is always alive — it has an inbox that collects events, a consciousness that grows with every interaction, and a process loop that wakes it up when something needs attention.

Every architectural decision flows from this: the agent is a participant in ongoing conversations, not a fresh invocation that reconstructs context from scratch each time.

---

## Core Primitives

Everything in v3 is built on six primitives:

| Primitive | Purpose |
|-----------|---------|
| **Agent Process** | A persistent loop: sleep → wake → think → act → sleep. One process per agent. |
| **Inbox** | A queue (Redis) that collects all events for the agent: space messages, plan fires, service triggers. |
| **Consciousness** | A `ModelMessage[]` array that persists across think cycles — the agent's continuous memory of everything it has done and seen. |
| **Think Cycle** | A single `streamText()` call that processes inbox events, reasons, and acts through tools. |
| **Spaces** | Shared context environments where entities communicate. Every message triggers all other agent members (sender excluded). |
| **Tools** | Generic, space-agnostic capabilities. No tool is special. |

---

## What Changed from v2

| v2 Concept | v3 Replacement |
|------------|----------------|
| Stateless runs (fresh run per message) | Living agent process (persistent loop with inbox) |
| System prompt history rebuilt per run | Consciousness (`ModelMessage[]`) carried forward across cycles |
| `[SEEN]`/`[NEW]` markers on messages | Consciousness already contains everything the agent has seen |
| `absorb_run` for concurrent run coordination | No concurrent runs — one process, one inbox batches events |
| Multiple concurrent runs per agent | One process handles all events sequentially |
| Context rebuilt from DB every invocation | Consciousness loaded once, updated incrementally |
| Run = unit of work | Think cycle = unit of work |
| One model per agent, fixed | One model per agent (configurable in `configJson.model`) |
| No middleware | Composable middleware stack (RAG, guardrails, caching) |
| `lastProcessedMessageId` tracking | Not needed — consciousness tracks what the agent has seen |

---

## What Stays the Same

These v2 concepts carry forward unchanged:

| Concept | Notes |
|---------|-------|
| **Spaces** | Shared communication environments. Same model. |
| **All-agent triggering** | Every message triggers all other agent members (sender excluded). |
| **`enter_space`** | Stateful active space context. Same behavior. |
| **`send_message`** | One tool, one parameter (`text`). Same behavior. |
| **Tool system** | Execution types (`gateway`, `external`, `space`, `internal`), `visible: true/false`. |
| **Plans** | `runAfter`, `scheduledAt`, `cron`. Self-scheduling triggers. |
| **Services** | External triggers via API. |
| **Memories & Goals** | Persistent key-value state and goal tracking. |
| **Streaming** | SSE + Redis Pub/Sub for real-time delivery. |
| **Cross-space origin context** | Messages carry origin metadata when sent cross-space. |
| **Interactive space tools** | `executionType: "space"` pauses for user interaction. |
| **MCP tools** | External tool servers via Model Context Protocol. |

---

## Design Principles

### 1. Continuity of Self

The agent is one continuous entity. Its consciousness (ModelMessage[]) carries forward across every think cycle. When the agent wakes up for cycle 50, it sees cycles 1-49 as **its own past actions** — not as someone else's history pasted into a prompt. The LLM experiences this as one long interaction it walked through, with tool calls it made and results it received.

### 2. Inbox Over Triggers

Events don't "trigger runs" — they push into an inbox. The agent wakes up, drains the inbox, and processes everything in one coherent think cycle. If three messages arrive while the agent is asleep, it wakes once and handles all three — no need for `absorb_run` or concurrent run coordination.

### 3. Sleep Is Free

When the inbox is empty, the agent sleeps — a blocking wait on Redis. No LLM running, no CPU, no cost. The agent only consumes resources when it has work to do. This makes it economically viable to have thousands of living agents, each sleeping most of the time.

### 4. One Process, One Mind

Unlike v2 where an agent could have multiple concurrent runs (each a separate LLM invocation with its own context), v3 has **one process per agent**. This eliminates all concurrent run coordination problems: no race conditions, no absorb_run, no duplicate work. The agent thinks sequentially, like a human.

### 5. Tools Are the Only Output

The agent's LLM text output is **internal reasoning** — never shown to anyone, never spoken. All externally visible communication happens through tools:

- **`send_message`** — text posted to a space (persisted, triggers other agents)
- **Visible tools** — UI components streamed to a space
- **`speak`** *(future)* — audio streamed directly to a connected client (ephemeral, not persisted in space, does not trigger other agents)

Three output channels, same as a human: think silently, say something out loud, or type a message in the group chat. The agent chooses which to use based on context. This is true in v2 (minus speak) and remains true in v3.

### 6. Space-Stateful Context

Same as v2: the agent "enters" a space, and that space becomes the active context. Subsequent actions happen within that context. No `spaceId` in tool parameters.

### 7. Human-Like by Architecture

The Living Agent paradigm makes agents more human-like than v2's stateless model:
- Humans don't "restart" every time they get a message — they wake up, check notifications, and respond.
- Humans have continuous memory — they remember yesterday's conversation without re-reading it.
- Humans batch-process: if you got 5 messages while you were away, you read them all and respond coherently, not in 5 separate isolated responses.

---

## The Human Analogy

| Human | Agent (v3) |
|-------|------------|
| Sleeps until alarm or notification | Sleeps until inbox has events |
| Wakes up, checks phone | Wakes up, drains inbox |
| Reads all new messages at once | Processes all inbox events in one think cycle |
| Remembers yesterday's conversation | Consciousness carries forward across cycles |
| Responds based on full context | `streamText` with consciousness + inbox events |
| Goes back to sleep | Returns to `waitForInbox()` |
| Sets an alarm for tomorrow | Creates a plan (`set_plans`) |
| Can enter different group chats | `enter_space` to switch context |
| Sends messages | `send_message` |
| Speaks out loud | `speak` *(future)* — direct audio to client |
| Thinks silently | LLM text output — internal, never shown or spoken |

---

## Document Index

| Doc | Title | Description |
|-----|-------|-------------|
| [01](./01-living-agent-process.md) | Living Agent Process | The process loop, inbox, consciousness, sleep/wake |
| [02](./02-inbox-and-triggers.md) | Inbox & Triggers | How events enter the inbox: space messages, plans, services |
| [03](./03-consciousness.md) | Consciousness | ModelMessage[], sliding window, compaction, semantic memory |
| [04](./04-think-cycle.md) | Think Cycle | The streamText call, prepareStep, tool phases, stopping conditions |
| [05](./05-spaces-and-context.md) | Spaces & Active Context | `enter_space`, stateful context, space switching |
| [06](./06-tool-system.md) | Tool System | Execution types, visibility, configuration, MCP |
| [07](./07-messaging.md) | Messaging | `send_message`, conversations, multi-agent discussion |
| [09](./09-streaming-and-events.md) | Streaming & Events | SSE, Redis, event types, deduplication |
| [10](./10-prebuilt-tools-reference.md) | Prebuilt Tools Reference | All built-in tools with input/output schemas |
| [11](./11-data-model.md) | Data Model | Schema, consciousness storage, inbox tables |
| [12](./12-examples-and-scenarios.md) | Examples & Scenarios | Real-world flows with full traces |
| [13](./13-human-like-behavior.md) | Human-Like Behavior | How the architecture produces natural behavior |
