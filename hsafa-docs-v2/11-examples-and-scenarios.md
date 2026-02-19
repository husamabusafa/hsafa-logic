# 11 — Examples & Scenarios

## Overview

Real-world interaction flows showing how v2 primitives combine to produce human-like agent behavior. Each scenario traces the full lifecycle: trigger → context → actions → outcome.

---

## Scenario 1: Simple 1:1 Chat (Two-Entity Space)

**Setup:** Space "1:1 with Husam" — Husam (human) + Assistant (agent).

### Flow

```
Husam: "What's the weather in Amman?"

→ Gateway detects 2-entity space (1 human + 1 agent)
→ Auto-triggers Assistant (no mention needed)

Assistant Run:
  TRIGGER: Husam (human) in "1:1 with Husam": "What's the weather in Amman?"
  ACTIVE SPACE: "1:1 with Husam" (auto-set)

  1. Agent calls fetchWeather({ city: "Amman" })
     → Tool result: { temp: 22, condition: "sunny" }
     → Posted to space (visibility: visible)

  2. Agent calls send_message({ text: "It's 22°C and sunny in Amman right now!" })
     → Message streamed to space

  Run completes.
```

**User sees:**
1. Tool card: "fetchWeather → 22°C, sunny"
2. Message: "It's 22°C and sunny in Amman right now!"

---

## Scenario 2: Multi-Agent Space with Mentions

**Setup:** Space "Project Alpha" — Husam (human), Ahmad (human), Designer (agent), Developer (agent).

### Flow

```
Husam: "@Designer create a landing page mockup for the new product"

→ Gateway parses @Designer → resolves to Designer's entity ID
→ Triggers Designer

Designer Run:
  TRIGGER: Husam (human) in "Project Alpha": "@Designer create a landing page mockup..."
  ACTIVE SPACE: "Project Alpha" (auto-set)

  1. Agent calls generateImage({ prompt: "Modern landing page mockup..." })
     → Image generated, result posted to space (visible)

  2. Agent calls send_message({ text: "Here's the mockup! Key elements: hero banner, CTA button, testimonials section. @Developer can you review the feasibility?" })
     → Message posted to space
     → Gateway parses @Developer → triggers Developer

Developer Run:
  TRIGGER: Designer (agent) in "Project Alpha": "Here's the mockup!... @Developer can you review the feasibility?"
  ACTIVE SPACE: "Project Alpha" (auto-set)

  SPACE HISTORY:
    [14:00] Husam (human): "@Designer create a landing page mockup..."
    [14:01] Designer (agent): [tool_call: generateImage → image result]
    [14:01] Designer (agent): "Here's the mockup!... @Developer can you review the feasibility?"  ← TRIGGER

  1. Agent reasons about the mockup description
  2. Agent calls send_message({ text: "The layout looks doable. Hero banner and CTA are straightforward. Testimonials section will need a carousel component — I'd estimate 2 days." })
     → Message posted to space

  Run completes.
```

**Space timeline (what everyone sees):**
1. Husam: "@Designer create a landing page mockup..."
2. Designer: [generateImage tool card with result]
3. Designer: "Here's the mockup!... @Developer can you review the feasibility?"
4. Developer: "The layout looks doable... I'd estimate 2 days."

---

## Scenario 3: Agent Waits for Human Approval

**Setup:** Space "Deployments" — Sarah (human), DeployBot (agent).

### Flow

```
Sarah: "Deploy v2.1 to production"

→ 2-entity space → auto-trigger DeployBot

DeployBot Run:
  TRIGGER: Sarah (human) in "Deployments": "Deploy v2.1 to production"
  ACTIVE SPACE: "Deployments" (auto-set)

  1. Agent calls send_message({
       text: "I'll deploy v2.1 to production. This will affect 3 services. Confirm by replying 'yes'.",
       wait: true
     })
     → Message posted to space
     → Run enters waiting_reply (waiting for any human — no mention)

  ... Sarah reads the message ...

Sarah: "yes"

→ Gateway detects waiting_reply run for this space
→ Sarah is a human in the space → matches "any human" wait condition
→ Reply recorded, run resumes

DeployBot Run (resumed):
  Tool result from send_message: {
    replies: [{ entityName: "Sarah", text: "yes", timestamp: "..." }],
    status: "resolved"
  }

  2. Agent reasons: Sarah approved
  3. Agent calls deployService({ version: "2.1", target: "production" })
     → Deployment starts (visible tool card in space)

  4. Agent calls send_message({ text: "Deployment complete! All 3 services running v2.1." })

  Run completes.
```

---

## Scenario 4: Agent-to-Agent Collaboration with Wait

**Setup:** Space "Research" — Husam (human), Researcher (agent), Summarizer (agent).

