# Hsafa v4 — Vision

## The Leap

v3 built a **living agent** — a persistent process that sleeps, wakes, thinks, acts, and remembers. That was the right foundation. But v3 bundled everything into one monolith: the mind, the communication layer, the tools, the auth, the UI — all in one gateway.

v4 asks a different question: **What if the agent is just a mind?**

A mind that can see through any eyes, act through any hands, and exist in any world — without knowing the implementation details of any of them.

---

## The Architecture

v4 separates the system into three clean layers:

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT APPS                          │
│  React apps, mobile apps, CLI tools, dashboards        │
│  (talk to SERVICES, never to core)                     │
└───────────────────────┬─────────────────────────────────┘
                        │ service-specific auth (JWT, OAuth, API keys)
                        ▼
┌─────────────────────────────────────────────────────────┐
│                    SERVICES                             │
│  Independent applications with own DB, API, auth       │
│                                                        │
│  • Spaces App    — chat/collaboration (own DB, JWT)    │
│  • Gmail         — email (Google OAuth)                │
│  • Shopify       — e-commerce (Shopify API keys)       │
│  • Procore       — construction (OAuth)                │
│  • Reachy Mini   — robot (REST API on hardware)        │
│  • Any system... — any API                             │
│                                                        │
│  Each service exists independently of Hsafa.           │
│  It has its own clients, its own users, its own data.  │
└───────────────────────┬─────────────────────────────────┘
                        │ service events (SSE, webhooks, IMAP, MQTT...)
                        ▼
┌─────────────────────────────────────────────────────────┐
│                    EXTENSIONS                           │
│  Thin adapters — bridge between services and core      │
│                                                        │
│  Each extension provides three things:                 │
│  • Senses      — events from the service → core       │
│  • Actions     — tool calls from core → service API   │
│  • Instructions — prompt guidance for the LLM          │
│                                                        │
│  No business logic. No client-facing API.              │
│  Just translate and route.                             │
│                                                        │
│  ext-spaces: listens to Spaces App SSE                 │
│  ext-email:  listens to IMAP                           │
│  ext-github: receives GitHub webhooks                  │
│  ext-reachy: bridges Reachy REST API                   │
└───────────────────────┬─────────────────────────────────┘
                        │ extension key (push events / receive tool calls)
                        ▼
┌─────────────────────────────────────────────────────────┐
│                    HSAFA CORE                           │
│  Pure cognition — the mind                             │
│                                                        │
│  • Consciousness  — ModelMessage[] across cycles       │
│  • Self-Model     — "who am I, what do I care about"   │
│  • Theory of Mind — person-models of everyone          │
│  • Will           — autonomous goal-setting            │
│  • Think Cycle    — one streamText() call              │
│                                                        │
│  The core knows NOTHING about:                         │
│  • What a "space" is                                   │
│  • What "email" is                                     │
│  • What a "robot" is                                   │
│  • Any specific domain                                 │
│                                                        │
│  It just receives sense events, thinks, and calls      │
│  tools — which get routed to the right extension.      │
└─────────────────────────────────────────────────────────┘
```

### The Key Insight

**Extension ≠ Service.**

A service is an independent application (Spaces App, Gmail, Shopify). It has its own database, its own API, its own authentication, its own clients. It exists whether or not Hsafa exists.

An extension is a thin adapter that connects a service to a Haseef's mind. It stores a connection map (haseefId → service credentials) and does two things:
1. Listens to the service for events → pushes them as sense events to the core
2. Receives tool calls from the core → forwards them to the service's API

That's it. No business logic. No UI. No client-facing API.

---

## What Changed from v3

| v3 Concept | v4 Replacement |
|------------|----------------|
| Monolithic gateway (mind + API + tools + auth) | Core is just the mind. Services are independent apps. Extensions bridge them. |
| Spaces built into the gateway | Spaces App is an independent service. ext-spaces is the adapter. |
| Tools defined in the gateway | Tools come from extensions. Core has no built-in domain tools. |
| One gateway handles everything | Each service handles its own domain. Core handles only cognition. |
| Auth in the gateway (JWT, public/secret keys) | Auth is per-layer: service auth, extension keys, core API keys. |
| API routes for spaces, messages, etc. | Those routes belong to the Spaces App service, not the core. |

## What Stays the Same

These v3 concepts carry forward into v4's core:

| Concept | v4 Location |
|---------|-------------|
| **Living Agent Process** | Core — same sleep/wake/think loop |
| **Consciousness** | Core — same ModelMessage[] across cycles |
| **Think Cycle** | Core — same streamText() call |
| **Inbox & Event Batching** | Core — events from extensions instead of internal triggers |
| **Plans** | Core — self-scheduling triggers |
| **Memories & Goals** | Core — persistent key-value state |
| **Internal Text** | Core — LLM text is internal reasoning, never shown |
| **Human-Like Behavior** | Core — continuous memory, natural batching, one mind |

---

## The Developing Haseef

v4 introduces a richer model of the agent's inner life:

| Concept | Description |
|---------|-------------|
| **Self-Model** | The Haseef knows what it is, what it values, what its purpose is. Not just instructions — identity. |
| **Theory of Mind** | The Haseef builds person-models of the humans it interacts with. It understands their preferences, patterns, emotional states. |
| **Will** | The Haseef doesn't just react to events. It develops its own goals, initiatives, and desires based on its values and observations. |

These aren't features bolted on — they're emergent properties of continuous consciousness + rich sensory input from multiple extensions.

---

## The Promise

One mind. Any number of bodies. Infinite possibilities.

- A personal Haseef connected to your Spaces, email, calendar, smart home, and health monitor — reasoning across all of them as one consciousness.
- A company Haseef connected to CRM, support tickets, analytics, and team chat — seeing patterns no single-domain tool could spot.
- A factory Haseef connected to IoT sensors, quality systems, and maintenance — performing root cause analysis across data streams.

The core never changes. You just plug in more extensions — more senses, more hands — and the mind grows more capable.

---

## Document Index

| Doc | Title |
|-----|-------|
| [01](./01-hsafa-core.md) | Hsafa Core — The Mind |
| [02](./02-extensions.md) | Extensions — Connecting to Reality |
| [03](./03-the-developing-haseef.md) | The Developing Haseef — Self-Model, Theory of Mind, Will |
| [04](./04-scenarios.md) | Scenarios — Multi-Extension Examples |
| [05](./05-naming.md) | Naming — The Hsafa Glossary |
| [06](./06-auth-and-permissions.md) | Auth & Permissions — Where Auth Lives |
| [07](./07-building-extensions.md) | Building Extensions — A Complete Guide |
| [08](./08-sdk-architecture.md) | SDK Architecture — Client Libraries for Services |
| [09](./09-diagrams.md) | Diagrams — Visual Reference for the Full Architecture |
| [10](./10-all-scenarios.md) | Comprehensive Scenarios — Every Field, Every Pattern (34 scenarios) |
