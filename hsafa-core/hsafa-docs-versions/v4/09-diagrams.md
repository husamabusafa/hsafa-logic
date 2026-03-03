# 09 — Diagrams: Visual Reference for the Full Architecture

## 1. The Full Stack

```
┌─────────────────────────────────────────────────────────────┐
│                      CLIENT APPS                            │
│                                                             │
│   React App     Mobile App     CLI Tool     Dashboard       │
│   (browser)     (phone)        (terminal)   (admin)         │
└──────┬──────────────┬──────────────┬──────────────┬─────────┘
       │              │              │              │
       │   service-specific auth (JWT, OAuth, API keys)
       │              │              │              │
       ▼              ▼              ▼              ▼
┌─────────────────────────────────────────────────────────────┐
│                      SERVICES                               │
│                                                             │
│   Spaces App    Gmail       Shopify     Home Assistant      │
│   (own DB,      (Google     (Shopify    (own DB,            │
│    own API,      OAuth,      API,        REST API,          │
│    JWT auth)     IMAP)       webhooks)   MQTT)              │
│                                                             │
│   Each service exists independently of Hsafa.               │
└──────┬──────────────┬──────────────┬──────────────┬─────────┘
       │              │              │              │
       │   service events (SSE, webhooks, IMAP, MQTT...)
       │              │              │              │
       ▼              ▼              ▼              ▼
┌─────────────────────────────────────────────────────────────┐
│                      EXTENSIONS                             │
│                                                             │
│   ext-spaces    ext-email   ext-shopify  ext-smart-home     │
│   (SSE →        (IMAP →     (webhook →   (MQTT →            │
│    senses,       senses,     senses,      senses,           │
│    API ←         SMTP ←      API ←        REST ←            │
│    actions)      actions)    actions)     actions)           │
│                                                             │
│   Capabilities plugged into the mind. No client-facing API. │
└──────┬──────────────┬──────────────┬──────────────┬─────────┘
       │              │              │              │
       │         extension keys (push events / receive calls)
       │              │              │              │
       ▼              ▼              ▼              ▼
┌─────────────────────────────────────────────────────────────┐
│                      HSAFA CORE                             │
│                                                             │
│   ┌─────────────────────────────────────────────────┐       │
│   │              Haseef "Atlas"                      │       │
│   │                                                  │       │
│   │   Consciousness ← ModelMessage[] across cycles   │       │
│   │   Self-Model    ← identity, values, purpose      │       │
│   │   Theory of Mind ← person-models                 │       │
│   │   Will          ← autonomous goals               │       │
│   │   Think Cycle   ← streamText() call              │       │
│   │   Tool Router   ← routes calls to extensions     │       │
│   │   Memories      ← persistent key-value store     │       │
│   │   Plans         ← self-scheduled triggers        │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   Pure cognition. Domain-agnostic. No UI. No user auth.     │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Extension Definition

```
┌─────────────────────────────────────────────────┐
│              EXTENSION                          │
│                                                 │
│   ┌───────────────────────────────────────┐     │
│   │  SENSES (Service → Core)              │     │
│   │                                       │     │
│   │  Listen to service events             │     │
│   │  Filter noise                         │     │
│   │  Translate to SenseEvent format       │     │
│   │  Push to core inbox                   │     │
│   └───────────────────────────────────────┘     │
│                                                 │
│   ┌───────────────────────────────────────┐     │
│   │  ACTIONS (Core → Service)             │     │
│   │                                       │     │
│   │  Register tools with core             │     │
│   │  Receive tool calls from core         │     │
│   │  Forward to service API               │     │
│   │  Return results to core               │     │
│   └───────────────────────────────────────┘     │
│                                                 │
│   ┌───────────────────────────────────────┐     │
│   │  INSTRUCTIONS (→ System Prompt)       │     │
│   │                                       │     │
│   │  How to use this extension's tools    │     │
│   │  Domain-specific rules                │     │
│   │  Behavioral guidance                  │     │
│   └───────────────────────────────────────┘     │
│                                                 │
│   ┌───────────────────────────────────────┐     │
│   │  CONNECTION MAP                       │     │
│   │                                       │     │
│   │  haseef-atlas → { service creds }     │     │
│   │  haseef-aria  → { service creds }     │     │
│   └───────────────────────────────────────┘     │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## 3. Auth Layers

```
Layer 1: Client → Service
┌──────────┐    JWT / OAuth / API Key    ┌──────────┐
│  Client  │ ──────────────────────────► │ Service  │
│  (React) │                             │ (Spaces) │
└──────────┘                             └──────────┘
  The core never sees this auth.

Layer 2: Extension → Core
┌──────────┐    extension key            ┌──────────┐
│Extension │ ──────────────────────────► │  Core    │
│(ext-spaces)                            │          │
└──────────┘                             └──────────┘
  Push events, receive tool calls.

Layer 3: Admin → Core
┌──────────┐    secret key               ┌──────────┐
│  Admin   │ ──────────────────────────► │  Core    │
│  (CLI)   │                             │          │
└──────────┘                             └──────────┘
  Create Haseefs, register extensions.

Layer 4: Extension → Service (internal)
┌──────────┐    stored service creds     ┌──────────┐
│Extension │ ──────────────────────────► │ Service  │
│(ext-email)│   (OAuth token, API key)   │ (Gmail)  │
└──────────┘                             └──────────┘
  The core never sees service credentials.
```