### Flow

```
Husam: "@Researcher find the top 5 AI papers from last week"

→ Triggers Researcher

Researcher Run:
  1. Agent calls searchPapers({ query: "AI", period: "last_week", limit: 5 })
     → Returns 5 papers

  2. Agent calls send_message({
       text: "@Summarizer can you summarize these papers? [paper list]",
       wait: true
     })
     → Triggers Summarizer
     → Researcher's run pauses (waiting_reply for Summarizer)

Summarizer Run:
  TRIGGER: Researcher (agent) in "Research": "@Summarizer can you summarize these papers?..."
  
  1. Agent reads the paper list from the trigger message
  2. Agent calls send_message({ text: "Here are the summaries:\n1. Paper A: ...\n2. Paper B: ..." })
  
  Run completes.

→ Summarizer's message resolves Researcher's wait

Researcher Run (resumed):
  Receives reply: "Here are the summaries: ..."

  3. Agent calls send_message({ text: "Here's your research report:\n\n[formatted summaries]\n\nLet me know if you want me to dig deeper into any of these." })

  Run completes.
```

**Key:** Researcher didn't fire-and-forget. It waited for Summarizer, then composed a final response incorporating both its own search results and Summarizer's summaries.

---

## Scenario 5: Plan-Triggered Cross-Space Action

**Setup:**
- ReportBot (agent) belongs to spaces: "Daily Reports", "Management", "Engineering"
- Plan: "Daily Metrics" — cron: `0 9 * * *` (every day at 9am)

### Flow

```
[9:00 AM — Plan triggers]

ReportBot Run:
  TRIGGER: Plan "Daily Metrics" triggered
  ACTIVE SPACE: none

  1. Agent calls enter_space("Daily Reports")
     → Active space set

  2. Agent calls read_messages({ limit: 10 })
     → Reads recent messages for context

  3. Agent calls fetchMetrics({ date: "2026-02-18" })
     → Gets metrics data

  4. Agent calls send_message({ text: "📊 Daily Report (Feb 18):\n- Revenue: $45K (+12%)\n- Users: 1,230 (+5%)\n- Errors: 3 (down from 8)" })
     → Posted to "Daily Reports"

  5. Agent calls enter_space("Management")
     → Switches active space

  6. Agent calls send_message({ text: "Quick update: Revenue up 12%, users up 5%. Full report in #daily-reports." })
     → Posted to "Management" with origin annotation:
       [sent because plan "Daily Metrics" triggered]

  7. Agent calls enter_space("Engineering")

  8. Agent calls send_message({ text: "Heads up: error count dropped to 3 yesterday. Nice work!" })
     → Posted to "Engineering" with origin annotation

  Run completes.
```

**Key:** Single run, three spaces. The agent enters each space, posts contextually appropriate content, and moves on. Origin annotations explain why a plan-triggered agent is posting in each space.

---

## Scenario 6: Service Trigger (Jira Webhook)

**Setup:**
- ProjectBot (agent) belongs to "Engineering" space
- External Jira webhook integration

### Flow

```
[Jira fires webhook: issue PROJ-456 moved to "Done"]

POST /api/agents/{projectBotId}/trigger
  { "serviceName": "jira", "payload": { "issue": "PROJ-456", "status": "done", "assignee": "Ahmad" } }

ProjectBot Run:
  TRIGGER: Service "jira" — payload: { issue: "PROJ-456", status: "done", assignee: "Ahmad" }
  ACTIVE SPACE: none

  1. Agent calls enter_space("Engineering")

  2. Agent calls read_messages({ limit: 20 })
     → Sees previous discussion about PROJ-456

  3. Agent calls send_message({ text: "PROJ-456 is done! Ahmad closed it. The ticket was about fixing the login timeout bug." })

  Run completes.
```

---

## Scenario 7: Concurrent Runs with Awareness

**Setup:** Space "Support" — Husam (human), Ahmad (human), SupportBot (agent).

### Flow

```
[Same second:]
Husam: "@SupportBot my account is locked"
Ahmad: "@SupportBot I can't access the billing page"

→ Two independent runs triggered

SupportBot Run 1:
  TRIGGER: Husam — "my account is locked"
  ACTIVE RUNS:
    - Run 1 (this run) — Husam's account issue
    - Run 2 (running) — Ahmad's billing issue

  1. Agent calls checkAccount({ userId: "husam-id" })
  2. Agent calls send_message({ text: "Husam, I've unlocked your account. You should be able to log in now." })

SupportBot Run 2:
  TRIGGER: Ahmad — "I can't access the billing page"
  ACTIVE RUNS:
    - Run 1 (running) — Husam's account issue
    - Run 2 (this run) — Ahmad's billing issue

  1. Agent calls checkBilling({ userId: "ahmad-id" })
  2. Agent calls send_message({ text: "Ahmad, the billing page issue was due to an expired session. I've refreshed it — try again." })
```

