# Hsafa Use Cases

Real-world scenarios showing how SmartSpaces, Entities, Agents, and Tools come together.

---

## 1. Company & Enterprise

### 1.1 Internal IT Helpdesk

**SmartSpace:** `#it-helpdesk` (company-wide)
**Agents:** `IT-Triage-Agent` (admin), `Password-Reset-Agent`, `Provisioning-Agent`
**Entities:** All employees (Human), IT admins (Human)

An employee sends "I can't access Jira." The **admin agent** (IT-Triage) receives the message, pulls the employee's profile (HTTP tool → HR system), checks service status (HTTP tool → status page API), and either resolves it directly or uses `sendSpaceMessage` with `mention` to ask the provisioning agent to re-grant access. If the issue is a password reset, it uses `delegateToAgent` to silently hand off to the password-reset agent, which triggers a reset via an HTTP tool and confirms back.

**Tools used:** `request` (HR API, Jira admin API, status page), `sendSpaceMessage` (with mention), `delegateToAgent`

---

### 1.2 Sales Deal Room

**SmartSpace:** One per active deal (e.g., `#deal-acme-corp`)
**Agents:** `Sales-Coach-Agent` (admin), `Pricing-Agent`, `CRM-Agent`
**Entities:** Account exec (Human), sales manager (Human)
**Service triggers:** CRM system (Salesforce webhooks trigger `CRM-Agent` via service API)

The account exec asks "What discount can we offer Acme for a 3-year contract?" The **admin agent** (Sales-Coach) uses `sendSpaceMessage` with `mention` to ask the pricing agent. The pricing agent pulls Acme's history from the CRM (HTTP tool), calculates margin-safe discounts (compute tool), and responds with options. The sales coach agent adds talk-track suggestions. The CRM agent logs the proposed deal terms back to Salesforce via HTTP tool.

**Tools used:** `request` (CRM API), `compute` (margin calculation), `sendSpaceMessage` (with mention)

---

### 1.3 Employee Onboarding Workflow

**SmartSpace:** One per new hire (e.g., `#onboard-sarah`)
**Agents:** `Onboarding-Coordinator` (admin), `IT-Setup-Agent`, `HR-Agent`
**Entities:** New hire (Human), hiring manager (Human)

When a new hire's SmartSpace is created, the **admin agent** (Onboarding-Coordinator) greets them and walks them through Day 1. It uses `sendSpaceMessage` with `mention` to ask the IT-Setup agent to provision accounts (HTTP tools → Google Workspace, Slack, GitHub APIs). The HR agent handles benefits enrollment questions and sends forms via a **client tool** that renders an inline form in the new hire's browser. The hiring manager can drop in anytime to check progress.

**Tools used:** `request` (provisioning APIs), `basic` (client tool for inline forms), `prebuilt` (setGoals), `sendSpaceMessage` (with mention)

---

### 1.4 Incident War Room

**SmartSpace:** Created per incident (e.g., `#incident-2025-0042`)
**Agents:** `Incident-Commander-Agent` (admin), `Log-Analyzer-Agent`, `Comms-Agent`
**Entities:** On-call engineers (Human)
**Service triggers:** PagerDuty (webhook triggers `Incident-Commander-Agent` via service API)

PagerDuty fires a webhook that triggers the incident commander agent via the **service trigger API** (`POST /api/agents/{id}/trigger`). The commander agent uses `sendSpaceMessage` to post the incident details to the space, triages severity, pulls recent logs via MCP tool (connected to Datadog/Grafana), and uses `sendSpaceMessage` with `mention` to ask the log analyzer for deep analysis. The comms agent drafts status updates and posts them to Slack via HTTP tool. Engineers collaborate in real-time alongside the agents. Once resolved, the commander agent sets goals summarizing the postmortem action items.

**Tools used:** `mcp` (Datadog), `request` (Slack API, PagerDuty API), `sendSpaceMessage` (with mention), `prebuilt` (setGoals)

---

### 1.5 Legal Contract Review

**SmartSpace:** One per contract (e.g., `#contract-vendor-xyz`)
**Agents:** `Contract-Reviewer-Agent` (admin), `Compliance-Agent`
**Entities:** Legal team member (Human), procurement lead (Human)

