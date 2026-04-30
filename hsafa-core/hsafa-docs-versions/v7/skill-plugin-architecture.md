# Scope-as-Plugin Architecture

> Scopes are modular plugins that give a Haseef capabilities — messaging in Spaces, sending WhatsApp messages, reading Gmail, calling custom APIs, etc. Users manage scopes and haseefs from the Spaces app. Core stays generic with no frontend.

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Spaces App (UI + Server)                 │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Haseef Mgmt  │  │ Scope Mgmt   │  │ Scope Runtime        │  │
│  │ (UI + API)   │  │ (UI + API)   │  │                      │  │
│  │              │  │              │  │  Prebuilt scopes:    │  │
│  │ Create       │  │ Browse       │  │   spaces (built-in)  │  │
│  │ Edit config  │  │ Add instance │  │   scheduler (built-in│) │
│  │ Attach scope │  │ Configure    │  │                      │  │
│  │ View runs    │  │ Custom scope │  │  Custom scopes:      │  │
│  │              │  │   dev + release│ │   (worker threads)   │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
│         │                 │                      │              │
│         │    Spaces DB    │                      │              │
│         │  (users, spaces, messages,             │              │
│         │   scope configs, uploaded code)         │              │
│         └─────────────────┴──────────────────────┘              │
│                           │                                     │
│                    @hsafa/sdk (SSE)                              │
└───────────────────────────┼─────────────────────────────────────┘
                            │
                    ┌───────▼───────┐
                    │   Hsafa Core  │
                    │  (no frontend)│
                    │               │
                    │  Core DB:     │
                    │  - Haseefs    │
                    │  - Runs       │
                    │  - Memory (4) │
                    │  - Scopes     │
                    │  - ScopeTools │
                    └───────────────┘
```

---

## Key Concepts

### Scope

A scope is a **named plugin** that provides tools to a Haseef. Each scope instance is independent — it has its own name, config, and tools.

Examples:
- `spaces` — built-in, lets haseef chat in smart spaces
- `scheduler` — built-in, lets haseef set schedules/reminders
- `personal-whatsapp` — WhatsApp scope instance, configured with personal WhatsApp Business API key
- `business-whatsapp` — another WhatsApp scope instance, different API key (different WhatsApp Business account)
- `gmail-husam` — Gmail scope instance, configured with user's Resend API key
- `inventory-api` — custom scope built by a developer, connects to their company's inventory system

### Scope Template (Prebuilt)

A **scope template** is the blueprint for a scope type. It defines:
- What tools the scope provides
- What config fields the user needs to fill in (`configSchema`)
- The handler code that executes tool calls

Prebuilt templates ship with the platform (Spaces, Scheduler, WhatsApp, Gmail, etc.). Custom templates are created by developers.

### Scope Instance

A **scope instance** is a configured copy of a template. The user:
1. Picks a template (e.g. "WhatsApp")
2. Gives it a name (e.g. "personal-whatsapp")
3. Fills in config (e.g. API key, phone number)
4. Result: a scope instance ready to attach to haseefs

Two instances of the same template are fully independent scopes with different names, configs, and potentially attached to different haseefs.

---

## Data Split

### Core DB (haseef brain + scope tool definitions)

| Table | Purpose |
|-------|---------|
| `Haseef` | Name, config, profile, `scopes[]` array, `apiKeyId` (owner) |
| `Run` | Stateless execution runs with metrics |
| `EpisodicMemory` | Run summaries + context metadata |
| `SemanticMemory` | Key-value facts with importance |
| `SocialMemory` | Person models with observations |
| `ProceduralMemory` | Learned patterns with confidence |
| `Scope` | Global scope registry (name, connected status, `apiKeyId` owner) |
| `ScopeTool` | Tools registered by each scope |

**Core stores NO user secrets.** It knows scope names and tools but not service API keys. It does track which Core API key (`apiKeyId`) created each haseef and registered each scope — this is for ownership, not secrets.

### Spaces DB (users, spaces, messages, scope configs, scope code)

| Table | Purpose |
|-------|---------|
| `User` | Auth, email, password, Google OAuth |
| `Entity` | Unified identity (human or agent) |
| `SmartSpace` | Chat spaces |
| `SmartSpaceMembership` | Who's in which space |
| `SmartSpaceMessage` | Messages in spaces |
| `Base` | Teams/organizations |
| `BaseMember` | Team membership |
| `HaseefOwnership` | Links User → Haseef (Core) + Entity |
| `ScopeTemplate` | **NEW** — template definitions (prebuilt + custom) |
| `ScopeInstance` | **NEW** — configured scope instances |
| `ScopeInstanceConfig` | **NEW** — encrypted config values per instance |
| `ScopeCode` | **NEW** — uploaded custom scope code bundles |
| `ApiKey` | User's LLM provider API keys (encrypted) |

---

## New Database Models (Spaces DB)

### ScopeTemplate

Defines what a scope type is and what config it needs.

```
ScopeTemplate
  id            UUID (PK)
  slug          String (unique) — "whatsapp", "gmail", "spaces", "scheduler", or custom
  name          String — display name ("WhatsApp", "Gmail")
  description   String
  icon          String? — icon name or URL
  category      String — "prebuilt" | "custom"
  configSchema  Json — JSON Schema for config fields the user must fill in
  requiredProfileFields  String[] — profile fields a haseef must have to use this scope (e.g. ["phone"] for WhatsApp)
  tools         Json — array of tool definitions [{name, description, inputSchema}]
  instructions  String? — scope-level instructions injected into haseef prompt
  sourceCode    String? — bundled JS code for custom scopes (null for prebuilt)
  authorId      String? — userId of the developer who created it (null for prebuilt)
  published     Boolean @default(false) — custom scopes: visible to others?
  createdAt     DateTime
  updatedAt     DateTime
