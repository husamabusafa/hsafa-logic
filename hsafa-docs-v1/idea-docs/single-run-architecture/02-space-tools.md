# Space Tools

The agent interacts with ALL spaces (including the trigger space) through these tools. There is no implicit "respond" — every communication is explicit.

---

## 1. `readSpaceMessages`

Read recent messages from any space the agent is a member of.

```json
{
  "name": "readSpaceMessages",
  "description": "Read recent messages from a space you are a member of. Use this to understand context before sending a message.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "spaceId": {
        "type": "string",
        "description": "ID of the space to read from"
      },
      "limit": {
        "type": "number",
        "description": "Number of recent messages to read (default 15, max 50)",
        "default": 15
      }
    },
    "required": ["spaceId"]
  }
}
```

**Returns:** Array of `{ sender, type, text, timestamp }`. The agent sees who said what and when.

**Implementation:** Server-side prebuilt tool. Validates agent membership in the target space. Queries `SmartSpaceMessage` table. Returns formatted messages with sender display names.

---

## 2. `sendSpaceMessage` (Unified — Send + Mention + Wait)

One tool for all agent communication. Sends a message to any space the agent is a member of. Optionally **mentions** another agent to trigger them, and optionally **waits** for a reply.

This single tool replaces the old `sendSpaceMessage` (fire-and-forget) + `sendSpaceMessageAndWait` (blocking) + `mentionAgent` (trigger another agent).

```json
{
  "name": "sendSpaceMessage",
  "description": "Send a message to a space you are a member of. This is your primary way to communicate. Optionally mention an agent to trigger them to respond. Optionally wait for a reply before continuing.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "spaceId": {
        "type": "string",
        "description": "ID of the space to send to"
      },
      "text": {
        "type": "string",
        "description": "Message content"
      },
      "mention": {
        "type": "string",
        "description": "Entity ID of an agent to mention. This agent will be triggered to respond after your message is posted. If omitted, no agent is triggered — the message is for humans or informational only."
      },
      "wait": {
        "type": "object",
        "description": "Wait for a reply after sending. Specify one or more conditions — the tool resolves as soon as ANY condition is satisfied (first match wins). If omitted, the message is fire-and-forget (no blocking).",
        "properties": {
          "for": {
            "type": "array",
            "description": "Array of wait conditions. The tool blocks until ANY one of these conditions is matched by an incoming reply (OR logic).",
            "items": {
              "type": "object",
              "properties": {
                "type": {
                  "type": "string",
                  "enum": ["any", "agent", "human", "entity"],
                  "description": "'any' = any message, 'agent' = any agent reply, 'human' = any human reply, 'entity' = a specific entity's reply."
                },
                "entityId": {
                  "type": "string",
                  "description": "Required when type='entity'. The specific entity ID to wait for."
                }
              },
              "required": ["type"]
            },
            "minItems": 1
          },
          "timeout": {
            "type": "number",
            "description": "Max seconds to wait for a matching reply (default 60, max 120)",
            "default": 60
          }
        },
        "required": ["for"]
      }
    },
    "required": ["spaceId", "text"]
  }
}
```

### Composite Message

Each `sendSpaceMessage` call adds a **text part** to the run's composite message for that space. Multiple `sendSpaceMessage` calls to the same space within one run accumulate into a single message (see [Composite Messages & Display Tools](./05-space-ui.md)). Client/UI tool calls can also add parts when the tool has `displayTool: true` and the AI provides `targetSpaceId`. When a display tool call also includes `mention`, the mentioned agent is triggered after the tool message is posted — same behavior as `sendSpaceMessage` with `mention`. The `text` argument streams via `tool-input-delta` to the target space in real-time.

### Return Values

**Without `wait`** (fire-and-forget):
```json
{ "messageId": "msg-123", "sent": true }
```

**With `wait`** (blocking — resolves on first matching reply):
```json
{
  "messageId": "msg-123",
  "sent": true,
  "timedOut": false,
  "reply": { "text": "Q4 budget: $2.1M allocated...", "entityId": "entity-finance", "entityName": "Finance Agent", "entityType": "agent" }
}
```

