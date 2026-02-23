# Complete Scenarios

## Scenario 1: Human → Agent → Cross-Space Ask → Return Response

**Setup:**
- Space X: "Husam's Chat" — Husam (human), AI Assistant (agent, admin)
- Space Y: "Finance Team" — Finance Agent (admin), Data Agent

**Flow:**

```
Husam (Space X): "What's our Q4 budget status?"

1. Gateway creates a GENERAL RUN for AI Assistant (admin of Space X)
   Trigger: { type: "space_message", spaceId: spaceX, messageContent: "What's our Q4 budget status?", senderName: "Husam", senderType: "human" }
   Gateway starts relaying run events to Space X's SSE channel

2. AI Assistant (internal reasoning): "I need budget data from the Finance space"

3. AI Assistant calls readSpaceMessages(spaceY, 5)
   → internal tool call (no space part shown)
   → tool returns: [
       { sender: "Finance Agent", text: "Monthly report posted...", time: "..." },
       { sender: "Ahmad", text: "Can we get updated numbers?", time: "..." }
     ]

4. AI Assistant calls sendSpaceMessage(spaceY, "What's the current Q4 budget status? Husam needs a summary.",
     mention: financeAgentEntityId, wait: { for: [{ type: "agent" }], timeout: 60 })
   → message streams into Space Y; wait state is internal to the run

   --- In Space Y (Finance Team): ---
   a. AI Assistant's message streams into Space Y (real LLM streaming via tool-input-delta)
   b. Gateway creates a NEW GENERAL RUN for Finance Agent (mentioned agent)
      Trigger: { type: "space_message", senderType: "agent", senderName: "AI Assistant", mentionReason: "Q4 budget question" }
      Gateway relays this run's events to Space Y
   c. Finance Agent calls `queryBudgetAPI({ ..., targetSpaceId: spaceY })` (tool has `displayTool: true`)
      → tool card appears in Space Y
   d. Finance Agent calls sendSpaceMessage(spaceY, "Q4 budget: $2.1M allocated, $1.7M spent, $400K remaining...")
      → streams into Space Y (real LLM tokens)
   e. Finance Agent's run completes
   --- Back in AI Assistant's run: ---

5. sendSpaceMessage wait resolves: { reply: "Q4 budget: $2.1M allocated...", repliedBy: "Finance Agent" }
   → internal tool result; AI Assistant continues

6. AI Assistant calls sendSpaceMessage(spaceX, "Here's the Q4 budget from our finance team: $2.1M allocated, $1.7M spent, with $400K remaining...")
   → streams into Space X (real LLM tokens)

7. AI Assistant's run completes
```

**What Husam sees in Space X (one composite message, streamed):**
```
Husam: What's our Q4 budget status?
AI Assistant:
  Here's the Q4 budget from our finance team: $2.1M allocated... (text part, REAL LLM streaming)
```

`readSpaceMessages` is internal (not visible to the user). The cross-space `sendSpaceMessage` with `wait` is also internal tool mechanics — only the final text parts appear in the composite message.

**What users see in Space Y (streamed):**
```
AI Assistant: What's the current Q4 budget status? Husam needs a summary. (real LLM streaming)
Finance Agent: [thinking...] [tool: queryBudgetAPI ✓]
  Q4 budget: $2.1M allocated, $1.7M spent, $400K remaining... (real LLM streaming)
```

**Total: Two general runs. Zero space-bound logic. Both spaces see full streaming.**

---

## Scenario 2: Multi-Agent Space — Admin Delegates to Specialist

**Setup:**
- Space: "Engineering Ops"
- Members: Husam (human), Ops-Agent (admin), Deploy-Agent, QA-Agent

**Flow:**

```
Husam: "Roll back the last deployment, it broke the login page"

1. Gateway creates GENERAL RUN for Ops-Agent (admin — receives human messages)
   Trigger: { type: "space_message", spaceId: opsSpace, messageContent: "Roll back...", senderName: "Husam", senderType: "human" }
   Gateway relays events to "Engineering Ops" space

2. Ops-Agent reasons: "This is a deployment issue. Deploy-Agent should handle this directly."
3. Ops-Agent calls delegateToAgent(deployAgentEntityId)
   → Ops-Agent's run is silently canceled and removed

4. Gateway creates NEW GENERAL RUN for Deploy-Agent with the ORIGINAL trigger:
   Trigger: { type: "space_message", spaceId: opsSpace, messageContent: "Roll back the last deployment, it broke the login page", senderName: "Husam", senderType: "human" }
   Gateway relays this run's events to "Engineering Ops" space

5. Deploy-Agent sees Husam's message directly — as if Ops-Agent was never involved
6. Deploy-Agent calls `checkDeployments({ ..., targetSpaceId: opsSpace })` (tool has `displayTool: true`) → sees deploy #287
   → tool card appears in Engineering Ops
7. Deploy-Agent calls `rollbackDeploy({ ..., targetSpaceId: opsSpace })` (tool has `displayTool: true`) → success
   → tool card appears in Engineering Ops
8. Deploy-Agent calls sendSpaceMessage(opsSpace, "Done — I've rolled back deployment #287. The login page should be back to normal in about 2 minutes.")
   → streams into Engineering Ops (real LLM tokens)
```

