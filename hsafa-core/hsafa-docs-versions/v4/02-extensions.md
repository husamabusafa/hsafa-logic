# 02 — Extensions: Expanding the Mind

## Overview

An extension is **any capability you plug into a Haseef's mind**. It gives the Haseef new senses (perception), new actions (tools), and new understanding (instructions) — without the core knowing anything about the implementation.

Every extension provides the same three things to the core:
1. **Senses** — events pushed to the Haseef's inbox
2. **Actions** — tools the Haseef can call
3. **Instructions** — prompt guidance injected into the system prompt

That's the universal interface. **What's inside the extension is completely up to the developer.** An extension can:

- **Bridge an external service** — connect WhatsApp, Gmail, Shopify, a robot
- **Be a self-contained feature** — dreaming, emotion tracking, learning from mistakes
- **Be both** — bridge WhatsApp AND add smart features like auto-translate, message scheduling, read-receipt intelligence

The core doesn't know or care. It just sees: "this extension gives me these senses and these tools."

### Examples

| Extension | What's Inside |
|-----------|--------------|
| **ext-whatsapp** | Bridges WhatsApp API (adapter) + auto-translates messages + smart notification batching (features) |
| **ext-dreaming** | Pure feature — nightly reflection, day summarization, tomorrow planning. No external service. |
| **ext-spaces** | Bridges the Spaces App chat platform (adapter) |
| **ext-email** | Bridges Gmail IMAP/SMTP (adapter) + smart email categorization (feature) |
| **ext-health** | Bridges wearable API (adapter) + pattern detection for stress/sleep (feature) |
| **ext-learning** | Pure feature — monitors mistakes and successes, generates learning summaries |
| **ext-reachy** | Bridges Reachy robot REST API (adapter) |

The extension system is general. An extension is a **service** in its own right — it can have its own logic, its own data, its own schedule. Some extensions happen to also bridge an external system. Some don't. The interface to the core is always the same.

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

## Extension Examples in Detail

| Extension | Senses It Pushes | Tools It Provides | Internal Logic |
|-----------|-----------------|-------------------|----------------|
| **ext-spaces** | Messages from spaces | `send_space_message`, `read_space_messages` | Bridges Spaces App SSE/API |
| **ext-email** | New emails | `send_email`, `search_emails` | Bridges IMAP/SMTP + categorization |
| **ext-dreaming** | Nightly reflection prompts | `review_dream`, `set_tomorrow_intentions` | Scheduled summarization, pattern detection |
| **ext-whatsapp** | Messages from WhatsApp | `send_whatsapp_message` | Bridges WhatsApp API + auto-translate |
| **ext-health** | Elevated heart rate, anomalies | `get_health_summary` | Bridges wearable API + stress pattern detection |
| **ext-smart-home** | Doorbell, water leak, temperature | `set_thermostat`, `lock_door` | Bridges Home Assistant API |
| **ext-learning** | Learning insights, mistake patterns | `consolidate_memories`, `reinforce_success` | Analyzes Haseef's history, generates insights |

Every row follows the same pattern: senses in, tools out, instructions included. What's inside (bridging, scheduling, analyzing, etc.) is the extension's business.

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
  ADAPTER EXTENSIONS (body — connect to the world):
  ├── ext-spaces      → senses: messages, actions: send/read messages
  ├── ext-email       → senses: new emails, actions: send/search email
  ├── ext-calendar    → senses: reminders, actions: create/update events
  ├── ext-smart-home  → senses: doorbell/leak, actions: lock/unlock/shutoff
  ├── ext-health      → senses: heart rate, actions: none (read-only)
  ├── ext-whatsapp    → senses: messages, actions: send messages
  └── ext-reachy      → senses: camera, actions: move head/play emotion

  FEATURE EXTENSIONS (inner life — enrich the mind):
  ├── ext-dreaming    → senses: nightly reflection prompt, actions: review_dream, plan_tomorrow
  ├── ext-emotion     → senses: emotional state updates, actions: express_emotion
  └── ext-learning    → senses: learning insights, actions: consolidate, reinforce
```

All tools from all extensions → one flat list for the LLM. The LLM picks the right tool based on context. The core routes the call to the right extension. No integration layer needed.

---

## The Human Metaphor

If the core is the **mind**, extensions are everything else that makes a person:

| Aspect | Extension Type | Examples |
|--------|---------------|----------|
| **Body** (senses + actions) | Adapter | ext-spaces (ears/mouth), ext-email (eyes/hands), ext-reachy (legs) |
| **Subconscious** (background processing) | Feature | ext-dreaming (nightly reflection), ext-emotion (emotional awareness) |
| **Habits** (learned patterns) | Feature | ext-learning (pattern recognition), ext-reflection (self-improvement) |
| **Instincts** (automatic responses) | Feature | ext-safety (emergency detection), ext-routine (daily habits) |

A mind with more extensions is more capable — not because the mind changed, but because it can perceive, act, and grow in more ways. Some extensions give it new body parts. Others give it richer inner life.
