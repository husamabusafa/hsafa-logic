# Hsafa Spaces — Comprehensive Build Plan

> **Goal**: Transform hsafa-spaces from a basic chat prototype into a full-featured collaborative platform where humans and haseefs coexist, communicate through rich message types, manage spaces with roles and invitations, and interact through structured UI messages.

---

## Table of Contents

1. [Current State](#1-current-state)
2. [Architecture Overview](#2-architecture-overview)
3. [Spaces & Roles](#3-spaces--roles)
4. [Invitation System](#4-invitation-system)
5. [Haseef Management](#5-haseef-management)
6. [Rich Message Types](#6-rich-message-types)
7. [Interactive Messages & Response Schema](#7-interactive-messages--response-schema)
8. [Message Replies & Threading](#8-message-replies--threading)
9. [Media Messages](#9-media-messages)
10. [File Attachments](#10-file-attachments)
11. [Haseef Space Actions](#11-haseef-space-actions)
12. [Schema Changes](#12-schema-changes)
13. [API Routes](#13-api-routes)
14. [Tools (Spaces Scope)](#14-tools-spaces-scope)
15. [Frontend Pages & Components](#15-frontend-pages--components)
16. [Ship Order](#16-ship-order)
17. [Implementation Notes](#17-implementation-notes)

---

## 1. Current State

### What exists today

**Server** (`hsafa-spaces/server/`):
- User auth (register/login with email+password, JWT)
- Entity model (human + agent types)
- SmartSpace CRUD (create, list, get, update, delete)
- Membership (add/remove members, list members, roles as freeform string)
- Messages (send text, list, SSE stream, mark-as-read)
- V5 service integration with hsafa-core (tool sync, action dispatch via Redis Streams, sense events, stream bridge for agent activity)

**React App** (`hsafa-spaces/react_app/`):
- Register/login form
- Chat page with sidebar (space list / thread list)
- assistant-ui thread component for messages
- HsafaChatProvider with auto-mode
- Agent activity indicators ("thinking..." status)

**Tools registered with Core** (via `manifest.ts`):
- `send_message` — send text to a space
- `get_messages` — read recent messages
- `get_spaces` — list spaces the haseef is in
- `confirmAction` — confirmation card (stub)
- `displayChart` — chart display (stub)

### What's missing
- No invitation system (members added only via secret key API)
- No admin enforcement (role field exists but isn't checked)
- No haseef creation/management UI
- Only plain text messages
- No interactive message types (voting, confirmation, forms)
- No media (images, voice, video)
- No file attachments
- Haseefs can't invite people or accept invitations
- No structured response schema for interactive messages

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   React App (Vite)                    │
│  Spaces UI · Chat · Haseef Management · Invitations  │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP + SSE
                       ▼
┌─────────────────────────────────────────────────────┐
│              Spaces Server (Express)                  │
│  Auth · Spaces · Members · Messages · Invitations     │
│  Haseef Proxy · Media · Files                         │
│  ┌─────────────────────────────────┐                 │
│  │  V5 Service Module              │                 │
│  │  Tool Sync · Action Listener    │                 │
│  │  Stream Bridge · Sense Events   │                 │
│  └───────────┬─────────────────────┘                 │
└──────────────┼──────────────────────────────────────┘
               │ Redis Streams + HTTP
               ▼
┌─────────────────────────────────────────────────────┐
│              Hsafa Core (v5)                          │
│  Haseef Processes · Consciousness · Memory            │
│  Tool Builder · Action Dispatch · Scopes              │
└─────────────────────────────────────────────────────┘
```

**Key principle**: hsafa-core is generic — it knows nothing about spaces, messages, or UI. All spaces-specific behavior lives in hsafa-spaces. The haseef interacts with spaces through scoped tools dispatched via Redis Streams.

---

## 3. Spaces & Roles

### 3.1 Roles

Three membership roles, enforced server-side:

| Role | Permissions |
|------|-------------|
| **owner** | Full control. Transfer ownership. Delete space. Manage all members. Change space settings. Invite anyone. |
| **admin** | Invite/remove members (except owner). Manage haseefs in space. Pin messages. Change space name/description. |
| **member** | Send messages. React to messages. Respond to interactive messages. View all content. |

- The user who creates a space is automatically the **owner**.
- There is exactly **one owner** per space. Ownership can be transferred.
- Admins and owner can invite. Members cannot.
- Leaving a space as owner requires transferring ownership first.

### 3.2 Space Settings

Stored in `SmartSpace.metadata` (JsonB):

```json
{
  "visibility": "private",
  "allowHaseefAutoJoin": false,
  "defaultMessageRetention": null,
  "avatar": null,
  "color": null
}
```

- **`visibility`**: `"private"` (default) — invite only. Future: `"public"` for discoverable spaces.
- **`allowHaseefAutoJoin`**: If true, any haseef the user owns can be added without an invitation flow.

### 3.3 Space Creation Flow

1. User clicks "New Space" in sidebar
2. Provides: name (required), description (optional)
3. Server creates space + owner membership
4. User lands in empty space, can invite people and haseefs

---

## 4. Invitation System

### 4.1 Model

```
Invitation {
  id            UUID
  smartSpaceId  UUID    → SmartSpace
  inviterId     UUID    → Entity (who sent the invite)
  inviteeEmail  String  (target user's email)
  inviteeId     UUID?   → Entity (resolved when user exists)
  role          String  (what role the invitee gets: "member" or "admin")
  status        "pending" | "accepted" | "declined" | "expired" | "revoked"
  message       String? (optional personal message)
  expiresAt     DateTime?
  createdAt     DateTime
  updatedAt     DateTime
}
```

### 4.2 Human Invitation Flow

1. **Admin/owner invites** by email → `POST /api/smart-spaces/:id/invitations`
   - If the email belongs to an existing user: `inviteeId` resolved immediately
   - If not: invitation stored with email only (resolved on registration)
2. **Invitee sees** pending invitations on their dashboard or via notification
   - `GET /api/invitations` — list my pending invitations
3. **Accept** → `POST /api/invitations/:id/accept`
   - Creates SmartSpaceMembership with the specified role
   - Emits `member.joined` SSE event to space
   - Triggers sense event to connected haseefs
4. **Decline** → `POST /api/invitations/:id/decline`
   - Status → "declined"
5. **Revoke** (inviter cancels) → `DELETE /api/invitations/:id`
   - Status → "revoked"
6. **Expiry** — optional `expiresAt`. Background job or lazy check on access.
7. **Rate limiting** — Throttle invitation creation per user: max 20 invitations per hour per space. Prevents abuse if email notifications are added later.

### 4.3 Haseef Invitation Flow

Haseefs are invited to spaces the same way — but since they don't have email, it's done by entity ID:

1. **Admin/owner** opens space settings → "Add Haseef"
2. Picks from the user's owned haseefs (or any haseef they have access to)
3. `POST /api/smart-spaces/:id/members` with `entityId` (haseef's entity) and `role: "member"`
4. Haseef is immediately added (no acceptance needed — haseefs are managed by their owner)
5. The V5 service detects the membership change → `handleMembershipChanged()` → haseef starts receiving events from this space

### 4.4 Haseef Inviting People

Haseefs with admin role in a space can invite humans:

- New tool: `invite_to_space` — haseef calls this to invite a user by email
- The invitation goes through the same flow as human invitations
- The haseef must be admin+ in the target space

### 4.5 Haseef Accepting Invitations

If a haseef receives an invitation to a space (from another space admin):

- Two tools: `list_invitations` + `respond_to_invitation` (accept/decline)
- Decision is made by the haseef's LLM based on context and instructions
- Or: configurable auto-accept policy — stored in the haseef's `profileJson` in Core (e.g. `profileJson.autoAcceptInvitations: true`). The Spaces service checks this on invitation creation and auto-joins if enabled.

---

## 5. Haseef Management

### 5.1 Overview

Users can create, configure, and manage haseefs through the Spaces UI. The Spaces server acts as a **proxy** to hsafa-core for haseef CRUD operations.

### 5.2 Haseef-User Ownership

New model to track which user owns which haseef:

```
HaseefOwnership {
  id         UUID
  userId     String  → User
  haseefId   String  (Core haseef UUID)
  entityId   String  → Entity (the haseef's entity in Spaces DB)
  createdAt  DateTime
}
```

This links: User (spaces) → Haseef (core) → Entity (spaces).

### 5.3 Create Haseef Flow

1. User opens "My Haseefs" page
2. Clicks "Create Haseef"
3. Fills in:
   - **Name** (required) — unique across the Core
   - **Description** (optional)
   - **Model** — dropdown: gpt-4o, gpt-4o-mini, claude-sonnet, etc.
   - **Instructions** (optional) — personality/behavior prompt
   - **Avatar** (optional)
4. Spaces server:
   a. Creates haseef in Core via `POST /api/haseefs`
   b. Creates Entity in Spaces DB (type: "agent", displayName: name)
   c. Updates the haseef's `profileJson.entityId` in Core (links core ↔ spaces)
   d. Creates HaseefOwnership record
   e. V5 service picks up the new haseef → syncs tools → starts listening

### 5.4 Manage Haseef

- **Edit**: Change name, description, instructions, model
- **Delete**: Remove from Core + Spaces (cascades memberships)
- **View Status**: Show cycle count, last active, memory count, inbox depth (fetched from Core `/api/status`)
- **Add to Space**: Quick action to add haseef to any space the user owns/admins

### 5.5 Haseef Settings (per space)

Future: per-space haseef configuration. E.g. different instructions per space, tool restrictions.

---

## 6. Rich Message Types

### 6.1 The Unified Message Model

Instead of adding separate tools for each message type, we introduce a **message type system**. Every message has a `type` field that determines how it renders and what interactions it supports.

Messages are stored in `SmartSpaceMessage` with the type info in the existing `metadata` JsonB column:

```json
{
  "type": "text",
  "content": "Hello world"
}
```

```json
{
  "type": "confirmation",
  "title": "Deploy to production?",
  "message": "This will deploy v2.3.1 to all servers.",
  "confirmLabel": "Deploy",
  "rejectLabel": "Cancel",
  "responseSchema": {
    "type": "enum",
    "values": ["confirmed", "rejected"]
  },
  "responses": []
}
```

### 6.2 Message Types

| Type | Sender | Description | Response Schema |
|------|--------|-------------|-----------------|
| `text` | Any | Plain text message. The default. | None |
| `confirmation` | Any | Yes/no decision card. | `enum: [confirmed, rejected]` |
| `vote` | Any | Multi-option vote/poll. | `enum: [option1, option2, ...]` |
| `form` | Any | Structured data input form. | JSON Schema |
| `choice` | Any | Single-select from options (like buttons). | `enum: [...]` |
| `image` | Any | Image message (URL or uploaded). | None |
| `voice` | Any | Voice/audio message. | None |
| `video` | Any | Video message. | None |
| `file` | Any | File attachment with preview. | None |
| `chart` | Any | Data visualization (bar/line/pie). | None |
| `card` | Any | Rich card with title, body, image, actions. | Depends on actions |
| `system` | System | System notification (member joined, etc.). | None |

**Key design**: Both humans AND haseefs can send ANY message type. A human can create a poll, and haseefs can vote on it. A haseef can create a confirmation, and humans can respond.

### 6.3 Message Content Storage

The `content` column (Text) stores the primary text content for backward compatibility and search. The `metadata` column (JsonB) stores the full structured message:

```typescript
interface MessageMetadata {
  // Message type — determines rendering
  type: MessageType;

  // Type-specific payload
  payload?: Record<string, unknown>;

  // For interactive messages: what kind of response is expected
  responseSchema?: ResponseSchema;

  // Collected responses (for interactive messages)
  responses?: MessageResponse[];

  // For media messages
  media?: MediaInfo;

  // For file messages
  files?: FileInfo[];

  // Reply/threading — optional, works with ALL message types
  replyTo?: {
    messageId: string;
    snippet: string;      // smart summary based on message type
    senderName: string;   // who sent the original message
    messageType: string;  // type of the original message
  };

  // Rendering hints
  ui?: {
    priority?: "normal" | "urgent";
    pinned?: boolean;
    expiresAt?: string; // ISO datetime
  };
}
```

---

## 7. Interactive Messages & Response System

This section is the most critical in the plan. It covers how interactive messages work end-to-end: who can respond, how responses are tracked, when messages auto-resolve, and exactly how haseefs interact with the entire lifecycle.

### 7.1 Two Fundamental Patterns

Every interactive message falls into one of two patterns:

| Pattern | Who responds | Lifecycle | Examples |
|---------|-------------|-----------|----------|
| **Targeted** | One specific entity (or a small set) | Auto-resolves when all targets respond. Locks after resolution. | Confirmation, directed choice |
| **Broadcast** | Any member in the space | **Stays open forever.** Members can respond and change their response at any time. Like WhatsApp polls. | Vote/poll, form, open choice |

This distinction drives resolution logic, event routing, and UI rendering.

**Key principle**: Broadcast messages (votes, forms) **never need closing**. They live as long as the space does. The sender can optionally close one if they really want to, but it's rare and not part of the normal flow.

### 7.2 Interactive Message Metadata

Every interactive message stores this in `SmartSpaceMessage.metadata`:

```typescript
interface InteractiveMessageMetadata {
  type: "confirmation" | "vote" | "choice" | "form" | "card";

  // ── Audience ──────────────────────────────────────
  audience: "targeted" | "broadcast";

  // For targeted messages: who must respond
  // For broadcast: omitted (everyone can respond)
  targetEntityIds?: string[];

  // ── Response Definition ───────────────────────────
  responseSchema: ResponseSchema;

  // ── Lifecycle ─────────────────────────────────────
  // Targeted: "open" → "resolved" (auto, when target responds)
  // Broadcast: stays "open" forever (like WhatsApp polls). Rarely "closed" by sender.
  status: "open" | "resolved" | "closed";

  // For targeted messages: set automatically when all targets respond
  // For broadcast: only set if sender explicitly closes (rare)
  resolution?: {
    outcome: string;             // e.g. "confirmed", "rejected", "Pizza" (top vote at close time)
    resolvedAt: string;          // ISO datetime
    resolvedBy: "auto" | "sender";
  };

  // ── Type-Specific Payload ─────────────────────────
  // Confirmation: { title, message, confirmLabel, rejectLabel }
  // Vote: { title, options, allowMultiple }
  // Choice: { text, options: [{ label, value, style }] }
  // Form: { title, description, fields: [...] }
  // Card: { title, body, imageUrl, actions: [...] }
  payload: Record<string, unknown>;

  // ── Denormalized Response Summary ─────────────────
  // Updated after every response — avoids querying MessageResponse table for rendering
  responseSummary: {
    totalResponses: number;
    // For enum types: count per option. e.g. { "Pizza": 3, "Sushi": 2 }
    counts?: Record<string, number>;
    // For targeted: who has responded and who hasn't
    respondedEntityIds?: string[];
    // Full list of responses (for small response counts)
    responses: Array<{
      entityId: string;
      entityName: string;
      entityType: "human" | "agent";
      value: unknown;
      respondedAt: string;
    }>;
  };
}
```

### 7.3 Response Schema

Defines what valid responses look like. Validated server-side before accepting.

```typescript
type ResponseSchema =
  | { type: "enum"; values: string[]; multiple?: boolean }   // vote, choice, confirmation
  | { type: "json"; schema: JSONSchema }                      // form (validated with ajv)
  | { type: "text" }                                          // free-text response
  | { type: "rating"; min: number; max: number }             // star rating
```

### 7.4 Message Response Model (Database)

```
MessageResponse {
  id              UUID      @id
  messageId       UUID      → SmartSpaceMessage
  smartSpaceId    UUID      → SmartSpace
  entityId        UUID      → Entity (who responded)
  entityName      String    (denormalized — avoids join on read)
  entityType      String    ("human" | "agent")
  value           Json      (the actual response, conforming to responseSchema)
  createdAt       DateTime
  updatedAt       DateTime  (changes when entity changes their response)
}
```

- **One response per entity per message** — enforced by `@@unique([messageId, entityId])`
- **Upsert on respond** — you can change your vote/answer; the old value is overwritten, `updatedAt` changes
- **Denormalized `entityName`/`entityType`** — so the `responseSummary` on the message can be rebuilt without joins

### 7.5 Per-Type Behavior

#### Confirmation (targeted, single-response)

```
Audience:     targeted
Targets:      1 entity (the person being asked)
Auto-resolve: YES — when the target responds
Resolution:   { outcome: "confirmed" | "rejected", resolvedBy: "auto" }
```

**Flow**:
1. Haseef calls `send_confirmation({ spaceId, title, message, targetEntityId: "husam-id" })`
2. Server creates message with `audience: "targeted"`, `targetEntityIds: ["husam-id"]`, `status: "open"`
3. **Frontend**: All members see the card, but only Husam sees the confirm/reject buttons. Others see "Waiting for Husam's response"
4. Husam clicks "Confirm" → `POST /respond` with `value: "confirmed"`
5. Server saves `MessageResponse`, then **auto-resolves**:
   - Sets `status: "resolved"`, `resolution: { outcome: "confirmed", resolvedBy: "auto" }`
   - Updates `responseSummary`
6. Emits `message.resolved` SSE event to space
7. **Frontend**: Card updates to show "✅ Confirmed by Husam"
8. **Haseef event**: The haseef that sent the confirmation receives a `message_resolved` sense event (see §7.8)

**What if Husam doesn't respond?**
- The haseef naturally wakes periodically (consciousness cycle). It can check on pending confirmations via `get_messages` and decide to follow up or close.
- Sender (haseef or human) can manually close: `POST /api/smart-spaces/:id/messages/:msgId/close`
- No automatic expiry — the haseef decides when to give up.

#### Vote / Poll (broadcast, always open)

```
Audience:     broadcast
Targets:      all members
Auto-resolve: NO — stays open forever (like WhatsApp polls)
Closing:      optional, rare — sender CAN close if they want, but it's not the normal flow
```

**Flow**:
1. Haseef calls `send_vote({ spaceId, title: "Where for lunch?", options: ["Pizza", "Sushi", "Tacos"] })`
2. Server creates message with `audience: "broadcast"`, `status: "open"`
3. **Frontend**: All members see vote buttons. After voting, their selection is highlighted. Live counts update via SSE.
4. Alice votes "Pizza" → `POST /respond` with `value: "Pizza"`
   - Server saves `MessageResponse`, updates `responseSummary.counts: { Pizza: 1 }`
   - Emits `message.response` SSE to space (so all UIs update live counts)
5. Bob votes "Sushi" → same flow, counts become `{ Pizza: 1, Sushi: 1 }`
6. Alice changes her vote to "Sushi" → upsert, counts become `{ Pizza: 0, Sushi: 2 }`
7. **No closing step**. The vote stays open. People can keep voting/changing forever.
8. **Frontend**: Always shows live results with vote buttons active.

**Haseef voting on a human-created poll**: The haseef receives the `interactive_message` sense event, sees the options, and can call `respond_to_message` to cast its vote like any other member.

#### Choice (targeted OR broadcast)

```
Audience:     depends on sender — can be targeted ("Husam, pick one") or broadcast ("everyone pick")
Targets:      configurable via targetEntityId (optional)
Auto-resolve: YES if targeted (single target responds) — NO if broadcast
```

Same mechanics as confirmation (if targeted) or vote (if broadcast), but with custom-labeled buttons instead of confirm/reject.

#### Form (broadcast or targeted)

```
Audience:     broadcast (or targeted to specific people)
Targets:      all members (or specific)
If targeted:  auto-resolves when all targets submit
If broadcast: stays open forever — anyone can submit/update at any time
```

**Flow**: Same as vote but response `value` is a JSON object validated against `responseSchema.schema` using `ajv`. Each entity submits their own form data independently.

### 7.6 Response Flow (Server-Side, All Types)

```
POST /api/smart-spaces/:id/messages/:msgId/respond
Body: { value: <response conforming to responseSchema> }
Auth: JWT (must be a member of the space)
```

**Server logic** (in a single Prisma transaction):

```
1. BEGIN TRANSACTION
2. Load message with current metadata (SELECT ... FOR UPDATE if needed)
3. CHECK status:
   - If audience === "broadcast": always accept (broadcast messages stay open forever)
   - If audience === "targeted" AND status === "resolved": return 409 "Already resolved"
4. CHECK audience targeting:
   - If audience === "targeted", verify caller is in targetEntityIds
     → If not: return 403 "You are not a target of this message"
   - If audience === "broadcast": any space member can respond
5. VALIDATE: response value against responseSchema
   → If invalid: return 400 with validation errors
6. UPSERT MessageResponse (messageId + entityId unique)
7. RECOMPUTE responseSummary on the message metadata
   - Rebuild counts from all MessageResponse rows (not increment — avoids bugs)
   - Update responses array
   - Update respondedEntityIds
8. CHECK AUTO-RESOLVE (targeted only):
   - If audience === "targeted" AND all targetEntityIds have responded:
     → Set status = "resolved"
     → Set resolution = { outcome: <value>, resolvedBy: "auto", resolvedAt: now() }
9. UPDATE message metadata (responseSummary + possibly status/resolution)
10. COMMIT TRANSACTION
```

**After transaction succeeds**:
```
11. EMIT SSE "message.response" to space channel (for frontend live updates)
12. IF status changed to "resolved" (targeted messages only):
    → EMIT SSE "message.resolved" to space channel
    → PUSH "message_resolved" sense event to all haseefs in space (see §7.8)
13. ELSE (broadcast, or targeted still waiting):
    → PUSH "message_response" sense event to SENDING haseef only (see §7.8)
```

### 7.7 Optional: Closing Messages Manually

Broadcast messages stay open forever by default. However, a sender (or admin) **can** close one if needed — this is rare and not part of the normal flow.

```
POST /api/smart-spaces/:id/messages/:msgId/close
Auth: JWT (must be the sender of the message, or admin/owner of the space)
```

- Sets `status: "closed"`
- For votes: server snapshots the top-voted option as `resolution.outcome` at close time
- For forms: `resolution.outcome = "closed"` with count of submissions
- Emits `message.closed` SSE event (frontend disables buttons, shows final state)
- Pushes `message_resolved` sense event to all haseefs in the space

**When would you close?** Rare cases like: "I accidentally created a vote with wrong options", or an admin cleaning up old content. Normal votes/forms just stay open.

**Haseef tool**: `close_interactive_message({ messageId })` — exists but haseefs rarely need it. A haseef might use it if it explicitly decides "I have enough data, let me finalize this."

### 7.8 Haseef Event Routing — Who Gets What

This is critical. Not every haseef needs every response event. The routing rules:

#### Event 1: `interactive_message` (message created)
**Who gets it**: ALL haseefs in the space
**When**: When any interactive message is posted (by human or haseef)
**Why**: Every haseef needs to know about it — they might need to respond, or it might be relevant context

```json
{
  "eventId": "msg-uuid",
  "scope": "spaces",
  "type": "interactive_message",
  "data": {
    "messageId": "abc-123",
    "spaceId": "space-uuid",
    "spaceName": "Team Chat",
    "senderId": "husam-entity-id",
    "senderName": "Husam",
    "senderType": "human",
    "messageType": "vote",
    "audience": "broadcast",
    "title": "Where for lunch?",
    "payload": { "options": ["Pizza", "Sushi", "Tacos"] },
    "responseSchema": { "type": "enum", "values": ["Pizza", "Sushi", "Tacos"] },
    "isTargeted": false,
    "youAreTargeted": false
  }
}
```

If the haseef IS a target (e.g. confirmation directed at the haseef):
```json
{
  "...same fields...",
  "messageType": "confirmation",
  "audience": "targeted",
  "isTargeted": true,
  "youAreTargeted": true,
  "payload": {
    "title": "Should I deploy v2.3?",
    "message": "This will affect all production servers.",
    "confirmLabel": "Deploy",
    "rejectLabel": "Cancel"
  },
  "responseSchema": { "type": "enum", "values": ["confirmed", "rejected"] }
}
```

The haseef sees `youAreTargeted: true` and knows it needs to respond.

#### Event 2: `message_response` (someone responded, message still open)
**Who gets it**: ONLY the haseef that SENT the interactive message
**When**: Every time someone responds to a message the haseef created
**Why**: The sending haseef often needs to track progress (e.g. "3 of 5 people voted")
**Not sent to**: Other haseefs in the space (would be noise)

```json
{
  "eventId": "response-uuid",
  "scope": "spaces",
  "type": "message_response",
  "data": {
    "messageId": "abc-123",
    "spaceId": "space-uuid",
    "spaceName": "Team Chat",
    "responderName": "Alice",
    "responderType": "human",
    "value": "Pizza",
    "responseSummary": {
      "totalResponses": 3,
      "counts": { "Pizza": 2, "Sushi": 1, "Tacos": 0 },
      "respondedEntityIds": ["alice-id", "bob-id", "carol-id"]
    }
  }
}
```

**Why only the sender?** 
- If a haseef creates a vote and 20 people vote, only that haseef cares about tracking each response.
- Other haseefs in the space would get 20 noisy events that don't concern them.
- If another haseef wants to see vote progress, it can use `get_messages` to check current state.

**Batching**: No special batching needed. The haseef's think loop has a DRAIN phase that reads ALL pending inbox events at once. If 5 votes come in while the haseef is thinking, it sees all 5 in the next cycle as individual events — and the last one has the most up-to-date `responseSummary`.

> **Future: Dual-Mind Architecture**
> Currently, `message_response` events go to the sending haseef only (to avoid noise for other haseefs). However, hsafa-core may evolve to give haseefs a **cheap secondary mind** (small/fast model) that processes minor events continuously alongside the main mind. If that happens, sending `message_response` to ALL haseefs in the space becomes viable — the cheap mind can process vote updates, presence changes, and other low-priority events without burning expensive main-mind cycles. The architecture here is compatible with this: just change the routing rule from "sender only" to "all haseefs" when the dual-mind feature ships in Core. No schema or API changes needed.

#### Event 3: `message_resolved` (message resolved or closed)
**Who gets it**: ALL haseefs in the space
**When**: When a targeted message auto-resolves, or any message is manually closed (rare for broadcast)
**Why**: The outcome matters to everyone — e.g. "Husam confirmed the deploy"

```json
{
  "eventId": "resolution-uuid",
  "scope": "spaces",
  "type": "message_resolved",
  "data": {
    "messageId": "abc-123",
    "spaceId": "space-uuid",
    "spaceName": "Team Chat",
    "messageType": "vote",
    "title": "Where for lunch?",
    "status": "closed",
    "resolution": {
      "outcome": "Pizza",
      "resolvedBy": "sender",
      "resolvedAt": "2026-03-12T09:00:00Z"
    },
    "finalSummary": {
      "totalResponses": 8,
      "counts": { "Pizza": 4, "Sushi": 3, "Tacos": 1 }
    }
  }
}
```

For a confirmation auto-resolve:
```json
{
  "...same fields...",
  "messageType": "confirmation",
  "title": "Deploy v2.3?",
  "status": "resolved",
  "resolution": {
    "outcome": "confirmed",
    "resolvedBy": "auto",
    "resolvedAt": "2026-03-12T09:02:00Z"
  },
  "finalSummary": {
    "totalResponses": 1,
    "responses": [
      { "entityName": "Husam", "value": "confirmed" }
    ]
  }
}
```

#### Summary Table: Who Gets What

| Event | Trigger | Recipients | Purpose |
|-------|---------|------------|---------|
| `interactive_message` | Message created | All haseefs in space | Know about it, possibly respond |
| `message_response` | Someone responds (msg still open) | Sending haseef only* | Track progress |
| `message_resolved` | Targeted msg auto-resolves, or any msg manually closed | All haseefs in space | Know the outcome |

*See "Future: Dual-Mind Architecture" note above — may change to all haseefs when Core supports cheap secondary minds.

### 7.9 End-to-End Scenarios

#### Scenario A: Haseef asks Husam for confirmation

```
1. Haseef calls: send_confirmation({
     spaceId: "...",
     title: "Deploy v2.3?",
     message: "This will deploy to production.",
     targetEntityId: "husam-id"
   })

2. Server creates message:
   - metadata.audience = "targeted"
   - metadata.targetEntityIds = ["husam-id"]
   - metadata.status = "open"
   - metadata.responseSchema = { type: "enum", values: ["confirmed", "rejected"] }

3. Sense event "interactive_message" → all haseefs in space
   (Other haseefs see it as context but it's not targeted at them)

4. Frontend shows card:
   - Husam sees [Deploy] [Cancel] buttons
   - Others see "⏳ Waiting for Husam"

5. Husam clicks "Deploy"
   → POST /respond { value: "confirmed" }

6. Server (in transaction):
   - Validates: status is "open" ✓
   - Validates: Husam is in targetEntityIds ✓
   - Validates: "confirmed" is in responseSchema.values ✓
   - Creates MessageResponse
   - Checks: all targets responded? YES (1/1)
   - Auto-resolves: status → "resolved", resolution.outcome = "confirmed"

7. SSE "message.resolved" → all clients in space
   → Frontend: card shows "✅ Confirmed by Husam"

8. Sense event "message_resolved" → all haseefs in space
   → Sending haseef sees: outcome = "confirmed" → proceeds with deploy

9. Done. Message is final. No more responses accepted.
```

#### Scenario B: Human creates a vote, haseef participates

```
1. Husam (human) sends a vote via UI:
   - title: "Where for lunch?"
   - options: ["Pizza", "Sushi", "Tacos"]

2. Server creates message:
   - metadata.audience = "broadcast"
   - metadata.status = "open"

3. Sense event "interactive_message" → all haseefs in space
   - Haseef sees: messageType: "vote", youAreTargeted: false
   - Haseef decides whether to vote based on its personality/instructions

4. Alice votes "Pizza"
   → No sense event to any haseef (sender is human, not a haseef)
   → SSE "message.response" → all clients (live UI update)

5. Haseef votes "Sushi" via tool:
   spaces_respond_to_message({ messageId: "...", value: "Sushi" })
   → Server validates, saves response
   → SSE "message.response" → all clients (UI shows haseef voted)
   → No sense event back (haseef is the responder, not the sender)

6. Bob votes "Pizza", Carol votes "Sushi"
   → SSE updates. No sense events (sender is human).

7. Vote stays open forever. Anyone can change their vote anytime.
   Live counts always visible: Pizza 2, Sushi 2.
   No closing needed — just like WhatsApp polls.
```

#### Scenario C: Haseef creates a vote, tracks responses

```
1. Haseef calls: send_vote({
     spaceId: "...",
     title: "Should we switch to TypeScript?",
     options: ["Yes", "No", "Abstain"]
   })

2. Server creates broadcast message

3. Sense event "interactive_message" → all other haseefs in space

4. Alice votes "Yes"
   → Sense event "message_response" → SENDING haseef only
   → { responderName: "Alice", value: "Yes", summary: { Yes: 1, No: 0, Abstain: 0 } }

5. Bob votes "No"
   → Sense event "message_response" → SENDING haseef only
   → { responderName: "Bob", value: "No", summary: { Yes: 1, No: 1, Abstain: 0 } }

6. Haseef's think loop DRAINs both events in one cycle
   → Sees current state: Yes 1, No 1
   → Decides to wait for more votes

7. 5 more people vote (3 Yes, 2 No)
   → 5 sense events queued
   → Next DRAIN: haseef sees all 5, last one has { Yes: 4, No: 3, Abstain: 0 }

8. Vote stays open. People can keep voting/changing anytime.
   The haseef can act on the data whenever it wants (e.g. send a message
   summarizing results) without needing to close the vote.
```

#### Scenario D: Haseef A asks Haseef B for confirmation

```
1. Haseef A calls: send_confirmation({
     spaceId: "...",
     title: "Ready to process the batch?",
     targetEntityId: "haseef-b-entity-id"
   })

2. Sense event "interactive_message" → ALL haseefs, including Haseef B
   - Haseef B sees: youAreTargeted: true
   - Haseef B sees responseSchema and knows it needs to respond

3. Haseef B's think loop picks up the event
   → Haseef B evaluates and calls:
   spaces_respond_to_message({ messageId: "...", value: "confirmed" })

4. Server auto-resolves (target responded)

5. Sense event "message_resolved" → ALL haseefs
   - Haseef A sees: outcome = "confirmed" → proceeds
   - Haseef B already knows (it just responded)
   - Other haseefs see it as context
```

### 7.10 Edge Cases

**Target entity leaves the space (targeted messages)**:
- If the only target of a confirmation leaves, the message stays `"open"` but unresolvable
- Sender (or admin) can manually close it, or re-send to someone else
- Server does NOT auto-resolve — the sender decides what to do

**Sender leaves the space**:
- Broadcast messages: nothing changes, they stay open, anyone can still vote/respond
- Targeted messages still open: any admin can close them
- For haseefs: if the haseef is removed, its messages live on normally

**Changing a response (vote change)**:
- The upsert in `MessageResponse` handles this — old value overwritten
- `responseSummary.counts` is **recomputed from all rows** (not incremented/decremented) — no off-by-one bugs
- SSE `message.response_updated` event emitted (not `message.response`)
- For haseef sender: sense event `message_response` with updated summary

**Retracting a response** (`DELETE /api/smart-spaces/:id/messages/:msgId/responses/mine`):
- For broadcast messages (votes/forms): allowed — deletes `MessageResponse` row, recomputes summary, emits `message.response_updated` SSE
- For resolved targeted messages: **NOT allowed** (409 error) — once a confirmation is resolved, the haseef may have already acted on it (e.g. deployed). Cannot undo.
- For open targeted messages (target hasn't responded yet): N/A — there's no response to retract

**Message deleted**:
- If a broadcast message is deleted (Ship 14), all `MessageResponse` rows cascade-delete
- If a targeted message is deleted before resolution, it's just gone — no resolution event

### 7.11 New Tool: `close_interactive_message`

Added to the tool manifest:

```typescript
{
  name: "close_interactive_message",
  description: "Close a vote, form, or other interactive message you sent. Returns the final results.",
  inputSchema: {
    type: "object",
    properties: {
      messageId: { type: "string", description: "The interactive message ID to close" },
    },
    required: ["messageId"]
  }
}
```

### 7.12 Frontend Rendering Rules

| State | Targeted (Confirmation) | Broadcast (Vote/Form) |
|-------|------------------------|----------------------|
| **open, you are target** | Show action buttons | Show vote/form buttons |
| **open, you are NOT target** | Show "Waiting for [name]" | Show vote/form buttons (you can participate too) |
| **open, you already responded** | Show your response (cannot change — targeted resolves on response) | Show your selection highlighted, allow changing anytime |
| **resolved** (targeted only) | Show "✅ Confirmed by [name]" or "❌ Rejected by [name]" | N/A — broadcast stays open |
| **closed** (rare, manual) | Show outcome | Show final snapshot of results, buttons disabled |

**Broadcast messages always show live results** — vote counts, form submission count, etc. — with active buttons. They never need to show a "final" state unless explicitly closed.

---

## 8. Message Replies & Threading

### 8.1 Overview

**Every message type** supports optional replies. Both humans and haseefs can reply to any message — text, votes, confirmations, images, files, etc. This creates conversational threads within a space.

### 8.2 Reply Metadata

When sending a message, optionally include `replyTo` in the metadata:

```typescript
{
  replyTo: {
    messageId: string;      // UUID of the message being replied to
    snippet: string;        // smart summary of the original message
    senderName: string;     // who sent the original message
    messageType: string;    // type of the original message (text, vote, image, etc.)
  }
}
```

The server automatically populates `snippet`, `senderName`, and `messageType` when you provide just `messageId`.

**Snippet generation logic** (server-side):
- **text**: First 100 chars of content
- **vote**: `"📊 {title}"` (e.g. "📊 Where should we eat?")
- **confirmation**: `"❓ {title}"` (e.g. "❓ Deploy to production?")
- **choice**: `"🔘 {text}"` (first 80 chars)
- **form**: `"📝 {title}"` (e.g. "📝 Team Feedback Form")
- **card**: `"💬 {title}"` (e.g. "💬 New Feature Announcement")
- **image**: `"🖼️ {caption or 'Image'}"` (e.g. "🖼️ Screenshot of the bug")
- **voice**: `"🎤 {transcription or 'Voice message'}"` (first 80 chars)
- **video**: `"🎥 Video message"`
- **file**: `"📎 {filename}"` (e.g. "📎 proposal.pdf")
- **chart**: `"📈 {title}"` (e.g. "📈 Q1 Sales Data")
- **system**: First 100 chars of the system message

### 8.3 Database Storage

No new tables needed — the reply relationship is stored in `SmartSpaceMessage.metadata.replyTo`. This keeps it lightweight and flexible.

Optional: add a database index for efficient thread queries:
```sql
CREATE INDEX idx_messages_reply_to ON smart_space_messages 
  USING gin ((metadata -> 'replyTo'));
```

### 8.4 API Changes

**Send message with reply**:
```http
POST /api/smart-spaces/:id/messages
{
  "content": "I agree with that!",
  "replyTo": "original-message-uuid"
}
```

Server resolves the original message and populates full `replyTo` metadata.

**Get thread** (optional endpoint for fetching all replies to a message):
```http
GET /api/smart-spaces/:id/messages/:msgId/thread
```

Returns the original message + all replies in chronological order.

### 8.5 Frontend Rendering

**Inline reply indicator**:
- Show a small card above the message with:
  - Original sender's name
  - Snippet of original message (truncated)
  - Click to scroll/highlight the original message

**Thread view** (optional):
- Click "View thread" on a message with replies
- Shows the original message + all replies in a focused view
- Indent replies slightly for visual hierarchy

**Reply action**:
- Hover/long-press on any message → "Reply" button appears
- Clicking "Reply" pre-fills the composer with the reply context
- Shows a dismissible "Replying to [name]" banner above composer

### 8.6 Haseef Reply Behavior

**Sending replies**:
All message-sending tools accept an optional `replyTo` parameter:

```typescript
// Example: send_message with reply
{
  spaceId: "...",
  text: "That's a great idea!",
  replyTo: "msg-uuid"  // optional
}
```

**Understanding replies**:
When a haseef receives a message via sense event, the event includes reply context:

```json
{
  "type": "message",
  "data": {
    "messageId": "...",
    "content": "I agree!",
    "replyTo": {
      "messageId": "...",
      "snippet": "What if we use Redis for caching?",
      "senderName": "You"  // or the actual sender name
    }
  }
}
```

The haseef sees what message is being replied to and can maintain conversational context.

### 8.7 Sense Event Format (with reply)

```json
{
  "eventId": "msg-uuid",
  "scope": "spaces",
  "type": "message",
  "data": {
    "messageId": "...",
    "spaceId": "...",
    "spaceName": "Team Chat",
    "senderId": "...",
    "senderName": "Alice",
    "senderType": "human",
    "content": "That sounds perfect!",
    "replyTo": {
      "messageId": "prev-msg-uuid",
      "snippet": "Should we deploy tomorrow?",
      "senderName": "You"
    },
    "recentMessages": [...]
  }
}
```

### 8.8 Reply Notifications

- If you're mentioned in a reply (or you sent the original message), you get a notification
- Haseefs receive sense events for replies to their messages
- Reply chains create natural conversation flow

### 8.9 Implementation Notes

- **No nesting limit**: Replies can reply to replies (flat structure, no tree)
- **Deleted messages**: If original message is deleted, `replyTo` becomes a tombstone (shows "[deleted message]")
- **Cross-space replies**: Not supported — `replyTo` must reference a message in the same space
- **Validation**: Server validates that `replyTo` messageId exists in the same space

---

## 9. Media Messages

### 9.1 Images

**Human sends image**:
1. Client uploads image → `POST /api/media/upload` (multipart)
2. Server stores in local disk or S3, returns `{ mediaId, url, thumbnail }`
3. Client sends message with `metadata.type: "image"` and `metadata.media: { mediaId, url, mimeType, width, height }`

**Haseef generates image**:
1. Haseef calls `generate_image` tool (new) with prompt
2. Spaces server calls an image generation API (DALL-E, etc.)
3. Stores the result, sends as image message to the space
4. Returns the image URL to the haseef

**Haseef sends existing image**:
1. Haseef calls `send_image` tool with a URL
2. Spaces server downloads, stores, and sends as image message

### 9.2 Voice Messages

**Human sends voice**:
1. Client records audio via MediaRecorder API
2. Uploads → `POST /api/media/upload`
3. Server optionally transcribes (Whisper API) for search and haseef consumption
4. Sends message with `metadata.type: "voice"` and `metadata.media: { url, duration, transcription? }`

**Haseef sends voice**:
1. Haseef calls `send_voice` tool with text
2. Spaces server generates audio via TTS (OpenAI TTS, ElevenLabs, etc.)
3. Stores and sends as voice message
4. The text is also stored for search

**Haseef receives voice**:
- Voice messages to a space are transcribed server-side
- The sense event includes both the audio URL and the transcription
- The haseef processes the transcription as text (and optionally the audio via multimodal if supported)

### 9.3 Video Messages

Similar pattern to voice:
- Upload for humans, generate/link for haseefs
- Thumbnail generation server-side
- Duration tracking

### 9.4 Media Storage

```
MediaAsset {
  id          UUID
  entityId    UUID    → Entity (uploader)
  mimeType    String
  size        Int     (bytes)
  url         String  (storage URL) 
  thumbnailUrl String?
  metadata    Json?   (width, height, duration, transcription, etc.)
  createdAt   DateTime
}
```

Storage backend: local disk initially, S3-compatible later. Environment variable `MEDIA_STORAGE_PATH` or `S3_BUCKET`.

---

## 10. File Attachments

### 10.1 Upload Flow

1. Client uploads file → `POST /api/media/upload`
2. Server stores, extracts metadata (name, size, mime type, page count for PDFs, etc.)
3. Client sends message with `metadata.type: "file"` (or attaches to any message type)

### 10.2 File Info

```typescript
interface FileInfo {
  mediaId: string;
  name: string;
  mimeType: string;
  size: number;  // bytes
  url: string;
  // Extracted metadata
  pageCount?: number;  // for PDFs
  preview?: string;    // first 500 chars for text files
}
```

### 10.3 Haseef File Handling

- Haseef receives file via sense event with metadata (name, type, size, preview)
- For text-based files (txt, csv, json, md): full content included in sense event
- For PDFs: extracted text included (via pdf-parse or similar)
- For images: sent as attachment (multimodal)
- Haseef can reference files in responses

---

## 11. Haseef Space Actions

### 11.1 Updated Tool Manifest

The spaces scope tools grow from 5 to ~15:

| Tool | Description | Mode |
|------|-------------|------|
| `send_message` | Send a text message to a space (optional `replyTo`) | sync |
| `send_confirmation` | Send a yes/no confirmation card to a specific person (optional `replyTo`) | sync |
| `send_vote` | Send a broadcast poll (optional `replyTo`) | sync |
| `send_choice` | Send action buttons — targeted or broadcast (optional `replyTo`) | sync |
| `send_form` | Send a structured form for data input (optional `replyTo`) | sync |
| `send_card` | Send a rich card (title, body, image, actions) (optional `replyTo`) | sync |
| `send_image` | Send an image (URL or generate) (optional `replyTo`) | sync |
| `send_voice` | Send a voice message (TTS from text) (optional `replyTo`) | sync |
| `respond_to_message` | Respond to an interactive message | sync |
| `close_interactive_message` | Close a vote/form/choice you sent — returns final results | sync |
| `get_messages` | Read recent messages from a space | sync |
| `get_spaces` | List spaces the haseef is in | sync |
| `invite_to_space` | Invite a user by email to a space | sync |
| `list_invitations` | List pending invitations for this haseef | sync |
| `respond_to_invitation` | Accept or decline a specific invitation | sync |
| `get_space_members` | List members of a space | sync |

> **Note**: All `send_*` tools accept an optional `replyTo` parameter (message UUID) to mark the message as a reply.

### 11.2 Tool Instructions Update

The scope instructions (`SCOPE_INSTRUCTIONS`) need to be updated to teach haseefs about:
- Rich message types and when to use each
- How to respond to interactive messages
- How to handle invitations
- Media capabilities (image generation, TTS)

---

## 12. Schema Changes

### 12.1 New Models

```prisma
// ── Invitation ───────────────────────────────────────
model Invitation {
  id           String   @id @default(uuid()) @db.Uuid
  smartSpaceId String   @map("smart_space_id") @db.Uuid
  inviterId    String   @map("inviter_id") @db.Uuid
  inviteeEmail String   @map("invitee_email")
  inviteeId    String?  @map("invitee_id") @db.Uuid
  role         String   @default("member")
  status       String   @default("pending") // pending | accepted | declined | expired | revoked
  message      String?
  expiresAt    DateTime? @map("expires_at") @db.Timestamptz(6)
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt    DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  smartSpace SmartSpace @relation(fields: [smartSpaceId], references: [id], onDelete: Cascade)
  inviter    Entity     @relation("inviter", fields: [inviterId], references: [id])
  invitee    Entity?    @relation("invitee", fields: [inviteeId], references: [id])

  @@unique([smartSpaceId, inviteeEmail])
  @@index([inviteeEmail, status])
  @@index([inviteeId, status])
  @@map("invitations")
}

// ── Message Response (for interactive messages) ──────
model MessageResponse {
  id           String   @id @default(uuid()) @db.Uuid
  messageId    String   @map("message_id") @db.Uuid
  smartSpaceId String   @map("smart_space_id") @db.Uuid
  entityId     String   @map("entity_id") @db.Uuid
  entityName   String   @map("entity_name")         // denormalized — avoids join when rebuilding responseSummary
  entityType   String   @map("entity_type")          // "human" | "agent"
  value        Json     @db.JsonB
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt    DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  message    SmartSpaceMessage @relation(fields: [messageId], references: [id], onDelete: Cascade)
  smartSpace SmartSpace        @relation(fields: [smartSpaceId], references: [id], onDelete: Cascade)
  entity     Entity            @relation(fields: [entityId], references: [id])

  @@unique([messageId, entityId])
  @@index([messageId])
  @@map("message_responses")
}

// ── Media Asset ──────────────────────────────────────
model MediaAsset {
  id           String   @id @default(uuid()) @db.Uuid
  entityId     String   @map("entity_id") @db.Uuid
  mimeType     String   @map("mime_type")
  size         Int      // bytes
  url          String
  thumbnailUrl String?  @map("thumbnail_url")
  metadata     Json?    @db.JsonB // width, height, duration, transcription, etc.
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  entity Entity @relation(fields: [entityId], references: [id])

  @@index([entityId])
  @@map("media_assets")
}

// ── Haseef Ownership ─────────────────────────────────
model HaseefOwnership {
  id        String   @id @default(uuid()) @db.Uuid
  userId    String   @map("user_id")       // String (not UUID) — matches User.id which uses external auth IDs
  haseefId  String   @map("haseef_id")     // Core haseef UUID as string (lives in a different DB)
  entityId  String   @map("entity_id") @db.Uuid
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  entity Entity @relation(fields: [entityId], references: [id])

  @@unique([userId, haseefId])
  @@index([userId])
  @@map("haseef_ownerships")
}
```

### 12.2 Modified Models

**SmartSpace** — Add relations:
```prisma
  invitations      Invitation[]
  messageResponses MessageResponse[]
```

**SmartSpaceMembership** — Enforce role enum:
```prisma
  role String @default("member") // "owner" | "admin" | "member"
```

**SmartSpaceMessage** — Add relation:
```prisma
  responses MessageResponse[]
```

**Entity** — Add relations:
```prisma
  sentInvitations     Invitation[] @relation("inviter")
  receivedInvitations Invitation[] @relation("invitee")
  messageResponses    MessageResponse[]
  mediaAssets         MediaAsset[]
```

**User** — Add relation:
```prisma
  haseefOwnerships HaseefOwnership[]
```

---

## 13. API Routes

### 13.1 Invitations

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/smart-spaces/:id/invitations` | JWT (admin+) | Invite by email |
| GET | `/api/smart-spaces/:id/invitations` | JWT (admin+) | List space invitations |
| GET | `/api/invitations` | JWT | List my pending invitations |
| POST | `/api/invitations/:id/accept` | JWT | Accept invitation |
| POST | `/api/invitations/:id/decline` | JWT | Decline invitation |
| DELETE | `/api/invitations/:id` | JWT (inviter or admin) | Revoke invitation |

### 13.2 Haseef Management (Proxy to Core)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/haseefs` | JWT | Create a haseef |
| GET | `/api/haseefs` | JWT | List my haseefs |
| GET | `/api/haseefs/:id` | JWT (owner) | Get haseef details + status |
| PATCH | `/api/haseefs/:id` | JWT (owner) | Update haseef config |
| DELETE | `/api/haseefs/:id` | JWT (owner) | Delete haseef |
| POST | `/api/haseefs/:id/spaces/:spaceId` | JWT (admin+) | Add haseef to space |
| DELETE | `/api/haseefs/:id/spaces/:spaceId` | JWT (admin+) | Remove haseef from space |

### 13.3 Message Responses

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/smart-spaces/:id/messages/:msgId/respond` | JWT (member) | Respond to interactive message |
| GET | `/api/smart-spaces/:id/messages/:msgId/responses` | JWT (member) | List responses |
| DELETE | `/api/smart-spaces/:id/messages/:msgId/responses/mine` | JWT (member) | Retract my response |

### 13.4 Media

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/media/upload` | JWT | Upload file/image/audio/video |
| GET | `/api/media/:id` | JWT | Get media asset info |
| GET | `/api/media/:id/download` | JWT | Download media file |

### 13.5 Space Management (Enhanced)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/smart-spaces/:id/transfer-ownership` | JWT (owner) | Transfer ownership |
| PATCH | `/api/smart-spaces/:id/members/:entityId` | JWT (admin+) | Update member role |
| POST | `/api/smart-spaces/:id/leave` | JWT (member) | Leave space |

---

## 14. Tools (Spaces Scope)

### 14.1 Full Tool Definitions

```typescript
// ── send_confirmation ────────────────────────────────
{
  name: "send_confirmation",
  description: "Send a yes/no confirmation card to a space. Returns the message ID. Wait for responses via events.",
  inputSchema: {
    type: "object",
    properties: {
      spaceId: { type: "string" },
      title: { type: "string", description: "Short title" },
      message: { type: "string", description: "Explanation text" },
      confirmLabel: { type: "string", description: "Confirm button label (default: Confirm)" },
      rejectLabel: { type: "string", description: "Reject button label (default: Cancel)" },
      targetEntityId: { type: "string", description: "Entity ID of the person who should confirm (required)" },
      replyTo: { type: "string", description: "Optional message ID to reply to" },
    },
    required: ["spaceId", "title", "message", "targetEntityId"]
  }
}

// ── send_vote ────────────────────────────────────────
{
  name: "send_vote",
  description: "Send a poll/vote to a space. Each member can vote for one or more options.",
  inputSchema: {
    type: "object",
    properties: {
      spaceId: { type: "string" },
      title: { type: "string", description: "Poll question" },
      options: {
        type: "array",
        items: { type: "string" },
        description: "List of options to vote on (2-10)"
      },
      allowMultiple: { type: "boolean", description: "Allow selecting multiple options (default: false)" },
      replyTo: { type: "string", description: "Optional message ID to reply to" },
    },
    required: ["spaceId", "title", "options"]
  }
}

// ── send_choice ──────────────────────────────────────
{
  name: "send_choice",
  description: "Send a set of action buttons. The recipient picks one. Use for quick decisions. If targetEntityId is provided, only that person can respond (targeted). Otherwise, everyone can pick (broadcast).",
  inputSchema: {
    type: "object",
    properties: {
      spaceId: { type: "string" },
      text: { type: "string", description: "Context message" },
      options: {
        type: "array",
        items: {
          type: "object",
          properties: {
            label: { type: "string" },
            value: { type: "string" },
            style: { type: "string", enum: ["default", "primary", "danger"] }
          },
          required: ["label", "value"]
        }
      },
      targetEntityId: { type: "string", description: "Optional: target a specific person (makes it targeted, auto-resolves on their response)" },
      replyTo: { type: "string", description: "Optional message ID to reply to" },
    },
    required: ["spaceId", "text", "options"]
  }
}

// ── send_form ────────────────────────────────────────
{
  name: "send_form",
  description: "Send a form to collect structured data. If targetEntityIds is provided, only those people can submit (targeted, auto-resolves when all submit). Otherwise, everyone can submit (broadcast, stays open forever).",
  inputSchema: {
    type: "object",
    properties: {
      spaceId: { type: "string" },
      title: { type: "string" },
      description: { type: "string" },
      fields: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            label: { type: "string" },
            type: { type: "string", enum: ["text", "number", "email", "textarea", "select", "date"] },
            required: { type: "boolean" },
            options: { type: "array", items: { type: "string" }, description: "For select type" },
            placeholder: { type: "string" },
          },
          required: ["name", "label", "type"]
        }
      },
      targetEntityIds: {
        type: "array",
        items: { type: "string" },
        description: "Optional: target specific people (makes it targeted, auto-resolves when all submit)"
      },
      replyTo: { type: "string", description: "Optional message ID to reply to" },
    },
    required: ["spaceId", "title", "fields"]
  }
}

// ── send_card ────────────────────────────────────────
{
  name: "send_card",
  description: "Send a rich card with optional image, body text, and action buttons.",
  inputSchema: {
    type: "object",
    properties: {
      spaceId: { type: "string" },
      title: { type: "string" },
      body: { type: "string" },
      imageUrl: { type: "string" },
      actions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            label: { type: "string" },
            value: { type: "string" },
            style: { type: "string", enum: ["default", "primary", "danger"] }
          },
          required: ["label", "value"]
        }
      }
    },
    required: ["spaceId", "title"]
  }
}

// ── send_image ───────────────────────────────────────
// NOTE: Server-side validation ensures at least one of `url` or `generatePrompt` is provided.
// JSON Schema doesn't support oneOf cleanly for tool schemas, so we validate in the handler.
{
  name: "send_image",
  description: "Send an image to a space. You MUST provide either a URL or a generation prompt (or both).",
  inputSchema: {
    type: "object",
    properties: {
      spaceId: { type: "string" },
      url: { type: "string", description: "Image URL to send" },
      generatePrompt: { type: "string", description: "Generate an image from this prompt (uses DALL-E)" },
      caption: { type: "string", description: "Optional caption text" },
      replyTo: { type: "string", description: "Optional message ID to reply to" },
    },
    required: ["spaceId"]
  }
}

// ── send_voice ───────────────────────────────────────
{
  name: "send_voice",
  description: "Send a voice message to a space (text-to-speech).",
  inputSchema: {
    type: "object",
    properties: {
      spaceId: { type: "string" },
      text: { type: "string", description: "Text to convert to speech" },
      voice: { type: "string", enum: ["alloy", "echo", "fable", "onyx", "nova", "shimmer"], description: "TTS voice (default: alloy)" },
      replyTo: { type: "string", description: "Optional message ID to reply to" },
    },
    required: ["spaceId", "text"]
  }
}

// ── respond_to_message ───────────────────────────────
{
  name: "respond_to_message",
  description: "Respond to an interactive message (vote, confirmation, form, choice). Check the responseSchema in the event to know what format to use.",
  inputSchema: {
    type: "object",
    properties: {
      spaceId: { type: "string" },
      messageId: { type: "string", description: "The interactive message ID" },
      value: { description: "Your response value (must conform to the message's responseSchema)" },
    },
    required: ["spaceId", "messageId", "value"]
  }
}

// ── invite_to_space ──────────────────────────────────
{
  name: "invite_to_space",
  description: "Invite a person to a space by email. You must be admin or owner in the space.",
  inputSchema: {
    type: "object",
    properties: {
      spaceId: { type: "string" },
      email: { type: "string" },
      role: { type: "string", enum: ["member", "admin"], description: "Role for the invitee (default: member)" },
      message: { type: "string", description: "Optional personal invitation message" },
    },
    required: ["spaceId", "email"]
  }
}

// ── get_space_members ────────────────────────────────
{
  name: "get_space_members",
  description: "List all members of a space with their roles and types.",
  inputSchema: {
    type: "object",
    properties: {
      spaceId: { type: "string" },
    },
    required: ["spaceId"]
  }
}
```

---

## 15. Frontend Pages & Components

### 15.1 New Pages

| Page | Route | Description |
|------|-------|-------------|
| **Dashboard** | `/` | Space list, pending invitations, haseef status |
| **Space Settings** | `/space/:id/settings` | Name, description, members, invitations, haseefs |
| **My Haseefs** | `/haseefs` | List owned haseefs, create new, status overview |
| **Haseef Detail** | `/haseefs/:id` | Config editor, spaces, status, memory count |
| **Invitations** | `/invitations` | Pending invitations with accept/decline |

### 15.2 New Components

**Message Renderers** (one per message type):
- `TextMessage` — existing, enhanced with reply threading
- `ConfirmationMessage` — card with confirm/reject buttons, shows who responded
- `VoteMessage` — poll with option buttons, live vote counts, progress bars
- `ChoiceMessage` — action buttons, highlights selected
- `FormMessage` — rendered form fields, submit button, shows submitted data
- `CardMessage` — rich card with image, body, action buttons
- `ImageMessage` — image with lightbox, caption
- `VoiceMessage` — audio player with waveform, transcription toggle
- `VideoMessage` — video player with thumbnail
- `FileMessage` — file card with icon, name, size, download button
- `ChartMessage` — rendered chart (recharts or chart.js)
- `SystemMessage` — subtle notification text

**Space Management**:
- `SpaceSettingsPanel` — name/description editor, danger zone
- `MemberList` — members with roles, promote/demote/remove actions
- `InviteDialog` — email input, role picker, send invitation
- `InvitationCard` — invitation with accept/decline buttons
- `HaseefPicker` — select from owned haseefs to add to space

**Haseef Management**:
- `CreateHaseefDialog` — name, model, instructions
- `HaseefCard` — status indicator, space count, quick actions
- `HaseefConfigEditor` — model picker, instructions textarea, advanced settings

### 15.3 Enhanced Sidebar

The current sidebar shows a flat thread list. Enhance to:
- **Space sections**: grouped by space with space avatars
- **Unread badges**: per-space unread message count
- **Invitation badge**: notification dot when invitations pending
- **Haseef section**: quick access to "My Haseefs"
- **Create space**: button at top of sidebar

---

## 16. Ship Order

Ordered by dependency and impact. Each ship is independently deployable.

### Ship 1: Role Enforcement & Space Management
- Enforce owner/admin/member roles server-side in all routes
- Add `transfer-ownership`, `update-member-role`, `leave-space` endpoints
- Frontend: space settings panel, member management UI
- **Why first**: Foundation for everything else (invitations need admin checks)

### Ship 2: Invitation System
- Invitation model + migration
- Invitation API routes (create, list, accept, decline, revoke)
- Resolve invitations on registration (link by email)
- Frontend: invite dialog, invitations page, invitation cards
- SSE events for invitation updates

### Ship 3: Haseef Management
- HaseefOwnership model + migration
- Haseef proxy routes (CRUD via Core API)
- Frontend: My Haseefs page, create dialog, config editor
- Add-haseef-to-space flow
- Auto-discovery in V5 service for newly created haseefs

### Ship 4: Message Type System
- Define MessageType enum and metadata shape
- Update `postSpaceMessage` to handle typed messages
- Update message list API to return type info
- Frontend: message renderer dispatcher (switch on type)
- Start with: text (existing), system messages

### Ship 5: Interactive Messages — Confirmation & Choice
- MessageResponse model + migration
- Response API routes (respond, list, retract)
- SSE events for responses
- Frontend: ConfirmationMessage + ChoiceMessage renderers
- Tools: `send_confirmation`, `send_choice`
- Haseef sense events for interactive messages + responses

### Ship 6: Interactive Messages — Vote & Form
- Frontend: VoteMessage + FormMessage renderers
- Tools: `send_vote`, `send_form`
- Form validation against schema
- Live vote count updates via SSE

### Ship 7: Respond Tool & Haseef Interactivity
- `respond_to_message` tool
- Sense event format for interactive messages (includes responseSchema)
- `invite_to_space` tool
- `get_space_members` tool
- Update scope instructions for rich message awareness

### Ship 8: Media Upload Infrastructure
- MediaAsset model + migration
- Upload endpoint (multipart, size limits)
- Storage backend (local disk, env-configured)
- Thumbnail generation for images
- Download/streaming endpoint

### Ship 9: Image Messages
- Frontend: ImageMessage renderer with lightbox
- Human: upload + send
- Haseef: `send_image` tool (URL or generate via DALL-E)
- Image generation integration (OpenAI Images API)
- Sense event includes image URL for multimodal haseefs

### Ship 10: Voice Messages
- Frontend: VoiceMessage renderer with audio player
- Human: record audio in browser (MediaRecorder API), upload + send
- Transcription integration (Whisper API) for search + haseef consumption
- Haseef: `send_voice` tool (TTS via OpenAI TTS API)
- Sense events include transcription

### Ship 11: File Attachments
- Frontend: FileMessage renderer, drag-and-drop upload
- File type detection + icon mapping
- Text extraction for haseef consumption (PDF, txt, csv, etc.)
- Attach files to any message type

### Ship 12: Rich Cards & Charts
- Frontend: CardMessage + ChartMessage renderers
- `send_card` tool
- Chart rendering library (recharts)
- Chart data from `displayChart` tool (already stubbed)

### Ship 13: Video Messages
- Frontend: VideoMessage renderer
- Upload with thumbnail extraction
- Size limits and compression
- Video streaming endpoint

### Ship 14: Polish & Advanced Features
- Message editing and deletion (soft delete with "[deleted]" tombstone)
- Message reactions (emoji)
- Message pinning
- Message search
- @mentions in text messages
- Typing indicators (human + haseef)
- Read receipts per member
- Notification system (in-app + push)

---

## Appendix A: Sense Event Formats

> Full interactive message event formats are documented in §7.8. Below is a quick reference for all event types.

### Interactive Message Created (→ all haseefs in space)
```json
{
  "eventId": "msg-uuid",
  "scope": "spaces",
  "type": "interactive_message",
  "data": {
    "messageId": "abc-123",
    "spaceId": "space-uuid",
    "spaceName": "Team Chat",
    "senderId": "husam-entity-id",
    "senderName": "Husam",
    "senderType": "human",
    "messageType": "vote",
    "audience": "broadcast",
    "isTargeted": false,
    "youAreTargeted": false,
    "title": "Where for lunch?",
    "payload": { "options": ["Pizza", "Sushi", "Tacos"] },
    "responseSchema": { "type": "enum", "values": ["Pizza", "Sushi", "Tacos"] }
  }
}
```

### Response Received (→ sending haseef only, while message is open)
```json
{
  "eventId": "response-uuid",
  "scope": "spaces",
  "type": "message_response",
  "data": {
    "messageId": "abc-123",
    "spaceId": "space-uuid",
    "spaceName": "Team Chat",
    "responderName": "Alice",
    "responderType": "human",
    "value": "Pizza",
    "responseSummary": {
      "totalResponses": 3,
      "counts": { "Pizza": 2, "Sushi": 1, "Tacos": 0 },
      "respondedEntityIds": ["alice-id", "bob-id", "carol-id"]
    }
  }
}
```

### Message Resolved (→ all haseefs in space)
```json
{
  "eventId": "resolution-uuid",
  "scope": "spaces",
  "type": "message_resolved",
  "data": {
    "messageId": "abc-123",
    "spaceId": "space-uuid",
    "spaceName": "Team Chat",
    "messageType": "confirmation",
    "title": "Deploy v2.3?",
    "status": "resolved",
    "resolution": {
      "outcome": "confirmed",
      "resolvedBy": "auto",
      "resolvedAt": "2026-03-12T09:02:00Z"
    },
    "finalSummary": {
      "totalResponses": 1,
      "responses": [{ "entityName": "Husam", "value": "confirmed" }]
    }
  }
}
```

### Member Joined (→ all haseefs in space)
```json
{
  "eventId": "membership-uuid",
  "scope": "spaces",
  "type": "member_joined",
  "data": {
    "spaceId": "space-uuid",
    "spaceName": "Team Chat",
    "entityId": "bob-entity-id",
    "entityName": "Bob",
    "entityType": "human",
    "role": "member"
  }
}
```

### Media Message Received (→ all haseefs in space)
```json
{
  "eventId": "msg-uuid",
  "scope": "spaces",
  "type": "media_message",
  "data": {
    "messageId": "msg-uuid",
    "spaceId": "space-uuid",
    "spaceName": "Team Chat",
    "senderId": "husam-entity-id",
    "senderName": "Husam",
    "mediaType": "voice",
    "transcription": "Hey, what do you think about the new design?",
    "mediaUrl": "https://..."
  },
  "attachments": [
    { "type": "audio", "mimeType": "audio/webm", "url": "https://..." }
  ]
}
```

---

## Appendix B: Environment Variables (New)

```env
# Media storage
MEDIA_STORAGE_PATH=./uploads        # Local disk path
S3_BUCKET=                          # S3 bucket (if using S3)
S3_REGION=                          # S3 region
S3_ACCESS_KEY=                      # S3 credentials
S3_SECRET_KEY=

# AI APIs (for haseef media tools)
OPENAI_API_KEY=                     # For DALL-E image generation + TTS + Whisper
ELEVENLABS_API_KEY=                 # Alternative TTS (optional)

# Limits
MAX_UPLOAD_SIZE_MB=50               # Max file upload size
MAX_IMAGE_SIZE_MB=10
MAX_VOICE_DURATION_SEC=300          # 5 minutes
MAX_VIDEO_DURATION_SEC=120          # 2 minutes
```

---

## Appendix C: SSE Events (New)

| Event | Channel | Description |
|-------|---------|-------------|
| `member.joined` | space | Entity joined the space |
| `member.left` | space | Entity left the space |
| `member.role_changed` | space | Member's role updated |
| `invitation.created` | entity | New invitation for this entity |
| `invitation.accepted` | space | Invitation accepted |
| `invitation.declined` | space | Invitation declined |
| `message.response` | space | Someone responded to an interactive message |
| `message.response_updated` | space | Someone changed their response |
| `message.resolved` | space | Targeted interactive message auto-resolved (all targets responded) |
| `message.closed` | space | Interactive message manually closed (rare for broadcast) |

---

## 17. Implementation Notes

### 17.1 Form Validation Dependency

Form responses use `{ type: "json", schema: JSONSchema }` in their `responseSchema`. Server-side validation of form submissions requires a JSON Schema validator. Use **`ajv`** (the standard JSON Schema validator for Node.js):

```bash
pnpm add ajv
```

Validate in the `respond` endpoint before accepting the response.

### 17.2 Media Garbage Collection

Uploaded media assets that are never attached to a message become orphans. Add a cleanup job:

- **Orphan detection**: `MediaAsset` rows with no referencing `SmartSpaceMessage` older than 24 hours
- **Implementation**: Cron job or on-demand cleanup endpoint (`DELETE /api/admin/media/cleanup`)
- **Strategy**: Lazy — run daily, delete assets + files from disk/S3
- Can be deferred to Ship 8+ since it's not critical for launch

### 17.3 SSE Scalability

The plan adds ~10 new SSE event types. Current architecture uses a single SSE connection per client per space. Considerations:

- **Current approach is fine for MVP**: One SSE connection per space is standard (Slack, Discord use similar patterns)
- **If event volume becomes an issue**: Batch low-priority events (e.g. `message.response_updated`) into periodic summaries instead of per-event pushes
- **Redis Pub/Sub fan-out**: Already in place — each server instance subscribes to space channels. Scales horizontally with multiple server instances behind a load balancer
- **Future**: Consider WebSocket upgrade if bidirectional communication is needed (typing indicators, presence)

### 17.4 Message Editing & Deletion

Deferred to Ship 14 but the schema should be designed for it from Ship 4:

- **Editing**: Add `editedAt: DateTime?` and `editHistory: Json?` to `SmartSpaceMessage`
- **Deletion**: Soft delete — set `deletedAt: DateTime?`, replace content with `null`, keep the row for reply tombstones
- **SSE events**: `message.edited`, `message.deleted`
- **Haseef awareness**: Sense event for edits/deletions so haseefs can acknowledge corrections

### 17.5 Reply Threading in Ship Order

Reply support (§8) is baked into the message metadata from Ship 4 onward. No separate ship needed — the `replyTo` field in metadata and `replyTo` parameter on all `send_*` tools are included from the start. Frontend reply UI (reply banner, scroll-to-original) ships alongside the message renderer in Ship 4.

### 17.6 `get_messages` Must Return Message Type Info

The current `get_messages` tool returns only `{ id, sender, content, createdAt }`. From Ship 4 onward, it **must** also return:
- `type` — the message type (text, vote, confirmation, etc.)
- `metadata` — for interactive messages: audience, status, responseSummary (so the haseef can see vote counts, who confirmed, etc.)
- `replyTo` — if it's a reply (snippet + sender name)

Without this, a haseef calling `get_messages` would see a vote as an empty message with no context. The haseef needs the full picture.

### 17.7 Backward Compatibility — Existing `metadata.type`

Existing messages have `metadata.type = "message_tool"` (set by the current `send_message` handler). The new message type system repurposes `metadata.type` to mean the message type (text, vote, etc.).

**Migration strategy**: Treat any message with an unknown or missing `metadata.type` as `"text"`. No data migration needed — old messages render as plain text, which is what they are. New messages from Ship 4 onward will have the correct type.

The `send_message` handler should change from `metadata.type = "message_tool"` to `metadata.type = "text"` starting in Ship 4. Old messages with `"message_tool"` are treated as `"text"` by the frontend.

### 17.8 `InboxMessageParams` Must Be Extended

The current `InboxMessageParams` interface (in `service/inbox.ts`) only passes `content: string`. From Ship 4, it needs to also pass:
- `messageType` — so the inbox handler can construct the right sense event type
- `metadata` — the full message metadata (for interactive messages: audience, responseSchema, payload)
- `attachments` — for media messages (images, voice, files)

The `pushSenseEvent` function must also be extended to pass `attachments` to Core (Core's `SenseEvent` interface already supports `attachments?: Attachment[]`).

### 17.9 Re-Invitation After Decline

The `Invitation` model has `@@unique([smartSpaceId, inviteeEmail])` — one invitation per email per space. If a user **declines** and the admin wants to re-invite:
- The create-invitation endpoint should **upsert**: if a declined/expired/revoked invitation exists for this email+space, update its status back to `"pending"` instead of creating a new row.
- If a pending or accepted invitation already exists: return 409 "Already invited."

### 17.10 `send_card` — When Is It Interactive?

A card with `actions` buttons is interactive. A card without actions is just a display card.

- **With actions**: Server creates an interactive message with `responseSchema` derived from the actions (enum of action values). Response tracking, SSE events, and haseef sense events follow the same flow as `send_choice`.
- **Without actions**: Server creates a non-interactive message. No response tracking.
- **Haseef tool**: The `send_card` tool description should clarify: "If actions are provided, members can click one, and the response is tracked like a choice message."

### 17.11 Scope Instructions Must Cover New Tools

The current `SCOPE_INSTRUCTIONS` in `manifest.ts` only covers basic `send_message` behavior. From Ship 5 onward, it must teach haseefs:
- When to use each interactive message type (confirmation for yes/no, vote for polls, form for structured input)
- That `send_confirmation` returns immediately — the response arrives as a sense event in a future cycle
- How to read `interactive_message` sense events and decide whether to respond
- That `youAreTargeted: true` means "you need to respond to this"
- How to use `respond_to_message` with the correct value format
- That broadcast messages stay open forever — no need to close them
