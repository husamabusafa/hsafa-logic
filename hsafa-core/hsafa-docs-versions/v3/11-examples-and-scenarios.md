# 12 — Examples & Scenarios

## Overview

Real-world interaction flows showing how v3 primitives combine to produce human-like agent behavior. Each scenario traces the full lifecycle: inbox event → consciousness → think cycle → outcome.

---

## Scenario 1: Simple 1:1 Chat

**Setup:** Space "1:1 with Husam" — Husam (human) + Assistant (agent).

### Flow

```
Husam: "What's the weather in Amman?"
→ Event pushed to Assistant's inbox

Assistant wakes:
  consciousness = [system prompt, ...previous cycles]
  
  INBOX (1 event):
    [1:1 with Husam] Husam (human): "What's the weather in Amman?"

  Think cycle:
    Step 0: enter_space("1:1-with-husam")
            → { history: [...], spaceName: "1:1 with Husam" }
    Step 1: fetchWeather({ city: "Amman" })
            → { temp: 22, condition: "sunny" }
            → Posted to space (visible: true)
    Step 2: send_message("It's 22°C and sunny in Amman right now!")
            → Streamed to space
    Step 3: "Answered Husam's weather question." (internal reasoning)
            → finishReason: end-turn
  
  Cycle ends. Consciousness updated. Agent sleeps.
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
→ Events pushed to Designer's inbox AND Developer's inbox

Designer wakes:
  INBOX: [Project Alpha] Husam: "Create a landing page mockup..."
  
  Think cycle:
    Step 0: enter_space("project-alpha") → reads history
    Step 1: generateImage({ prompt: "Modern landing page mockup..." })
            → Image posted to space (visible: true)
    Step 2: send_message("Here's the mockup! Key elements: hero banner, CTA, testimonials.")
            → Streamed to space
            → Pushes to Developer's inbox (Designer excluded as sender)
  Cycle ends.

Developer wakes (from Husam's message):
  INBOX: [Project Alpha] Husam: "Create a landing page mockup..."
  
  Think cycle:
    Step 0: enter_space("project-alpha") → reads history
    Step 1: Reasons: "This is a design task, not dev. I'll stay silent."
    → No send_message called. Cycle ends.

Developer wakes again (from Designer's message):
  INBOX: [Project Alpha] Designer (agent): "Here's the mockup! Key elements..."
  
  Consciousness already has: Husam's original request (previous cycle)
  
  Think cycle:
    Step 0: enter_space("project-alpha") → reads history (sees mockup)
    Step 1: send_message("The layout looks doable. Hero + CTA are straightforward. Testimonials carousel — 2 days.")
  Cycle ends.
```

**Key:** Every message pushes to all other agents' inboxes. Each agent independently decides whether to respond.

---

## Scenario 3: Agent Asks, Human Answers (Multi-Turn)

**Setup:** Space "Deployments" — Sarah (human), DeployBot (agent).

### Flow

```
Sarah: "Deploy v2.1 to production"
→ DeployBot's inbox

DeployBot Cycle 1:
  INBOX: [Deployments] Sarah: "Deploy v2.1 to production"
  
  Think cycle:
    Step 0: enter_space("deployments")
    Step 1: send_message("I'll deploy v2.1. This affects 3 services. Confirm by replying 'yes'.")
  Cycle ends. Agent sleeps.

Sarah: "yes"
→ DeployBot's inbox

DeployBot Cycle 2:
  INBOX: [Deployments] Sarah: "yes"
  
  Consciousness already has:
    - Cycle 1: Sarah asked to deploy, agent asked for confirmation
    
  Agent KNOWS it asked for confirmation — it's in consciousness.
  
  Think cycle:
    Step 0: enter_space("deployments")
    Step 1: Reasons: "I asked for confirmation, Sarah said yes."
    Step 2: deployService({ version: "2.1", target: "production" })
    Step 3: send_message("Deployment complete! All 3 services running v2.1.")
  Cycle ends.
```