---

## 4. Multi-System Haseef

```
                    Haseef "Atlas"
                    ┌──────────────┐
                    │  ONE MIND    │
                    │              │
                    │ consciousness│
                    │ self-model   │
                    │ theory-mind  │
                    │ will         │
                    └──────┬───────┘
                           │
           ┌───────┬───────┼───────┬───────┬───────┐
           │       │       │       │       │       │
           ▼       ▼       ▼       ▼       ▼       ▼
        ext-     ext-    ext-    ext-    ext-    ext-
        spaces   spaces  email   cal    health  smart
        (work)   (family)               monitor home
           │       │       │       │       │       │
           ▼       ▼       ▼       ▼       ▼       ▼
        Company  Family  Gmail  Google  Wearable Home
        Spaces   Spaces         Calendar         Asst.
        App      App
```

One mind. Six extensions. Six services. All events arrive in the same inbox. The Haseef reasons across all of them as one consciousness.

---

## 5. Sensory Filtering

```
Service: Spaces App
  │
  ├── user.typing           ──► FILTERED (noise)
  ├── user.online           ──► FILTERED (noise)
  ├── space.message (self)  ──► FILTERED (avoid loops)
  ├── space.message (other) ──► PASSED ✅ → SenseEvent
  └── space.created         ──► FILTERED (admin event)

Service: Health Monitor
  │
  ├── hr: 68 (normal)       ──► FILTERED (routine)
  ├── hr: 95 (elevated)     ──► PASSED ✅ → SenseEvent
  ├── steps: 5000           ──► FILTERED (routine)
  └── battery: 20%          ──► FILTERED (operational)

Service: Email (IMAP)
  │
  ├── spam folder            ──► FILTERED
  ├── newsletter             ──► FILTERED
  ├── from: boss@company.com ──► PASSED ✅ → SenseEvent
  └── from: client@corp.com  ──► PASSED ✅ → SenseEvent
```

Extensions decide what's signal and what's noise. The core only sees pre-filtered, meaningful events.

---

## 6. The Haseef's Mind

```
┌─────────────────────────────────────────────────────────┐
│                    CONSCIOUSNESS                        │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │ System Prompt (identity + extension instructions)  │  │
│  ├───────────────────────────────────────────────────┤  │
│  │ Cycle 1: inbox events → reasoning → tool calls    │  │
│  ├───────────────────────────────────────────────────┤  │
│  │ Cycle 2: inbox events → reasoning → tool calls    │  │
│  ├───────────────────────────────────────────────────┤  │
│  │ ...                                               │  │
│  ├───────────────────────────────────────────────────┤  │
│  │ Cycle N: inbox events → reasoning → tool calls    │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ SELF-MODEL  │  │THEORY OF MIND│  │    WILL       │  │
│  │             │  │              │  │               │  │
│  │ "Who am I?" │  │ "Who are     │  │ "What do I    │  │
│  │ Identity    │  │  they?"      │  │  want?"       │  │
│  │ Values      │  │ Person-      │  │ Goals         │  │
│  │ Purpose     │  │ models       │  │ Initiatives   │  │
│  └─────────────┘  └──────────────┘  └───────────────┘  │
│                                                         │
│  ┌─────────────┐  ┌──────────────┐                      │
│  │  MEMORIES   │  │    PLANS     │                      │
│  │             │  │              │                      │
│  │ Persistent  │  │ Self-        │                      │
│  │ key-value   │  │ scheduled    │                      │
│  │ facts       │  │ triggers     │                      │
│  └─────────────┘  └──────────────┘                      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 7. The Developing Haseef

```
Day 1                    Month 1                  Year 1
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│ Basic        │         │ Rich         │         │ Deep         │
│ identity     │         │ identity     │         │ identity     │
│              │         │              │         │              │
│ No person-   │  ───►   │ Detailed     │  ───►   │ Knows them   │
│ models       │         │ person-      │         │ better than  │
│              │         │ models       │         │ they know    │
│ Purely       │         │              │         │ themselves   │
│ reactive     │         │ Anticipates  │         │              │
│              │         │ needs        │         │ Autonomous   │
│              │         │              │         │ partner      │
└──────────────┘         └──────────────┘         └──────────────┘
```

---

## 8. SDK Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   SDK BOUNDARY MAP                       │
│                                                         │
│  ┌─────────────────────────────────────┐                │
│  │  SERVICE SDKs                       │                │
│  │                                     │                │
│  │  @hsafa/spaces-react ──► Spaces App │                │
│  │  @hsafa/spaces-rn    ──► Spaces App │                │
│  │  @hsafa/spaces-node  ──► Spaces App │                │
│  │                                     │                │
│  │  Auth: public key + JWT             │                │
│  │  Knows: spaces, messages, entities  │                │
│  │  Doesn't know: core, extensions     │                │
│  └─────────────────────────────────────┘                │
│                                                         │
│  ┌─────────────────────────────────────┐                │
│  │  ADMIN SDK                          │                │
│  │                                     │                │
│  │  @hsafa/admin ──────────► Hsafa Core│                │
│  │                                     │                │
│  │  Auth: secret key                   │                │
│  │  Knows: haseefs, extensions, plans  │                │
│  │  Doesn't know: services, clients    │                │
│  └─────────────────────────────────────┘                │
│                                                         │
│  ┌─────────────────────────────────────┐                │
│  │  EXTENSION SDK                      │                │
│  │                                     │                │
│  │  @hsafa/extension-sdk ──► Hsafa Core│                │
│  │                                     │                │
│  │  Auth: extension key                │                │
│  │  Knows: sense events, tool calls    │                │
│  │  Doesn't know: clients, admin ops   │                │
│  └─────────────────────────────────────┘                │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 9. Tool Routing

```
LLM produces tool call:
  send_space_message({ spaceId: "abc", text: "Hello!" })

                    │
                    ▼