On timeout (no condition matched):
```json
{ "messageId": "msg-123", "sent": true, "timedOut": true, "reply": null }
```

### Usage Patterns

**Simple response to human** (fire-and-forget, no mention, no wait):
```json
sendSpaceMessage({ spaceId: "space-X", text: "Hello! Here's your report." })
```

**Mention another agent** (fire-and-forget — trigger them but don't wait):
```json
sendSpaceMessage({ spaceId: "space-X", text: "Finance, can you check the budget?", mention: "finance-agent-entity-id" })
```

**Ask an agent and wait for their reply** (blocking, single condition):
```json
sendSpaceMessage({ spaceId: "space-X", text: "What's the Q4 budget status?",
  mention: "finance-agent-entity-id",
  wait: { for: [{ type: "agent" }], timeout: 60 } })
```

**Ask a human and wait** (blocking until human replies):
```json
sendSpaceMessage({ spaceId: "space-X", text: "Do you approve this expense?",
  wait: { for: [{ type: "human" }], timeout: 120 } })
```

**Wait for a specific entity**:
```json
sendSpaceMessage({ spaceId: "space-X", text: "Ahmad, can you confirm the 3 PM meeting?",
  wait: { for: [{ type: "entity", entityId: "entity-ahmad" }], timeout: 90 } })
```

**Wait for either of two specific agents** (whichever replies first):
```json
sendSpaceMessage({ spaceId: "space-X", text: "Finance or HR, does anyone have the Q4 numbers?",
  wait: { for: [
    { type: "entity", entityId: "entity-finance" },
    { type: "entity", entityId: "entity-hr" }
  ], timeout: 60 } })
```

**Wait for either an agent or a human** (whichever replies first):
```json
sendSpaceMessage({ spaceId: "space-X", text: "Can anyone confirm the budget is approved?",
  wait: { for: [
    { type: "agent" },
    { type: "human" }
  ], timeout: 120 } })
```

**Post and wait for anyone** (any single reply):
```json
sendSpaceMessage({ spaceId: "space-X", text: "Does anyone have the Q3 report?",
  wait: { for: [{ type: "any" }] } })
```

### `mention` and `wait` Are Independent

- **`mention`** controls WHO gets triggered — it creates a new run for the mentioned agent
- **`wait`** controls WHETHER this tool blocks — it pauses the current run until a reply arrives

You can use them in any combination:

| mention | wait | Behavior |
|---------|------|----------|
| ✗ | ✗ | Fire-and-forget. Message posted, no agent triggered, no blocking. |
| ✓ | ✗ | Trigger agent, don't wait. Agent will respond on its own. |
| ✗ | ✓ | Post message, wait for a reply (e.g., wait for human). |
| ✓ | ✓ | Trigger agent AND wait for their reply (most common for cross-space asks). |

### How Mention Works (Triggering Rules)

When `mention` is provided:
1. Validate the mentioned entity is an agent member of the target space
2. Post the message to the space (streamed — see [Streaming](./06-streaming.md))
3. Create a **new general run** for the mentioned agent with trigger:
   ```json
   { "type": "space_message", "senderType": "agent", "mentionReason": "..." }
   ```
4. If `wait` is also provided, block until the wait condition is met

When `mention` is NOT provided:
1. Post the message to the space (streamed)
2. **No agent is triggered** — the message is for humans to read or for informational purposes
3. If `wait` is provided, block until the wait condition is met (e.g., a human replies)

### Implementation (Blocking Wait)

When `wait` is provided:
1. After posting the message (and optionally triggering the mentioned agent), subscribe to the target space's Redis pub/sub channel
2. Listen for `smartSpace.message` events. For each incoming message, check if it matches **any** condition in `wait.for`:
   - `type: "any"` — matches any message
   - `type: "agent"` — matches if sender is an agent entity
   - `type: "human"` — matches if sender is a human entity
   - `type: "entity"` — matches if sender's entityId matches the condition's `entityId`
3. As soon as **one** condition matches, return the reply immediately (OR logic — first match wins)
4. If timeout expires before any condition matches, return `{ timedOut: true, reply: null }`

**Why blocking is fine:** During tool execution, the LLM is not running. The AI SDK tool loop works as: LLM emits tool-call → SDK runs `execute()` → result returned → LLM resumes. The tool `execute()` can take as long as it needs. The only cost is one Node.js promise waiting on Redis pub/sub — negligible.

**What about the caller's streaming?** The caller's run is still "running" from the client's perspective. The client sees the tool-call part in progress (spinner). When the tool returns and the agent resumes, streaming continues normally.

---

## 3. `delegateToAgent` (Admin Only — Silent Handoff)

Admin-exclusive tool. When the admin agent decides it shouldn't handle a human message, it calls `delegateToAgent` to silently hand off. The admin's run is **canceled and removed**, and a new run is created for the target agent with the **original human message** as the trigger — as if the admin was never involved.

```json
{
  "name": "delegateToAgent",
  "description": "Silently delegate this human message to another agent. Your run will be canceled. The target agent will receive a new run triggered by the original human message — as if you were never involved. Only available to the admin agent.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "targetAgentEntityId": {
        "type": "string",
        "description": "Entity ID of the agent to delegate to. Must be a member of the current space."
      }
    },
    "required": ["targetAgentEntityId"]
  }
}
```

**Implementation:**
1. Validate the target agent is a member of the trigger space
2. Cancel the admin's current run (status → `canceled`, remove from active runs)
3. Create a new general run for the target agent with the **same trigger context** as the admin's run (same `triggerType`, `triggerSpaceId`, `triggerMessageContent`, `triggerSenderEntityId`, etc.)
4. The target agent sees the original human message — no trace of the admin's involvement

**When to use `delegateToAgent` vs `mention`:**
- `delegateToAgent` → admin steps away entirely. Target agent sees the human message directly.
- `sendSpaceMessage` with `mention` → admin stays involved. Admin's message appears in the space and the target agent's trigger is an agent message, not the human message.

---

## All Runs Use the Same Tools

With general-purpose runs, plan runs and service-triggered runs work **exactly the same** as human-triggered runs. The only difference is the trigger context.

```
Plan triggers → General run created
  1. readSpaceMessages(engineeringSpace) → gets sprint updates
  2. readSpaceMessages(financeSpace) → gets budget data
  3. sendSpaceMessage(dataSpace, "Pull Q4 metrics", mention: dataAgent, wait: { for: [{ type: "agent" }] }) → gets reply
  4. Agent reasons and compiles report
  5. sendSpaceMessage(leadershipSpace, "Weekly Report: ...")
  6. sendSpaceMessage(engineeringSpace, "Summary posted to leadership")
```

```
Service trigger (Jira webhook) → General run created
  1. Agent reads trigger payload: { event: "ticket_critical", ticketId: "PROJ-123" }
  2. sendSpaceMessage(engineeringSpace, "🚨 Critical ticket PROJ-123: Login broken after deploy #287", mention: deployAgent, wait: { for: [{ type: "agent" }] })
  3. Deploy Agent responds with rollback status
  4. sendSpaceMessage(engineeringSpace, "Rollback complete. Login restored.")
```

Same tools, same model, every trigger type.

---

## 4. `getMyRuns`

See the agent's own currently active runs and their progress. This is critical when an agent gets triggered multiple times concurrently (e.g., a plan triggers at the same time a human sends a message, or a blocking `wait` means the agent has a held-open run while a new trigger arrives).

```json
{
  "name": "getMyRuns",
  "description": "See your own currently active runs (running, waiting_tool, queued). Use this to check if you are already handling something before starting duplicate work. Each run includes its trigger source, status, and a summary of what has been done so far.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "status": {
        "type": "string",
        "enum": ["running", "waiting_tool", "queued", "all"],
        "description": "Filter by run status. Default: 'all' (shows all active runs)",
        "default": "all"
      },
      "triggerSpaceId": {
        "type": "string",
        "description": "Optional: only show runs triggered from a specific space"
      }
    }
  }
}
```

**Returns:**
```json
{
  "currentRunId": "run-abc",
  "otherActiveRuns": [
    {
      "runId": "run-xyz",
      "triggerType": "plan",
      "triggerSource": "Morning Report",
      "status": "running",
      "startedAt": "2025-02-13T11:00:05Z",
      "progress": {
        "toolsCalled": ["readSpaceMessages", "sendSpaceMessage (waiting for reply)"],
        "textGenerated": "Good morning! Here's today's standup:...",
        "reasoning": "Compiling morning report from engineering and finance data..."
      }
    },
    {
      "runId": "run-def",
      "triggerType": "space_message",
      "triggerSource": "Husam in Husam's Chat",
      "status": "waiting_tool",
      "startedAt": "2025-02-13T11:00:12Z",
      "progress": {
        "toolsCalled": ["showConfirmation (waiting for user input)"],
        "textGenerated": "I've prepared the options for you:",
        "reasoning": null
      }
    }
  ]
}
```

**Implementation:**
1. Query `Run` table: `WHERE agentEntityId = thisAgent AND status IN ('running', 'queued', 'waiting_tool') AND id != currentRunId`
2. For each active run, load its events from Redis to build a progress summary:
   - Collect `tool-input-available` events → list of tools called
   - Collect `text-delta` events → concatenated text (truncated to ~200 chars)
   - Collect `reasoning-delta` events → concatenated reasoning (truncated to ~200 chars)
   - Check if any tool is currently in `waiting_tool` state
3. Include `currentRunId` so the agent knows which run it IS (to avoid confusion)
4. Return the structured summary

**Why this matters:**

Without this, an agent can accidentally do duplicate work:
- Plan triggers "morning report" → agent starts reading spaces, calling APIs
- Human sends "what's the weather?" at the same time → another run triggers
- The second run might also try to compile a report, or the agent might not know it's already busy

With `getMyRuns`, the agent sees: "I already have a run compiling the morning report. I'll just answer the weather question and skip report-related work."

---

## Concurrent Run Awareness in System Prompt

When the agent has other active runs at trigger time, the system prompt should include a brief notice:

```
⚠ You currently have 1 other active run:
- run-xyz (plan: Morning Report, running, started 30s ago) — compiling morning report
Use getMyRuns for full details if needed. Avoid duplicating work already in progress.
```

This is injected by `prompt-builder.ts` by querying active runs for the agent before building the prompt. It's a lightweight heads-up — the agent can call `getMyRuns` for full details if it needs to coordinate.

---

## Concurrent Run Scenarios

### Agent Skips Duplicate Work

```
6:00 AM — Plan triggers Ops-Agent → starts morning report (run-1)
6:00 AM — Service "cron" also triggers Ops-Agent with "daily-trigger" → (run-2)

Run-2 starts. System prompt includes:
  "⚠ You have 1 other active run: run-1 (plan: morning-report, running)"

Ops-Agent (run-2) reasons: "I'm already running the morning report in run-1. This trigger is redundant."
→ Run-2 completes silently without sending any messages. No duplicate work.
```

### Agent Defers to Active Run

```
Husam: "Get me the Q4 budget" → triggers AI Assistant (run-1)
Run-1 calls sendSpaceMessage(financeSpace, ..., mention: financeAgent, wait: { for: [{ type: "agent" }] }) → blocking

While run-1 is waiting, Husam sends: "Also include headcount data"
→ triggers AI Assistant again (run-2)

Run-2 starts. System prompt includes:
  "⚠ You have 1 other active run: run-1 in this space (running) — waiting on sendSpaceMessage reply"

AI Assistant (run-2) calls getMyRuns() → sees run-1 is actively fetching Q4 budget
AI Assistant (run-2) responds: "Got it — I'll include headcount data in the report I'm already preparing."
  → stores a note via setGoals so when run-1 resumes, it can pick up the extra request
```

---

## Loop Protection

- Agent can only read/send to spaces where it has membership (validated server-side)
- `wait` has a max timeout (120s)
- If Agent A mentions Agent B with `wait`, and Agent B mentions Agent A with `wait`, Agent A's original run is still blocked — but a new run is created for Agent A. That new run can call `getMyRuns` to detect the circular dependency and break the loop
- Max tool loop steps (from agent config `loop.maxSteps`) limits total tool calls per run
- `getMyRuns` excludes the current run from results — the agent always knows which run it IS
