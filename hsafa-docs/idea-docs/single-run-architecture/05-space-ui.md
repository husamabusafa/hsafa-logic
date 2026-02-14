# Composite Messages & Tool Visibility

## The Composite Message Model

A run produces a **single composite message per space**. Every visible tool call within a run adds a **part** to that message. The human sees one cohesive message — not separate bubbles for each tool call.

### How Parts Accumulate

```
Run triggered from Shopping Space

Agent calls sendSpaceMessage(shopSpace, "Here are some laptops:")     → text part
Agent calls showProductCard({ name: "MacBook Pro", price: 1299 })     → UI part (client tool)
Agent calls showProductCard({ name: "Dell XPS 15", price: 1199 })     → UI part (client tool)
Agent calls sendSpaceMessage(shopSpace, "Want me to add any?")        → text part
Agent calls searchInventory({ query: "laptop" })                      → hidden (server tool)

Run completes → message finalized
```

**What the human sees — one message:**
```
Shop Agent:
  Here are some laptops:
  [Product Card: MacBook Pro — $1,299]
  [Product Card: Dell XPS 15 — $1,199]
  Want me to add any to your cart?
```

### Message Structure in DB

```json
{
  "id": "msg-123",
  "spaceId": "shopSpace",
  "entityId": "shop-agent-entity",
  "runId": "run-abc",
  "parts": [
    { "type": "text", "text": "Here are some laptops:" },
    { "type": "tool_call", "toolName": "showProductCard", "toolCallId": "call-1", "args": { "name": "MacBook Pro", "price": 1299 }, "result": null },
    { "type": "tool_call", "toolName": "showProductCard", "toolCallId": "call-2", "args": { "name": "Dell XPS 15", "price": 1199 }, "result": null },
    { "type": "text", "text": "Want me to add any to your cart?" }
  ]
}
```

Client tool results are filled in when the user interacts (e.g., clicks "Select" on a product card).

### Rules

- **Same space** → parts accumulate into one composite message
- **Different space** → separate composite message per space (each space gets its own message from this run)
- **`sendSpaceMessage`** → adds a `text` part (the `text` argument streams via `tool-input-delta`)
- **Client/UI tools** → add a `tool_call` part (rendered inline by the client SDK). Defaults to the **trigger space's** message, but can target any space via `targetSpaceId` (see Tool Call Routing below)
- **Server tools with visibility** → same routing rules. `hidden` tools are not added as parts. `minimal`/`full` tools appear as tool-card parts in the target space
- **`sendSpaceMessage` with `mention`** → finalizes the current composite message for that space, then triggers the mentioned agent's new run (which produces its own composite message)

---

## Tool Visibility

Not all tools should be visible to the human. Each tool has a visibility level that controls whether it appears as a part in the composite message.

### Visibility Levels

| Level | What the human sees | Use for |
|-------|-------------------|---------|
| `hidden` | Nothing — tool call is invisible | Internal tools (`readSpaceMessages`, `getMyRuns`, helper tools) |
| `minimal` | Tool name + status (calling → done) | Server tools where you want transparency (`queryBudgetAPI`, `searchInventory`) |
| `full` | Tool name, arguments, and result | Debug/admin visibility |

### Default Visibility by Tool Type

| Tool | Visibility | Reason |
|------|-----------|--------|
| `sendSpaceMessage` | Special — streams `text` as a text part, tool mechanics invisible | The message IS the visible output |
| `delegateToAgent` | `hidden` | Silent handoff, run gets canceled |
| `skipResponse` | `hidden` | Silent, no output |
| `readSpaceMessages` | `hidden` | Internal data gathering |
| `getMyRuns` | `hidden` | Internal awareness |
| Client/UI tools | Always visible | The whole point is custom UI |
| Server-side tools (HTTP, MCP, etc.) | Configurable per tool: `hidden` \| `minimal` \| `full` | Owner decides |

### Tool Visibility Configuration

Tool visibility is set per tool in the agent's tool config:

```json
{
  "name": "queryBudgetAPI",
  "executionType": "http",
  "visibility": "minimal",
  ...
}
```

Default is `hidden` for server-side tools. Prebuilt tools and client tools have fixed visibility (see table above).

---

## Tool Call Routing (`targetSpaceId`)

By default, tool call parts appear in the **trigger space's** composite message. But the agent can route any tool call to a specific space (or multiple spaces) using `targetSpaceId` or `targetSpaceIds`.

### How It Works

The gateway **auto-injects** `targetSpaceId` and `targetSpaceIds` as optional parameters into every tool's input schema at build time. The tool creator never adds them manually.

**Tool creator defines:**
```json
{
  "name": "showApprovalForm",
  "executionType": "basic",
  "execution": { "mode": "no-execution" },
  "inputSchema": {
    "properties": {
      "amount": { "type": "number" },
      "description": { "type": "string" }
    }
  }
}
```

