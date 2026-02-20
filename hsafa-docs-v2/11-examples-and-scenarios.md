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

## Scenario 2: Multi-Agent Space (All Agents Triggered)

**Setup:** Space "Project Alpha" — Husam (human), Ahmad (human), Designer (agent), Developer (agent).

### Flow

```
Husam: "Create a landing page mockup for the new product"

→ Gateway triggers ALL agent members: Designer, Developer
→ Two independent runs created

Designer Run:
  TRIGGER: Husam (human) in "Project Alpha": "Create a landing page mockup..."
  ACTIVE SPACE: "Project Alpha" (auto-set)

  1. Agent reasons: this is a design task — I should respond.
  2. Agent calls generateImage({ prompt: "Modern landing page mockup..." })
     → Image generated, result posted to space (visible: true)

  3. Agent calls send_message({ text: "Here's the mockup! Key elements: hero banner, CTA button, testimonials section." })
     → Message posted to space
     → Triggers Developer (Designer excluded as sender)

  Run completes.

Developer Run (from Husam's message):
  TRIGGER: Husam (human) in "Project Alpha": "Create a landing page mockup..."
  1. Agent reasons: this is a design task, not a dev task yet. I'll stay silent.
  Run completes (no message sent).

Developer Run (from Designer's message):
  TRIGGER: Designer (agent) in "Project Alpha": "Here's the mockup! Key elements: hero banner..."
  1. Agent reads space history — sees the mockup details.
  2. Agent calls send_message({ text: "The layout looks doable. Hero banner and CTA are straightforward. Testimonials section will need a carousel — I'd estimate 2 days." })
     → Triggers Designer

  Run completes.

Designer Run (from Developer's message):
  1. Agent reasons: Developer gave a feasibility assessment. No further design input needed.
  Run completes (no message sent).
```

**Key:** Every message triggers all other agent members. Agents independently decide whether to respond.

---

## Scenario 3: Agent Asks for Human Approval

**Setup:** Space "Deployments" — Sarah (human), DeployBot (agent).

### Flow

```
Sarah: "Deploy v2.1 to production"

→ Gateway triggers all agent members: DeployBot

DeployBot Run 1:
  TRIGGER: Sarah (human) in "Deployments": "Deploy v2.1 to production"
  ACTIVE SPACE: "Deployments" (auto-set)

  1. Agent calls send_message({
       text: "I'll deploy v2.1 to production. This will affect 3 services. Confirm by replying 'yes'."
     })
     → Message posted to space

  Run completes.

Sarah: "yes"

→ Gateway triggers DeployBot

DeployBot Run 2:
  TRIGGER: Sarah (human) in "Deployments": "yes"
  Context:
    [SEEN] Sarah: "Deploy v2.1 to production"
    [SEEN] DeployBot: "...Confirm by replying 'yes'."
    [NEW]  Sarah: "yes"  ← TRIGGER

  1. Agent reasons: "I asked for confirmation, Sarah said yes."
  2. Agent calls deployService({ version: "2.1", target: "production" })
     → Deployment starts (visible tool card in space)

  3. Agent calls send_message({ text: "Deployment complete! All 3 services running v2.1." })

  Run completes.
```

**Key:** No waiting, no pausing. Two short runs. The second run reads context, sees its own question + Sarah's answer, and proceeds.

---

## Scenario 4: Multi-Agent Collaboration

**Setup:** Space "Research" — Husam (human), Researcher (agent), Summarizer (agent).

### Flow

```
Husam: "Find the top 5 AI papers from last week and summarize them"

→ Gateway triggers ALL agent members: Researcher, Summarizer

Researcher Run:
  TRIGGER: Husam (human) in "Research": "Find the top 5 AI papers..."
  1. Agent calls searchPapers({ query: "AI", period: "last_week", limit: 5 })
     → Returns 5 papers

  2. Agent calls send_message({
       text: "Found 5 papers:\n1. Paper A — ...\n2. Paper B — ...\n[full list]"
     })
     → Message posted to space, triggers Summarizer

  Run completes.

Summarizer Run (from Husam's message):
  TRIGGER: Husam (human) in "Research": "Find the top 5 AI papers..."
  1. Agent reasons: Researcher is better suited for finding papers. I'll stay silent.
  Run completes.

Summarizer Run (from Researcher's message):
  TRIGGER: Researcher (agent) in "Research": "Found 5 papers: ..."
  Context:
    [SEEN] Husam: "Find the top 5 AI papers..."
    [NEW]  Researcher: "Found 5 papers: ..."  ← TRIGGER

  1. Agent reads the paper list from context
  2. Agent calls send_message({
       text: "Here are the summaries:\n1. Paper A: ...\n2. Paper B: ..."
     })

  Run completes.

Researcher Run (from Summarizer's message):
  TRIGGER: Summarizer (agent) in "Research": "Here are the summaries: ..."
  Context:
    [SEEN] Husam: "Find the top 5 AI papers..."
    [SEEN] Researcher: "Found 5 papers: ..."
    [NEW]  Summarizer: "Here are the summaries: ..."

  1. Agent reasons: Summaries are done. Husam has everything he needs.
  2. Agent calls send_message({ text: "Research complete! Here's your full report:\n\n[formatted summaries]\n\nLet me know if you want me to dig deeper into any of these." })

  Run completes.
```

