# 15 — Idea: Stateless Runs (Context Replaces Waiting)

## The Problem

The current v2 messaging system has accumulated significant complexity around the "waiting and reply" mechanism:

| Concept | Purpose | Complexity It Adds |
|---------|---------|-------------------|
| `wait: true` on `send_message` | Pause run until reply | New run status (`waiting_reply`), `waitState` metadata, timeout handling |
| `messageId` on `send_message` | Thread a reply to resume a waiting run | Humans must explicitly thread — they won't do this naturally |
| `continue_waiting` tool | Re-enter waiting after first reply | Clears previous tool result, `waitCycle` counter, catch-up check for race conditions |
| `resume_run` tool | Force-resume a waiting run from another run | Extra run just to route a message to a sibling run |
| Catch-up check | Handle replies that arrive in the gap between resume and `continue_waiting` | `lastResumedAt` timestamp, gap query before pausing |
| `senderExpectsReply` | Signal to agents that a reply is expected | Extra context field, behavioral coupling |
| Race conditions | Reply arrives while run is `running` (not `waiting_reply`) | Documented edge cases, workarounds, new runs to handle missed replies |

**That's 7 interrelated mechanisms** to handle one fundamental question: *how does an agent have a back-and-forth conversation?*

Meanwhile, humans in group chats have zero of these mechanisms. They just... send messages and read new ones.

---

## The Insight

**Humans don't "wait" in a system sense.** When you ask a question in WhatsApp:

1. You send the message
2. You go do other things
3. You come back when there's a notification
4. You read the new messages
5. You respond based on the full context

There's no "paused state." There's no "reply threading" (most people just send a new message). There's no "catch-up check." Your brain just re-reads the context and picks up where you left off.

**The agent can do exactly the same thing — because it already re-reads the full context at the start of every run.**

---

## The Proposal: Remove All Waiting Mechanics

### What Gets Removed

- `wait: true` parameter on `send_message`
- `messageId` parameter on `send_message`  
- `continue_waiting` tool
- `resume_run` tool
- `waiting_reply` run status
- `waitState` metadata (all of it: `lastResumedAt`, `waitCycle`, `toolCallId`, etc.)
- `senderExpectsReply` context field
- All race condition handling
- All catch-up check logic

### What Stays

- `send_message({ text })` — one parameter, one tool
- `waiting_tool` status — for interactive UI tools (forms, approvals) — this is different from chat waiting
- Every message triggers all agents (unchanged)
- `[SEEN]`/`[NEW]` markers (unchanged)
- Memories, goals, plans (unchanged)
- Chain depth protection (unchanged)

### The New `send_message`

```json
{
  "name": "send_message",
  "inputSchema": {
    "type": "object",
    "properties": {
      "text": {
        "type": "string",
        "description": "Message text."
      }
    },
    "required": ["text"]
  }
}
```

One tool. One parameter. That's it.

---

## How It Works

### The Core Loop

Every message in a space triggers all other agent members. Each triggered agent:

1. Starts a **fresh run**
2. Reads the **full space context** (timeline with `[SEEN]`/`[NEW]` markers)
3. Reads its **memories and goals** (persistent state from previous runs)
4. Reasons about what to do
5. Acts (send messages, call tools, update memories/goals)
6. **Run ends**

There is no pausing. There is no resuming. Every run is born, does its work, and dies. All conversational continuity comes from **context** — the space history and the agent's persistent state.

### How the Agent "Remembers" It Asked a Question

The agent's own previous messages are in the space timeline, marked with `[SEEN]`:

```
SPACE HISTORY ("Deployments"):
  [SEEN] [msg-001] [14:00] DeployBot (agent, you): "I'll deploy v2.1. Confirm by replying yes."
  [NEW]  [msg-002] [14:05] Sarah (human): "yes"  ← TRIGGER
```

The agent sees its own question AND Sarah's answer. It doesn't need a "wait/resume" mechanism — the context tells it everything.

### How Multi-Agent Conversations Work

```
Space "Research" — Husam (human), Researcher (agent), Summarizer (agent)

Husam: "Find top 5 AI papers and summarize them"
  → Triggers: Researcher, Summarizer

Researcher Run:
  Context: Husam asked for papers + summaries
  Action: searchPapers() → send_message("Found 5 papers: [list]")
  Run ends.

Researcher's message triggers: Summarizer (+ re-triggers Researcher at chainDepth+1)

Summarizer Run:
  Context: Husam asked for summaries, Researcher found 5 papers [NEW]
  Action: Summarizes → send_message("Here are the summaries: ...")
  Run ends.

Researcher Run (chainDepth=1, from Summarizer's message):
  Context: Sees summaries are done. Nothing to add.
  Run ends (silent).
```

