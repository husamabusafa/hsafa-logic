<div align="center">

# Hsafa
### The Runtime for Autonomous AI Agents

*The name **Hsafa** is inspired by the Arabic word **حصافة**, meaning intelligence and wisdom.*

A **Haseef** (حصيف) is not a chatbot — it is a long-lived AI agent with memory, goals, tools, and the ability to work autonomously across contexts.

</div>

---

## Architecture

Hsafa follows a **Core + Services** architecture:

- **Hsafa Core** — The agent's mind. Manages the think loop, memory, consciousness, inbox, tool execution, and MCP integration. No domain-specific logic.
- **Services** — Independent systems (Spaces, WhatsApp, robots, IoT, etc.) that connect to Core via a universal protocol: register tools, push events, handle actions, return results.

---

## Repository Structure

```
hsafa-core/
  core/                    # @hsafa/core — Agent runtime (think loop, memory, tools, MCP)
  sdks/
    service-node/          # @hsafa/service — Node.js SDK for building services
  services/
    test-service/          # Example service for testing the Core API
  external-docs/           # Reference docs (AI SDK, assistant-ui)
  hsafa-docs-versions/     # Historical doc snapshots (v1–v4)

hsafa-spaces/
  use-case-app/            # Next.js app — Spaces UI + API + service
  sdks/
    react-native-sdk/      # @hsafa/react-native — React Native SDK
  rn-app/                  # React Native demo app

sdks/
  node/                    # @hsafa/node — General Node.js SDK for Core API

docker-compose.yml         # Postgres + Redis + Core
init-db/                   # DB init scripts for Docker
```

---

## Quick Start

```bash
# Start infrastructure
docker compose up -d postgres redis

# Start Core
pnpm dev:core

# Start Spaces app
pnpm dev:app
```

---

## Key Concepts

| Concept | Description |
|---------|-------------|
| **Haseef** | A long-lived AI agent with identity, memory, and autonomy |
| **Scope** | A grouping of tools and events from one service (e.g. `spaces`, `whatsapp`) |
| **Sense Event** | An incoming event from a service (message, notification, etc.) |
| **Inbox** | Queue of sense events waiting to be processed |
| **Consciousness** | Compressed history of past cycles for continuity |
| **SmartSpace** | Shared workspace where humans and agents collaborate |

---

## SDKs

| Package | Location | Description |
|---------|----------|-------------|
| `@hsafa/node` | `sdks/node` | Core API client — manage Haseefs, runs, tools |
| `@hsafa/service` | `hsafa-core/sdks/service-node` | Build services that connect to Core |
| `@hsafa/react-native` | `hsafa-spaces/sdks/react-native-sdk` | React Native SDK for Spaces |

---

## License

[AGPL-3.0](./LICENSE)
