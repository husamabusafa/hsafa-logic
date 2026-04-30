# Skill-as-Plugin Architecture

> Skills are modular plugins that give a Haseef capabilities — messaging in Spaces, sending WhatsApp messages, reading Gmail, calling custom APIs, etc. Users manage skills and haseefs from the Spaces app. Core stays generic with no frontend.

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Spaces App (UI + Server)                 │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Haseef Mgmt  │  │ Skill Mgmt   │  │ Skill Runtime        │  │
│  │ (UI + API)   │  │ (UI + API)   │  │                      │  │
│  │              │  │              │  │  Prebuilt skills:    │  │
│  │ Create       │  │ Browse       │  │   spaces (built-in)  │  │
│  │ Edit config  │  │ Add instance │  │   scheduler (built-in│) │
│  │ Attach skill │  │ Configure    │  │                      │  │
│  │ View runs    │  │ Custom skill │  │  Custom skills:      │  │
│  │              │  │   dev + release│ │   (worker threads)   │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
│         │                 │                      │              │
│         │    Spaces DB    │                      │              │
│         │  (users, spaces, messages,             │              │
│         │   skill configs, uploaded code)         │              │
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
                    │  - Skills     │
                    │  - SkillTools │
                    └───────────────┘
```

---

## Key Concepts

### Skill

A skill is a **named plugin** that provides tools to a Haseef. Each skill instance is independent — it has its own name, config, and tools.

Examples:
- `spaces` — built-in, lets haseef chat in smart spaces
- `scheduler` — built-in, lets haseef set schedules/reminders
- `personal-whatsapp` — WhatsApp skill instance, configured with personal WhatsApp Business API key
- `business-whatsapp` — another WhatsApp skill instance, different API key (different WhatsApp Business account)
- `gmail-husam` — Gmail skill instance, configured with user's Resend API key
- `inventory-api` — custom skill built by a developer, connects to their company's inventory system

### Skill Template (Prebuilt)

A **skill template** is the blueprint for a skill type. It defines:
- What tools the skill provides
- What config fields the user needs to fill in (`configSchema`)
- The handler code that executes tool calls

Prebuilt templates ship with the platform (Spaces, Scheduler, WhatsApp, Gmail, etc.). Custom templates are created by developers.

### Skill Instance

A **skill instance** is a configured copy of a template. The user:
1. Picks a template (e.g. "WhatsApp")
2. Gives it a name (e.g. "personal-whatsapp")
3. Fills in config (e.g. API key, phone number)
4. Result: a skill instance ready to attach to haseefs

Two instances of the same template are fully independent skills with different names, configs, and potentially attached to different haseefs.

---

## Data Split

### Core DB (haseef brain + skill tool definitions)

| Table | Purpose |
|-------|---------|
| `Haseef` | Name, config, profile, `skills[]` array |
| `Run` | Stateless execution runs with metrics |
| `EpisodicMemory` | Run summaries + context metadata |
| `SemanticMemory` | Key-value facts with importance |
| `SocialMemory` | Person models with observations |
| `ProceduralMemory` | Learned patterns with confidence |
| `Skill` | Global skill registry (name, connected status) |
| `SkillTool` | Tools registered by each skill |

**Core stores NO user secrets.** It knows skill names and tools but not service API keys. Core has no concept of multi-user ownership — the Spaces layer (with its own user model) handles all per-user filtering.

### Spaces DB (users, spaces, messages, skill configs, skill code)

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
| `SkillTemplate` | **NEW** — template definitions (prebuilt + custom) |
| `SkillInstance` | **NEW** — configured skill instances |
| `SkillInstanceConfig` | **NEW** — encrypted config values per instance |
| `SkillCode` | **NEW** — uploaded custom skill code bundles |
| `ApiKey` | User's LLM provider API keys (encrypted) |

---

## New Database Models (Spaces DB)

### SkillTemplate

Defines what a skill type is and what config it needs.

```
SkillTemplate
  id            UUID (PK)
  slug          String (unique) — "whatsapp", "gmail", "spaces", "scheduler", or custom
  name          String — display name ("WhatsApp", "Gmail")
  description   String
  icon          String? — icon name or URL
  category      String — "prebuilt" | "custom"
  configSchema  Json — JSON Schema for config fields the user must fill in
  requiredProfileFields  String[] — profile fields a haseef must have to use this skill (e.g. ["phone"] for WhatsApp)
  tools         Json — array of tool definitions [{name, description, inputSchema}]
  instructions  String? — skill-level instructions injected into haseef prompt
  sourceCode    String? — bundled JS code for custom skills (null for prebuilt)
  authorId      String? — userId of the developer who created it (null for prebuilt)
  published     Boolean @default(false) — custom skills: visible to others?
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

