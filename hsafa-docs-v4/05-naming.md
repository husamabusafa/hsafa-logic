# 05 — Naming: The Hsafa Glossary

## Overview

Consistent naming matters. This document defines every term in the Hsafa v4 ecosystem and how they relate to each other.

---

## Core Terms

| Term | Definition |
|------|-----------|
| **Hsafa** | The platform/framework. Pronounced "ha-SA-fa". The system that enables Haseefs to exist. |
| **Haseef** | A single AI agent instance — a mind. Plural: Haseefs. Each Haseef has its own consciousness, identity, and connected extensions. |
| **Hsafa Core** | The runtime that hosts Haseefs. Pure cognition engine. No domain logic. |
| **Extension** | A thin adapter between a service and the core. Provides senses, actions, and instructions. |
| **Service** | An independent application (Spaces App, Gmail, Shopify, etc.) with its own DB, API, auth, and clients. |

---

## Agent Terms

| Term | Definition |
|------|-----------|
| **Consciousness** | `ModelMessage[]` — the Haseef's continuous memory across think cycles. |
| **Think Cycle** | A single `streamText()` call — the Haseef's unit of work. |
| **Inbox** | Queue of SenseEvents waiting to be processed. |
| **SenseEvent** | A structured event from an extension: `{ channel, source, type, data, timestamp }`. |
| **Self-Model** | The Haseef's understanding of its own identity, values, and purpose. |
| **Theory of Mind** | The Haseef's person-models of the humans it interacts with. |
| **Will** | The Haseef's capacity for autonomous goal-setting and initiative. |
| **Memory** | Persistent key-value fact store (survives consciousness window resets). |
| **Goal** | A tracked objective with status. |
| **Plan** | A self-scheduled trigger: delayed, timed, or recurring (cron). |

---

## Extension Terms

| Term | Definition |
|------|-----------|
| **Senses** | Events that flow FROM a service TO the core (via extension). The Haseef's perception. |
| **Actions** | Tool calls that flow FROM the core TO a service (via extension). The Haseef's agency. |
| **Instructions** | Prompt text injected into the system prompt. Helps the LLM understand the extension. |
| **Connection Map** | Extension-internal mapping of `haseefId → service credentials`. |
| **Sensory Filter** | Logic in the extension that decides which service events reach the core. |

---

## Package Names

| Package | Type | Purpose |
|---------|------|---------|
| **hsafa-core** | Runtime | The core cognition engine that hosts Haseefs |
| **spaces-app** | Service | The Spaces communication platform (independent app) |
| **ext-spaces** | Extension | Adapter between Spaces App and Hsafa Core |
| **ext-email** | Extension | Adapter between email (IMAP/SMTP) and Hsafa Core |
| **ext-calendar** | Extension | Adapter between calendar services and Hsafa Core |
| **ext-[service]** | Extension | Pattern: `ext-` prefix for all extensions |
| **@hsafa/spaces-react** | SDK | React SDK for building Spaces App clients |
| **@hsafa/admin** | SDK | Admin SDK for core API (create Haseefs, manage extensions) |
| **@hsafa/extension-sdk** | SDK | Toolkit for building extensions |

### Naming Convention

- **Services**: Plain name (e.g., `spaces-app`, not `hsafa-spaces-app`). They're independent — they don't need the Hsafa prefix.
- **Extensions**: `ext-` prefix (e.g., `ext-spaces`, `ext-email`). Always a thin adapter.
- **Core**: `hsafa-core`. The one thing that IS Hsafa.
- **SDKs**: `@hsafa/` scope (e.g., `@hsafa/spaces-react`, `@hsafa/admin`).

---

## Full System Diagram with Names

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT APPS                          │
│  @hsafa/spaces-react (React app)                       │
│  Mobile app (React Native)                             │
│  Admin dashboard (@hsafa/admin)                        │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│                    SERVICES                             │
│  spaces-app         (own DB, JWT, SSE)                 │
│  gmail              (Google OAuth, IMAP/SMTP)          │
│  shopify            (Shopify API, webhooks)            │
│  reachy-mini        (REST API on robot hardware)       │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│                    EXTENSIONS                           │
│  ext-spaces          (SSE listener + message tools)    │
│  ext-email           (IMAP listener + SMTP tools)      │
│  ext-shopify         (webhook receiver + API tools)    │
│  ext-reachy          (camera events + motor tools)     │
└───────────────────────┬─────────────────────────────────┘
                        │ extension key
                        ▼
┌─────────────────────────────────────────────────────────┐
│                    HSAFA CORE                           │
│  hsafa-core          (consciousness, think cycle,      │
│                       tool router, plans, memories)     │
└─────────────────────────────────────────────────────────┘
```

---

## Quick Reference

| When you say... | You mean... |
|----------------|-------------|
| "The core" | hsafa-core — the cognition engine |
| "An extension" | A thin adapter (ext-spaces, ext-email, etc.) |
| "A service" | An independent app (Spaces App, Gmail, etc.) |
| "A Haseef" | One AI agent instance — a mind |
| "Consciousness" | The ModelMessage[] array |
| "A think cycle" | One streamText() call |
| "A sense event" | An event from an extension → core |
| "An action" | A tool call from core → extension |
| "Instructions" | Extension-provided prompt text |
| "A plan" | A self-scheduled trigger |
| "A memory" | A persistent key-value fact |
| "A goal" | A tracked objective |
| "The connection map" | haseefId → service credentials in an extension |

---

## What NOT to Say

| ❌ Don't say | ✅ Say instead | Why |
|-------------|---------------|-----|
| "The extension's API" | "The service's API" | Extensions don't have client-facing APIs — services do |
| "The extension's database" | "The service's database" | Extensions don't have databases — services do |
| "Connect the client to the extension" | "Connect the client to the service" | Clients talk to services, not extensions |
| "The core handles messages" | "The Spaces App handles messages" | Message CRUD is a service concern |
| "The core authenticates users" | "The service authenticates users" | User auth is a service concern |
| "Install the extension" | "Connect the extension" | Extensions connect to a Haseef, not install into it |