**Gateway auto-injects at build time (what the LLM sees):**
```json
{
  "properties": {
    "amount": { "type": "number" },
    "description": { "type": "string" },
    "targetSpaceId": {
      "type": "string",
      "description": "Optional: space to show this tool call in. Defaults to trigger space."
    },
    "targetSpaceIds": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Optional: show this tool call in multiple spaces."
    }
  }
}
```

**Gateway strips** `targetSpaceId`/`targetSpaceIds` from the args before passing to the tool's `execute` function — the tool itself never sees them.

### Routing Rules

| `targetSpaceId` | `targetSpaceIds` | Where the part appears |
|---|---|---|
| Omitted | Omitted | Trigger space (default) |
| Set | — | That specific space's composite message |
| — | Set | Each listed space gets the part in its own composite message |

### Applies to All Tool Types

- **Client/UI tools** → UI renders in the target space. That space's client handles the interaction (`run.waiting_tool` relayed there).
- **Server tools with `minimal`/`full` visibility** → tool card appears in the target space's composite message.
- **`sendSpaceMessage`** → already has its own `spaceId`, so `targetSpaceId` is not injected (not needed).
- **Prebuilt tools** (`readSpaceMessages`, `getMyRuns`, etc.) → always `hidden`, so routing is irrelevant.

---

## Which Space Sees What?

| Scenario | Where it appears |
|----------|------------------|
| `sendSpaceMessage(spaceA, "text")` | Text part in spaceA's composite message |
| `showProductCard({ ... })` (no targetSpaceId) | UI part in the **trigger space's** composite message |
| `showProductCard({ ..., targetSpaceId: spaceB })` | UI part in **spaceB's** composite message |
| `showAlert({ ..., targetSpaceIds: [spaceA, spaceB] })` | UI part in **both** spaceA and spaceB composite messages |
| `queryBudgetAPI(...)` (server tool, `minimal`) | Tool-card part in the **trigger space's** composite message |
| `queryBudgetAPI({ ..., targetSpaceId: spaceB })` (`minimal`) | Tool-card part in **spaceB's** composite message |
| `readSpaceMessages(spaceB)` (prebuilt, `hidden`) | Nowhere — invisible |

---

## How Event Relay Works

Since runs are general (not space-bound), UI visibility depends on **event relay**. The gateway relays run events to the appropriate space's SSE channel based on routing.

1. Run triggered by Space X → gateway notes `triggerSpaceId = spaceX`
2. Agent calls `sendSpaceMessage(spaceX, ...)` → `text-delta` events stream to Space X (text part)
3. Agent calls `showProductCard(...)` (no targetSpaceId) → events relay to Space X (default)
4. Agent calls `showApprovalForm({ ..., targetSpaceId: spaceY })` → events relay to **Space Y** instead
5. Space Y subscribers render the approval form. User clicks "Approve" → submits result.
6. Run resumes, agent continues
7. Agent calls `sendSpaceMessage(spaceX, "Budget approved!")` → text streams into Space X's composite message

### Streaming Order

Parts stream in order as the agent executes:
1. **text-delta** events for first `sendSpaceMessage` → client starts composite message, appends text
2. **tool-input-available** for tool calls → client renders UI component inline (in the correct space per routing)
3. **text-delta** events for subsequent `sendSpaceMessage` → client appends more text
4. **run.completed** → composite message(s) finalized

All parts within the same space appear in one message bubble.

---

## Cross-Space UI Pattern

With `targetSpaceId`, cross-space UI is simple — the agent directly routes tool calls to any space it's a member of:

```
Agent triggered from Space A (CEO's space)

1. sendSpaceMessage(spaceA, "I'll send the budget for approval to finance.")
   → text part in spaceA's composite message

2. showApprovalForm({ targetSpaceId: financeSpace, amount: 50000, description: "Q4 marketing" })
   → UI part in financeSpace's composite message
   → run.waiting_tool relayed to financeSpace
   → Finance team member sees the approval form in their space

3. Finance member clicks "Approve" → result submitted

4. sendSpaceMessage(spaceA, "Budget approved by finance!")
   → text part appended to spaceA's composite message
```

No agent-to-agent delegation needed for cross-space UI. The agent just routes the tool call directly.

For cases where the agent needs another agent to **reason** about something in a different space, use `sendSpaceMessage` with `mention` + `wait` (triggers a new run for the other agent). But for just showing UI, `targetSpaceId` is simpler.

---

## Targeted UI (Future Enhancement)

For cases where the agent wants to show UI to a specific entity (not the whole space), we could add a `targetEntityId` field:

```json
showProductCard({
  targetSpaceId: "spaceA",
  targetEntityId: "specific-user-entity-id",
  productId: "mac-air",
  name: "MacBook Air M4"
})
```

The SSE event would include `targetEntityId`, and clients would filter: only render the UI if the current user's entity matches. This is a future enhancement — not needed for v1.