The legal team member uploads a contract (message with attachment). The **admin agent** (Contract-Reviewer) analyzes clauses, flags risky terms, and highlights deviations from standard templates. If a clause touches data privacy, it uses `sendSpaceMessage` with `mention` to ask the compliance agent, which cross-references GDPR/SOC2 requirements via a knowledge base MCP tool. The procurement lead sees the full thread and can ask follow-up questions.

**Tools used:** `mcp` (legal knowledge base), `sendSpaceMessage` (with mention), `compute` (clause comparison)

---

## 2. Automation & DevOps

### 2.1 CI/CD Pipeline Assistant

**SmartSpace:** `#deployments`
**Agents:** `Deploy-Agent` (admin), `Rollback-Agent`, `QA-Agent`
**Entities:** Dev team (Human)
**Service triggers:** GitHub Actions (triggers `Deploy-Agent` via service API), monitoring system (triggers `QA-Agent` via service API)

GitHub Actions triggers the deploy agent via the **service trigger API** with payload: "Build #412 passed, ready for staging." The agent uses `sendSpaceMessage` to inform the space, then confirms with the on-call dev via a **client tool** (inline approve/reject button in the UI). On approval, it triggers deployment via HTTP tool. If the monitoring system triggers the QA agent post-deploy with error data, the QA agent analyzes logs and uses `sendSpaceMessage` with `mention` to ask the rollback agent to execute a rollback.

**Tools used:** `request` (deploy API, monitoring API), `basic` (client tool for approval button), `sendSpaceMessage` (with mention), `delegateToAgent`

---

### 2.2 Data Pipeline Monitor

**SmartSpace:** `#data-ops`
**Agents:** `Pipeline-Monitor-Agent` (admin), `Data-Quality-Agent`
**Entities:** Data engineer (Human)
**Service triggers:** Airflow (triggers `Pipeline-Monitor-Agent` via service API every hour), dbt (triggers `Data-Quality-Agent` via service API)

Airflow triggers the pipeline monitor agent via the **service trigger API** with DAG run results. If a task fails, the monitor agent pulls logs (MCP tool → Airflow API), diagnoses the failure, and uses `sendSpaceMessage` to post findings. The data quality agent, triggered by dbt, runs validation queries (HTTP tool → warehouse API) after successful loads and flags anomalies. The data engineer only gets pulled in for issues the agents can't auto-resolve.

**Tools used:** `mcp` (Airflow), `request` (warehouse API), `sendSpaceMessage`

---

### 2.3 Smart Home / IoT Hub

**SmartSpace:** `#home-automation`
**Agents:** `Home-Agent`
**Entities:** Family members (Human)
**Service triggers:** Smart devices (thermostat, lights, security camera, door lock trigger `Home-Agent` via service API)

A family member says "I'm leaving, lock up." The home agent calls HTTP tools to lock the door, arm the security system, lower the thermostat, and turn off lights. Later, the security camera triggers the agent via the **service trigger API** with a motion alert — the agent checks camera feed metadata and uses `sendSpaceMessage` to notify the right family member. Supports multiple clients: the parent uses the web app, the teenager uses the mobile app — both connected to the same SmartSpace.

**Tools used:** `request` (smart device APIs), `image-generator` (optional: generate visual summaries)

---

### 2.4 E-Commerce Order Ops

**SmartSpace:** Per-order or shared `#order-ops`
**Agents:** `Order-Agent` (admin), `Inventory-Agent`, `Shipping-Agent`
**Entities:** Customer support rep (Human)
**Service triggers:** Shopify (webhooks trigger `Inventory-Agent` via service API), warehouse system (triggers `Shipping-Agent` via service API)

A support rep asks "Where's order #8891?" The **admin agent** (Order-Agent) pulls status from Shopify (HTTP tool), sees it's shipped, and fetches tracking from the shipping carrier API. If the item is stuck, it uses `delegateToAgent` for silent handoff to the shipping agent which files a carrier inquiry. The inventory agent, triggered by Shopify's low-stock webhook via the **service trigger API**, auto-creates a reorder request and uses `sendSpaceMessage` to notify the space.

**Tools used:** `request` (Shopify API, carrier API), `delegateToAgent`, `sendSpaceMessage`

---

## 3. Family & Friends

### 3.1 Family Organizer

**SmartSpace:** `#family`
**Agents:** `Family-Assistant`
**Entities:** Each family member (Human)