Three agents had a natural conversation. No waiting, no threading, no `messageId`. Each agent just reads context and acts.

---

## Scenario Comparisons

### Scenario 1: Human Approval

**Old (waiting model):**
```
DeployBot run:
  1. send_message("Deploy? Yes/no", wait: true) → pauses
  [Sarah: "yes"] → resumes
  2. Reads reply from tool result → deploys
  Run ends.
```

**New (stateless model):**
```
DeployBot Run 1 (triggered by Sarah: "Deploy v2.1"):
  1. send_message("Deploy v2.1? Confirm by replying yes.")
  Run ends.

[Sarah: "yes"] → triggers DeployBot

DeployBot Run 2 (triggered by Sarah: "yes"):
  Context:
    [SEEN] DeployBot: "Deploy v2.1? Confirm by replying yes."
    [NEW]  Sarah: "yes"  ← TRIGGER
  1. Reasons: "I asked for confirmation, Sarah said yes."
  2. Deploys → send_message("Done! All services running v2.1.")
  Run ends.
```

**Result:** Same behavior. Zero waiting logic.

---

### Scenario 2: Multi-Turn Negotiation

**Old (waiting model):**
```
Agent run:
  1. send_message("Here's the contract.", wait: true) → pauses
  [Sarah: "Change to NET-30"] → resumes
  2. Updates contract
  3. send_message("Updated. Anything else?")
  4. continue_waiting() → pauses again
  [Sarah: "Add termination clause"] → resumes
  5. Updates → send_message("Done.")
  Run ends.
```

**New (stateless model):**
```
Agent Run 1 (triggered by request):
  1. send_message("Here's the contract draft.")
  Run ends.

[Sarah: "Change to NET-30"] → triggers Agent

Agent Run 2:
  Context:
    [SEEN] Agent: "Here's the contract draft."
    [NEW]  Sarah: "Change to NET-30"
  1. updateContract({ paymentTerms: "NET-30" })
  2. send_message("Updated to NET-30. Anything else?")
  Run ends.

[Sarah: "Add termination clause"] → triggers Agent

Agent Run 3:
  Context:
    [SEEN] Agent: "Here's the contract draft."
    [SEEN] Sarah: "Change to NET-30"
    [SEEN] Agent: "Updated to NET-30. Anything else?"
    [NEW]  Sarah: "Add termination clause"
  1. updateContract({ addClause: "early_termination" })
  2. send_message("Done. Final version attached.")
  Run ends.
```

**Result:** Same conversation, 3 short runs instead of 1 complex pausing run. No race conditions. No `continue_waiting`. No gap handling.

---

### Scenario 3: Collecting Votes

**Old (waiting model):**
```
Agent run:
  1. send_message("Vote: A or B?", wait: true) → pauses
  [Ahmad: "A"] → resumes
  2. continue_waiting() → pauses
  [Sarah: "B"] → resumes
  3. continue_waiting() → pauses
  [Husam: "A"] → resumes
  4. send_message("A wins 2-1!")
  Run ends.
```

**New (stateless model):**
```
Agent Run 1 (triggered by request):
  1. send_message("Team vote: A or B?")
  2. set_memories([{ key: "vote_total", value: "3 members" }])
  Run ends.

[Ahmad: "A"] → triggers Agent

Agent Run 2:
  Context: [SEEN] Agent asked for votes. [NEW] Ahmad: "A"
  Memory: "vote_total: 3 members"
  1. Counts votes in history: Ahmad=A (1/3)
  2. Stays silent (or sends "1/3 votes in")
  Run ends.

[Sarah: "B"] → triggers Agent

Agent Run 3:
  Context: Ahmad voted A, Sarah voted B (2/3)
  1. Counts: 2/3
  2. Stays silent (or sends "2/3 votes in")
  Run ends.

[Husam: "A"] → triggers Agent

Agent Run 4:
  Context: Ahmad=A, Sarah=B, Husam=A (3/3)
  1. Counts: A wins 2-1
  2. send_message("Vote results: Option A wins 2-1! Proceeding with A.")
  Run ends.
```

**Result:** No waiting, no `continue_waiting`, no race conditions. The agent just counts messages in the history. It can use memory as an optimization, but the space history is the source of truth.

---

### Scenario 4: Human Forgets to "Reply"

