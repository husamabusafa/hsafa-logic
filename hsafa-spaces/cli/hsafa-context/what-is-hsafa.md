# What is Hsafa

> This file provides AI assistants (Cursor, Windsurf, Copilot, etc.) with context about the Hsafa platform so they can generate correct, idiomatic code for Hsafa scopes.

## Overview

**Hsafa** (حصافة — Arabic for intelligence and wisdom) is a runtime for autonomous AI agents called **Haseefs**.

A **Haseef** (حصيف) is NOT a chatbot. It is a long-lived AI agent with:
- **Identity** — persistent name, personality, profile
- **Memory** — episodic, semantic, social, procedural memory systems
- **Consciousness** — compressed history of past cycles for continuity across sessions
- **Inbox** — queue of incoming sense events from the world
- **Tools** — actions it can take, provided by connected services (scopes)
- **Goals & Plans** — autonomous objectives and scheduled actions
- **Autonomy** — it decides when to act, what to do, and when to stay silent

## Architecture: Core + Services

Hsafa follows a strict **Core + Services** separation:

### Hsafa Core
The agent's **mind**. It runs the think loop, manages memory, consciousness, inbox, tool execution, and MCP integration. Core has **zero domain-specific logic** — it doesn't know about chat, databases, emails, or any specific use case.

- **API**: REST + SSE at `http://localhost:3001` (default)
- **Auth**: API keys (`hsk_service_*`, `hsk_haseef_*`, `hsk_scope_*`)
- **Think Loop**: `SLEEP → DRAIN INBOX → BUILD PROMPT → THINK → SAVE`

### Services (Scopes)
Independent systems that connect to Core and give Haseefs capabilities. Each service operates under a **scope** — a named channel that identifies it.

Examples: `spaces` (chat), `postgres` (database), `scheduler` (cron), `whatsapp`, `jira`, `slack`, etc.

A service does three things:
1. **Register tools** — tells Core what actions the Haseef can take via this service
2. **Handle tool calls** — executes actions when the Haseef invokes a tool
3. **Push sense events** — sends incoming data (messages, notifications, webhooks) into the Haseef's inbox

## Key Concepts

| Concept | Description |
|---------|-------------|
| **Haseef** | A long-lived AI agent with identity, memory, and autonomy |
| **Scope** | A named channel identifying a service (e.g. `postgres`, `weather`) |
| **Scope Key** | API key (`hsk_scope_*`) that authenticates a scope service with Core |
| **Tool** | An action a Haseef can take (defined by a scope, executed by the service) |
| **Sense Event** | Incoming data pushed from a service into a Haseef's inbox |
| **Inbox** | Queue of sense events waiting to be processed in the next think cycle |
| **SmartSpace** | A shared chat workspace where humans and Haseefs collaborate |
| **Run** | A single think cycle — triggered by an inbox event, produces tool calls and messages |
| **Consciousness** | Compressed history of past runs for long-term continuity |

## How a Scope Works (End-to-End)

```
1. Scope service starts → connects to Core via @hsafa/sdk
2. Registers tools (e.g. "query", "send_email") → Core now knows the Haseef has these capabilities
3. Scope is attached to a Haseef → Haseef can now use the tools
4. Something happens externally → scope pushes a sense event → lands in Haseef's inbox
5. Haseef wakes up → reads inbox → decides to call a tool → Core dispatches the action via SSE
6. Scope handler executes the tool → returns result to Core → Haseef continues thinking
```

## This Project is a Scope

This project is a **Hsafa scope** — a service that connects to Hsafa Core and provides tools to Haseefs. When building this scope:

- Use `@hsafa/sdk` to connect to Core
- Define tools with clear names, descriptions, and JSON Schema inputs
- Implement handlers that execute tool calls and return structured results
- Optionally push sense events when external things happen
- Keep tool handlers focused and deterministic — the Haseef decides *when* to call them
