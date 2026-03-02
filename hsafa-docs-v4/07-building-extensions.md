# 07 — Building Extensions: A Complete Guide

## Overview

This guide walks through building an extension from scratch, using the **Spaces extension** as the primary example. By the end, you'll understand the full pattern that applies to any extension.

---

## What You're Building

An extension is a thin adapter that:
1. **Listens** to a service for events → pushes SenseEvents to the core
2. **Registers** tools → receives tool calls from the core → forwards to service API
3. **Provides** instructions → injected into the Haseef's system prompt

That's it. No business logic. No UI. No client-facing API.

---

## Example: Building ext-spaces

### Step 1: Connect to the Service

The Spaces App is an independent service with its own API. ext-spaces connects to it using stored credentials:

```typescript
import { HsafaExtension } from '@hsafa/extension-sdk';

const extension = new HsafaExtension({
  name: 'ext-spaces',
  coreUrl: process.env.HSAFA_CORE_URL,
  extensionKey: process.env.EXTENSION_KEY,
});

// Connection map: which Haseefs we serve and their Spaces App credentials
const connections = new Map<string, SpacesCredentials>();

// Example connection:
// haseef-atlas → { spacesAppUrl: "https://spaces.example.com", apiKey: "sk_..." }
```

### Step 2: Register Senses (Service → Core)

Listen to the Spaces App SSE stream and push relevant events to the core:

```typescript
function connectToSpacesApp(haseefId: string, creds: SpacesCredentials) {
  const sse = new EventSource(`${creds.spacesAppUrl}/api/stream`, {
    headers: { 'x-secret-key': creds.apiKey }
  });

  sse.on('space.message', (event) => {
    const msg = JSON.parse(event.data);

    // SENSORY FILTER: skip messages from the Haseef itself (avoid loops)
    if (msg.senderEntityId === creds.haseefEntityId) return;

    // SENSORY FILTER: skip non-connected spaces
    if (!creds.connectedSpaceIds.includes(msg.spaceId)) return;

    // Push to core as a SenseEvent
    extension.pushSenseEvent(haseefId, {
      channel: 'ext-spaces',
      source: msg.spaceId,
      type: 'message',
      data: {
        from: msg.senderName,
        text: msg.content,
        spaceId: msg.spaceId,
        spaceName: msg.spaceName,
        messageId: msg.id,
      }
    });
  });

  // Filter out noise — typing indicators, online/offline, etc.
  // Only meaningful events reach the Haseef
}
```

### Step 3: Register Actions (Core → Service API)

Define tools that the Haseef can use. The core routes tool calls here:

```typescript
extension.registerTools([
  {
    name: 'send_space_message',
    description: 'Send a message to a space. Returns {success:true} on delivery — do NOT retry.',
    parameters: {
      spaceId: {
        type: 'string',
        description: 'The space ID. MUST be provided first.'
      },
      text: {
        type: 'string',
        description: 'The message text to send.'
      }
    },
    execute: async (args, context) => {
      const creds = connections.get(context.haseefId);
      const result = await fetch(`${creds.spacesAppUrl}/api/smart-spaces/${args.spaceId}/messages`, {
        method: 'POST',
        headers: {
          'x-secret-key': creds.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          entityId: creds.haseefEntityId,
          content: args.text
        })
      });
      const data = await result.json();
      return { success: true, messageId: data.message.id };
    }
  },
  {
    name: 'read_space_messages',
    description: 'Read recent messages from a space.',
    parameters: {
      spaceId: { type: 'string', description: 'The space ID' },
      limit: { type: 'number', description: 'Number of messages to read (default 20)' }
    },
    execute: async (args, context) => {
      const creds = connections.get(context.haseefId);
      const result = await fetch(
        `${creds.spacesAppUrl}/api/smart-spaces/${args.spaceId}/messages?limit=${args.limit || 20}`,
        { headers: { 'x-secret-key': creds.apiKey } }
      );
      return await result.json();
    }
  }
]);
```

### Step 4: Provide Instructions

Tell the LLM how to use this extension:

```typescript
extension.setInstructions(`
[Extension: Spaces]
You are connected to the Spaces communication platform.
- Use send_space_message(spaceId, text) to send messages to spaces.
- ALWAYS output spaceId FIRST in tool calls, then text.
- Messages are delivered reliably — do NOT retry on success.
- Use read_space_messages(spaceId) to catch up on conversation history.
- When someone mentions you (@yourname), they expect a response.
- Your text output is INTERNAL reasoning — only tool calls are visible to others.
`);
```

### Step 5: Start the Extension

```typescript
await extension.start();
console.log('ext-spaces running — listening to Spaces App, connected to core');
```

---

## Multi-Haseef Support

One ext-spaces instance can serve multiple Haseefs:

```typescript
// Each Haseef has its own connection to potentially different Spaces Apps
connections.set('haseef-atlas', {
  spacesAppUrl: 'https://spaces.company-a.com',
  apiKey: 'sk_company_a_...',
  haseefEntityId: 'entity-atlas',
  connectedSpaceIds: ['space-family', 'space-work', 'space-husam-1on1']
});

connections.set('haseef-aria', {
  spacesAppUrl: 'https://spaces.company-b.com',
  apiKey: 'sk_company_b_...',
  haseefEntityId: 'entity-aria',
  connectedSpaceIds: ['space-sales', 'space-marketing']
});
```