**Key:** No waiting, no pausing. Two short cycles. Consciousness carries the context between them.

---

## Scenario 4: Batched Events (v3 Advantage)

**Setup:** Space "Family" — Husam (human), FamilyBot (agent). FamilyBot also in "Muhammad's Space" — Muhammad (human), FamilyBot.

### Flow

```
[00:00] Husam: "Tell Muhammad the meeting is at 3pm"       → inbox
[00:05] Husam: "Also tell him don't forget the documents"   → inbox

FamilyBot wakes at [00:05]:
  INBOX (2 events):
    [Family] Husam: "Tell Muhammad the meeting is at 3pm"
    [Family] Husam: "Also tell him don't forget the documents"
  
  Think cycle:
    Step 0: enter_space("family-space") → reads context
    Step 1: send_message("Got it, I'll tell Muhammad both things.")
    Step 2: enter_space("muhammad-space") → reads Muhammad's chat
    Step 3: send_message("Hey Muhammad, the meeting is at 3pm. Also, don't forget to bring the documents!")
    Step 4: enter_space("family-space") → switch back
    Step 5: send_message("Done — told Muhammad about the meeting and the documents.")
  Cycle ends.
```

**Key:** No `absorb_run`. No concurrent runs. Two messages batched in one inbox → one coherent think cycle → one message to Muhammad with both items. This is the exact scenario that required `absorb_run` in v2.

---

## Scenario 5: Plan-Triggered Cross-Space Action

**Setup:** ReportBot belongs to: "Daily Reports", "Management", "Engineering". Plan: "Daily Metrics" — cron `0 9 * * *`.

### Flow

```
[9:00 AM — Plan fires → event pushed to ReportBot's inbox]

ReportBot wakes:
  INBOX (1 event):
    [Plan: Daily Metrics] Generate and post the daily metrics summary
  
  Think cycle:
    Step 0: enter_space("daily-reports") → reads recent messages
    Step 1: fetchMetrics({ date: "2026-02-18" }) → gets data
    Step 2: send_message("📊 Daily Report (Feb 18): Revenue $45K (+12%), Users 1,230 (+5%)")
    Step 3: enter_space("management")
    Step 4: send_message("Quick update: Revenue up 12%, users up 5%. Full report in #daily-reports.")
    Step 5: enter_space("engineering")
    Step 6: send_message("Heads up: error count dropped to 3 yesterday. Nice work!")
  Cycle ends.
```

**Key:** Single cycle, three spaces. The agent enters each space, posts appropriate content, and moves on.

---

## Scenario 6: Service Trigger (Jira Webhook)

**Setup:** ProjectBot belongs to "Engineering". External Jira webhook integration.

### Flow

```
[Jira fires webhook: PROJ-456 moved to "Done"]

POST /api/agents/{projectBotId}/trigger
  { "serviceName": "jira", "payload": { "issue": "PROJ-456", "status": "done", "assignee": "Ahmad" } }
→ Event pushed to ProjectBot's inbox

ProjectBot wakes:
  INBOX (1 event):
    [Service: jira] { "issue": "PROJ-456", "status": "done", "assignee": "Ahmad" }
  
  Think cycle:
    Step 0: enter_space("engineering") → reads recent discussion
    Step 1: send_message("PROJ-456 is done! Ahmad closed it. The ticket was about the login timeout bug.")
  Cycle ends.
```

---

## Scenario 7: Multi-Turn Trip Planning (Consciousness Continuity)

**Setup:** 1:1 space — Husam + AssistantBot.

### Flow