```

**Config schema example for WhatsApp** (service credentials only — identity comes from haseef profile):
```json
{
  "type": "object",
  "properties": {
    "apiKey": { "type": "string", "title": "WhatsApp Business API Key", "secret": true },
    "webhookVerifyToken": { "type": "string", "title": "Webhook Verify Token", "secret": true }
  },
  "required": ["apiKey"]
}
```

**Required profile fields:** `["phone"]` — any haseef using this scope must have `phone` in its `profileJson`.

Fields marked `"secret": true` are encrypted at rest.

### ScopeInstance

A configured, named instance of a template.

```
ScopeInstance
  id            UUID (PK)
  templateId    UUID (FK → ScopeTemplate)
  name          String — user-chosen name ("personal-whatsapp")
  scopeName     String (unique) — the scope name registered in Core (same as `name` by default)
  description   String?
  ownerId       String? — userId (null = platform-owned, like the default "spaces" instance)
  baseId        UUID? — if shared with a Base (team), FK → Base. null = private to owner.
  active        Boolean @default(true)
  createdAt     DateTime
  updatedAt     DateTime
```

### ScopeInstanceConfig

Encrypted config values for a scope instance.

```
ScopeInstanceConfig
  id            UUID (PK)
  instanceId    UUID (FK → ScopeInstance)
  key           String — config field name ("apiKey", "phoneNumber")
  value         String — encrypted value (AES-256-GCM for secrets, plain for non-secrets)
  isSecret      Boolean @default(false)
  createdAt     DateTime
  updatedAt     DateTime

  @@unique([instanceId, key])
```

### ScopeCode

Uploaded custom scope code bundles.

```
ScopeCode
  id            UUID (PK)
  templateId    UUID (FK → ScopeTemplate)
  version       String — semver ("1.0.0")
  bundle        String @db.Text — bundled JavaScript code
  checksum      String — SHA-256 of the bundle
  releasedAt    DateTime
  createdAt     DateTime