Each Haseef gets events only from its own connected spaces. The extension maintains separate SSE connections and filters per Haseef.

### Multi-Spaces-App Support

A single Haseef can even be connected to MULTIPLE Spaces App instances:

```
Haseef "Atlas":
  ext-spaces connection 1 → Company Spaces App (work spaces)
  ext-spaces connection 2 → Family Spaces App (family spaces)
```

Both streams feed into the same Haseef's inbox. The Haseef sees messages from both and can respond to either.

---

## Building Other Extensions: The Same Pattern

### ext-email

```typescript
// Senses: listen to IMAP for new emails
imap.on('new-mail', (email) => {
  extension.pushSenseEvent(haseefId, {
    channel: 'ext-email',
    source: 'inbox',
    type: 'new_email',
    data: { from: email.from, subject: email.subject, snippet: email.snippet }
  });
});

// Actions: send email via SMTP
extension.registerTools([{
  name: 'send_email',
  parameters: { to: 'string', subject: 'string', body: 'string' },
  execute: async (args) => {
    await smtp.send({ to: args.to, subject: args.subject, body: args.body });
    return { success: true };
  }
}]);

// Instructions
extension.setInstructions(`
[Extension: Email]
You are connected to email via IMAP/SMTP.
Use send_email(to, subject, body) to send emails.
Use search_emails(query) to find emails.
`);
```

### ext-smart-home

```typescript
// Senses: listen to Home Assistant state changes
homeAssistant.on('state_changed', (event) => {
  if (event.entity === 'binary_sensor.water_leak' && event.state === 'on') {
    extension.pushSenseEvent(haseefId, {
      channel: 'ext-smart-home',
      source: 'basement',
      type: 'water_leak',
      data: { location: 'basement', severity: 'critical' }
    });
  }
});

// Actions: control devices
extension.registerTools([
  { name: 'set_thermostat', execute: (args) => homeAssistant.callService('climate', 'set_temperature', args) },
  { name: 'lock_door', execute: (args) => homeAssistant.callService('lock', 'lock', args) },
  { name: 'shut_off_water', execute: (args) => homeAssistant.callService('valve', 'close', args) },
]);
```

### ext-reachy (Robot)

```typescript
// Senses: camera/vision events from Reachy's API
reachyApi.on('person_detected', (event) => {
  extension.pushSenseEvent(haseefId, {
    channel: 'ext-reachy',
    source: 'camera',
    type: 'person_detected',
    data: { person: event.name, confidence: event.confidence, location: event.room }
  });
});

// Actions: motor commands
extension.registerTools([
  { name: 'move_head', execute: (args) => reachyApi.post('/head/move', args) },
  { name: 'play_emotion', execute: (args) => reachyApi.post('/emotion/play', args) },
  { name: 'wave', execute: () => reachyApi.post('/gesture/wave') },
]);
```

---

## Full Picture: One Haseef, Many Extensions

```
Haseef "Atlas" — connected to 9 extensions:

┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ ext-spaces   │  │ ext-email    │  │ ext-calendar │
│ (work+family)│  │ (IMAP/SMTP)  │  │ (Google Cal) │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │                │                │
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ ext-whatsapp │  │ ext-bank     │  │ ext-health   │
│ (WhatsApp    │  │ (Banking API)│  │ (Wearable)   │
│  Business)   │  │ (read-only)  │  │ (read-only)  │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │                │                │
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ ext-smart-   │  │ ext-reachy   │  │ ext-weather  │
│ home         │  │ (robot)      │  │ (Weather API)│
│ (Home Asst)  │  │              │  │              │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │                │                │
       └────────────────┴────────────────┘
                        │
                        ▼
              ┌──────────────────┐
              │   HSAFA CORE     │
              │                  │
              │  Atlas's mind:   │
              │  - consciousness │
              │  - self-model    │
              │  - person-models │
              │  - will          │
              │  - 27 tools      │
              │    (flat list)   │
              └──────────────────┘
```

27 tools from 9 extensions → one flat list. The LLM picks the right tool. The core routes to the right extension. No orchestration needed.

---

## Extension Lifecycle

```
1. REGISTER:    Admin registers extension with core (secret key)
                → core returns extension key
2. CONNECT:     Admin connects extension to a Haseef (secret key)
                → extension can now push events and receive tool calls for this Haseef
3. RUN:         Extension starts running:
                - Listens to service for events
                - Pushes SenseEvents to core
                - Receives tool calls from core
                - Forwards tool calls to service API
4. DISCONNECT:  Admin disconnects extension from Haseef
                → extension stops pushing events for this Haseef
```

---

## Checklist: Is Your Extension Correct?

| Question | Expected Answer |
|----------|----------------|
| Does your extension have its own database? | ❌ No — the service has the DB |
| Does your extension have a client-facing API? | ❌ No — the service faces clients |
| Does your extension contain business logic? | ❌ No — just translate and route |
| Does your extension filter noise from the service? | ✅ Yes — only meaningful events pass |
| Does your extension store service credentials? | ✅ Yes — in its connection map |
| Does your extension use the core's extension key? | ✅ Yes — to push events and receive calls |
| Could you swap the service for a different one with the same tools? | ✅ Yes — the core wouldn't know |