```
Husam: "Help me plan a trip to Tokyo"

AssistantBot Cycle 1:
  INBOX: [1:1] Husam: "Help me plan a trip to Tokyo"
  → enter_space → send_message("When are you going, and for how long?")

Husam: "$150/night, first week of April, 5 days"

AssistantBot Cycle 2:
  INBOX: [1:1] Husam: "$150/night, first week of April, 5 days"
  
  Consciousness has cycle 1: trip to Tokyo, asked about dates
  → searchHotels({ city: "Tokyo", dates: "2026-04-01 to 2026-04-06", maxPrice: 150 })
  → searchFlights({ destination: "NRT", dates: "..." })
  → send_message("Cherry blossom season! Found 3 hotels and 2 flights: ...")

Husam: "Book the second hotel and cheapest flight"

AssistantBot Cycle 3:
  INBOX: [1:1] Husam: "Book the second hotel and cheapest flight"
  
  Consciousness has cycles 1+2: Tokyo, April, 5 days, $150, search results
  Agent KNOWS which hotel is "the second one" — search results are in consciousness
  
  → bookHotel({ hotelId: "hotel-xyz", dates: "..." })
  → bookFlight({ flightId: "flight-abc" })
  → send_message("Booked! Hotel Sakura (¥18,000/night) + ANA flight departing 7:05 AM.")
```

**Key:** By cycle 3, the agent has the full conversation context in consciousness without any reconstruction. It knows "the second one" because the search results from cycle 2 are right there in its ModelMessage array.

---

## Scenario 8: Selective Silence

**Setup:** Space "General" — Husam, Ahmad, HelperBot.

### Flow

```
Husam: "Hey Ahmad, how was your weekend?"
→ HelperBot's inbox

HelperBot wakes:
  INBOX: [General] Husam: "Hey Ahmad, how was your weekend?"
  
  Think cycle:
    Reasons: "Casual conversation between humans. Nothing for me."
    → No send_message. Cycle ends.

Ahmad: "Great! Went hiking."
→ HelperBot's inbox

HelperBot wakes:
  INBOX: [General] Ahmad: "Great! Went hiking."
  
  Consciousness has: Husam asked Ahmad about weekend, agent stayed silent
  
  Think cycle:
    Reasons: "Still casual. Stay silent."
    → No send_message. Cycle ends.

Husam: "Nice! What's the weather forecast for next Saturday?"
→ HelperBot's inbox

HelperBot wakes:
  INBOX: [General] Husam: "What's the weather forecast for next Saturday?"
  
  Consciousness has: casual conversation, agent was silent for 2 cycles
  
  Think cycle:
    → enter_space("general")
    → fetchWeather({ date: "2026-02-22" })
    → send_message("Next Saturday: 18°C, light breeze. Perfect hiking weather!")
  Cycle ends.
```

**Key:** HelperBot wakes for every message but decides independently whether to respond. Silence is the default.

---

## Scenario 9: Voting with Inbox Batching

**Setup:** Space "Team Vote" — Ahmad, Sarah, Husam (humans), VoteBot (agent).

### Flow

```
VoteBot posted: "Vote: Option A or Option B?"

[00:00.0] Ahmad: "Option A"    → VoteBot's inbox
[00:00.3] Sarah: "Option B"    → VoteBot's inbox
[00:01.1] Husam: "Option A"    → VoteBot's inbox

VoteBot wakes at [00:01.1]:
  INBOX (3 events):
    [Team Vote] Ahmad: "Option A"
    [Team Vote] Sarah: "Option B"
    [Team Vote] Husam: "Option A"
  
  Think cycle:
    → enter_space("team-vote")
    → Counts: Option A = 2 (Ahmad + Husam), Option B = 1 (Sarah)
    → send_message("Vote closed! Option A wins 2-1 (Ahmad + Husam vs Sarah).")
  Cycle ends.
```

**Key:** In v2, this required 3 concurrent runs + `absorb_run`. In v3, all 3 votes arrive in the inbox and are processed in one cycle. Zero coordination needed.

---

## Scenario 10: Long-Running Workflow with Memory

**Setup:** AnalystBot in "Finance" space and "Reports" space.

### Flow