**What Husam sees:**
```
Husam: Roll back the last deployment, it broke the login page
Deploy-Agent: [thinking...] [tool: checkDeployments ✓] [tool: rollbackDeploy ✓]
  Done — I've rolled back deployment #287... (real LLM streaming)
```

The delegation is invisible — Husam sees Deploy-Agent respond directly to their message. No admin message, no handoff visible. The right agent just handles it.

---

## Scenario 3: Client Tool — Browser Interactive UI (Composite Message)

**Setup:**
- Space: "Shopping Assistant"
- Members: Sarah (human), Shop-Agent (agent, admin)
- Agent has a client tool: `showProductCard` (no server-side execute, `displayTool: true`)
- Agent has a server tool: `searchProducts` (HTTP, `displayTool: true`)

**Flow:**

```
Sarah: "Show me some laptops under $1500"

1. Gateway creates GENERAL RUN for Shop-Agent (admin)
   Trigger: { type: "space_message", spaceId: shopSpace, messageContent: "Show me some laptops...", senderName: "Sarah", senderType: "human" }
   Gateway relays run events to "Shopping Assistant" space
   Gateway creates empty composite message for shopSpace (runId: run-abc)

2. Agent calls sendSpaceMessage(shopSpace, "Let me search for laptops under $1,500 for you.")
   → text part streams into composite message via tool-input-delta

3. Agent calls `searchProducts({ query: "laptops under 1500", targetSpaceId: shopSpace })` → gets 3 results
   → tool card part added to composite message (routed via `targetSpaceId` → shows "searchProducts ✓")

4. Agent calls showProductCard({ productId: "mac-air", name: "MacBook Air M4", price: 1299, targetSpaceId: shopSpace })
5. Agent calls showProductCard({ productId: "thinkpad-x1", name: "ThinkPad X1", price: 1449, targetSpaceId: shopSpace })
   → 2 client tool_call parts added to composite message → stream ends

6. Gateway detects pending client tool calls → sets run status: waiting_tool
7. Gateway relays run.waiting_tool to "Shopping Assistant" space SSE

8. Sarah's browser renders the composite message so far:
   - Text: "Let me search for laptops under $1,500 for you."
   - Tool card: [searchProducts ✓]
   - Product card UI: MacBook Air M4 — $1,299 [Select]
   - Product card UI: ThinkPad X1 — $1,449 [Select]

9. Sarah clicks "Select" on MacBook Air
   → ProductCard component calls submitToRun(runId, { callId: "...", result: { selected: "mac-air" } })
   → Second card auto-submits { selected: null }

10. Gateway receives both results → resumes run
11. Agent sees results → calls sendSpaceMessage(shopSpace, "Great choice! The MacBook Air M4 at $1,299 is excellent. Want me to add it to your cart?")
    → another text part appended to the SAME composite message (real LLM streaming)

12. Run completes → composite message finalized with all parts
```

**What Sarah sees — ONE composite message:**
```
Sarah: Show me some laptops under $1500
Shop-Agent:
  Let me search for laptops under $1,500 for you. (streamed text part)
  [searchProducts ✓] (tool card part, routed with `targetSpaceId`)
  ┌─────────────────────────────┐  ┌─────────────────────────────┐
  │ MacBook Air M4       $1,299 │  │ ThinkPad X1 Carbon   $1,449 │
  │ [image]                     │  │ [image]                     │
  │        [ Select ]           │  │        [ Select ]           │
  └─────────────────────────────┘  └─────────────────────────────┘
  Sarah clicks MacBook Air →
  Great choice! The MacBook Air M4 at $1,299 is excellent... (streamed text part)
```

**Composite message in DB:**
```json
{
  "id": "msg-123", "spaceId": "shopSpace", "entityId": "shop-agent", "runId": "run-abc",
  "parts": [
    { "type": "text", "text": "Let me search for laptops under $1,500 for you." },
    { "type": "tool_call", "toolName": "searchProducts", "toolCallId": "call-0", "args": { "query": "laptops under 1500" }, "status": "done" },
    { "type": "tool_call", "toolName": "showProductCard", "toolCallId": "call-1", "args": { "productId": "mac-air", "name": "MacBook Air M4", "price": 1299 }, "result": { "selected": "mac-air" } },
    { "type": "tool_call", "toolName": "showProductCard", "toolCallId": "call-2", "args": { "productId": "thinkpad-x1", "name": "ThinkPad X1", "price": 1449 }, "result": { "selected": null } },
    { "type": "text", "text": "Great choice! The MacBook Air M4 at $1,299 is excellent. Want me to add it to your cart?" }
  ]
}
```

