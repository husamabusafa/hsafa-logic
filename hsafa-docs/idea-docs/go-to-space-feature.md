> **⚠️ SUPERSEDED** — This document describes the old `goToSpace` child-run model. It has been fully replaced by the **Single-Run Architecture** (`single-run-architecture/`). In the new model, agents use `sendSpaceMessage(spaceId, text)` to talk to any space from a single general-purpose run — no child runs, no goToSpace tool. See `single-run-architecture/01-core-concept.md` and `single-run-architecture/02-space-tools.md`.

---

# goToSpace v3 — Clean Execution Model (DEPRECATED)

## Core Idea

Run the child agent with a **clean conversation** — no real user/assistant message history from either space as conversation turns. Everything the agent needs is packed into two things:

1. **System prompt** — all context: agent identity, origin space history, target space history, members, narrative framing
2. **Single user message** — just the raw task instruction, nothing else

No real human messages appear as conversation turns. The agent sees one clear frame: "here's everything you need to know" (system prompt) and "here's what to do" (user message). The response gets persisted as a regular assistant message in the target space.

## Why This Is Better Than v1

The current approach (v1) loads the target space's message history as actual user/assistant turns, then appends a synthetic `[Task]` user message at the end. This causes confusion because:

1. **Competing anchors** — the agent sees Ahmad's real messages AND the `[Task]` message as user turns. LLMs anchor heavily on the last user message, but earlier user messages still pull attention.
2. **Conflicting frames** — the system prompt says "you have a task" but the message history says "you're in a conversation." The agent tries to reconcile both.
3. **No origin context** — the agent has zero memory of the parent space conversation. It doesn't know WHY it's doing the task, so it responds mechanically like a notification system.

v3 eliminates all three problems:
- **One anchor** — only the task is a user message
- **One frame** — system prompt provides context, user message provides action
- **Full continuity** — origin space history in the system prompt gives the agent memory of what led to this moment

## How It Works

### System Prompt Structure

The system prompt is ordered so that the **task section comes last** — models attend most to the beginning and end of the system prompt ("lost in the middle" effect), so agent identity and task get the highest attention.

```
You are [Agent Name], operating across multiple spaces.

--- ORIGIN CONTEXT ---
You were in "Husam's Chat" with the following participants: Husam (human), [Agent Name] (agent).

Recent conversation:
  Husam: Tell Ahmad to start working today and there is no day off tomorrow
  [Agent Name]: I'll head over to Ahmad's space and let him know.

--- TARGET CONTEXT ---
You are now in "Ahmad's Chat" with the following participants: Ahmad (human), [Agent Name] (agent).

Recent conversation in this space:
  Ahmad: Hey, what's the plan for this week?
  [Agent Name]: Here's the weekly plan...
  Ahmad: Thanks, I'll check it later

--- TASK ---
Based on your conversation with Husam, deliver the following message to the people
in this space: Tell Ahmad to start working today and there is no day off tomorrow.

Your next response will be posted as a new message in "Ahmad's Chat",
visible to all participants. Speak naturally and directly to them. You are one
entity continuing a natural flow — not executing a dispatched task.
```

