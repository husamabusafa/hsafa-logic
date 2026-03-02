# Hsafa Gateway v2 — Core Philosophy

## Vision

Hsafa v2 is built on **simplicity**, **generalization**, and **human-like interaction**.

The system removes all special-case logic — admin agents, delegate tools, mention tools, space IDs inside every tool call — and replaces it with a **clean, universal communication model**.

An AI agent in Hsafa v2 behaves like a human participant: it enters spaces, reads context, sends messages, reads responses, uses tools, and manages its own schedule. The architecture enforces no artificial boundaries between what a human can do and what an agent can do.

---

## Core Primitives

Everything in v2 is built on five primitives:

| Primitive | Purpose |
|-----------|---------|
| **Spaces** | Shared context environments where entities communicate. Every message triggers all other agent members (sender excluded). |
| **Plans** | Scheduled or conditional triggers that agents define for themselves. |
| **Runs** | A single execution of an agent — from trigger to completion. |
| **Tools** | Generic, space-agnostic capabilities. No tool is special. |
| **Context** | Structured awareness: why the agent is running, who triggered it, what happened before. |

---

## What Changed from v1

| v1 Concept | v2 Replacement |
|------------|----------------|
| Admin agent | Removed. No special agent role. |
| `delegateToAgent` tool | Removed. No delegation — all agents run independently. |
| `@mention`-based triggering | Removed. Every message triggers all other agent members in the space (sender excluded). |
| `sendSpaceMessage(spaceId, text, mention)` | Replaced by `enter_space(spaceId)` + `send_message(text)`. |
| `spaceId` in every tool call | Removed. The active space is stateful context. |
| `displayTool` + `targetSpaceId` injection | Removed. Tools use a simple `visible: true/false` flag. |
| Role-based history (`user`/`assistant`) | Replaced by structured chronological event context. |
| No waiting mechanism | Stateless runs — each message triggers a fresh run, context provides continuity. |

---

## Design Principles

### 1. No Special Cases

Every agent is equal. There is no admin, no router, no orchestrator baked into the architecture. Every message in a space triggers all other agent members (sender excluded) — each agent independently decides whether to respond.

### 2. Space-Stateful Context

An agent doesn't pass a space ID to every tool. It "enters" a space, and that space becomes the active context. Subsequent actions happen within that context — like a human opening a chat window.

### 3. Tools Are Generic

A tool is a capability. It doesn't know about spaces, mentions, or routing. The gateway handles visibility (should the tool result appear in a space?) based on configuration, not tool logic.

### 4. Conversation Is First-Class

Agents have natural back-and-forth conversations with humans and other agents. Every message triggers a fresh run — the agent reads the full timeline, sees what's new, and responds. Multi-turn conversations emerge from context, not from run-level pausing. A single `send_message({ text })` tool handles all communication.

### 5. Context Over Roles

The agent doesn't see a flat `user`/`assistant` history. It sees a structured timeline: who said what, when, why, and what triggered the current run. This makes the agent's reasoning grounded in reality, not in an artificial role-play format.

### 6. Human-Like by Architecture

The goal is not to make agents *pretend* to be human through prompt engineering. The goal is to build an architecture where the natural behavior of the system *is* human-like: entering spaces, reading messages, responding, waiting, collaborating.

---

## Document Index

| Doc | Title | Description |
|-----|-------|-------------|
| [01](./01-trigger-system.md) | Trigger System | How agents get triggered: space messages (all agents), plans, services. |
| [02](./02-spaces-and-context.md) | Spaces & Active Context | `enter_space`, stateful space context, space lifecycle. |
| [03](./03-tool-system.md) | Tool System | Generalized tools: execution types, visibility, configuration. |
| [04](./04-messaging-and-waiting.md) | Messaging & Conversations | `send_message`, stateless runs, context-driven conversations. |
| [05](./05-context-model.md) | Context Model | Structured event history, trigger context, no role-based history. |
| [06](./06-run-awareness.md) | Run Awareness | Concurrent runs, paused runs, run history, deduplication. |
| [07](./07-human-like-behavior.md) | Human-Like Behavior | Intent awareness, memory, continuity, personality. |
| [08](./08-migration-from-v1.md) | Migration from v1 | What to change, what to keep, step-by-step migration. |
| [09](./09-data-model.md) | Data Model | Schema changes, new tables, removed columns. |
| [10](./10-implementation-blueprint.md) | Implementation Blueprint | Concrete gateway code changes, file-by-file. |
