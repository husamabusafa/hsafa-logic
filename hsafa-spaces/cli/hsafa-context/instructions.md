# Hsafa Scope — AI Instructions

> **This file is for AI assistants (Cursor, Windsurf, Copilot, etc.).** Read all `.md` files in this `.hsafa/` folder to understand the Hsafa platform and how to write scopes correctly.

## Context Files

Read these files in order for full context:

1. **`what-is-hsafa.md`** — What Hsafa is, the Core + Services architecture, key concepts
2. **`sdk-reference.md`** — Full `@hsafa/sdk` API reference (constructor, registerTools, onToolCall, pushEvent, events, connect)
3. **`cli-reference.md`** — All CLI commands for managing scopes
4. **`scope-development-guide.md`** — Best practices, patterns, anti-patterns, project structure
5. **`examples.md`** — Real code examples (API wrapper, database, webhooks, monitoring)

## Rules for AI

When generating code for this Hsafa scope project:

1. **Always use `@hsafa/sdk`** — import `HsafaSDK` from `@hsafa/sdk`
2. **Follow the 4-step pattern** — create SDK → register tools → handle tool calls → connect
3. **Use `snake_case` for tool names** — e.g. `get_weather`, `send_email`
4. **Add descriptions to every tool and every input field** — the Haseef reads these
5. **Return structured JSON from handlers** — not strings, not raw HTML
6. **Load config from environment variables** — SCOPE_NAME, SCOPE_KEY, CORE_URL + your own
7. **Handle errors gracefully** — return `{ error: "message" }` or throw
8. **Include graceful shutdown** — disconnect SDK on SIGINT/SIGTERM
9. **Use `formattedContext` in sense events** — human-readable summary for the Haseef's inbox
10. **Keep tools focused** — one tool = one action, split complex workflows

## This Project

This is a Hsafa scope service. It connects to Hsafa Core and provides tools to Haseefs (autonomous AI agents). The Haseef decides when to call tools — your job is to define what tools are available and implement their execution logic.
