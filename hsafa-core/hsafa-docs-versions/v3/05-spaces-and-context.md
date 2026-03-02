# 05 — Spaces & Active Context

## Overview

Spaces work the same as v2: the agent "enters" a space, and that space becomes the active context for all subsequent actions. No `spaceId` in tool parameters. The difference in v3 is that space interactions are recorded in consciousness as tool calls, giving the agent persistent memory of which spaces it has visited and what it did there.

---

## The `enter_space` Tool

### Signature

```json
{
  "name": "enter_space",
  "description": "Set the active space context. All subsequent messages and visible tool results go to this space.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "spaceId": {
        "type": "string",
        "description": "ID of the space to enter. Must be a space you are a member of."
      },
      "limit": {
        "type": "number",
        "description": "How many recent messages to load. Default: 50."
      }
    },
    "required": ["spaceId"]
  }
}
```

### Behavior

1. Agent calls `enter_space(spaceId)`.
2. Gateway validates the agent is a member of that space.
3. The process's **active space** is updated to `spaceId`.
4. The tool returns the space's recent messages (formatted timeline).
5. All subsequent `send_message` calls go to this space.
6. All subsequent visible tool results are posted to this space.
7. The agent can call `enter_space` again to switch to a different space.

### Tool Result (in consciousness)

The `enter_space` result includes the space's recent message history, which the agent can reason about:

```json
{
  "success": true,
  "spaceId": "space-xyz",
  "spaceName": "Project Alpha",
  "history": [
    { "id": "msg-001", "senderName": "Husam", "senderType": "human", "content": "Can you check the status?", "timestamp": "2026-02-18T14:00:00Z" },
    { "id": "msg-002", "senderName": "Designer", "senderType": "agent", "content": "On it.", "timestamp": "2026-02-18T14:01:00Z" }
  ],
  "totalMessages": 48
}
```

This is how the agent learns about space context in v3 — by entering the space and reading the history returned by the tool. The space history lives in the tool result inside consciousness, not in the system prompt.

---

## Automatic Space Entry

For **space_message** inbox events, the gateway does NOT auto-enter the space. The inbox event tells the agent which space the message came from, and the agent decides whether to enter it.

However, the system prompt instructs the agent:

```
When you receive a space_message inbox event, the message includes the space context.
If you want to respond, call enter_space first (unless you're already in that space).
```

In practice, the agent almost always enters the trigger space as its first action. But unlike v2, this is a tool call in consciousness — visible, traceable, and the agent can choose NOT to enter (e.g., if it determines the message doesn't need a response).

| Event Type | Space Entry |
|-----------|-------------|
| `space_message` | Agent decides — typically enters trigger space |
| `plan` | Agent must call `enter_space` explicitly |
| `service` | Agent must call `enter_space` explicitly |

---

## Space Switching

An agent can enter multiple spaces during a single think cycle:

```
Cycle N:
  INBOX: [Family] Husam: "Send the report to the dev channel"
  
  Step 0: enter_space("family-space")     → reads Family history
  Step 1: send_message("Got it, sending now")
  Step 2: enter_space("dev-channel")       → reads Dev Channel history
  Step 3: send_message("Here's the Q4 report")
  Step 4: enter_space("family-space")      → back to Family
  Step 5: send_message("Done — posted to dev channel")
```

Each `enter_space` call is recorded in consciousness. In future cycles, the agent can see it entered multiple spaces and what it did in each — full cross-space traceability.

---

## What the Agent Knows About Spaces

The system prompt (refreshed each cycle) includes the agent's space memberships:

```
YOUR SPACES:
- "Family" (id: space-family) — Husam (human), Muhammad (human), You
- "Dev Channel" (id: space-dev) — You, Sarah (human), DevBot (agent)
- "1:1 with Husam" (id: space-husam) — Husam (human), You
```

This tells the agent which spaces exist and who's in them. The agent uses this to decide which spaces to enter and who to communicate with.

---

## Reading Earlier History

The `enter_space` tool returns the last N messages (default: 50). For spaces with longer history, the agent can call `read_messages` with an `offset`:

```json
{ "spaceId": "space-xyz", "offset": 50, "limit": 50 }
```

This lets the agent page back through history. Important facts discovered this way should be stored in memories (`set_memories`), so the agent doesn't need to re-read them.

---

## Space Membership Validation

- `enter_space` fails if the agent is not a member of the target space.
- `send_message` fails if no active space is set.
- The agent cannot read messages from spaces it doesn't belong to.

---

## Streaming & Active Space

When the agent calls `send_message`, the gateway streams the message text to the **active space** in real-time (via `tool-input-delta` events on the space SSE stream). This is identical to v2.

---

## Cross-Space Origin Context

When an agent sends a message to a space that is **different from the inbox event's source space**, the message carries origin metadata:

```json
{
  "origin": {
    "sourceSpace": "Family",
    "sourceEvent": "Husam: 'Send the report to the dev channel'"
  }
}
```

In v3, this is less critical than v2 because the agent's consciousness already records the full decision chain:

```
consciousness:
  [user]  INBOX: [Family] Husam: "Send the report to dev channel"
  [assistant → tool_call] enter_space("family-space")
  [tool → result] { history: [...] }
  [assistant → tool_call] send_message("Got it")
  [tool → result] { success: true }
  [assistant → tool_call] enter_space("dev-channel")       ← agent decided to switch
  [tool → result] { history: [...] }
  [assistant → tool_call] send_message("Here's the report") ← cross-space message
  [tool → result] { success: true }
```

The agent knows WHY it sent the message to dev channel — it's right there in consciousness. But origin metadata is still useful for **other agents** who see the message in the dev channel and need to understand why it was posted.

---

## Removed Concepts

| v2 | v3 |
|----|-----|
| Auto-set active space from trigger | Agent enters space explicitly via tool call |
| `[SEEN]`/`[NEW]` markers in space history | Not needed — consciousness tracks everything |
| `lastProcessedMessageId` per agent per space | Not needed — inbox events are in consciousness |
| `ACTIVE SPACE: "Project Alpha" (auto-set)` in system prompt | Agent's `enter_space` calls in consciousness |