Everyone shares one SmartSpace. "What's for dinner?" — the agent suggests meals based on dietary preferences stored in goals. "Remind Dad about the dentist Thursday" — the agent sets a goal/reminder. Mom asks "What did we decide about the vacation?" — the agent recalls the thread history. Each family member uses their own device (phone, tablet, laptop) via separate clients, all synced in real-time.

**Tools used:** `prebuilt` (setGoals, getGoals), `request` (optional: calendar API, recipe API)

---

### 3.2 Trip Planner (Friend Group)

**SmartSpace:** `#bali-trip-2025`
**Agents:** `Travel-Agent` (admin), `Budget-Agent`
**Entities:** Each friend (Human)

Friends discuss trip ideas. The **admin agent** (Travel-Agent) searches flights and hotels (MCP tool → travel API), presents options, and tracks everyone's votes via **client tools** (inline voting cards in the UI). It uses `sendSpaceMessage` with `mention` to ask the budget agent for cost tracking. The budget agent tracks the shared budget, splits costs, and keeps a running tally stored as goals. Anyone can ask "What's our total spend so far?" and get an instant breakdown.

**Tools used:** `mcp` (travel APIs), `basic` (client tool for voting UI), `prebuilt` (setGoals, getGoals), `compute` (budget math), `sendSpaceMessage` (with mention)

---

### 3.3 Study Group

**SmartSpace:** `#chem-201-study`
**Agents:** `Tutor-Agent` (admin), `Quiz-Agent`
**Entities:** Students (Human)

Students discuss homework problems. The **admin agent** (Tutor) explains concepts, references the textbook via MCP tool (connected to a course knowledge base), and generates diagrams with the image generator tool. When someone says "quiz me," the agent uses `delegateToAgent` for silent handoff to the quiz agent, which generates questions, presents them as **client tools** (inline multiple-choice cards), and tracks scores as goals.

**Tools used:** `mcp` (course KB), `image-generator` (diagrams), `basic` (client tool for quiz cards), `delegateToAgent`, `prebuilt` (setGoals)

---

### 3.4 Shared Household (Roommates)

**SmartSpace:** `#apartment-42`
**Agents:** `House-Manager-Agent`
**Entities:** Each roommate (Human)

Tracks chores, rent splits, and shared groceries. "Add milk to the list" — stored as a goal. "Whose turn to clean the bathroom?" — agent checks the rotation. End of month: agent calculates rent + utilities split (compute tool) and posts a summary. Can connect to Venmo/Splitwise via HTTP tool to send payment requests.

**Tools used:** `prebuilt` (setGoals, getGoals), `compute` (split calculations), `request` (payment API)

---

## 4. Professional & Freelance

### 4.1 Client Project Space

**SmartSpace:** One per client (e.g., `#project-clientX`)
**Agents:** `PM-Agent`, `Research-Agent`
**Entities:** Freelancer (Human), client stakeholder (Human)

The freelancer and client communicate in a shared space. The PM agent tracks milestones as goals, sends deadline reminders, and generates status reports. The research agent can pull competitive analysis (MCP tool → web search) and summarize findings. The client sees everything transparently — no separate email chains.

**Tools used:** `prebuilt` (setGoals, getGoals), `mcp` (web search/research), `request` (project management API)

---

### 4.2 Content Creation Pipeline

**SmartSpace:** `#content-pipeline`
**Agents:** `Writer-Agent` (admin), `Editor-Agent`, `SEO-Agent`, `Image-Agent`
**Entities:** Content manager (Human)

The content manager says "Write a blog post about AI in healthcare." The **admin agent** (Writer) drafts it, then uses `sendSpaceMessage` with `mention` to ask the editor for review. The editor suggests improvements and uses `sendSpaceMessage` with `mention` to ask the SEO agent to optimize keywords. The image agent generates a hero image (image-generator tool). Once approved, the writer agent publishes it to the CMS via HTTP tool.

**Tools used:** `image-generator`, `request` (CMS API), `sendSpaceMessage` (with mention), `mcp` (SEO keyword tools)

---

### 4.3 Personal Finance Advisor

**SmartSpace:** `#my-finances`
**Agents:** `Finance-Agent`
**Entities:** User (Human)
**Service triggers:** Bank (sends daily transaction summaries via service trigger API)

The bank triggers the finance agent daily via the **service trigger API** with transaction summaries. The finance agent categorizes spending, tracks budgets as goals, and uses `sendSpaceMessage` to alert on anomalies ("You spent 40% more on dining this month"). The user can ask "Can I afford a $2k vacation?" and the agent runs projections (compute tool) based on current savings and spending patterns.

