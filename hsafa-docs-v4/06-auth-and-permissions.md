# 06 — Auth & Permissions: Where Auth Lives

## Overview

v4 has **three layers**, and each layer handles its own authentication. The core never sees a user password, JWT, or OAuth token. Auth is cleanly separated.

Client apps never talk to the core. They talk to the **services** (Spaces App, Gmail, etc.). Extensions are thin adapters between services and the core — most have no client-facing API at all.

```
┌───────────────┐   ┌───────────────┐
│ React App     │   │ Mobile App    │
│ (browser)     │   │ (phone)       │
└───────┬───────┘   └───────┬───────┘
        │ public key + JWT    │
        ▼                     ▼
┌───────────────────────────────────────┐
│          SERVICES (independent apps)       │
│  Spaces App: JWT → membership check        │
│  Gmail: OAuth → account access             │
│  GitHub: OAuth → repo permissions          │
│  (own DB, own API, own clients)            │
└───────────────────┬───────────────────┘
                    │ service events (SSE, webhooks, etc.)
                    ▼
┌───────────────────────────────────────┐
│          EXTENSIONS (thin adapters)        │
│  ext-spaces: listens to Spaces App SSE     │
│  ext-email: listens to IMAP                │
│  ext-github: receives GitHub webhooks      │
│  (no client-facing API — just bridges)     │
└───────────────────┬───────────────────┘
                    │ extension key
                    ▼
┌───────────────────────────────────────┐
│          CORE API                          │
│  secret key → admin (create Haseefs, etc.) │
│  extension key → push events, receive calls │
└───────────────────────────────────────┘
```

---

## Layer 1: Client → Service Auth

Each service handles its own client authentication. The core is not involved.

| Service | Auth Method | Who Handles It |
|---------|------------|----------------|
| **Spaces App** | Public key + JWT | Spaces App verifies JWT, checks membership |
| **Gmail** | Google OAuth | Google handles OAuth flow |
| **Shopify** | Shopify API keys | Shopify handles merchant auth |
| **GitHub** | GitHub OAuth / PAT | GitHub handles auth |
| **Custom Service** | Whatever it uses | The service handles its own auth |

### Example: Spaces App

```
Browser → Spaces App API
  Header: x-public-key: pk_...
  Header: Authorization: Bearer <JWT>

Spaces App:
  1. Verify public key → valid
  2. Verify JWT → extract entityId
  3. Check membership → user is member of this space
  4. Allow request
```

The core never sees this JWT. The Spaces App is a fully independent application.

### Anti-Impersonation

Services that handle user-generated content must prevent impersonation:
- `messages.send` forces `entityId` from the JWT (not from request body)
- `clients.register` forces `entityId` from the JWT
- Users cannot pretend to be someone else

---

## Layer 2: Extension → Core Auth

Extensions authenticate to the core using **extension keys**:

```
Extension → Core API
  Header: x-extension-key: ext_...

Core:
  1. Verify extension key → valid, belongs to ext-spaces
  2. Check: is this extension connected to the target Haseef?
  3. Allow: push sense events, receive tool calls
```

### What Extension Keys Allow

| Action | Allowed |
|--------|---------|
| Push sense events to connected Haseefs | ✅ |
| Receive tool call routing from connected Haseefs | ✅ |
| Return tool call results | ✅ |
| Create or delete Haseefs | ❌ (needs secret key) |
| Connect/disconnect extensions | ❌ (needs secret key) |
| Access other extensions' data | ❌ |

### Extension Credential Storage

Extensions store **service credentials** in their own connection map (not in the core):

```
ext-spaces stores:
  haseef-atlas → { spacesAppUrl: "https://spaces.example.com", apiKey: "sk_spaces_..." }
  haseef-aria  → { spacesAppUrl: "https://spaces.example.com", apiKey: "sk_spaces_..." }

ext-email stores:
  haseef-atlas → { imapHost: "imap.gmail.com", user: "atlas@gmail.com", token: "oauth_..." }
```