```
Cycle N:
  INBOX: [Finance] Husam: "Generate the Q4 report"
  
  → enter_space("finance")
  → fetchRevenueData() → $2.1M
  → fetchUserMetrics() → 45K
  → send_message("Started Q4 report. I need budget numbers — can someone share?")
  → set_memories([{ key: "q4_report", value: "waiting for budget. Revenue $2.1M, users 45K" }])
  → set_goals([{ id: "q4", description: "Complete Q4 report", status: "active" }])
  Cycle ends.

[... many cycles pass, consciousness may be compacted ...]

Cycle N+50:
  INBOX: [Finance] CFO: "Budget is $500K"
  
  System prompt (refreshed) has:
    MEMORIES: q4_report = "waiting for budget. Revenue $2.1M, users 45K"
    GOALS: "Complete Q4 report" (active)
  
  Even if cycle N was compacted, the agent knows from memories:
  → enter_space("finance")
  → generateReport({ revenue: 2100000, users: 45000, budget: 500000 })
  → send_message("Q4 Report: Revenue $2.1M, Users 45K, Budget $500K. [full analysis]")
  → enter_space("reports")
  → send_message("Q4 report is ready — posted in Finance channel.")
  → set_goals([{ id: "q4", status: "completed" }])
  → delete_memories(["q4_report"])
  Cycle ends.
```

**Key:** Memories and goals survive consciousness compaction. Even after 50 cycles, the agent knows it was waiting for budget numbers.

---

## Scenario 11: Correction Mid-Conversation

**Setup:** Space "Family" — Husam + FamilyBot. FamilyBot also in "Muhammad's Space".

### Flow

```
Husam: "Tell Muhammad the meeting is at 3pm"

FamilyBot Cycle 1:
  INBOX: [Family] Husam: "Tell Muhammad the meeting is at 3pm"
  → enter_space("muhammad-space")
  → send_message("Hey Muhammad, the meeting is at 3pm.")
  → enter_space("family-space")
  → send_message("Done — told Muhammad about the 3pm meeting.")
  Cycle ends.

Husam: "Actually it's 4pm not 3pm"

FamilyBot Cycle 2:
  INBOX: [Family] Husam: "Actually it's 4pm not 3pm"
  
  Consciousness has cycle 1: told Muhammad 3pm
  
  → enter_space("muhammad-space")
  → send_message("Correction — the meeting is at 4pm, not 3pm. Sorry about that!")
  → enter_space("family-space")
  → send_message("Updated Muhammad — told him it's 4pm now.")
  Cycle ends.
```

**Key:** The agent KNOWS from consciousness that it already told Muhammad 3pm. It sends a correction, not a duplicate. No `absorb_run` needed because these are sequential cycles, not concurrent runs.

---

## Scenario 12: Full Agent Config

```json
{
  "version": "3.0",
  "agent": {
    "name": "ProjectAssistant",
    "description": "Manages project tasks and coordinates with team members.",
    "system": "You are ProjectAssistant. Be concise but thorough."
  },
  "model": {
    "provider": "openai",
    "name": "gpt-4o",
    "api": "responses",
    "temperature": 0.5,
    "maxOutputTokens": 8000,
    "reasoning": { "enabled": true, "effort": "medium", "summary": "auto" }
  },
  "consciousness": {
    "maxTokens": 100000,
    "minRecentCycles": 10,
    "compactionStrategy": "summarize"
  },
  "loop": { "maxSteps": 20, "toolChoice": "auto" },
  "tools": [
    {
      "name": "fetchJiraTickets",
      "executionType": "gateway",
      "visible": true,
      "inputSchema": { "type": "object", "properties": { "project": { "type": "string" } }, "required": ["project"] },
      "execution": { "url": "https://jira.company.com/api/search", "method": "GET", "timeout": 15000 }
    }
  ],
  "mcp": {
    "servers": [{ "name": "github", "url": "https://mcp.github.com", "transport": "http" }]
  }
}
```