**Old (waiting model):**
```
Agent Run A: send_message("Deploy?", wait: true) → pauses
[Husam: "yes deploy it" — NOT threaded]
  → Triggers new Run B
  → Run B uses resume_run to force-resume Run A
  → Run A processes the reply
```

**New (stateless model):**
```
Agent Run 1: send_message("Deploy v2.1?")
  Run ends.

[Husam: "yes deploy it"] → triggers Agent

Agent Run 2:
  Context:
    [SEEN] Agent: "Deploy v2.1?"
    [NEW]  Husam: "yes deploy it"
  1. Reasons: "I asked about deployment, Husam said yes."
  2. Deploys.
  Run ends.
```

**The problem doesn't even exist.** There's no threading to forget. Every message is just a message. The agent reads context and figures it out.

---

### Scenario 5: Three Agents Having a Conversation

**Old model:** Agents use `wait: true` and `messageId` to coordinate — complex, fragile.

**New model:**

```
Space "Architecture" — Husam (human), Architect (agent), SecurityBot (agent), DevOps (agent)

Husam: "We need to redesign the auth system"
  → Triggers: Architect, SecurityBot, DevOps

Architect Run (chainDepth=0):
  1. send_message("I'd suggest moving to OAuth2 with JWT tokens. This gives us SSO and token refresh.")
  Run ends.

SecurityBot Run (chainDepth=0):
  1. send_message("From a security perspective, make sure we use short-lived tokens (15 min) with refresh rotation.")
  Run ends.

DevOps Run (chainDepth=0):
  1. Stays silent (waiting to see the technical direction first)
  Run ends.

Architect's message triggers SecurityBot + DevOps (chainDepth=1):

SecurityBot Run (chainDepth=1):
  Context: Architect proposed OAuth2 + JWT
  1. send_message("OAuth2 is good. I'd add: use PKCE for public clients and store refresh tokens server-side only.")
  Run ends.

DevOps Run (chainDepth=1):
  Context: Architect proposed OAuth2, Security added PKCE
  1. send_message("I can set up Keycloak as the identity provider. It supports OAuth2 + PKCE out of the box. ETA: 2 days.")
  Run ends.

SecurityBot's message triggers Architect + DevOps (chainDepth=2):

Architect Run (chainDepth=2):
  Context: Full discussion so far
  1. send_message("Great alignment. Let me draft the architecture doc with these decisions. I'll share it in #docs.")
  Run ends.

DevOps Run (chainDepth=2):
  Context: Keycloak already proposed, Architect will document
  1. Stays silent.
  Run ends.

... chain depth continues until MAX_CHAIN_DEPTH, then conversation pauses until a human sends a new message.
```

**This is a natural multi-agent discussion.** No waiting, no threading, no coordination tools. Each agent reads the full conversation and contributes when relevant.

---

## What About Long-Running Workflows?

The main concern: "What if the agent needs to maintain state across multiple interactions?"

### Answer: Memories and Goals ARE the State

```
Run 1: Agent starts a complex report
  1. Pulls data from 3 sources
  2. send_message("I've started the Q4 report. Need budget numbers from Finance team.")
  3. set_memories([
       { key: "q4_report_status", value: "waiting for budget from Finance" },
       { key: "q4_data_pulled", value: "revenue: $2.1M, users: 45K, churn: 3.2%" }
     ])
  4. set_goals([{ id: "q4-report", description: "Complete Q4 report", status: "active" }])
  Run ends.

[Later, Finance sends numbers] → triggers Agent

Run 2:
  Context: [SEEN] Agent asked for budget. [NEW] Finance: "Budget is $500K"
  Memories: q4_report_status = "waiting for budget", q4_data_pulled = "..."
  Goals: "Complete Q4 report" (active)
  1. Agent sees: "I was waiting for budget numbers, they arrived."
  2. Combines all data → generates report
  3. send_message("Q4 Report: [full report]")
  4. set_goals([{ id: "q4-report", status: "completed" }])
  Run ends.
```

The agent's persistent state (memories + goals) bridges runs. This is **more robust** than in-run state because:
- If the server crashes during a waiting run, all in-run state is lost
- Memories/goals are in the database — they survive anything
- The agent can inspect its own state from any run

---

## What About Interactive UI Tools?

Interactive tools (`executionType: "space"`) that need user input — like approval buttons, forms, file pickers — still pause the run with `waiting_tool`. **This is NOT removed.**

The distinction:
- **`waiting_tool`** = waiting for structured UI input from the frontend. The tool call is displayed, the user interacts, submits result. This is tool-level, not conversation-level.
- **`waiting_reply`** (REMOVED) = waiting for a chat message. This was conversation-level and is replaced by context.