**Required profile fields:** `["phone"]` — any haseef using this skill must have `phone` in its `profileJson`.

Fields marked `"secret": true` are encrypted at rest.

### SkillInstance

A configured, named instance of a template.

```
SkillInstance
  id            UUID (PK)
  templateId    UUID (FK → SkillTemplate)
  name          String — user-chosen name ("personal-whatsapp")
  skillName     String (unique) — the skill name registered in Core (same as `name` by default)
  description   String?
  ownerId       String? — userId (null = platform-owned, like the default "spaces" instance)
  baseId        UUID? — if shared with a Base (team), FK → Base. null = private to owner.
  active        Boolean @default(true)
  createdAt     DateTime
  updatedAt     DateTime
```

### SkillInstanceConfig

Encrypted config values for a skill instance.

```
SkillInstanceConfig
  id            UUID (PK)
  instanceId    UUID (FK → SkillInstance)
  key           String — config field name ("apiKey", "phoneNumber")
  value         String — encrypted value (AES-256-GCM for secrets, plain for non-secrets)
  isSecret      Boolean @default(false)
  createdAt     DateTime
  updatedAt     DateTime

  @@unique([instanceId, key])
```

### SkillCode

Uploaded custom skill code bundles.

```
SkillCode
  id            UUID (PK)
  templateId    UUID (FK → SkillTemplate)
  version       String — semver ("1.0.0")
  bundle        String @db.Text — bundled JavaScript code
  checksum      String — SHA-256 of the bundle
  releasedAt    DateTime
  createdAt     DateTime
```

---

## Skill Ownership Model

**Core has no ownership concept.** It uses a single secret key (`SECRET_KEY`) and trusts every authenticated request equally. Multi-tenant filtering lives entirely in the **Spaces layer**.

Spaces maps its own users to haseefs (via `HaseefOwnership`) and to skill instances (via `SkillInstance.userId` / `SkillInstance.baseId`). When a user makes a request, Spaces filters what they can see and modify, then talks to Core with its single `SECRET_KEY`.

Skill instances in Spaces can be **private** or **shared**:

| `ownerId` | `baseId` | Visibility |
|-----------|----------|------------|
| userId    | null     | Private — only this user can see and attach it to their haseefs |
| userId    | baseId   | Shared — any member of the Base can attach it to haseefs in that Base |
| null      | null     | Platform-owned — the default "spaces" instance, available to everyone |

When creating a skill instance, the user chooses:
- **"Just for me"** → private (ownerId = user, baseId = null)
- **"Share with [Base Name]"** → shared (ownerId = user, baseId = selected base)

### Permission Rules for Skill Attachment

When a user tries to attach a skill instance to a haseef, the following rules apply:

| Instance type | Who can attach | To which haseefs |
|---------------|----------------|------------------|
| **Private** (ownerId = me, no Base) | Only the owner | Only their own haseefs |
| **Shared** (ownerId = someone, baseId = X) | Any member of Base X | Only haseefs they own that are also in Base X |
| **Platform** (ownerId = null) | Anyone | Any haseef they own |

**Cross-Base rule**: A shared skill instance from Base A **cannot** be attached to a haseef in Base B. The haseef must belong to the same Base as the skill instance.