All tool calls and text in one cohesive message. No separate bubbles.

---

## Scenario 4: Service Trigger — Jira Webhook (No System Entity)

**Setup:**
- Ops-Agent is a member of "Engineering Ops" space
- Jira is configured as an external service (NOT an entity, NOT a space member)
- A Node.js backend handles `runSqlQuery` client tools

**Flow:**

```
Jira sends webhook → Node.js backend calls POST /api/agents/{opsAgentId}/trigger
  payload: { event: "ticket_critical", ticketId: "PROJ-123", summary: "Login page broken after deploy #287" }

1. Gateway creates GENERAL RUN for Ops-Agent
   Trigger: { type: "service", serviceName: "Jira", payload: { event: "ticket_critical", ... } }
   No trigger space — no event relay (run is standalone)

2. Ops-Agent reasons: "Critical ticket, need to check recent deployments and alert the team"

3. Ops-Agent calls sendSpaceMessage(engineeringSpace, "🚨 Critical ticket PROJ-123: Login broken after deploy #287. Investigating.",
     mention: deployAgentEntityId, wait: { for: [{ type: "agent" }], timeout: 60 })
   → streams into Engineering Ops (real LLM tokens)
   → Deploy-Agent is triggered (new general run)

4. Deploy-Agent checks deployments → identifies deploy #287 → rolls back
5. Deploy-Agent calls sendSpaceMessage(engineeringSpace, "Rolled back deploy #287. Login page restored.")
   → streams into Engineering Ops (real LLM tokens)

6. Ops-Agent's wait resolves with Deploy-Agent's reply
7. Ops-Agent calls sendSpaceMessage(engineeringSpace, "Incident resolved. Deploy #287 was rolled back. Login is back to normal.")
   → streams into Engineering Ops (real LLM tokens)
```

**Key:** Jira is NOT an entity. It doesn't appear in the space member list. It simply triggers the agent via API. The agent decides which spaces to communicate with.

---

## Scenario 5: Plan Run — Identical to Human-Triggered Run

**Setup:**
- Ops-Manager-Agent has a scheduled plan: "Morning standup report" (daily 6 AM)
- Spaces: "Engineering" (agents + humans), "Finance" (Finance Agent), "Leadership" (executives)

**Flow:**

```
Plan triggers at 6:00 AM

1. Gateway creates GENERAL RUN for Ops-Manager-Agent
   Trigger: { type: "plan", planId: "plan-xyz", planName: "Morning Report" }
   No trigger space → no event relay (run is completely standalone)

2. readSpaceMessages(engineeringSpace, 30)
   → gets yesterday's activity: PRs merged, tickets resolved, etc.

3. sendSpaceMessage(financeSpace, "What's today's budget snapshot?",
     mention: financeAgentEntityId, wait: { for: [{ type: "agent" }], timeout: 30 })
   → triggers Finance Agent (new general run)
   → Finance Agent responds: "Budget: 85% used, $12K remaining this month"

4. Agent compiles the report internally (full context from both spaces)

5. sendSpaceMessage(engineeringSpace, "Good morning! Here's today's standup:\n- 4 PRs merged yesterday\n- 2 critical tickets open\n- Budget: 85% used ($12K remaining)\n- No PTO today")
   → streams into Engineering space (real LLM tokens)

6. sendSpaceMessage(leadershipSpace, "Daily Ops Summary:\n[condensed version]")
   → streams into Leadership space (real LLM tokens)

7. Agent updates its goals: setGoals([{ description: "Posted morning standup", ... }])

Done. One general run. Three spaces read/written. Full context throughout.
Same model as a human-triggered run — the only difference is the trigger context.
```

---

## Scenario 6: Cross-Space with Client Tool + Wait for Human

**Setup:**
- Space X: "Husam's Chat" — Husam (human), AI Assistant (admin)
- Space Y: "Ahmad's Chat" — Ahmad (human), AI Assistant (admin)
- AI Assistant has client tool `showConfirmation`

**Flow:**