**Tools used:** `request` (bank API), `compute` (projections), `prebuilt` (setGoals, getGoals), `sendSpaceMessage`

---

## 5. Education & Community

### 5.1 Classroom Space

**SmartSpace:** One per class (e.g., `#math-101`)
**Agents:** `Teaching-Assistant-Agent` (admin), `Grading-Agent`
**Entities:** Teacher (Human), students (Human)
**Service triggers:** LMS (triggers `Grading-Agent` via service API for assignment submissions)

Students ask questions anytime — the **admin agent** (TA) responds instantly using the course syllabus (MCP tool → LMS knowledge base). The teacher drops in to answer complex questions. The grading agent, triggered by the LMS via the **service trigger API** with assignment submissions, provides instant feedback, records scores, and uses `sendSpaceMessage` to post results. The teacher reviews flagged edge cases.

**Tools used:** `mcp` (LMS/course KB), `request` (LMS API for grades), `sendSpaceMessage`

---

### 5.2 Community Support Forum

**SmartSpace:** One per topic (e.g., `#billing-help`, `#feature-requests`)
**Agents:** `Community-Agent` (admin), `Escalation-Agent`
**Entities:** Community members (Human), moderators (Human)

Community members post questions. The **admin agent** (Community-Agent) answers common ones from the knowledge base (MCP tool). If it can't resolve the issue, it uses `delegateToAgent` for silent handoff to the escalation agent, which creates a support ticket (HTTP tool → Zendesk) and notifies a moderator. Moderators can jump in at any point. The agent learns from moderator responses over time.

**Tools used:** `mcp` (community KB), `request` (Zendesk API), `delegateToAgent`

---

## 6. Fully Autonomous Agent — Deep Dive Example

### Operations Manager Agent (Zero Human-in-the-Loop)

> A fully autonomous agent that runs 24/7 inside a company, handling real operational work without waiting for human input.

**SmartSpace:** `#ops-autopilot`
**Agents:** `Ops-Manager-Agent` (admin), `Finance-Agent`, `Comms-Agent`
**Entities:** Team leads and executives (Human) — members who observe but rarely need to message
**Service triggers:** HR system, Calendar, Slack, Jira, Finance system, Email gateway — all trigger `Ops-Manager-Agent` via the service trigger API

---

#### What It Does (Daily Lifecycle)

**6:00 AM — Morning Scan**
The agent is triggered by a **plan trigger** (scheduled cron) or a **service trigger** from the scheduling system. It:

1. Pulls today's calendar via HTTP tool → Google Calendar API
2. Pulls open Jira tickets via HTTP tool → Jira API (filter: unresolved, assigned to team)
3. Pulls yesterday's git commits via HTTP tool → GitHub API
4. Pulls PTO/sick leave for today via HTTP tool → HR system API
5. Stores a daily snapshot as goals (`setGoals` with `clearExisting: true` for the `daily-status` category)

Then uses `sendSpaceMessage` with `mention` to ask the comms agent, which composes and posts a morning standup summary to `#engineering` on Slack (HTTP tool → Slack API):

```
Good morning. Here's today's status:
- 3 engineers out (PTO: Sarah, Ali | Sick: James)
- 12 open tickets (4 critical)
- 2 PRs waiting review since yesterday
- Meetings: Sprint Review at 2pm, 1:1 with VP Eng at 4pm
```

No human asked for this. It just runs.

---

**Throughout the Day — Event-Driven Reactions**

External services trigger the ops manager agent via the **service trigger API** as events happen:

| Service | Trigger Payload | Agent Action |
|---|---|---|
| **Jira** | `{ event: 'ticket_critical', issueKey: '...' }` | Agent checks assignee workload (HTTP tool → Jira), if assignee is on PTO, reassigns to next available (HTTP tool → Jira update), notifies via Slack |
| **GitHub** | `{ event: 'pr_stale', prNumber: 412 }` | Agent finds reviewer from CODEOWNERS (HTTP tool → GitHub), assigns them, DMs on Slack: "PR #412 needs your review" |
| **Calendar** | `{ event: 'meeting_soon', meetingId: '...' }` | Agent pulls meeting attendees, checks recent Jira activity for shared projects, drafts an agenda, posts it to the calendar event (HTTP tool → Calendar API) |
| **HR system** | `{ event: 'pto_request', employeeId: '...' }` | Agent checks team coverage (HTTP tool → HR + Calendar), if coverage is fine → auto-approves (HTTP tool → HR approve endpoint), if not → flags to team lead on Slack |
| **Finance** | `{ event: 'expense_submitted', amount: 2100 }` | Uses `sendSpaceMessage` with `mention` to ask finance agent → validates against policy (compute tool for limits), if under $500 and matches category rules → auto-approves, if over → routes to manager on Slack with summary |
| **Monitoring** | `{ event: 'cpu_alert', threshold: 90 }` | Agent checks recent deployments (HTTP tool → GitHub), correlates with deploy timing, if match → triggers rollback (HTTP tool → deploy API), posts incident to Slack |