| Status | Kept? | Why |
|--------|-------|-----|
| `waiting_tool` | ✅ Yes | UI tools need structured input — can't be replaced by context |
| `waiting_reply` | ❌ Removed | Chat messages are already in context — no need to "wait" |

---

## Tradeoffs

### What We Gain

1. **Massive simplification** — Remove 7 interrelated mechanisms, replace with nothing
2. **No race conditions** — No gap between resume and `continue_waiting`, no missed replies
3. **No threading burden** — Humans just send messages, no `messageId` needed
4. **Natural multi-agent conversations** — Agents just read context and respond
5. **More robust state** — Memories/goals in DB vs. transient in-run state
6. **Simpler implementation** — No `waitState` metadata, no reply detection, no catch-up checks
7. **Simpler `send_message`** — One parameter: `text`

### What We Lose

1. **Run continuity** — A single run can't span multiple messages. Complex multi-step reasoning must be reconstructed from context each time.
2. **Cost** — Each human message creates runs for all agents. Most runs are short (agent stays silent), but each still requires at least one LLM call.
3. **Guaranteed sequential processing** — With waiting, the agent processes replies in order within one run. Without waiting, each reply creates an independent run — if two arrive simultaneously, two runs start and might produce conflicting actions.

### Mitigations

**For run continuity:**
- Memories and goals bridge runs effectively
- The space timeline IS the continuity — the agent re-reads it each time
- For truly complex workflows, the agent stores intermediate results in memories

**For cost:**
- The current model ALREADY triggers all agents on every message — the number of trigger events is identical
- The difference is: paused runs (old) vs. fresh runs (new) for "reply" messages — a minor increase
- Short "should I respond?" runs can be optimized with lightweight pre-filtering

**For sequential processing:**
- Deduplication already prevents duplicate runs from the same message
- For critical ordering, the agent can use goals to track step-by-step progress
- In practice, simultaneous replies are rare for human-to-agent conversations

---

## Impact on Existing Docs

| Document | Changes Needed |
|----------|---------------|
| `00-core-philosophy.md` | Remove "waits for replies" from primitives. Simplify principle #4. |
| `01-trigger-system.md` | Remove `senderExpectsReply`. Simplify trigger context. |
| `04-messaging-and-waiting.md` | **Major rewrite.** Remove all waiting sections, `continue_waiting`, `resume_run`. Keep only `send_message({ text })`. |
| `05-context-model.md` | Remove `senderExpectsReply` from trigger block. Context model otherwise unchanged. |
| `06-run-awareness.md` | Remove `waiting_reply` from run states. Remove `resume_run` tool. |
| `09-data-model.md` | Remove `waiting_reply` from RunStatus enum. Remove `waitState` metadata. |
| `10-implementation-blueprint.md` | Simplify: no wait/resume logic in run-runner. |
| `11-examples-and-scenarios.md` | Rewrite scenarios 3, 4 to use stateless model. |
| `12-streaming-and-redis.md` | Remove `run.waiting_reply` event. |
| `14-prebuilt-tools-reference.md` | Remove `continue_waiting`, `resume_run`. Simplify `send_message`. |

---

## The Human Test (Revisited)

From `07-human-like-behavior.md`:

> If you replaced the agent with a human, would the system still make sense?

With the stateless model, the answer is **more yes than before**:

- A human enters a space → `enter_space` ✅
- A human reads the chat → `read_messages` ✅
- A human sends a message → `send_message` ✅
- A human **checks back later when there's a new message** → new run with context ✅
- ~~A human "waits" and "resumes"~~ → humans don't actually do this in chat ❌

The stateless model is **more human-like** than the waiting model. Humans don't pause their brain — they come back with fresh eyes and full context.

---

## Recommendation

**Adopt the stateless model.** The simplification is massive and the tradeoffs are manageable.

The waiting model was designed for a world where the agent needs explicit coordination. But the system already has the tools for implicit coordination:
- **Space history** with `[SEEN]`/`[NEW]` markers tells the agent what's new
- **Memories and goals** persist state across runs
- **All-agent triggering** ensures every relevant agent sees every message

These three mechanisms, combined with the LLM's reasoning ability, are sufficient to handle every conversation pattern — without any waiting, threading, or resume logic.

### The Final `send_message`

```json
{
  "name": "send_message",
  "description": "Post a message to the active space.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "text": { "type": "string", "description": "Message text." }
    },
    "required": ["text"]
  }
}
```

One tool. One parameter. Maximum simplicity.
