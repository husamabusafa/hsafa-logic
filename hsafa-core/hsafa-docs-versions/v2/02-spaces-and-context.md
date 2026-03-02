# 02 — Spaces & Active Context

## Overview

In v2, tools no longer accept `spaceId` as a parameter. Instead, the agent explicitly **enters a space**, and that space becomes the **active context** for all subsequent actions — until the agent enters a different space.

This mirrors how humans work: you open a chat window, and everything you do is within that conversation until you switch.

---

## The `enter_space` Tool

### Signature

```json
{
  "name": "enter_space",
  "description": "Set the active space context. All subsequent messages and space-visible tool results will be directed to this space.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "spaceId": {
        "type": "string",
        "description": "ID of the space to enter. Must be a space you are a member of."
      }
    },
    "required": ["spaceId"]
  }
}
```

### Behavior

1. Agent calls `enter_space(spaceId)`.
2. Gateway validates the agent is a member of that space.
3. The run's **active space** is updated to `spaceId`.
4. All subsequent `send_message` calls go to this space.
5. All subsequent tool calls with `visible: true` configuration have their results posted to this space.
6. The agent can call `enter_space` again to switch to a different space mid-run.

### Implementation

The active space is stored as **run-level state** (in run metadata or a dedicated column):

```
Run {
  ...
  activeSpaceId: String?   // Set by enter_space, null initially
}
```

When `send_message` is called without an explicit target, it uses `activeSpaceId`. When a visible tool completes, its result is posted to `activeSpaceId`.

---

## Automatic Space Entry

For **space_message triggers**, the trigger space is automatically set as the active space at the start of the run. The agent doesn't need to call `enter_space` if it only wants to respond in the space where it was triggered.

For **plan/service triggers**, there is no active space initially. The agent must call `enter_space` before sending any messages.

| Trigger Type | Initial Active Space |
|-------------|---------------------|
| `space_message` | Trigger space (auto-set) |
| `plan` | None — agent must call `enter_space` |
| `service` | None — agent must call `enter_space` |

---

## Space Switching

An agent can enter multiple spaces during a single run:

```
1. Agent triggered by message in Space A
   → activeSpaceId = Space A (auto)

2. Agent responds in Space A
   → send_message("Here's the report")

3. Agent enters Space B
   → enter_space(Space B)
   → activeSpaceId = Space B

4. Agent posts in Space B
   → send_message("FYI, the report is ready")

5. Agent switches back to Space A
   → enter_space(Space A)
   → send_message("I also notified the team in Space B")
```

Each `enter_space` call emits an internal run event for traceability but is **invisible to space members**. They only see the messages.

---

## What the Agent Knows About Spaces

The agent's system prompt includes a list of all spaces it belongs to:

```
YOUR SPACES:
- "Design Team" (id: abc-123) — Members: Husam (human), Ahmad (human), You (agent)
- "Dev Updates" (id: def-456) — Members: You (agent), Sarah (human)
- "1:1 with Husam" (id: ghi-789) [ACTIVE] — Members: Husam (human), You (agent)
```

The `[ACTIVE]` tag shows which space is currently entered.

---

## Reading Earlier History

The space history block in the system prompt shows the last 50 messages. For spaces with longer history, the agent can call `read_messages` with an `offset` to scan earlier messages:

```json
{ "offset": 50, "limit": 50 }
```

This lets the agent page back through history when it needs more context. Agents should store important details discovered this way in their memory using `set_memories`, so they don't need to re-scan on every run.

---

## Space Membership Validation

- `enter_space` fails if the agent is not a member of the target space.
- `send_message` fails if no active space is set (and no explicit space is provided).
- The agent cannot read messages from spaces it doesn't belong to.

---

## Streaming & Active Space

When the agent calls `send_message`, the gateway streams the message text to the **active space** in real-time (via `text-delta` events on the space SSE stream). This is identical to v1's sendSpaceMessage streaming — the difference is only that the space target comes from run state rather than tool arguments.

---

## Cross-Space Origin Context

When an agent enters a space that is **different from its trigger space**, messages it sends carry origin metadata:

```json
{
  "origin": {
    "triggerType": "space_message",
    "triggerSpaceId": "abc-123",
    "triggerSpaceName": "Design Team",
    "triggerSenderName": "Husam",
    "triggerMessage": "Send the report to the dev channel"
  }
}
```

This lets the agent (and other agents) understand **why** a cross-space message was sent when they encounter it in later runs.

---

## Removed Concepts

| v1 | v2 |
|----|----|
| `sendSpaceMessage(spaceId, text, mention)` | `enter_space(spaceId)` + `send_message(text)` |
| `displayTool` + `targetSpaceId` auto-injection | Tool `visible: true/false` config; results go to active space |
| Space ID in every prebuilt tool call | Active space is implicit run state |
| `@mention` in tool parameter | Removed. Every message triggers all other agent members (sender excluded). |