---

**6:00 PM — End-of-Day Wrap-Up**

Triggered by another plan/service trigger. The agent:

1. Compares morning goals to current state (getGoals + fresh API pulls)
2. Calculates tickets resolved, PRs merged, incidents handled (compute tool)
3. Uses `sendSpaceMessage` with `mention` to ask the comms agent to post EOD summary to Slack
4. Uses `sendSpaceMessage` with `mention` to ask the finance agent to post daily spend summary
5. Updates goals with weekly running totals

```
EOD Summary:
- Tickets: 12 open → 8 open (4 resolved, 2 new)
- PRs: 5 merged, 2 still pending review (pinged reviewers)
- Incidents: 1 (auto-rolled-back deploy #287, resolved in 4 min)
- PTO approved: 1 (auto), PTO flagged: 0
- Expenses: 3 auto-approved ($120, $85, $340), 1 routed to manager ($2,100)
```

---

**Weekly (Friday 5 PM) — Executive Report**

The agent compiles the week's goals into a report:
- Velocity trends (tickets/week)
- Time-to-review for PRs
- Incident count and resolution time
- Budget spend vs. allocation
- Team availability forecast for next week

Posts to `#leadership` on Slack and emails the VP Eng (HTTP tool → email gateway).

---

#### Agent Config (Simplified)

```json
{
  "version": "1.0",
  "agent": {
    "name": "ops-manager",
    "description": "Autonomous operations manager. Monitors systems, takes action, reports status.",
    "system": "You are an autonomous operations manager for an engineering team. You act independently — do not ask humans for permission unless a decision is high-risk (>$1000 spend, production rollback of >1 hour, or PTO denial). For everything else, just do it and report what you did. Be concise in Slack posts. Use tools proactively."
  },
  "model": {
    "provider": "openai",
    "name": "gpt-5",
    "api": "responses",
    "reasoning": { "enabled": true, "effort": "medium" },
    "maxOutputTokens": 4000
  },
  "loop": {
    "maxSteps": 20,
    "toolChoice": "auto"
  },
  "tools": [
    {
      "name": "jira_query",
      "executionType": "request",
      "description": "Query Jira tickets with JQL.",
      "inputSchema": {
        "type": "object",
        "properties": { "jql": { "type": "string" } },
        "required": ["jql"]
      },
      "execution": {
        "method": "POST",
        "url": "https://company.atlassian.net/rest/api/3/search",
        "headers": { "Authorization": "Bearer ${env.JIRA_TOKEN}" }
      }
    },
    {
      "name": "jira_update",
      "executionType": "request",
      "description": "Update a Jira ticket (reassign, change status, add comment).",
      "inputSchema": {
        "type": "object",
        "properties": {
          "issueKey": { "type": "string" },
          "fields": { "type": "object" }
        },
        "required": ["issueKey", "fields"]
      },
      "execution": {
        "method": "PUT",
        "url": "https://company.atlassian.net/rest/api/3/issue/${input.issueKey}",
        "headers": { "Authorization": "Bearer ${env.JIRA_TOKEN}" }
      }
    },
    {
      "name": "slack_post",
      "executionType": "request",
      "description": "Post a message to a Slack channel.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "channel": { "type": "string" },
          "text": { "type": "string" }
        },
        "required": ["channel", "text"]
      },
      "execution": {
        "method": "POST",
        "url": "https://slack.com/api/chat.postMessage",
        "headers": { "Authorization": "Bearer ${env.SLACK_BOT_TOKEN}" }
      }
    },
    {
      "name": "github_api",
      "executionType": "request",
      "description": "Call GitHub REST API (PRs, commits, deployments).",
      "inputSchema": {
        "type": "object",
        "properties": {
          "endpoint": { "type": "string" },
          "method": { "type": "string", "enum": ["GET", "POST", "PUT", "PATCH"] },
          "body": { "type": "object" }
        },
        "required": ["endpoint"]
      },
      "execution": {
        "method": "${input.method || 'GET'}",
        "url": "https://api.github.com${input.endpoint}",
        "headers": { "Authorization": "Bearer ${env.GITHUB_TOKEN}" }
      }
    },
    {
      "name": "calendar_events",
      "executionType": "request",
      "description": "List or update Google Calendar events.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "calendarId": { "type": "string" },
          "timeMin": { "type": "string" },
          "timeMax": { "type": "string" }
        },
        "required": ["calendarId"]
      },
      "execution": {
        "method": "GET",
        "url": "https://www.googleapis.com/calendar/v3/calendars/${input.calendarId}/events",
        "headers": { "Authorization": "Bearer ${env.GOOGLE_TOKEN}" }
      }
    },
    {
      "name": "hr_api",
      "executionType": "request",
      "description": "Query or update HR system (PTO, employee info).",
      "inputSchema": {
        "type": "object",
        "properties": {
          "action": { "type": "string", "enum": ["get_pto", "approve_pto", "deny_pto", "get_team"] },
          "params": { "type": "object" }
        },
        "required": ["action"]
      },
      "execution": {
        "method": "POST",
        "url": "https://hr.company.com/api/${input.action}",
        "headers": { "Authorization": "Bearer ${env.HR_TOKEN}" }
      }
    },
    {
      "name": "expense_check",
      "executionType": "compute",
      "description": "Evaluate expense against policy rules.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "amount": { "type": "number" },
          "category": { "type": "string" },
          "policy_limit": { "type": "number" }
        },
        "required": ["amount", "category"]
      },
      "execution": {
        "operation": "evaluate",
        "expression": "amount <= (policy_limit || 500) ? 'auto_approve' : 'needs_manager'"
      }
    }
  ]
}
```

