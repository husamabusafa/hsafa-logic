# 01 — Hsafa Core: The Mind

## Overview

The Hsafa Core is **pure cognition**. It is the agent's mind — and nothing else. It doesn't know what a "space" is, what "email" is, or what a "robot" is. It receives sense events from extensions, thinks about them using consciousness and identity, and outputs tool calls that get routed back to the right extension.

The core is the v3 Living Agent Process, extracted from the monolith and purified.

---

## What's IN the Core

| Component | Description |
|-----------|-------------|
| **Consciousness** | `ModelMessage[]` — continuous memory across think cycles. The LLM sees it as one long interaction. |
| **Think Cycle** | A single `streamText()` call. The agent's unit of work. Drains sense events, reasons, calls tools. |
| **Inbox** | A queue that collects SenseEvents from extensions. The agent wakes when events arrive. |
| **Sleep/Wake Loop** | The persistent process: sleep → wake on events → think → act → sleep. |
| **Self-Model** | Identity, values, purpose — who the Haseef is, not just what it does. |
| **Theory of Mind** | Person-models of the humans it interacts with — preferences, patterns, emotional states. |
| **Will** | Autonomous goal-setting. The Haseef develops its own initiatives based on values and observations. |
| **Memories** | Persistent key-value store. The agent can remember facts across consciousness resets. |
| **Goals** | Tracked objectives with status. The agent can set, pursue, and complete goals. |
| **Plans** | Self-scheduling triggers: `runAfter`, `scheduledAt`, `cron`. The agent can wake itself up. |
| **Tool Router** | Receives tool calls from the LLM, routes them to the correct extension based on tool ownership. |

---

## What's NOT in the Core

| Concern | Where It Lives | Why |
|---------|---------------|-----|
| Space management (create, join, messages) | Spaces App service | Spaces is a service with its own DB, API, auth |
| User authentication (JWT, OAuth) | Each service independently | The core never sees a user password or JWT |
| Message persistence | Each service (Spaces App stores messages) | The core doesn't store messages — it stores consciousness |
| Client connections (SSE, WebSocket) | Each service | Clients connect to services, not to the core |
| Domain logic (e-commerce, healthcare, etc.) | Services + their extensions | The core is domain-agnostic |
| UI components | Services + client apps | The core has no UI |
| Rate limiting, billing per service | Each service | Services manage their own operational concerns |

### The Rule

If it's about **cognition** (thinking, remembering, deciding, planning) → it's in the core.

If it's about **a specific domain** (messages, emails, tickets, sensors) → it's in a service, bridged by an extension.

---

## The SenseEvent

All input to the core comes through one uniform type:

```typescript
interface SenseEvent {
  channel: string;      // Which extension sent this: "ext-spaces", "ext-email", etc.
  source: string;       // Specific source within the extension: spaceId, mailbox, etc.
  type: string;         // Event type: "message", "alert", "reading", etc.
  data: any;            // The actual payload — varies per extension
  timestamp: Date;
}
```

The core doesn't interpret the `channel` or `type` — it passes them to the LLM as context. The LLM uses the extension's **instructions** (prompt guidance) to understand what the events mean and what tools are available.

### Example: Three Events in One Cycle

```
SENSE EVENTS (3):

[ext-spaces] source=family-space type=message
  { from: "Husam", text: "Don't forget the meeting at 3pm" }

[ext-email] source=inbox type=new_email
  { from: "boss@company.com", subject: "Q3 Review", snippet: "Please prepare..." }

[ext-health] source=wearable type=reading
  { heartRate: 95, hrv: "low", activity: "resting" }
```

The LLM sees all three in one think cycle and can reason across them — "Husam is stressed (HR 95 at rest), has a meeting at 3pm, and needs to prepare a Q3 review."

---

## The Think Cycle

Same as v3 — a single `streamText()` call:

```typescript
const result = streamText({
  model: haseef.model,
  messages: consciousness,    // Everything the Haseef has ever seen and done
  tools: allTools,            // Flat list from all connected extensions
  system: undefined,          // System prompt is first message in consciousness
  maxSteps: MAX_STEPS,
});
```

### What Happens Inside

```
Step 0: Model reads consciousness + new sense events → reasons about all of them
Step 1: Model calls tool (e.g., send_space_message) → routed to ext-spaces
Step 2: Model reads tool result → calls another tool (e.g., send_email) → routed to ext-email
Step 3: Model reads result → produces final internal text → cycle complete
```

The LLM picks tools from a **flat list** — it doesn't know which extension owns which tool. The core's tool router handles routing based on a tool→extension map built at startup.

---

## Tool Routing

When extensions connect to a Haseef, they register their tools:

```
ext-spaces registers: [send_space_message, read_space_messages, enter_space]
ext-email registers:  [send_email, search_emails, mark_read]
ext-calendar registers: [create_event, list_events, update_event]
```

The core builds a flat tool list for the LLM and a routing map:

```
Tool Map:
  send_space_message → ext-spaces
  read_space_messages → ext-spaces
  send_email → ext-email
  search_emails → ext-email
  create_event → ext-calendar
  ...
```

When the LLM calls `send_email(...)`, the core looks up the routing map and forwards the call to `ext-email`, which forwards it to Gmail's API using the stored credentials.

---

## Consciousness Management

Same as v3:

- **Grows** by appending new messages after each think cycle
- **Sliding window** when it gets too large — oldest messages compressed or removed
- **Memories** as a separate persistent store for facts that must survive window resets
- **System prompt** is the first message in consciousness — contains identity, instructions, and extension-provided guidance

### Extension Instructions in System Prompt

Each connected extension provides instructions that get injected into the system prompt:

```
[Extension: Spaces]
You are connected to the Spaces communication platform.
Use send_space_message(spaceId, text) to send messages.
Always output spaceId FIRST in tool calls.
Messages are delivered reliably — do NOT retry on success.

[Extension: Email]
You are connected to email via IMAP/SMTP.
Use send_email(to, subject, body) to send emails.
Use search_emails(query) to find emails.

[Extension: Health Monitor]
You receive health data from a wearable device.
Heart rate > 110 at rest + missed medication = urgent. Notify family.
Heart rate > 140 at rest = emergency. Call emergency services.
```

The LLM reads these instructions and knows how to use each extension's tools appropriately.

---

## Plans: Self-Scheduling

The core has built-in plan support — the agent can schedule its own wake-ups:

```typescript
// Delayed execution
set_plan({ delay: "30m", instruction: "Re-check grandmother's heart rate" })

// Specific time
set_plan({ time: "5:15pm", instruction: "Remind Husam to leave for recital" })

// Recurring
set_plan({ cron: "0 9 * * *", instruction: "Check morning health readings and calendar" })
```

Plans fire as SenseEvents with `channel: "core"` and `type: "plan"`.

---

## The Core API

The core exposes a minimal API:

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `POST /haseefs` | secret key | Create a new Haseef |
| `GET /haseefs/:id` | secret key | Get Haseef details |
| `POST /haseefs/:id/senses` | extension key | Push sense events |
| `POST /haseefs/:id/tools/:toolId/result` | extension key | Return tool call results |
| `GET /haseefs/:id/tools/calls` | extension key | Poll for pending tool calls |
| `POST /extensions` | secret key | Register an extension |
| `POST /haseefs/:id/extensions/:extId/connect` | secret key | Connect extension to Haseef |

That's it. No message routes. No space routes. No user routes. Those belong to services.