┌──────────────────────────────────────┐
│           TOOL ROUTER                │
│                                      │
│  Tool Map:                           │
│    send_space_message → ext-spaces   │
│    read_space_messages → ext-spaces  │
│    send_email         → ext-email    │
│    search_emails      → ext-email    │
│    create_event       → ext-calendar │
│    set_thermostat     → ext-smart-home│
│    move_head          → ext-reachy   │
│                                      │
│  Route: send_space_message → ext-spaces
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│           ext-spaces                 │
│                                      │
│  1. Look up credentials for Haseef   │
│  2. Call Spaces App API:             │
│     POST /api/spaces/abc/messages    │
│     { entityId: "...", text: "Hello"}│
│  3. Return { success: true }         │
└──────────────────────────────────────┘
```

---

## 10. Marketplace Flow

```
┌──────────┐         ┌──────────────┐         ┌──────────┐
│Extension │  1.     │  MARKETPLACE │  2.     │  Admin   │
│Developer │ ──────► │              │ ──────► │  (user)  │
│          │ Publish │  ext-weather │ Browse  │          │
│          │         │  ext-crm     │ +       │          │
│          │         │  ext-iot     │ Install │          │
└──────────┘         │  ext-social  │         └────┬─────┘
                     │  ...         │              │
                     └──────────────┘              │
                                                   │ 3. Connect
                                                   │    to Haseef
                                                   ▼
                                            ┌──────────────┐
                                            │  Haseef      │
                                            │  gains new   │
                                            │  senses +    │
                                            │  actions     │
                                            └──────────────┘
```

---

## 11. Multi-Agent Communication

```
┌──────────────┐                    ┌──────────────┐
│ Haseef A     │                    │ Haseef B     │
│ "Atlas"      │                    │ "Aria"       │
│              │                    │              │
│ ext-spaces ──┼──► Spaces App ◄───┼── ext-spaces │
│              │    (shared space)  │              │
│              │                    │              │
│ Atlas sends  │    ┌──────────┐   │ Aria receives│
│ message  ────┼──► │ Space    │ ──┼──► message   │
│              │    │ "collab" │   │ as sense     │
│              │    └──────────┘   │ event        │
└──────────────┘                    └──────────────┘

Two Haseefs communicate through a shared space in the Spaces App.
They don't talk to each other directly — they talk THROUGH a service.
```

---

## 12. v3 → v4 Migration

```
v3 (Monolith)                         v4 (Separated)
┌───────────────────┐                 ┌───────────────┐
│   GATEWAY         │                 │   SERVICES    │
│                   │                 │               │
│ ┌───────────────┐ │     Extract     │ Spaces App    │
│ │ Space routes  │─┼─────────────►   │ (own app)     │
│ │ Message routes│ │                 │               │
│ │ Auth (JWT)    │ │                 └───────┬───────┘
│ │ SSE streaming │ │                         │
│ └───────────────┘ │                 ┌───────┴───────┐
│                   │     Extract     │  EXTENSIONS   │
│ ┌───────────────┐ │                 │               │
│ │ Tools (built-│─┼─────────────►   │ ext-spaces    │
│ │  in domain)  │ │                 │ ext-email     │
│ └───────────────┘ │                 │ ext-calendar  │
│                   │                 └───────┬───────┘
│ ┌───────────────┐ │                         │
│ │ Agent process │ │     Keep        ┌───────┴───────┐
│ │ Consciousness │─┼─────────────►   │  HSAFA CORE   │
│ │ Think cycle   │ │                 │               │
│ │ Plans/Memory  │ │                 │ Pure cognition│
│ └───────────────┘ │                 └───────────────┘
└───────────────────┘
```