```

---

## Scope Ownership Model

Security works in **two layers**:

1. **Core layer** — API key ownership. Core tracks which API key created each haseef and registered each scope (`apiKeyId` fields). Core enforces: you can only modify your own haseefs, and you can only attach scopes you own (or platform scopes). See [Security → API Key Ownership](#api-key-ownership-core-level) for details.

2. **Spaces layer** — User-level visibility and sharing. Spaces maps API keys to users and adds richer rules: private vs. shared instances, Base (team) membership, detach permissions.

The rest of this section describes the **Spaces layer** (layer 2).

Scope instances can be **private** or **shared**:

| `ownerId` | `baseId` | Visibility |
|-----------|----------|------------|
| userId    | null     | Private — only this user can see and attach it to their haseefs |
| userId    | baseId   | Shared — any member of the Base can attach it to haseefs in that Base |
| null      | null     | Platform-owned — the default "spaces" instance, available to everyone |

When creating a scope instance, the user chooses:
- **"Just for me"** → private (ownerId = user, baseId = null)
- **"Share with [Base Name]"** → shared (ownerId = user, baseId = selected base)

### Permission Rules for Scope Attachment

When a user tries to attach a scope instance to a haseef, the following rules apply:

| Instance type | Who can attach | To which haseefs |
|---------------|----------------|------------------|
| **Private** (ownerId = me, no Base) | Only the owner | Only their own haseefs |
| **Shared** (ownerId = someone, baseId = X) | Any member of Base X | Only haseefs they own that are also in Base X |
| **Platform** (ownerId = null) | Anyone | Any haseef they own |

**Cross-Base rule**: A shared scope instance from Base A **cannot** be attached to a haseef in Base B. The haseef must belong to the same Base as the scope instance.

**Detach rules**:
- Owner of the scope instance can detach it from any haseef (even if they don't own the haseef, within the same Base)
- Owner of the haseef can detach any scope instance from their haseef
- Base admins can detach any scope instance from any haseef in their Base

**Deletion cascade**: When a scope instance is deleted, it is automatically detached from all haseefs. The haseef's `scopes[]` array in Core is updated to remove the scope name.

---

## Haseef + Scope Attachment

When a user attaches a scope instance to a haseef:

1. **Validate profile fields** — check the haseef has all `requiredProfileFields` from the template (e.g. `phone` for WhatsApp). Block attachment if missing.
2. Spaces server adds the scope name to the haseef's `scopes[]` array in Core (via `PATCH /api/haseefs/:id`)
3. Spaces server syncs tools for that scope to Core
4. The scope instance starts handling tool calls for that haseef

**Profile validation example:**
```typescript
async function attachScopeToHaseef(instanceId: string, haseefId: string) {
  const instance = await db.scopeInstance.findUnique({ 
    where: { id: instanceId },
    include: { template: true }
  });
  const haseef = await coreApi.getHaseef(haseefId);
  const profile = haseef.profileJson ?? {};

  for (const field of instance.template.requiredProfileFields) {
    if (!profile[field]) {
      throw new Error(
        `Haseef "${haseef.name}" is missing profile field "${field}" ` +
        `required by scope "${instance.name}"`
      );
    }
  }

  // proceed with attachment
  await coreApi.addScope(haseefId, instance.scopeName);
}
```

A haseef can have multiple scope instances attached. Each one is independent:
```
Haseef "Atlas"
  ├── spaces (default, prebuilt)
  ├── scheduler (prebuilt)
  ├── personal-whatsapp (user's WhatsApp instance)
  └── inventory-api (custom scope from developer)
```

### Default Scope

New haseefs get the **Spaces** scope by default. The user can remove it if they want a haseef that only operates on WhatsApp or a custom API (no chat spaces).

---

## Scope Runtime (Spaces Server)

The Spaces server is the **scope runtime** — it executes all scope code, both prebuilt and custom.

### Prebuilt Scope Execution

Prebuilt scopes (Spaces, Scheduler) run as **built-in modules** inside the Spaces server process. Their handler code ships with the server.

```
spaces-server/src/lib/service/
  scopes/
    spaces/         — the existing spaces scope (send_message, get_messages, etc.)
    scheduler/      — the existing scheduler scope (set_schedule, etc.)
```

When Core dispatches a tool call for a prebuilt scope, the Spaces server routes it to the built-in handler directly.

### Custom Scope Execution

Custom scopes (uploaded via `hsafa scope release`) run in **Node.js Worker Threads** with a light sandbox:

- **Allowed**: `fetch()` for HTTP calls, `crypto`, `URL`, `TextEncoder/Decoder`, pre-bundled common npm packages
- **Not allowed**: filesystem access (`fs`), child process spawning, `eval`, raw `require`
- **Provided**: A scope SDK object with helpers:
  - `scope.config` — the decrypted config values for this instance
  - `scope.pushEvent(haseefId, event)` — push a sense event to Core
  - `scope.log(message)` — structured logging

**Worker lifecycle:**
1. When a scope instance is activated, Spaces server spawns a Worker Thread and loads the bundled code
2. The worker exposes tool handlers (functions named after each tool)
3. When Core dispatches a tool call, Spaces server passes it to the worker via `postMessage`
4. Worker executes the handler, returns the result
5. Spaces server returns the result to Core

Workers are **long-lived** (not per-request) — they stay running while the scope instance is active. They're recycled on code updates or crashes.

---

## Custom Scope Developer Flow

### 1. Initialize

```bash
npx @hsafa/cli scope init my-weather-scope
```

Creates:
```
my-weather-scope/
  manifest.json       — name, description, configSchema, tools
  src/
    index.ts          — tool handler functions
  package.json
  tsconfig.json
```

**manifest.json:**
```json
{
  "name": "Weather Lookup",
  "description": "Get current weather for any city",
  "configSchema": {
    "type": "object",
    "properties": {
      "apiKey": { "type": "string", "title": "OpenWeather API Key", "secret": true }
    },
    "required": ["apiKey"]
  },
  "tools": [
    {
      "name": "get_weather",
      "description": "Get current weather for a city",
      "inputSchema": {
        "type": "object",
        "properties": {
          "city": { "type": "string", "description": "City name" }
        },
        "required": ["city"]
      }
    }
  ]
}
```

**src/index.ts:**
```typescript
import type { ToolHandler, ScopeContext } from "@hsafa/scope-sdk";

export const get_weather: ToolHandler = async (args, ctx: ScopeContext) => {
  const { city } = args;
  const res = await fetch(
    `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${ctx.config.apiKey}`
  );
  const data = await res.json();
  return {
    city,
    temperature: Math.round(data.main.temp - 273.15),
    description: data.weather[0].description,
  };
};
```

### 2. Develop

```bash
npx @hsafa/cli scope dev
```

This:
1. Connects to the Spaces server at the configured URL
2. Registers the scope tools
3. Listens for tool calls via SSE
4. Routes tool calls to the local handler functions
5. Hot-reloads on file changes

The developer can test by:
- Creating a scope instance in the Spaces UI (pointed at the dev server)
- Attaching it to a test haseef
- Chatting with the haseef and seeing it use the scope's tools

### 3. Release

```bash
npx @hsafa/cli scope release
```

This:
1. Bundles the scope code (esbuild single-file bundle)
2. Validates the manifest
3. Uploads the bundle + manifest to the Spaces server API
4. The scope template appears in the Spaces UI for users to install

---

## UI Pages (Spaces App)

### Scopes Page (`/scopes`)

Shows all available scope templates:

```
┌─────────────────────────────────────────────────┐
│ Scopes                                          │
│                                                 │
│ Prebuilt                                        │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│ │ 💬      │ │ 📅      │ │ 📱      │           │
│ │ Spaces  │ │Scheduler│ │WhatsApp │           │
│ │ Active  │ │ Active  │ │ Add     │           │
│ └─────────┘ └─────────┘ └─────────┘           │
│                                                 │
│ Custom                                          │
│ ┌─────────────────────────────────────┐         │
│ │ + Create Custom Scope               │         │
│ │ Or: Install from URL                │         │
│ └─────────────────────────────────────┘         │
│                                                 │
│ My Scope Instances                              │
│ ┌───────────────────────────────────────────┐   │
│ │ spaces (default)        Prebuilt  Active  │   │
│ │ scheduler               Prebuilt  Active  │   │
│ │ personal-whatsapp       WhatsApp  Active  │   │
│ │ business-whatsapp       WhatsApp  Active  │   │
│ │ my-weather-scope        Custom    Active  │   │
│ └───────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

### Scope Instance Detail (`/scopes/:instanceId`)

```
┌─────────────────────────────────────────────────┐
│ personal-whatsapp                               │
│ Template: WhatsApp                              │
│ Status: Active 🟢                               │
│                                                 │
│ Configuration (service credentials)             │
│ ┌───────────────────────────────────────────┐   │
│ │ API Key:              ****...a1b2  [Edit] │   │
│ │ Webhook Verify Token: ****...x9y8  [Edit] │   │
│ └───────────────────────────────────────────┘   │
│                                                 │
│ Required Profile Fields: phone                  │
│                                                 │
│ Tools (3)                                       │
│ ┌───────────────────────────────────────────┐   │
│ │ send_whatsapp_message                     │   │
│ │ read_whatsapp_messages                    │   │
│ │ get_whatsapp_contacts                     │   │
│ └───────────────────────────────────────────┘   │
│                                                 │
│ Attached Haseefs                                │
│ ┌───────────────────────────────────────────┐   │
│ │ Atlas         ✓ attached                  │   │
│ │ Luna          ✓ attached                  │   │
│ │ Helper Bot    ○ not attached  [Attach]    │   │
│ └───────────────────────────────────────────┘   │
│                                                 │
│ Sharing: Private (just me)  [Share with Base]   │
│                                                 │
│ [Deactivate]  [Delete]                          │
└─────────────────────────────────────────────────┘
```

### Haseef Settings → Scopes Tab (`/haseefs/:id/settings`)

```
┌─────────────────────────────────────────────────┐
│ Atlas — Settings                                │
│                                                 │
│ [General] [Model] [Scopes] [Voice]              │
│                                                 │
│ Active Scopes                                   │
│ ┌───────────────────────────────────────────┐   │
│ │ ☑ spaces (default)                        │   │
│ │ ☑ scheduler                               │   │
│ │ ☑ personal-whatsapp                       │   │
│ │ ☐ business-whatsapp         [Attach]      │   │
│ │   ⚠ Requires: phone ✓ (profile has it)   │   │
│ │ ☐ my-weather-scope          [Attach]      │   │
│ └───────────────────────────────────────────┘   │
│                                                 │
│ [+ Add new scope instance]                      │
└─────────────────────────────────────────────────┘
```

---

## API Endpoints (Spaces Server)

### Scope Templates

```
GET    /api/scopes/templates              — list all templates (prebuilt + published custom)
GET    /api/scopes/templates/:id          — get template details
POST   /api/scopes/templates              — create custom template (developer)
PATCH  /api/scopes/templates/:id          — update custom template
DELETE /api/scopes/templates/:id          — delete custom template
POST   /api/scopes/templates/:id/release  — upload code bundle for custom template
```

### Scope Instances

```
GET    /api/scopes/instances              — list my scope instances (+ shared from my bases)
POST   /api/scopes/instances              — create a new scope instance
GET    /api/scopes/instances/:id          — get instance details + config (secrets masked)
PATCH  /api/scopes/instances/:id          — update instance config
DELETE /api/scopes/instances/:id          — delete instance
POST   /api/scopes/instances/:id/activate — activate
POST   /api/scopes/instances/:id/deactivate — deactivate
```

### Haseef ↔ Scope Attachment

```
GET    /api/haseefs/:id/scopes            — list scopes attached to a haseef
POST   /api/haseefs/:id/scopes/:instanceId — attach scope instance to haseef
DELETE /api/haseefs/:id/scopes/:instanceId — detach scope instance from haseef
```

### Custom Scope Development

```
POST   /api/scopes/dev/register           — register dev scope (from CLI during `scope dev`)
DELETE /api/scopes/dev/:sessionId         — disconnect dev scope
```

---

## How Scope Execution Works (End-to-End)

### 1. Tool Call Dispatch

```
User sends message in Space
       │
       ▼
Core receives sense event → wakes Haseef → starts Run
       │
       ▼
Haseef calls tool "send_whatsapp_message"
       │
       ▼
Core dispatches tool call via SSE to scope "personal-whatsapp"
       │
       ▼
Spaces server receives tool call
       │
       ▼
Scope runtime looks up "personal-whatsapp" instance
       │
       ├── Prebuilt? → route to built-in handler
       │
       └── Custom? → route to Worker Thread
              │
              ▼
       Worker decrypts config, executes handler code
       (calls WhatsApp API with user's API key)
              │
              ▼
       Returns result to Spaces server
              │
              ▼
       Spaces server returns result to Core
              │
              ▼
       Core continues Haseef's Run
```

### 2. Inbound Events (e.g. WhatsApp message received)

For scopes that need to listen for external events (webhooks):

```
WhatsApp sends webhook to Spaces server
       │
       ▼
Spaces server routes to scope instance by webhook path
       │
       ▼
Scope handler processes the event
       │
       ▼
Calls scope.pushEvent(haseefId, { type: "message", data: {...} })
       │
       ▼
Spaces server pushes sense event to Core
       │
       ▼
Core wakes Haseef → starts Run → Haseef processes the WhatsApp message
```

Webhook URLs are auto-generated per scope instance:
```
POST /api/scopes/instances/:instanceId/webhook
```

---

## Security

### API Key Ownership (Core-Level)

Core tracks which API key created each haseef and registered each scope. This is the foundation of multi-user security — without it, anyone with a Core API key could see or modify anyone else's haseefs and scopes.

**Two fields added to Core DB:**

```prisma
model Haseef {
  // ... existing fields
  apiKeyId     String              // which API key created this haseef
}

model Scope {
  // ... existing fields
  apiKeyId    String?              // which API key registered this scope (null = platform)
}
```

**Enforcement in Core:**

| Action | Rule |
|--------|------|
| Create haseef | Records `apiKeyId` from the `x-api-key` header |
| Read/update/delete haseef | Must be the same `apiKeyId` that created it |
| Register scope tools | Records `apiKeyId` from the `x-api-key` header |
| Attach scope to haseef | Must own the haseef AND own the scope (or scope is platform) |
| List haseefs | Only returns haseefs owned by this API key |
| List scopes | Returns all scopes (with `apiKeyId`) — Spaces filters client-side |

**Platform scopes** (`spaces`, `scheduler`) have `apiKeyId = null`. They can be attached to any haseef by any API key.

**How Spaces uses this:**

Spaces server knows which API keys belong to which users (it issued them). When a user opens the scopes page, Spaces:
1. Calls `GET /api/scopes` → gets all scopes with `apiKeyId`
2. Filters to: platform scopes (`apiKeyId = null`) + scopes where `apiKeyId` matches the user's API key(s) + scopes shared via Base membership
3. Shows only those scopes to the user

```
Husam sees:                         Sara sees:
  spaces        Platform  🟢          spaces        Platform  🟢
  scheduler     Platform  🟢          scheduler     Platform  🟢
  my-gmail      External  🟢          sara-twitter  External  🟢
  robot-vision  External  🟢
  (does NOT see sara-twitter)        (does NOT see my-gmail or robot-vision)
```

### Config Encryption

All config values marked `"secret": true` in the template's configSchema are encrypted using AES-256-GCM before storage. The encryption key is derived from a server-side `SCOPE_ENCRYPTION_KEY` environment variable (same pattern as the existing `ApiKey` model).

Secrets are:
- **Never returned in API responses** (masked as `****...last4`)
- **Only decrypted at execution time** inside the scope runtime
- **Not sent to Core** — Core never sees user secrets

### Custom Code Sandbox

Custom scope code runs in Node.js Worker Threads with restricted globals:

**Allowed:**
- `fetch` — HTTP requests (required for calling external APIs)
- `crypto` — cryptographic operations
- `URL`, `URLSearchParams` — URL handling
- `TextEncoder`, `TextDecoder` — encoding
- `setTimeout`, `setInterval` — timing
- `console.log`, `console.warn`, `console.error` — logging (captured and stored)
- `JSON` — serialization
- `Map`, `Set`, `Array`, `Object`, `Promise` — standard JS

**Blocked:**
- `require`, `import` — no dynamic module loading
- `process` — no process access
- `fs`, `path`, `os`, `child_process` — no system access
- `eval`, `Function` — no dynamic code execution
- `globalThis.__proto__` — no prototype pollution

**Resource limits:**
- Memory: 128MB per worker
- CPU: 30s execution timeout per tool call
- Network: outbound HTTP only (no raw sockets)

### Scope Instance Isolation

Each scope instance runs in its own Worker Thread. Instances cannot access each other's config, state, or memory.

### Webhook Authentication

Scopes that receive inbound events (e.g. WhatsApp messages, GitHub webhooks) use webhook endpoints. Every scope instance gets an auto-generated webhook URL:

```
POST /api/scopes/instances/:instanceId/webhook
```

The platform provides **two layers** of webhook authentication:

**Layer 1 — Platform signature (all scopes)**

Each scope instance has an auto-generated `webhookSecret` (32-byte random, stored encrypted). The webhook URL includes a non-guessable path token:

```
POST /api/scopes/webhooks/:instanceId/:pathToken
```

The `pathToken` is a HMAC-SHA256 of the instanceId using the platform's webhook signing key. This prevents enumeration — you can't guess valid webhook URLs.

**Layer 2 — Provider-specific verification (per scope)**

Many providers (WhatsApp, Stripe, GitHub) send their own signature headers. The scope's handler code can verify these using config values:

- WhatsApp: `webhookVerifyToken` in config → verify challenge requests
- Stripe: `webhookSigningSecret` in config → verify `Stripe-Signature` header
- GitHub: `webhookSecret` in config → verify `X-Hub-Signature-256` header

This is **scope-specific** — the scope template's configSchema includes the relevant verification fields, and the handler code does the verification. The platform doesn't enforce a specific provider protocol.

**Rate limiting**: Webhook endpoints are rate-limited per instance (100 requests/minute default, configurable per template).

---

## No-Code HTTP Scope Builder

For non-developers who need simple integrations ("when this tool is called, make an HTTP request to my API"), the Spaces UI offers a **no-code HTTP scope builder**.

This covers ~80% of custom integration needs without writing any code.

### How It Works

The user creates a scope using a form-based builder instead of the CLI:

```
┌─────────────────────────────────────────────────┐
│ Create HTTP Scope                               │
│                                                 │
│ Name: inventory-lookup                          │
│ Description: Check product inventory            │
│                                                 │
│ Configuration Fields                            │
│ ┌───────────────────────────────────────────┐   │
│ │ + Add config field                        │   │
│ │ apiKey (string, secret)                   │   │
│ │ baseUrl (string)                          │   │
│ └───────────────────────────────────────────┘   │
│                                                 │
│ Tools                                           │
│ ┌───────────────────────────────────────────┐   │
│ │ + Add tool                                │   │
│ │                                           │   │
│ │ Tool: check_stock                         │   │
│ │ Description: Check if product is in stock │   │
│ │                                           │   │
│ │ Parameters:                               │   │
│ │   productId (string, required)            │   │
│ │   warehouse (string, optional)            │   │
│ │                                           │   │
│ │ HTTP Request:                             │   │
│ │   Method: GET                             │   │
│ │   URL: {{config.baseUrl}}/api/stock/{{args│.productId}}
│ │   Headers:                                │   │
│ │     Authorization: Bearer {{config.apiKey}│}  │
│ │     Content-Type: application/json        │   │
│ │   Body: (none for GET)                    │   │
│ │                                           │   │
│ │ Response mapping:                         │   │
│ │   Return full JSON response               │   │
│ └───────────────────────────────────────────┘   │
│                                                 │
│ [Test] [Create Scope]                           │
└─────────────────────────────────────────────────┘
```

### Template Variables

HTTP scope tool definitions support template variables using `{{...}}` syntax:

- `{{config.fieldName}}` — replaced with the scope instance's config value
- `{{args.paramName}}` — replaced with the tool call argument
- `{{haseef.id}}` — the haseef ID making the call
- `{{haseef.name}}` — the haseef name
- `{{haseef.profile.fieldName}}` — the haseef's profile field (e.g. `{{haseef.profile.phone}}`)

### Under the Hood

The no-code builder generates a `ScopeTemplate` with `category: "http"`. Instead of bundled JavaScript code, the template stores an HTTP request definition per tool:

```json
{
  "tools": [
    {
      "name": "check_stock",
      "description": "Check if product is in stock",
      "inputSchema": { ... },
      "http": {
        "method": "GET",
        "url": "{{config.baseUrl}}/api/stock/{{args.productId}}",
        "headers": {
          "Authorization": "Bearer {{config.apiKey}}"
        },
        "body": null,
        "responseMapping": "full"
      }
    }
  ]
}
```

The Spaces server's scope runtime handles HTTP scopes natively — no Worker Thread needed. It just resolves templates, makes the HTTP request, and returns the response.

### Limitations vs. Code Scopes

| Feature | HTTP scope (no-code) | Code scope (CLI) |
|---------|---------------------|------------------|
| HTTP requests | Yes (1 per tool) | Yes (unlimited) |
| Custom logic | No | Yes |
| Chained calls | No | Yes |
| Response transformation | Basic (full JSON or jq-like path) | Any code |
| Inbound webhooks | No | Yes |
| Background tasks | No | Yes |

HTTP scopes are intentionally simple. If the user needs more, they graduate to a code scope.

---

## Migration from Current Architecture

### What Changes

1. **Delete `hsafa-core/dashboard/`** — the separate Vite dashboard app. All management moves to Spaces UI.

2. **Spaces server** becomes the single scope runtime:
   - Existing `src/lib/service/` code stays (it's the "spaces" prebuilt scope)
   - New `src/lib/scope-runtime/` handles custom scope execution
   - New routes for scope template/instance CRUD
   - New Prisma models for templates, instances, configs, code

3. **Core gets two small changes** — API surface stays the same, but ownership tracking is added:
   - Add `apiKeyId` field to `Haseef` model (records who created it)
   - Add `apiKeyId` field to `Scope` model (records who registered it)
   - `PATCH /api/haseefs/:id` validates ownership before allowing scope attachment
   - `GET /api/scopes` returns `apiKeyId` so Spaces can filter by user
   - All existing routes unchanged: `PUT /api/scopes/:scope/tools`, `GET /api/scopes/:scope/actions/stream`, `POST /api/actions/:actionId/result`, `POST /api/events`

4. **Haseef creation flow** updates:
   - Currently: Spaces creates haseef in Core + auto-connects to spaces service
   - New: Spaces creates haseef in Core + attaches default "spaces" scope instance + user can add/remove scopes

### What Stays the Same

- Core API surface (no new endpoints)
- `@hsafa/sdk` protocol (scopes still connect via SSE — SDK doesn't change)
- Existing spaces scope behavior (messages, tool calls, streaming)
- Frontend chat UI (react_app)

---

## Summary

| Concept | Description |
|---------|-------------|
| **Scope template** | Blueprint defining tools + configSchema + handler code |
| **Scope instance** | Named, configured copy of a template (user-created) |
| **Prebuilt scope** | Template + code ships with the platform (Spaces, Scheduler) |
| **Custom scope** | Developer creates template + code via CLI, uploads to platform |
| **Scope runtime** | Spaces server executes all scopes (built-in or worker threads) |
| **Private instance** | Only the creator can use it |
| **Shared instance** | Any member of a Base (team) can attach it to their haseefs |
| **Default scope** | New haseefs get "spaces" by default (removable) |
| **Config encryption** | Secrets encrypted with AES-256-GCM, never sent to Core |
| **API key ownership** | Core tracks which API key created each haseef/scope; enforces ownership on mutations |
| **Light sandbox** | Custom code runs in Worker Threads with restricted globals |
| **CLI workflow** | `scope init` → `scope dev` → `scope release` |
| **No-code HTTP scope** | Form-based builder for simple HTTP integrations (no code needed) |
| **Webhook auth** | Auto-generated path tokens + provider-specific signature verification |
