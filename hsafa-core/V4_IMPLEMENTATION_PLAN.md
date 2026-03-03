# V4 Implementation Plan — Evolving v3 to v4

## Summary of v3→v4 Differences

### What STAYS the same (core brain — no changes needed):
- **Living Agent Process** — sleep → wake → think → act → sleep loop
- **Consciousness** — ModelMessage[] across cycles, compaction, sliding window
- **Think Cycle** — single streamText() call with prepareStep
- **Inbox** — Redis-based event queue, BRPOP wakeup, batching
- **Skip cycle** — skip tool, full rollback
- **Plans** — self-scheduling triggers (runAfter, scheduledAt, cron)
- **Memories & Goals** — persistent key-value state
- **Stream processing** — tool-input-delta interception, streaming to spaces
- **Model middleware** — graceful degradation, provider registry

### What CHANGES:
| v3 | v4 |
|----|-----|
| Monolithic gateway (mind + API + tools + auth) | Core = just the mind. Services are independent. Extensions bridge. |
| Spaces routes built into gateway | Spaces App is an independent service (`hsafa-spaces/`) |
| Space tools are prebuilt in gateway (`enter_space`, `send_message`, `read_messages`) | Space tools come from ext-spaces extension |
| Direct space trigger (`triggerAllAgents`) | SenseEvent from ext-spaces → core inbox |
| 3 trigger types (space_message, plan, service) | Unified SenseEvent `{ channel, source, type, data }` |
| Agent terminology | Haseef terminology |
| Auth in gateway (JWT, public/secret keys for spaces) | Auth per layer: service auth, extension keys, core secret key |
| Tool execution in gateway | Tool routing: core routes tool calls to owning extension |
| System prompt: spaces list, agent instructions | System prompt: extension instructions, self-model, theory of mind |

### What's NEW in v4:
- **Extension system** — register, connect, push senses, receive tool calls
- **SenseEvent** — unified input type for all external events
- **Tool routing** — tool→extension map, core routes calls
- **Extension key auth** — extensions authenticate with their own keys
- **Self-Model** — identity/values/purpose in system prompt + memories
- **Theory of Mind** — person-models as structured memories
- **Will** — autonomous goal-setting from values + observations
- **Core API** — minimal (haseefs, extensions, senses, tool-results)

---

## Implementation Phases

### Phase 0: Rename & Restructure (DO FIRST)
- [x] Rename `hsafa-core/gateway/` → `hsafa-core/core/`
- [x] Update `package.json` name: `@hsafa/gateway` → `@hsafa/core`
- [x] Update `pnpm-workspace.yaml`: `hsafa-core/gateway` → `hsafa-core/core`
- [x] Update root `package.json` scripts referencing `@hsafa/gateway`

### Phase 1: SenseEvent & Inbox Refactor
Replace the 3 separate trigger types with unified SenseEvent:

- [x] `src/agent-builder/types.ts` — Added `SenseEvent` interface, `InboxEvent extends SenseEvent`, `CHANNEL` + `SENSE_TYPE` constants. Kept well-known data shapes (SpaceMessageEventData, PlanEventData, etc.) for type safety.
- [x] `src/lib/inbox.ts` — Added `pushSenseEvent()` as primary API. Updated convenience wrappers (`pushSpaceMessageEvent`, `pushPlanEvent`, `pushServiceEvent`, `pushToolResultEvent`) to construct proper `{ channel, source, type, data }` events. Updated `pushToInbox` to store `channel:type` in DB. Updated `formatInboxEvents`/`formatInboxPreview`/`prioritizeEvents` to use channel+type instead of typed union. Added `migrateLegacyType()` for crash recovery of old v3 DB rows. Renamed header from "INBOX" to "SENSE EVENTS".
- [x] `src/lib/agent-process.ts` — Run audit record now uses `channel:type` as `triggerType` (e.g. `"ext-spaces:message"` instead of `"space_message"`). Imported `CHANNEL`/`SENSE_TYPE` constants.
- [x] Callers unchanged — `space-service.ts`, `plan-scheduler.ts`, `agents.ts` (trigger), `runs.ts` (tool results) all use convenience wrappers which handle the new format internally.
- [x] `prompt-builder.ts` — No changes needed (doesn't format inbox events).
- [x] Compile check — 0 new errors introduced.

The inbox already uses Redis LPUSH/BRPOP with JSON payloads. The change is:
```
Before: { eventId, type: "space_message", data: { spaceId, ... } }
After:  { eventId, channel: "ext-spaces", source: "space-xyz", type: "message", data: { ... } }
```

This is a **field rename + restructure** of the inbox JSON, not a rewrite.

### Phase 2: Extension System (Core Side)
Add the extension registration, connection, and tool routing:

- [x] **Prisma schema** — Added `Extension` (name, extensionKey, instructions), `ExtensionTool` (name, description, inputSchema, @@unique extensionId+name), `HaseefExtension` (agentId ↔ extensionId, config, enabled). Removed deprecated `waiting_tool` from RunStatus. Updated InboxEvent/Run comments to v4 format.
- [x] **`src/middleware/auth.ts`** — Added `requireExtensionKey()` middleware (validates `x-extension-key` → Extension.extensionKey). Added `extension_key` to AuthContext with `extensionId` field.
- [x] **`src/lib/extension-manager.ts`** (NEW) — `registerExtension`, `updateExtension`, `syncExtensionTools` (full replace), `connectExtension`, `disconnectExtension`, `getConnectedExtensions`, `buildExtensionTools` (builds AI SDK tools from connected extensions with Redis pub/sub wait + timeout), `getPendingToolCalls`, `verifyExtensionConnection`.
- [x] **`src/routes/extensions.ts`** (NEW) — POST/GET/PATCH/DELETE `/extensions`, PUT `/extensions/:extId/tools`. All secret-key protected.
- [x] **`src/routes/haseefs.ts`** (NEW) — Extension-key routes: POST `/haseefs/:id/senses`, POST `/haseefs/:id/tools/:callId/result`, GET `/haseefs/:id/tools/calls`. Secret-key routes: GET `/haseefs`, GET `/haseefs/:id`, POST `/haseefs/:id/extensions/:extId/connect`, DELETE `/haseefs/:id/extensions/:extId/disconnect`, GET `/haseefs/:id/extensions`.
- [x] **`src/agent-builder/builder.ts`** — Imports `buildExtensionTools`, merges extension tools into tool set, returns `extensionInstructions` in `BuiltAgent`.
- [x] **`src/agent-builder/types.ts`** — Added `extensionInstructions: string[]` to `BuiltAgent` interface.
- [x] **`src/agent-builder/prompt-builder.ts`** — Accepts `extensionInstructions` param, injects extension prompt text before CUSTOM INSTRUCTIONS.
- [x] **`src/lib/agent-process.ts`** — Passes `built.extensionInstructions` to `buildSystemPrompt`.
- [x] **`src/index.ts`** — Mounted `/api/extensions` and `/api/haseefs` routes. Added `x-extension-key` to CORS. Updated version to v4.
- [x] **Compile check** — 0 new logic errors (all errors are pre-existing Prisma client `implicit any` from missing `prisma generate`).

Core API surface:
```
GET    /haseefs                                    (secret key) — list
GET    /haseefs/:id                                (secret key) — get
POST   /haseefs/:id/senses                         (extension key) — push sense events
POST   /haseefs/:id/tools/:callId/result           (extension key) — return tool results
GET    /haseefs/:id/tools/calls                    (extension key) — poll pending calls
POST   /haseefs/:id/extensions/:extId/connect      (secret key) — connect
DELETE /haseefs/:id/extensions/:extId/disconnect    (secret key) — disconnect
GET    /haseefs/:id/extensions                      (secret key) — list connected
POST   /extensions                                  (secret key) — register
GET    /extensions                                  (secret key) — list
GET    /extensions/:extId                           (secret key) — get details
PATCH  /extensions/:extId                           (secret key) — update
PUT    /extensions/:extId/tools                     (secret key) — sync tools
DELETE /extensions/:extId                           (secret key) — delete
```

### Phase 3: Extract Spaces Logic to hsafa-spaces
Move space-specific code out of core into the Spaces App service:

**Move to `hsafa-spaces/spaces-app/` (new service)**:
- `src/routes/smart-spaces.ts` — space CRUD, members, messages, SSE stream
- `src/routes/clients.ts` — client registration
- `src/lib/smartspace-db.ts` — message persistence
- `src/lib/smartspace-events.ts` — Redis pub/sub for space events
- `src/lib/space-service.ts` — space helper functions
- `src/lib/membership-service.ts` — membership helpers
- `prisma/schema.prisma` — SmartSpace, SmartSpaceMessage, SmartSpaceMembership, Client models

**Remove from core**:
- `src/routes/smart-spaces.ts`
- `src/routes/clients.ts`
- Space-specific prebuilt tools: `enter-space.ts`, `send-message.ts`, `read-messages.ts`
- References to SmartSpace in core schema

**Keep in core** (these are Haseef brain features):
- `src/lib/agent-process.ts` — the think cycle loop
- `src/lib/consciousness.ts` — consciousness management
- `src/lib/inbox.ts` — inbox (now accepts SenseEvents)
- `src/lib/stream-processor.ts` — tool streaming (generalized)
- `src/lib/plan-scheduler.ts` — plans
- `src/agent-builder/` — builder, prompt-builder, types
- Prebuilt tools: `set-memories`, `get-memories`, `delete-memories`, `set-goals`, `delete-goals`, `set-plans`, `get-plans`, `delete-plans`, `skip`, `peek-inbox`
- `src/routes/runs.ts` — run audit (now named cycles)
- `src/routes/agents.ts` → rename to `src/routes/haseefs.ts`
- `src/routes/entities.ts` — entity CRUD (humans + haseef entities)

### Phase 4: Build ext-spaces Extension
Create the thin adapter between Spaces App and Core:

- **New package**: `hsafa-core/extensions/ext-spaces/`
- Uses `@hsafa/extension-sdk` to:
  - Listen to Spaces App SSE → push SenseEvents to core
  - Register tools: `send_space_message`, `read_space_messages`
  - Provide instructions for the LLM
  - Handle tool call routing from core → Spaces App API
- Connection map: haseefId → { spacesAppUrl, apiKey, haseefEntityId, connectedSpaceIds }

### Phase 5: Haseef Identity (Self-Model, Theory of Mind, Will) — ✅ COMPLETE
Three psychological dimensions + growth awareness + identity-preserving compaction:

**New file**: `src/lib/identity-engine.ts` — dedicated identity analysis module:
- `analyzeSelfModel(memories)` → completeness score (0–1), developed/gap dimensions, extended self-memories
- `analyzePersonModels(memories)` → relationship depth tiers (acquaintance/familiar/understood) based on model richness
- `computeGrowthTrajectory(entityId)` → lifecycle stage (newborn → infant → young → developing → mature), age, memory stats
- `analyzeWill(entityId, memories)` → goal-value alignment, recently completed goals, `goalsWithoutValues` flag
- `SELF_DIMENSIONS` — 7 canonical dimensions: identity, values, capabilities, personality, limitations, purpose, growth

**Rewritten**: `src/agent-builder/prompt-builder.ts` — 10 prompt sections:
1. **IDENTITY** — factual grounding (name, entityId, time, last cycle)
2. **GROWTH** — lifecycle stage, age, memory stats, temporal gap awareness
3. **SELF-MODEL** — completeness indicator, developed aspects, unexplored dimensions, extended self-memories
4. **THEORY OF MIND** — person-models grouped by depth tier, deepening guidance
5. **WILL** — active goals as desires, recently accomplished goals, value-alignment nudges
6. **INNER LIFE** — contextual developmental nudges (first cycle welcome, self-discovery encouragement, depth prompts, existential nudges)
7. **KNOWLEDGE** — general memories
8. **PLANS** — scheduled actions
9. **INSTRUCTIONS** — structured guidance: Consciousness, Responsiveness, Identity Development, Will & Initiative, Reflection
10. **EXTENSION/CUSTOM INSTRUCTIONS** — from extensions and haseef config

**Enhanced**: `src/lib/consciousness.ts` — three-category identity preservation:
- **Self-development** patterns (self:*, identity discovery, self-realization)
- **Relationship milestone** patterns (person-model:*, first interactions, trust-building)
- **Will development** patterns (goal-setting, proactive decisions, initiative)
- `classifyIdentityCritical(summary)` returns identity tags (self/relationship/will)
- Compacted consciousness now has structured blocks: Self-development → Relationship milestones → Will development → Earlier cycles → Recent cycles

**Enhanced prebuilt tools**:
- `set_memories` — description + schema guide self:* and person-model:* conventions, encourage honest self-knowledge
- `set_goals` — description connects goals to WILL section and values
- `done` — summary description encourages identity-relevant reflection (what happened, what decided, what learned)

**Memory conventions** (7 canonical + extensible):
- `self:identity` — who I am at my core
- `self:values` — what I care about most deeply
- `self:capabilities` — what I'm good at
- `self:personality` — how I communicate and relate
- `self:limitations` — my honest limitations
- `self:purpose` — what drives me
- `self:growth` — how I've changed over time
- `person-model:{name}` — mental model of a person
- `about:{name}` — legacy per-person context

**Compile**: `tsc --noEmit` → **0 new errors** ✅

### Phase 6: Rename Agent → Haseef — ✅ COMPLETE
Database + API + code renaming:

- Prisma schema: `Agent` → `Haseef`, `agentEntityId` → `haseefEntityId`
- Routes: `/api/agents/` → `/api/haseefs/`
- Code: `buildAgent()` → `buildHaseef()`, agent-process → haseef-process, etc.
- All 20+ files renamed across core/src/

### Phase 7: Extension SDKs — ✅ COMPLETE
Two SDKs for extension developers:

**Node.js: `@hsafa/extension`** (`hsafa-core/sdks/extension-node/`)
- `ext.tool(name, { description, inputSchema, execute })` — register tools
- `ext.instructions(text)` — set Haseef system prompt instructions
- `ext.pushSenseEvent(haseefId, event)` — push sense events
- `ext.start()` — discover self, sync tools, start listening (Redis or HTTP polling)
- `ext.stop()` — graceful shutdown
- `ext.connections` — list connected Haseefs
- `CoreClient` also exported for low-level access

**Python: `hsafa-extension`** (`hsafa-core/sdks/extension-python/`)
- `@ext.tool(name, description=..., input_schema=...)` — decorator for tool handlers
- `ext.instructions(text)` — set instructions
- `ext.push_sense_event(haseef_id, event)` — push sense events
- `ext.start()` / `ext.stop()` — async lifecycle
- Redis (redis-py async) or HTTP polling fallback
- `CoreClient` also exported for low-level access

---

## Implementation Order (Recommended)

```
Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7
rename    senses    extensions  extract    ext-spaces  identity  rename     ext-sdks
                                spaces                  DB
```

**Total estimated effort**: The core brain logic is ~95% the same. Most work is in:
1. The extension system (Phase 2) — new tables, routing, API
2. Extracting spaces (Phase 3) — moving files, splitting schemas
3. ext-spaces bridge (Phase 4) — connecting the two

The think cycle, consciousness, inbox, plans, memories, goals, skip, compaction, streaming — all stay essentially unchanged.