The core never sees these service credentials. It just routes tool calls to extensions.

---

## Layer 3: Admin → Core Auth

Administrators authenticate to the core using a **secret key**:

```
Admin Tool → Core API
  Header: x-secret-key: sk_...

Core:
  1. Verify secret key → valid
  2. Allow: full admin access
```

### What Secret Keys Allow

| Action | Allowed |
|--------|---------|
| Create / delete Haseefs | ✅ |
| Register extensions | ✅ |
| Connect extensions to Haseefs | ✅ |
| View Haseef status and details | ✅ |
| Configure plans and memories | ✅ |
| Push sense events (bypass extension key) | ✅ |

---

## Auth Flow Summary

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│  USER (browser/mobile)                                          │
│    │                                                            │
│    │ public key + JWT (service-specific)                        │
│    ▼                                                            │
│  SERVICE (Spaces App, Gmail, etc.)                              │
│    │  Verifies JWT, checks permissions                          │
│    │  Handles all user-facing auth                              │
│    │                                                            │
│    │ service events (SSE, webhooks, IMAP...)                    │
│    ▼                                                            │
│  EXTENSION (ext-spaces, ext-email, etc.)                        │
│    │  Uses stored service credentials to listen                 │
│    │  Filters events, translates to SenseEvents                 │
│    │                                                            │
│    │ extension key                                              │
│    ▼                                                            │
│  CORE                                                           │
│    │  Verifies extension key                                    │
│    │  Routes events to Haseef inbox                             │
│    │  Routes tool calls back to extensions                      │
│                                                                  │
│  ADMIN (CLI, dashboard)                                         │
│    │                                                            │
│    │ secret key                                                 │
│    ▼                                                            │
│  CORE                                                           │
│    │  Verifies secret key                                       │
│    │  Full access to manage Haseefs, extensions, etc.           │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Key Principles

### 1. The Core Never Sees User Auth

The core doesn't know what a "user" is. It knows about Haseefs and extensions. User authentication is entirely a service concern.

### 2. Extensions Don't Face Clients

Extensions have no client-facing API. They only talk to:
- **Upstream**: The service (listening for events, calling its API)
- **Downstream**: The core (pushing sense events, receiving tool calls)

A user never authenticates to an extension.

### 3. Service Credentials Stay in Extensions

When ext-email needs to check Gmail, it uses OAuth tokens stored in its connection map. The core never sees these tokens. If the token expires, the extension handles refresh — the core doesn't know or care.

### 4. Each Layer Is Independent

You can swap out the auth system at any layer without affecting the others:
- Change Spaces App from JWT to OAuth → extensions and core unaffected
- Change extension key format → services and core unaffected
- Change core from secret key to mTLS → services and extensions unaffected

---

## Permissions Model

### Haseef Permissions (What Can a Haseef Do?)

A Haseef's permissions are determined by its connected extensions:

```
Haseef "Atlas":
  ext-spaces    → can send/read messages in connected spaces
  ext-email     → can send/search emails via connected account
  ext-calendar  → can create/read events in connected calendar
  ext-health    → can read health data (READ ONLY — no actions)
  ext-bank      → can read transactions (READ ONLY — no actions)
```

Some extensions are read-only (senses only, no actions). The Haseef can perceive but not act through them.

### Extension Permissions (What Can an Extension Access?)

Each extension can only:
- Push events to Haseefs it's connected to
- Receive tool calls for tools it registered
- Access its own connection map

An extension cannot:
- Access another extension's data
- Push events to Haseefs it's not connected to
- See what other extensions are connected to a Haseef

### Instruction-Level Boundaries

Extensions can also set soft boundaries through instructions:

```
[Extension: Bank]
You can view transaction data but NEVER initiate transfers.
Always ask the human for confirmation before sharing financial details with others.
```

These aren't enforced by the core — they're prompt-level guidance. Hard boundaries are enforced by the extension not providing certain tools (e.g., no `transfer_money` tool).
