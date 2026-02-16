# Composite Messages & Display Tools

## The Composite Message Model

A run produces a **single composite message per space**. Every display-enabled tool call within a run can add a **part** to that message. The human sees one cohesive message — not separate bubbles for each tool call.

### How Parts Accumulate

```
Run triggered from Shopping Space

Agent calls sendSpaceMessage(shopSpace, "Here are some laptops:")     → text part
Agent calls showProductCard({ name: "MacBook Pro", price: 1299, targetSpaceId: shopSpace })     → UI part (client tool)
Agent calls showProductCard({ name: "Dell XPS 15", price: 1199, targetSpaceId: shopSpace })     → UI part (client tool)
Agent calls sendSpaceMessage(shopSpace, "Want me to add any?")        → text part
Agent calls searchInventory({ query: "laptop", targetSpaceId: opsSpace }) → tool part in opsSpace (displayTool: true)

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
- **Tools with `displayTool: true`** → can add a `tool_call` part when the AI provides `targetSpaceId`
- **No `targetSpaceId`** → tool executes normally but no space message part is created
- **`sendSpaceMessage` with `mention`** → finalizes the current composite message for that space, then triggers the mentioned agent's new run (which produces its own composite message)

---

## Display Tools and Routing (`displayTool` + `targetSpaceId`)

Tool display is controlled by a top-level config flag:

- `displayTool: true` → gateway auto-injects optional `targetSpaceId` into that tool's input schema
- `displayTool: false` (or omitted) → no injection, tool stays internal to the run stream

### How It Works

The tool creator does **not** add `targetSpaceId` manually. They only set `displayTool: true`.

**Tool creator defines:**
```json
{
  "name": "showApprovalForm",
  "executionType": "basic",
  "displayTool": true,
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
      "description": "Optional: space to show this tool call in. If omitted, tool call is not shown in any space."
    }
  }
}
```

**Gateway strips** `targetSpaceId` from args before passing to the tool's `execute` function — the tool itself never sees it.

### Routing Rules

| `displayTool` | `targetSpaceId` | Where the part appears |
|---|---|---|
| `false` / omitted | any | Nowhere (internal tool execution only) |
| `true` | omitted | Nowhere (silent tool call) |
| `true` | set | That specific space's composite message |

### Applies to All Tool Types

- **Client/UI tools** → UI renders in the target space. That space's client handles the interaction (`run.waiting_tool` relayed there).
- **Server tools** → tool call/result card appears in the target space when `targetSpaceId` is set.
- **`sendSpaceMessage`** → already has its own `spaceId`, so `targetSpaceId` is not injected (not needed).
- **Prebuilt tools** (`readSpaceMessages`, `getMyRuns`, etc.) → internal by design unless explicitly modeled as display tools.

---

## Which Space Sees What?

| Scenario | Where it appears |
|----------|------------------|
| `sendSpaceMessage(spaceA, "text")` | Text part in spaceA's composite message |
| `showProductCard({ ... })` with `displayTool: true` (no targetSpaceId) | No space part (silent tool call) |
| `showProductCard({ ..., targetSpaceId: spaceB })` | UI part in **spaceB's** composite message |
| `queryBudgetAPI(...)` with `displayTool: true` (no targetSpaceId) | No space part (silent tool call) |
| `queryBudgetAPI({ ..., targetSpaceId: spaceB })` with `displayTool: true` | Tool-call part in **spaceB's** composite message |
| `readSpaceMessages(spaceB)` | Nowhere — internal only |

---

## How Event Relay Works

Since runs are general (not space-bound), UI visibility depends on **event relay**. The gateway relays run events to the appropriate space's SSE channel based on routing.

1. Run triggered by Space X → gateway notes `triggerSpaceId = spaceX`
2. Agent calls `sendSpaceMessage(spaceX, ...)` → `text-delta` events stream to Space X (text part)
3. Agent calls `showProductCard(...)` (no targetSpaceId) → no space relay for that tool call
4. Agent calls `showApprovalForm({ ..., targetSpaceId: spaceY })` → events relay to **Space Y**
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

With `targetSpaceId`, cross-space UI is simple — the agent directly routes display tools to any space it's a member of:

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

No agent-to-agent delegation needed for cross-space UI. The agent just routes the display tool directly.

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