**Key:** Both runs execute in parallel. Each knows about the other. Neither duplicates work or gets confused.

---

## Scenario 8: Multi-Turn Human Conversation

**Setup:** 2-entity space — Husam + AssistantBot.

### Flow

```
Husam: "Help me plan a trip to Tokyo"

AssistantBot Run 1:
  1. send_message({ text: "I'd love to help! When are you thinking of going, and for how long?", wait: true })
  → Pauses

Husam: "First week of April, about 5 days"

→ Reply resolves wait

AssistantBot Run 1 (resumed):
  2. Reasons: April, 5 days, Tokyo
  3. send_message({ text: "Great timing — cherry blossom season! Here's a rough itinerary:\n\nDay 1: Shinjuku & Shibuya\nDay 2: Asakusa & Akihabara\n...\n\nWant me to find hotels and flights?", wait: true })
  → Pauses again

Husam: "Yes, budget around $150/night for hotels"

→ Reply resolves wait

AssistantBot Run 1 (resumed):
  4. calls searchHotels({ city: "Tokyo", dates: "2026-04-01 to 2026-04-06", maxPrice: 150 })
  5. calls searchFlights({ destination: "NRT", dates: "2026-04-01 to 2026-04-06" })
  6. send_message({ text: "Found 3 great options:\n\n🏨 Hotels:\n1. ...\n\n✈️ Flights:\n1. ...\n\nWant me to book any of these?" })

  Run completes (no wait this time — agent delivered the final answer).
```

**Key:** Single run with multiple wait cycles. The agent maintains full context across the entire conversation — it doesn't lose track of "Tokyo, April, 5 days, $150 budget" between turns.

---

## Scenario 9: Agent Decides Not to Respond

**Setup:** Space "General" — Husam, Ahmad, HelperBot.

### Flow

```
Husam: "Hey Ahmad, how was your weekend?"

→ No @mention of HelperBot
→ HelperBot is NOT triggered (mention-based triggering)
→ Nothing happens — the message is just a human conversation

Ahmad: "Great! Went hiking. @HelperBot what's the weather forecast for next Saturday?"

→ @HelperBot mentioned → HelperBot triggered

HelperBot Run:
  1. calls fetchWeather({ date: "2026-02-22" })
  2. send_message({ text: "Next Saturday looks clear — 18°C, light breeze. Perfect hiking weather!" })

  Run completes.
```

**Key:** No `skipResponse` tool needed. The agent is simply not triggered when not mentioned. The architecture prevents unnecessary agent intervention.

---

## Scenario 10: Full Agent Config Example (v2)

```json
{
  "version": "2.0",
  "agent": {
    "name": "ProjectAssistant",
    "description": "Manages project tasks, coordinates with team members, and provides status updates.",
    "system": "You are ProjectAssistant, a proactive and organized project manager. You care about deadlines, quality, and team coordination. Be concise but thorough."
  },
  "model": {
    "provider": "openai",
    "name": "gpt-5",
    "api": "responses",
    "temperature": 0.5,
    "maxOutputTokens": 8000,
    "reasoning": {
      "enabled": true,
      "effort": "medium",
      "summary": "auto"
    }
  },
  "loop": {
    "maxSteps": 10,
    "toolChoice": "auto"
  },
  "tools": [
    {
      "name": "fetchJiraTickets",
      "description": "Fetch Jira tickets with filters",
      "executionType": "gateway",
      "visibility": "visible",
      "inputSchema": {
        "type": "object",
        "properties": {
          "project": { "type": "string" },
          "status": { "type": "string" }
        },
        "required": ["project"]
      },
      "execution": {
        "url": "https://jira.company.com/api/search",
        "method": "GET",
        "headers": { "Authorization": "Bearer ${env.JIRA_TOKEN}" },
        "timeout": 15000
      }
    },
    {
      "name": "confirmDeployment",
      "description": "Show deployment confirmation dialog to the user",
      "executionType": "space",
      "visibility": "visible",
      "inputSchema": {
        "type": "object",
        "properties": {
          "service": { "type": "string" },
          "version": { "type": "string" },
          "environment": { "type": "string" }
        },
        "required": ["service", "version", "environment"]
      },
      "display": {
        "customUI": "deploymentConfirmation"
      }
    }
  ],
  "mcp": {
    "servers": [
      {
        "name": "github-tools",
        "url": "https://mcp.github.com",
        "transport": "http",
        "headers": { "Authorization": "Bearer ${env.GITHUB_TOKEN}" },
        "allowedTools": ["list_prs", "create_issue"]
      }
    ]
  }
}
```