```
Husam (Space X): "Tell Ahmad the meeting is moved to 3 PM, get his confirmation"

1. Gateway creates GENERAL RUN for AI Assistant (Space X admin)
   Trigger: { type: "space_message", spaceId: spaceX, messageContent: "Tell Ahmad...", senderName: "Husam", senderType: "human" }
   Gateway relays run events to Space X

2. AI Assistant reasons: "I need to message Ahmad's space and wait for his reply"
3. AI Assistant calls sendSpaceMessage(spaceY, "Hey Ahmad, the meeting got moved to 3 PM. Can you confirm?",
     wait: { for: [{ type: "entity", entityId: "entity-ahmad" }], timeout: 90 })
   → no tool card in Space X (internal wait mechanics)
   → Message streams into Space Y (real LLM tokens via tool-input-delta)
   → No agent mentioned — this is a message for Ahmad (human) to read

4. Ahmad sees the message in Space Y, types: "Yes, 3 PM works for me"
   → AI Assistant's wait resolves: { reply: "Yes, 3 PM works for me", repliedBy: "Ahmad" }

5. AI Assistant calls sendSpaceMessage(spaceX, "Ahmad confirmed — he'll be at the 3 PM meeting.")
   → streams into Space X (real LLM tokens)
```

**What Husam sees (Space X):**
```
Husam: Tell Ahmad the meeting is moved to 3 PM, get his confirmation
AI Assistant: [thinking...]
  Ahmad confirmed — he'll be at the 3 PM meeting. (real LLM streaming)
```

**What Ahmad sees (Space Y):**
```
AI Assistant: Hey Ahmad, the meeting got moved to 3 PM. Can you confirm? (real LLM streaming)
Ahmad: Yes, 3 PM works for me
```

No agent was mentioned in Space Y — the message was for Ahmad. The `wait: { for: [{ type: "entity", entityId: "entity-ahmad" }] }` blocked until Ahmad replied. No second agent run needed.

---

## Scenario 7: Agent Chain Within a Space (Mention + Wait)

**Setup:**
- Space: "Content Pipeline"
- Members: Manager (human), Editor-Agent (admin), Writer-Agent, SEO-Agent

**Flow:**

```
Manager: "Write a blog post about AI in healthcare"

1. Gateway creates GENERAL RUN for Editor-Agent (admin — receives human messages)
   Trigger: { type: "space_message", spaceId: contentSpace, messageContent: "Write a blog post...", senderName: "Manager", senderType: "human" }
   Gateway relays events to Content Pipeline space

2. Editor-Agent reasons: "Writing is Writer-Agent's job. I'll pass this and wait for the draft."
3. Editor-Agent calls sendSpaceMessage(contentSpace, "Great topic! Writer, please draft this.",
     mention: writerAgentEntityId, wait: { for: [{ type: "entity", entityId: writerAgentEntityId }] })
   → streams into Content Pipeline space (real LLM tokens)

4. Gateway creates NEW GENERAL RUN for Writer-Agent (mentioned agent)
   Trigger: { type: "space_message", senderType: "agent", senderName: "Editor-Agent" }

5. Writer-Agent drafts the blog post (uses research tools, etc.)
   → [relayed: tool cards appear as Writer-Agent works]

6. Writer-Agent wants SEO review before posting the draft:
   Writer-Agent calls sendSpaceMessage(contentSpace, "Draft ready. SEO, can you review?",
     mention: seoAgentEntityId, wait: { for: [{ type: "agent" }] })
   → streams into Content Pipeline space (real LLM tokens)

7. Gateway creates NEW GENERAL RUN for SEO-Agent (mentioned agent)
8. SEO-Agent analyzes keywords, responds:
   sendSpaceMessage(contentSpace, "SEO suggestions: add keywords X, Y, Z to the title...")
   → streams into Content Pipeline space

9. Writer-Agent's wait resolves with SEO feedback
10. Writer-Agent calls sendSpaceMessage(contentSpace, "Here's the final draft with SEO suggestions applied: [blog post]")
    → streams into Content Pipeline space (real LLM tokens)

11. Editor-Agent's wait resolves (waited for Writer-Agent specifically — resolves on Writer-Agent's final message, not SEO-Agent's)
12. Editor-Agent calls sendSpaceMessage(contentSpace, "Post looks great. Publishing now.")
    → streams into Content Pipeline space (real LLM tokens)
```

**What Manager sees:**
```
Manager: Write a blog post about AI in healthcare
Editor-Agent: Great topic! Writer, please draft this. (streaming)
Writer-Agent: [tool: research ✓] [tool: webSearch ✓]
  Draft ready. SEO, can you review? (streaming)
SEO-Agent: [thinking...]
  SEO suggestions: add keywords X, Y, Z... (streaming)
Writer-Agent: Here's the final draft with SEO suggestions: [blog post] (streaming)
Editor-Agent: Post looks great. Publishing now. (streaming)
```

**Key:** No reply stack, no mention chain metadata, no `routeToAgent`. Just `sendSpaceMessage` with `mention` + `wait`, chaining naturally. Each agent's blocking wait resolves when the mentioned agent finishes. Four general runs, clean sequential flow.