---

#### Why This Works on Hsafa

| Hsafa Feature | How It's Used |
|---|---|
| **Service trigger API** | Jira, GitHub, Slack, Calendar, HR, Finance all trigger the ops agent via `POST /api/agents/{id}/trigger` — the agent reacts to each |
| **Admin agent + sendSpaceMessage** | Ops agent is admin, orchestrates via `sendSpaceMessage` with `mention` for comms and finance agents |
| **Goals** | Daily snapshots, weekly metrics, running totals — persistent state across runs |
| **HTTP tools** | Direct integration with every company system, no middleware needed |
| **Compute tools** | Policy checks, metric calculations, budget math |
| **Reasoning** | Complex decisions (should I rollback? is this PTO safe to approve?) benefit from chain-of-thought |
| **Silent completion** | Agent simply doesn't send a message for irrelevant events (e.g., a Jira comment that doesn't need action) — the run completes silently |
| **Plan triggers** | Scheduled daily/weekly runs (morning scan, EOD wrap-up, Friday report) |
| **No human-in-the-loop** | Humans are SmartSpace members but purely observers — they can intervene anytime but don't need to |

---

## Quick Reference: Hsafa Primitives Used

| Primitive | Role in Use Cases |
|-----------|------------------|
| **SmartSpace** | Shared context — one per project/deal/incident/group |
| **Human Entity** | Employees, family, friends, students, clients |
| **Agent Entity** | Specialized AI agents scoped to a role |
| **Admin Agent** | Receives human messages first, orchestrates via `sendSpaceMessage` and `delegateToAgent` |
| **Service Trigger API** | External services (CRM, GitHub, IoT devices, banks) trigger agents via `POST /api/agents/{id}/trigger` |
| **Client** | Web, mobile, CLI — multiple per person, all synced |
| **Run** | General-purpose agent execution — not tied to any space, communicates via `sendSpaceMessage` |
| **sendSpaceMessage** | Send messages to any space, with optional `mention` (trigger another agent) |
| **delegateToAgent** | Admin-only silent handoff to another agent |
| **Client Tools** | Inline UI in the user's app (buttons, forms, cards) |
| **Goals** | Persistent memory (budgets, chores, milestones, preferences) |
| **MCP Tools** | Connect to any external tool server |
| **HTTP Tools** | Call any REST API |
| **Image Generator** | Visual content on demand |