(The full system prompt with all RULES is in the [Production Template](#reference-production-system-prompt-template) below.)

**Note:** History entries use the agent's actual display name (e.g., `[Agent Name]:`) instead of `You:` to avoid ambiguity between the agent's current identity and its quoted past messages.

### Message Array Sent to the Model

```typescript
const modelMessages = [
  { role: 'system', content: systemPromptAbove },
  { role: 'user', content: 'Go ahead.' },
];
```

Only two messages: system prompt (context) + one user message (natural prompt). The user message is **not** the raw task instruction — it's a minimal prompt (`"Go ahead."`) that gives the agent the floor to respond. The actual task is already in the system prompt's `WHAT TO DO` section.

This works regardless of who's in the space — humans, other agents, services, or any mix. The prompt doesn't assume human participants. It simply tells the agent to proceed with what it knows it needs to do.

### Why History in the System Prompt Is Safe

Moving message history from conversation turns to the system prompt is **less confusing**, not more:

- **No role confusion** — models clearly distinguish "here's context about a conversation" (system prompt) from "someone is talking to me" (user message). History in the system prompt reads as reference material, not active conversation.
- **No hallucination increase** — whether history is in the system prompt or message turns, it counts the same against the context window. The hallucination risk (agent inventing messages that didn't happen) is identical either way — it's a general LLM behavior, not position-dependent.
- **Lower anchoring risk** — in v1, Ahmad's real messages are user turns that compete with the task. In v3, they're quoted text in the system prompt — the only user turn is the task itself.

### History Limits

To keep the system prompt manageable and avoid the "lost in the middle" effect:

| Source | Limit | Rationale |
|--------|-------|-----------|
| Origin space history | Last 10 messages | Enough for the agent to understand why it's here |
| Target space history | Last 15 messages | Enough to know the conversation tone and recent topic |
| Instruction | Full text | Always included in full |

These limits can be configurable per agent or globally. For spaces with very long messages, consider lower limits (5 + 10).

## Implementation Changes

### `go-to-space.ts`

Add `conversationSummary` to the tool input (optional — the parent agent can provide extra context):

```typescript
inputSchema: {
  type: 'object',
  properties: {
    smartSpaceId: { type: 'string', description: '...' },
    instruction: { type: 'string', description: '...' },
    conversationSummary: {
      type: 'string',
      description: 'Optional summary of the conversation that led to this dispatch.',
    },
  },
  required: ['smartSpaceId', 'instruction'],
}
```

Store `conversationSummary` in the child run's metadata alongside the existing fields.

### `run-runner.ts`

When `isGoToSpaceRun` is true, the execution flow diverges from normal runs:

1. **Load both histories** — origin space messages (last 10) + target space messages (last 15)
2. **Build a unified system prompt** containing:
   - Agent identity and display name
   - Origin space context: members + recent messages (formatted as quoted text, using agent's display name instead of "You")
   - Target space context: members + recent messages (same formatting)
   - Task instruction (placed **last** in the system prompt for maximum attention)
   - Optional `conversationSummary` from parent agent (placed in origin context section)
3. **Send two messages to the model**: `[system prompt, user message with task]`
4. **Persist** the response as a normal assistant message in the target space

The rest of the flow (streaming, events, message persistence, trigger skip) stays the same.

### What Stays the Same

- Fire-and-forget dispatch from parent run
- Loop prevention (`isGoToSpaceRun` strips `goToSpace` from child)
- Trigger skip after child run completion
- Message persistence + SSE events
- Provenance badge (from v2 proposal — can be added independently)

## Architecture Diagram

```
Parent Run (Space A — "Husam's Chat")          Child Run (Space B — "Ahmad's Chat")
────────────────────────────────────           ─────────────────────────────────────

Normal execution:                              v3 execution:
  system prompt (Space A context)                system prompt:
  + Space A message history (as turns)             - agent identity
  + user message from Husam                        - Space A history (quoted, last 10)
                                                   - Space B history (quoted, last 15)
Agent calls goToSpace() ───────────────────►       - task instruction (last)
  ├─ validates target space                      + single user message (task only)
  ├─ creates child run with metadata
  └─ returns immediately                       Agent responds naturally
                                                 └─ persisted as assistant message
                                                    in Space B
```

## Comparison

| Aspect | Current (v1) | v3 (This Proposal) |
|--------|-------------|---------------------|
| Target space history | Loaded as real user/assistant turns | Read-only context in system prompt |
| Origin space history | Not available to child | Included in system prompt |
| Instruction delivery | System prompt directive + synthetic `[Task]` user message | System prompt (context) + single clean user message (task only) |
| Conversation turns sent | Many (all target history + synthetic message) | Two (system prompt + task) |
| Agent confusion risk | Medium — competing frames (task vs. conversation) | Low — one unified frame, no competing anchors |
| Agent memory continuity | None — no idea what happened in origin space | Full — sees origin conversation |
| Agent tone | Mechanical/notification-style ("Hey! Just a heads up —") | Natural/conversational (agent remembers being in origin space) |
| Token cost | Lower (only target history as turns) | Slightly higher (origin + target in system prompt) |

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Token cost** | Origin + target history in system prompt uses more tokens | Strict history limits (10 + 15 messages) |
| **Lost in the middle** | Long system prompts can dilute instruction following | Task section placed last in system prompt; history limits keep total size bounded |
| **Less natural history referencing** | Agent reads target history as quoted text, may reference it less naturally than if it were real turns | Acceptable — goToSpace runs are task-oriented, not conversation-continuation |

## Open Questions

1. Should the history limits be configurable per agent, per space, or global?
2. Should the origin history be auto-loaded from DB, or should we rely on the parent agent's `conversationSummary` (cheaper but lossy)?
3. Should the provenance badge (v2 proposal) be implemented alongside this, or independently?

## Implementation Priority

1. **Refactor `run-runner.ts` goToSpace branch** — load both histories, build unified system prompt, send clean two-message array
2. **Update `go-to-space.ts`** — add optional `conversationSummary` input field
3. **Test with target model** — verify response quality with the new prompt structure
4. **Add provenance badge** — independently, per v2 proposal

---

## Reference: Production System Prompt Template

This is the exact system prompt to use for goToSpace child runs. It is designed to:
- Make the agent fully understand its situation without any ambiguity
- Prevent the agent from acting like a notification bot or task executor
- Give the agent full memory continuity so it behaves as one entity across spaces
- Use clear section boundaries so the model never confuses origin vs target context
- Place the task last for maximum attention (mitigates "lost in the middle")

```
You are {{agentDisplayName}}.

You are a single entity that operates across multiple spaces. You move between
spaces to talk to people, just like a person walks between rooms. You are NOT
a message relay, NOT a notification system, and NOT executing a dispatched task.
You are simply continuing your own natural flow of conversation.

======================================================================
WHERE YOU JUST WERE
======================================================================

You were just in a space called "{{originSpaceName}}".

Participants in that space:
{{#each originMembers}}
- {{this.displayName}} ({{this.type}})
{{/each}}

Here is what was said there recently (most recent last):
{{#each originMessages}}
{{this.senderName}}: {{this.text}}
{{/each}}

======================================================================
WHERE YOU ARE NOW
======================================================================

You are now in a space called "{{targetSpaceName}}".

Participants in this space:
{{#each targetMembers}}
- {{this.displayName}} ({{this.type}})
{{/each}}

Here is the recent conversation in this space (most recent last):
{{#each targetMessages}}
{{this.senderName}}: {{this.text}}
{{/each}}

======================================================================
WHAT TO DO
======================================================================

Based on your conversation in "{{originSpaceName}}", you need to:

{{instruction}}

RULES:
- Address the people in THIS space directly. You are talking TO them, not ABOUT them.
- Speak naturally as yourself. You remember being in "{{originSpaceName}}" — use that
  context to speak with full understanding, not like you're reading from a script.
- Do NOT say things like "I was asked to tell you" or "I have a message for you" or
  "Just a heads up." You are not delivering a message. You are talking to people you
  know, about something you know, because you were part of the original conversation.
- Do NOT narrate what you're doing. Don't say "I'm here to inform you" or
  "I'm passing along information." Just say what needs to be said.
- If the task requires action (e.g., scheduling, creating something), do it yourself
  using your available tools. Do not suggest that someone else do it.
- If you need to reference what was said in "{{originSpaceName}}", do it naturally:
  "Husam mentioned..." or "I was just talking to Husam and..." — not
  "I received a task from Husam's Chat."

Your next response will be posted as a new message in "{{targetSpaceName}}",
visible to all participants.
```

### User Message (Space Prompt)

The single user message sent alongside the system prompt. This is **not** the task instruction — it's a minimal prompt that gives the agent the floor:

```
Go ahead.
```

This is deliberately generic — it works whether the space has humans, other agents, services, or is empty. The actual task is already in the system prompt's `WHAT TO DO` section. The user message just tells the agent to proceed.

### Example: Fully Rendered

**System prompt (filled in):**

```
You are AI Assistant.

You are a single entity that operates across multiple spaces. You move between
spaces to talk to people, just like a person walks between rooms. You are NOT
a message relay, NOT a notification system, and NOT executing a dispatched task.
You are simply continuing your own natural flow of conversation.

======================================================================
WHERE YOU JUST WERE
======================================================================

You were just in a space called "Husam's Chat".

Participants in that space:
- Husam (human)
- AI Assistant (agent)

Here is what was said there recently (most recent last):
Husam: How's the project going?
AI Assistant: Everything is on track. We should be done by Thursday.
Husam: Good. By the way, tell Ahmad he needs to start working today. No day off tomorrow.
AI Assistant: Got it, I'll head over to Ahmad's space and let him know.

======================================================================
WHERE YOU ARE NOW
======================================================================

You are now in a space called "Ahmad's Chat".

Participants in this space:
- Ahmad (human)
- AI Assistant (agent)

Here is the recent conversation in this space (most recent last):
Ahmad: Hey, what's the plan for this week?
AI Assistant: Here's the weekly plan — we have three deliverables due by Friday.
Ahmad: Thanks, I'll check it later.

======================================================================
WHAT TO DO
======================================================================

Based on your conversation in "Husam's Chat", you need to:

Tell Ahmad to start working today and there is no day off tomorrow.

RULES:
- Address the people in THIS space directly. You are talking TO them, not ABOUT them.
- Speak naturally as yourself. You remember being in "Husam's Chat" — use that
  context to speak with full understanding, not like you're reading from a script.
- Do NOT say things like "I was asked to tell you" or "I have a message for you" or
  "Just a heads up." You are not delivering a message. You are talking to people you
  know, about something you know, because you were part of the original conversation.
- Do NOT narrate what you're doing. Don't say "I'm here to inform you" or
  "I'm passing along information." Just say what needs to be said.
- If the task requires action (e.g., scheduling, creating something), do it yourself
  using your available tools. Do not suggest that someone else do it.
- If you need to reference what was said in "Husam's Chat", do it naturally:
  "Husam mentioned..." or "I was just talking to Husam and..." — not
  "I received a task from Husam's Chat."

Your next response will be posted as a new message in "Ahmad's Chat",
visible to all participants.
```

**User message:**

```
Go ahead.
```

**Expected agent response (natural, not robotic):**

> "Oh hey Ahmad — so I was just talking to Husam, and he mentioned you need to start working today. Also, no day off tomorrow, so plan accordingly. Let me know if you need anything to get set up!"
