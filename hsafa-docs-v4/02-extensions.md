# 02 — Extensions: Connecting to Reality

## Overview

An extension is a **thin adapter** between an independent external service and a Haseef's mind. It is the bridge that lets a mind perceive and act in the real world — without the mind knowing anything about the specific technology, protocol, or domain.

**Extension ≠ Service.**

A service (Spaces App, Gmail, Shopify, a robot) exists independently. It has its own database, its own API, its own authentication, its own clients. It would exist even if Hsafa didn't.

An extension is the thin layer that:
1. **Listens** to the service for events → pushes them as SenseEvents to the core
2. **Receives** tool calls from the core → forwards them to the service's API
3. **Stores** only a connection map: `haseefId → service credentials`

---

## The Three Dimensions of an Extension

Every extension provides exactly three things:

### 1. Senses (Events → Core)

The extension listens to its service and translates events into SenseEvents:

```typescript
// ext-spaces listens to Spaces App SSE
spacesSSE.on('space.message', (msg) => {
  core.pushSenseEvent(haseefId, {
    channel: 'ext-spaces',
    source: msg.spaceId,
    type: 'message',
    data: { from: msg.senderName, text: msg.content, spaceId: msg.spaceId }
  });
});
```

```typescript
// ext-email listens to IMAP
imap.on('new-mail', (email) => {
  core.pushSenseEvent(haseefId, {
    channel: 'ext-email',
    source: 'inbox',
    type: 'new_email',
    data: { from: email.from, subject: email.subject, snippet: email.snippet }
  });
});
```

### 2. Actions (Core → Service API)

The extension registers tools and executes them when the core routes a call:

```typescript
// ext-spaces registers tools
extension.registerTools([
  {
    name: 'send_space_message',
    description: 'Send a message to a space',
    parameters: { spaceId: 'string', text: 'string' },
    execute: async ({ spaceId, text }) => {
      // Forward to Spaces App API using stored credentials
      const result = await spacesApi.sendMessage(spaceId, text, credentials);
      return { success: true, messageId: result.id };
    }
  },
  {
    name: 'read_space_messages',
    description: 'Read recent messages from a space',
    parameters: { spaceId: 'string', limit: 'number' },
    execute: async ({ spaceId, limit }) => {
      return await spacesApi.getMessages(spaceId, { limit }, credentials);
    }
  }
]);
```

### 3. Instructions (Prompt Guidance)

The extension provides text that gets injected into the Haseef's system prompt:

```typescript
extension.setInstructions(`
  [Extension: Spaces]
  You are connected to the Spaces communication platform.
  Use send_space_message(spaceId, text) to send messages.
  ALWAYS output spaceId FIRST in tool calls.
  Messages are delivered reliably — do NOT retry on success.
  Use read_space_messages(spaceId) to catch up on conversation history.
`);
```

Instructions help the LLM understand:
- What this extension is for
- How to use its tools correctly
- Domain-specific rules and protocols

---

## Sensory Filtering

Not every event from a service should reach the Haseef. Extensions filter:

```
Service: Spaces App
  ├── User typing indicator        → FILTERED (noise)
  ├── User online/offline          → FILTERED (noise)
  ├── Message from Husam           → PASSED ✅
  ├── Message from another agent   → FILTERED (avoid loops)
  └── Message in non-connected space → FILTERED (not relevant)

Service: Health Monitor
  ├── Heart rate reading (normal)  → FILTERED (routine)
  ├── Heart rate reading (elevated) → PASSED ✅
  └── Battery low                  → FILTERED (operational)
```

The extension decides what's signal and what's noise. The core only sees pre-filtered, meaningful events.

---

## Connection Map

An extension stores which Haseefs it serves and what credentials to use for each:

```
ext-spaces connection map:
  haseef-atlas  → { spacesAppUrl: "...", apiKey: "sk_..." }
  haseef-aria   → { spacesAppUrl: "...", apiKey: "sk_..." }

ext-email connection map:
  haseef-atlas  → { imapHost: "imap.gmail.com", user: "atlas@...", token: "..." }

ext-reachy connection map:
  haseef-atlas  → { reachyApiUrl: "http://192.168.1.50:8080" }
```

The core never sees these credentials. When it routes a tool call to `ext-email`, the extension looks up the Haseef's credentials and uses them to call the service API.

---

## Extension ≠ Service: Examples

| Service (Independent App) | Extension (Thin Adapter) |
|---------------------------|--------------------------|
| **Spaces App** — chat platform with own DB, API, JWT auth, React client | **ext-spaces** — listens to SSE, routes messages as senses, forwards send_message calls |
| **Gmail** — Google's email with OAuth, IMAP/SMTP, web client | **ext-email** — listens to IMAP, routes new emails as senses, forwards send_email calls |
| **Shopify** — e-commerce platform with own DB, API, admin dashboard | **ext-shopify** — receives webhooks, routes orders as senses, forwards inventory calls |
| **Reachy Mini** — robot with REST API running on hardware | **ext-reachy** — receives camera events, forwards motor commands |
| **Home Assistant** — smart home with own DB, API, mobile app | **ext-smart-home** — listens to state changes, forwards device commands |
| **Zendesk** — support platform with own DB, API, agent dashboard | **ext-zendesk** — receives ticket webhooks, forwards ticket updates |

The service has thousands of features. The extension exposes only what the Haseef needs.

---

## Multi-Haseef Support

One extension instance can serve multiple Haseefs:

```
ext-spaces instance:
  ├── haseef-atlas (connected to family spaces + work spaces)
  ├── haseef-aria  (connected to sales spaces)
  └── haseef-devbot (connected to engineering spaces)
```

Each Haseef gets events only from its own connected sources. The extension maintains separate connection maps and filters per Haseef.

---

## Multi-Extension per Haseef

One Haseef can be connected to many extensions simultaneously:

```
Haseef "Atlas":
  ├── ext-spaces      → senses: messages, actions: send/read messages
  ├── ext-email       → senses: new emails, actions: send/search email
  ├── ext-calendar    → senses: reminders, actions: create/update events
  ├── ext-smart-home  → senses: doorbell/leak, actions: lock/unlock/shutoff
  ├── ext-health      → senses: heart rate, actions: none (read-only)
  ├── ext-bank        → senses: transactions, actions: none (read-only)
  ├── ext-whatsapp    → senses: messages, actions: send messages
  ├── ext-reachy      → senses: camera, actions: move head/play emotion
  └── ext-weather     → senses: alerts, actions: get forecast
```

All tools from all extensions → one flat list for the LLM. The LLM picks the right tool based on context. The core routes the call to the right extension. No integration layer needed.

---

## The Body Metaphor

If the core is the **mind**, extensions are the **body parts**:

| Body Part | Extension | Senses | Actions |
|-----------|-----------|--------|---------|
| Eyes | ext-camera, ext-email, ext-social | See images, read emails, see trends | — |
| Ears | ext-spaces, ext-whatsapp | Hear messages | — |
| Mouth | ext-spaces, ext-email | — | Send messages, send emails |
| Hands | ext-shopify, ext-jira, ext-github | — | Create orders, tickets, PRs |
| Legs | ext-reachy | — | Move robot |
| Skin | ext-health, ext-iot | Feel heart rate, temperature | — |
| Internal organs | ext-bank, ext-crm | Feel transactions, deals | — |

A mind with more body parts is more capable — not because the mind changed, but because it can perceive and act in more of the world.