**Detach rules**:
- Owner of the skill instance can detach it from any haseef (even if they don't own the haseef, within the same Base)
- Owner of the haseef can detach any skill instance from their haseef
- Base admins can detach any skill instance from any haseef in their Base

**Deletion cascade**: When a skill instance is deleted, it is automatically detached from all haseefs. The haseef's `skills[]` array in Core is updated to remove the skill name.

---

## Haseef + Skill Attachment

When a user attaches a skill instance to a haseef:

1. **Validate profile fields** — check the haseef has all `requiredProfileFields` from the template (e.g. `phone` for WhatsApp). Block attachment if missing.
2. Spaces server adds the skill name to the haseef's `skills[]` array in Core (via `PATCH /api/haseefs/:id`)
3. Spaces server syncs tools for that skill to Core
4. The skill instance starts handling tool calls for that haseef

**Profile validation example:**
```typescript
async function attachSkillToHaseef(instanceId: string, haseefId: string) {
  const instance = await db.skillInstance.findUnique({ 
    where: { id: instanceId },
    include: { template: true }
  });
  const haseef = await coreApi.getHaseef(haseefId);
  const profile = haseef.profileJson ?? {};

  for (const field of instance.template.requiredProfileFields) {
    if (!profile[field]) {
      throw new Error(
        `Haseef "${haseef.name}" is missing profile field "${field}" ` +
        `required by skill "${instance.name}"`
      );
    }
  }

  // proceed with attachment
  await coreApi.addSkill(haseefId, instance.skillName);
}
```

A haseef can have multiple skill instances attached. Each one is independent:
```
Haseef "Atlas"
  ├── spaces (default, prebuilt)
  ├── scheduler (prebuilt)
  ├── personal-whatsapp (user's WhatsApp instance)
  └── inventory-api (custom skill from developer)
```

### Default Skill

New haseefs get the **Spaces** skill by default. The user can remove it if they want a haseef that only operates on WhatsApp or a custom API (no chat spaces).

---

## Skill Runtime (Spaces Server)

The Spaces server is the **skill runtime** — it executes all skill code, both prebuilt and custom.

### Prebuilt Skill Execution

Prebuilt skills (Spaces, Scheduler) run as **built-in modules** inside the Spaces server process. Their handler code ships with the server.

```
spaces-server/src/lib/service/
  skills/
    spaces/         — the existing spaces skill (send_message, get_messages, etc.)
    scheduler/      — the existing scheduler skill (set_schedule, etc.)
```

When Core dispatches a tool call for a prebuilt skill, the Spaces server routes it to the built-in handler directly.

### Custom Skill Execution

Custom skills (uploaded via `hsafa skill release`) run in **Node.js Worker Threads** with a light sandbox:

- **Allowed**: `fetch()` for HTTP calls, `crypto`, `URL`, `TextEncoder/Decoder`, pre-bundled common npm packages
- **Not allowed**: filesystem access (`fs`), child process spawning, `eval`, raw `require`
- **Provided**: A skill SDK object with helpers:
  - `skill.config` — the decrypted config values for this instance
  - `skill.pushEvent(haseefId, event)` — push a sense event to Core
  - `skill.log(message)` — structured logging

**Worker lifecycle:**
1. When a skill instance is activated, Spaces server spawns a Worker Thread and loads the bundled code
2. The worker exposes tool handlers (functions named after each tool)
3. When Core dispatches a tool call, Spaces server passes it to the worker via `postMessage`
4. Worker executes the handler, returns the result
5. Spaces server returns the result to Core

Workers are **long-lived** (not per-request) — they stay running while the skill instance is active. They're recycled on code updates or crashes.

---

## Custom Skill Developer Flow

### 1. Initialize

```bash
npx @hsafa/cli skill init my-weather-skill
```

Creates:
```
my-weather-skill/
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
import type { ToolHandler, SkillContext } from "@hsafa/skill-sdk";

export const get_weather: ToolHandler = async (args, ctx: SkillContext) => {
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
npx @hsafa/cli skill dev
```

This:
1. Connects to the Spaces server at the configured URL
2. Registers the skill tools
3. Listens for tool calls via SSE
4. Routes tool calls to the local handler functions
5. Hot-reloads on file changes

The developer can test by:
- Creating a skill instance in the Spaces UI (pointed at the dev server)
- Attaching it to a test haseef
- Chatting with the haseef and seeing it use the skill's tools

### 3. Release

```bash
npx @hsafa/cli skill release
```

This:
1. Bundles the skill code (esbuild single-file bundle)
2. Validates the manifest
3. Uploads the bundle + manifest to the Spaces server API
4. The skill template appears in the Spaces UI for users to install

---

## UI Pages (Spaces App)

### Skills Page (`/skills`)

Shows all available skill templates:

```
┌─────────────────────────────────────────────────┐
│ Skills                                          │
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
│ │ + Create Custom Skill               │         │
│ │ Or: Install from URL                │         │
│ └─────────────────────────────────────┘         │
│                                                 │
│ My Skill Instances                              │
│ ┌───────────────────────────────────────────┐   │
│ │ spaces (default)        Prebuilt  Active  │   │
│ │ scheduler               Prebuilt  Active  │   │
│ │ personal-whatsapp       WhatsApp  Active  │   │
│ │ business-whatsapp       WhatsApp  Active  │   │
│ │ my-weather-skill        Custom    Active  │   │
│ └───────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

### Skill Instance Detail (`/skills/:instanceId`)

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

### Haseef Settings → Skills Tab (`/haseefs/:id/settings`)

```
┌─────────────────────────────────────────────────┐
│ Atlas — Settings                                │
│                                                 │
│ [General] [Model] [Skills] [Voice]              │
│                                                 │
│ Active Skills                                   │
│ ┌───────────────────────────────────────────┐   │
│ │ ☑ spaces (default)                        │   │
│ │ ☑ scheduler                               │   │
│ │ ☑ personal-whatsapp                       │   │
│ │ ☐ business-whatsapp         [Attach]      │   │
│ │   ⚠ Requires: phone ✓ (profile has it)   │   │
│ │ ☐ my-weather-skill          [Attach]      │   │
│ └───────────────────────────────────────────┘   │
│                                                 │
│ [+ Add new skill instance]                      │
└─────────────────────────────────────────────────┘
```

---

## API Endpoints (Spaces Server)

### Skill Templates

```
GET    /api/skills/templates              — list all templates (prebuilt + published custom)
GET    /api/skills/templates/:id          — get template details
POST   /api/skills/templates              — create custom template (developer)
PATCH  /api/skills/templates/:id          — update custom template
DELETE /api/skills/templates/:id          — delete custom template
POST   /api/skills/templates/:id/release  — upload code bundle for custom template
```

### Skill Instances

```
GET    /api/skills/instances              — list my skill instances (+ shared from my bases)
POST   /api/skills/instances              — create a new skill instance
GET    /api/skills/instances/:id          — get instance details + config (secrets masked)
PATCH  /api/skills/instances/:id          — update instance config
DELETE /api/skills/instances/:id          — delete instance
POST   /api/skills/instances/:id/activate — activate
POST   /api/skills/instances/:id/deactivate — deactivate
```

### Haseef ↔ Skill Attachment

```
GET    /api/haseefs/:id/skills            — list skills attached to a haseef
POST   /api/haseefs/:id/skills/:instanceId — attach skill instance to haseef
DELETE /api/haseefs/:id/skills/:instanceId — detach skill instance from haseef
```

### Custom Skill Development

```
POST   /api/skills/dev/register           — register dev skill (from CLI during `skill dev`)
DELETE /api/skills/dev/:sessionId         — disconnect dev skill
```

---

## How Skill Execution Works (End-to-End)

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
Core dispatches tool call via SSE to skill "personal-whatsapp"
       │
       ▼
Spaces server receives tool call
       │
       ▼
Skill runtime looks up "personal-whatsapp" instance
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

For skills that need to listen for external events (webhooks):

```
WhatsApp sends webhook to Spaces server
       │
       ▼
Spaces server routes to skill instance by webhook path
       │
       ▼
Skill handler processes the event
       │
       ▼
Calls skill.pushEvent(haseefId, { type: "message", data: {...} })
       │
       ▼
Spaces server pushes sense event to Core
       │
       ▼
Core wakes Haseef → starts Run → Haseef processes the WhatsApp message
```

Webhook URLs are auto-generated per skill instance:
```
POST /api/skills/instances/:instanceId/webhook
```

---

## Security

### Authentication & Multi-Tenant Filtering

Core uses **one shared `SECRET_KEY`**. There is no per-haseef or per-skill ownership in Core. Anyone with that key has full access to every haseef and every skill.

Multi-tenant filtering happens entirely in the **Spaces layer**:

- Spaces has its own `User` table with email/password/JWT auth.
- `HaseefOwnership` (Spaces table) maps a user → their haseef IDs.
- `SkillInstance.userId` (Spaces table) records which user created each instance.
- `SkillInstance.baseId` (Spaces table) is set when a user shares an instance with their Base.

When a user calls a Spaces API:
1. Spaces verifies the user's JWT.
2. Spaces filters the data the user is allowed to see (their haseefs + their/Base-shared skill instances + platform instances).
3. Spaces talks to Core with the single `SECRET_KEY`.

```
Husam sees:                         Sara sees:
  spaces        Platform  🟢          spaces        Platform  🟢
  scheduler     Platform  🟢          scheduler     Platform  🟢
  my-gmail      Husam's   🟢          sara-twitter  Sara's    🟢
  robot-vision  Husam's   🟢
  (does NOT see sara-twitter)        (does NOT see my-gmail or robot-vision)
```

Both Husam and Sara talk to the same Core; Spaces filters the view.

### Config Encryption

All config values marked `"secret": true` in the template's configSchema are encrypted using AES-256-GCM before storage. The encryption key is derived from a server-side `SKILL_ENCRYPTION_KEY` environment variable (same pattern as the existing `ApiKey` model).

Secrets are:
- **Never returned in API responses** (masked as `****...last4`)
- **Only decrypted at execution time** inside the skill runtime
- **Not sent to Core** — Core never sees user secrets

### Custom Code Sandbox

Custom skill code runs in Node.js Worker Threads with restricted globals:

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

### Skill Instance Isolation

Each skill instance runs in its own Worker Thread. Instances cannot access each other's config, state, or memory.

### Webhook Authentication

Skills that receive inbound events (e.g. WhatsApp messages, GitHub webhooks) use webhook endpoints. Every skill instance gets an auto-generated webhook URL:

```
POST /api/skills/instances/:instanceId/webhook
```

The platform provides **two layers** of webhook authentication:

**Layer 1 — Platform signature (all skills)**

Each skill instance has an auto-generated `webhookSecret` (32-byte random, stored encrypted). The webhook URL includes a non-guessable path token:

```
POST /api/skills/webhooks/:instanceId/:pathToken
```

The `pathToken` is a HMAC-SHA256 of the instanceId using the platform's webhook signing key. This prevents enumeration — you can't guess valid webhook URLs.

**Layer 2 — Provider-specific verification (per skill)**

Many providers (WhatsApp, Stripe, GitHub) send their own signature headers. The skill's handler code can verify these using config values:

- WhatsApp: `webhookVerifyToken` in config → verify challenge requests
- Stripe: `webhookSigningSecret` in config → verify `Stripe-Signature` header
- GitHub: `webhookSecret` in config → verify `X-Hub-Signature-256` header

This is **skill-specific** — the skill template's configSchema includes the relevant verification fields, and the handler code does the verification. The platform doesn't enforce a specific provider protocol.

**Rate limiting**: Webhook endpoints are rate-limited per instance (100 requests/minute default, configurable per template).

---

## No-Code HTTP Skill Builder

For non-developers who need simple integrations ("when this tool is called, make an HTTP request to my API"), the Spaces UI offers a **no-code HTTP skill builder**.

This covers ~80% of custom integration needs without writing any code.

### How It Works

The user creates a skill using a form-based builder instead of the CLI:

```
┌─────────────────────────────────────────────────┐
│ Create HTTP Skill                               │
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
│ [Test] [Create Skill]                           │
└─────────────────────────────────────────────────┘
```

### Template Variables

HTTP skill tool definitions support template variables using `{{...}}` syntax:

- `{{config.fieldName}}` — replaced with the skill instance's config value
- `{{args.paramName}}` — replaced with the tool call argument
- `{{haseef.id}}` — the haseef ID making the call
- `{{haseef.name}}` — the haseef name
- `{{haseef.profile.fieldName}}` — the haseef's profile field (e.g. `{{haseef.profile.phone}}`)

### Under the Hood

The no-code builder generates a `SkillTemplate` with `category: "http"`. Instead of bundled JavaScript code, the template stores an HTTP request definition per tool:

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

The Spaces server's skill runtime handles HTTP skills natively — no Worker Thread needed. It just resolves templates, makes the HTTP request, and returns the response.

### Limitations vs. Code Skills

| Feature | HTTP skill (no-code) | Code skill (CLI) |
|---------|---------------------|------------------|
| HTTP requests | Yes (1 per tool) | Yes (unlimited) |
| Custom logic | No | Yes |
| Chained calls | No | Yes |
| Response transformation | Basic (full JSON or jq-like path) | Any code |
| Inbound webhooks | No | Yes |
| Background tasks | No | Yes |

HTTP skills are intentionally simple. If the user needs more, they graduate to a code skill.

---

## Migration from Current Architecture

### What Changes

1. **Delete `hsafa-core/dashboard/`** — the separate Vite dashboard app. All management moves to Spaces UI.

2. **Spaces server** becomes the single skill runtime:
   - Existing `src/lib/service/` code stays (it's the "spaces" prebuilt skill)
   - New `src/lib/skill-runtime/` handles custom skill execution
   - New routes for skill template/instance CRUD
   - New Prisma models for templates, instances, configs, code

3. **Core stays unchanged** — single `SECRET_KEY`, no ownership fields. All filtering happens in Spaces.
   - Existing routes unchanged: `PUT /api/skills/:skill/tools`, `GET /api/skills/:skill/actions/stream`, `POST /api/actions/:actionId/result`, `POST /api/events`

4. **Haseef creation flow** updates:
   - Currently: Spaces creates haseef in Core + auto-connects to spaces service
   - New: Spaces creates haseef in Core + attaches default "spaces" skill instance + user can add/remove skills

### What Stays the Same

- Core API surface (no new endpoints)
- `@hsafa/sdk` protocol (skills still connect via SSE — SDK doesn't change)
- Existing spaces skill behavior (messages, tool calls, streaming)
- Frontend chat UI (react_app)

---

## Summary

| Concept | Description |
|---------|-------------|
| **Skill template** | Blueprint defining tools + configSchema + handler code |
| **Skill instance** | Named, configured copy of a template (user-created) |
| **Prebuilt skill** | Template + code ships with the platform (Spaces, Scheduler) |
| **Custom skill** | Developer creates template + code via CLI, uploads to platform |
| **Skill runtime** | Spaces server executes all skills (built-in or worker threads) |
| **Private instance** | Only the creator can use it |
| **Shared instance** | Any member of a Base (team) can attach it to their haseefs |
| **Default skill** | New haseefs get "spaces" by default (removable) |
| **Config encryption** | Secrets encrypted with AES-256-GCM, never sent to Core |
| **Single Core key** | Core uses one `SECRET_KEY`; per-user filtering happens in Spaces |
| **Light sandbox** | Custom code runs in Worker Threads with restricted globals |
| **CLI workflow** | `skill init` → `skill dev` → `skill release` |
| **No-code HTTP skill** | Form-based builder for simple HTTP integrations (no code needed) |
| **Webhook auth** | Auto-generated path tokens + provider-specific signature verification |