**Key:** Both agents were triggered by the same human message. Each message triggers new runs. No waiting, no `messageId` threading — just agents reading context and contributing naturally.

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
Husam: "My account is locked"
Ahmad: "I can't access the billing page"

→ Each message triggers SupportBot → two independent runs

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

→ Triggers AssistantBot

AssistantBot Run 1:
  Context: [NEW] Husam: "Help me plan a trip to Tokyo"
  1. send_message({ text: "I'd love to help! When are you thinking of going, and for how long?" })
  Run completes.

Husam: "First week of April, about 5 days"

→ Triggers AssistantBot

AssistantBot Run 2:
  Context:
    [SEEN] Husam: "Help me plan a trip to Tokyo"
    [SEEN] AssistantBot: "When are you thinking of going...?"
    [NEW]  Husam: "First week of April, about 5 days"
  1. Reasons: April, 5 days, Tokyo
  2. send_message({ text: "Great timing — cherry blossom season! Here's a rough itinerary:\n\nDay 1: Shinjuku & Shibuya\nDay 2: Asakusa & Akihabara\n...\n\nWant me to find hotels and flights?" })
  Run completes.

Husam: "Yes, budget around $150/night for hotels"

→ Triggers AssistantBot

AssistantBot Run 3:
  Context:
    [SEEN] Husam: "Help me plan a trip to Tokyo"
    [SEEN] AssistantBot: "When are you thinking of going...?"
    [SEEN] Husam: "First week of April, about 5 days"
    [SEEN] AssistantBot: "Great timing — cherry blossom season!..."
    [NEW]  Husam: "Yes, budget around $150/night"
  1. calls searchHotels({ city: "Tokyo", dates: "2026-04-01 to 2026-04-06", maxPrice: 150 })
  2. calls searchFlights({ destination: "NRT", dates: "2026-04-01 to 2026-04-06" })
  3. send_message({ text: "Found 3 great options:\n\n🏨 Hotels:\n1. ...\n\n✈️ Flights:\n1. ...\n\nWant me to book any of these?" })
  Run completes.
```

**Key:** Three short runs, each reading the full conversation context. The agent doesn't lose track of "Tokyo, April, 5 days, $150 budget" — the entire timeline is in `[SEEN]` context every run. No waiting, no pausing, no state management.

---

## Scenario 9: Agent Decides Not to Respond (Selective Silence)

**Setup:** Space "General" — Husam, Ahmad, HelperBot.

### Flow

```
Husam: "Hey Ahmad, how was your weekend?"

→ Gateway triggers all agent members: HelperBot

HelperBot Run:
  TRIGGER: Husam (human) in "General": "Hey Ahmad, how was your weekend?"
  
  1. Agent reasons: this is casual conversation between humans. I have nothing to contribute.
  
  Run completes (no message sent).

Ahmad: "Great! Went hiking."

→ Ahmad is human → triggers HelperBot again

HelperBot Run:
  1. Agent reasons: still casual conversation. Stay silent.
  
  Run completes (no message sent).

Husam: "That sounds fun! What's the weather forecast for next Saturday?"

→ Gateway triggers HelperBot

HelperBot Run:
  1. Agent reasons: weather question — this is my domain.
  2. calls fetchWeather({ date: "2026-02-22" })
  3. send_message({ text: "Next Saturday looks clear — 18°C, light breeze. Perfect hiking weather!" })

  Run completes.
```

**Key:** HelperBot is triggered by every message (human or agent), but it independently decides whether to respond. For casual conversation, it stays silent. For weather questions, it contributes. No `skipResponse` tool needed — silence is the default behavior when the agent doesn't call `send_message`.

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
      "visible": true,
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
      "visible": true,
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
