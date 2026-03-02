# 04 — Scenarios: Multi-Extension Examples

## Overview

These scenarios demonstrate how extensions compose to give a Haseef rich perception and action capabilities. Each scenario follows the same pattern: events arrive from extensions → the core processes them in one think cycle → tool calls are routed back to extensions.

The core never changes. You just plug in more extensions.

---

## Scenario 1: Office Assistant

```
Haseef "WorkBot"
Extensions: [ext-spaces, ext-email, ext-calendar, ext-jira]
```

**Events arrive simultaneously:**
- ext-spaces: `{ from: "Ahmad", text: "Can we move the standup to 2pm?" }`
- ext-email: `{ from: "client@corp.com", subject: "Contract review needed by Friday" }`
- ext-calendar: `{ type: "conflict", events: ["standup 10am", "client call 10am"] }`

**Think cycle:**
```
1. Perceive: 3 events across 3 domains — schedule conflict + standup move request + client deadline
2. Think: Ahmad wants to move standup to 2pm. There's already a conflict at 10am.
   Moving to 2pm actually RESOLVES the conflict. And the client contract is due Friday —
   I should create a Jira ticket to track it.
3. Act: update_event({ event: "standup", newTime: "2pm" })
4. Act: send_space_message(team-space, "Standup moved to 2pm as Ahmad requested.
   This also resolves the 10am conflict with the client call. ✅")
5. Act: create_jira_ticket({ title: "Review client contract", due: "Friday",
   assignee: "husam", priority: "high" })
6. Act: send_email({ to: "client@corp.com",
   subject: "Re: Contract review", body: "Received — we'll have it reviewed by Friday." })
```

**Why it works:** Calendar, Jira, Spaces, and Email are all independent services. The core combined information from all four to make one coherent decision.

---

## Scenario 2: Headless Data Processor

```
Haseef "DataBot"
Extensions: [ext-webhook]  ← just ONE extension
```

A Haseef doesn't need multiple extensions. It can operate headlessly with just a webhook trigger:

**Event:**
- ext-webhook: `{ type: "csv_uploaded", url: "https://s3.../report.csv", rows: 50000 }`

**Think cycle:**
```
1. Perceive: New CSV uploaded, 50K rows
2. Act: download_file({ url: "..." })
3. Act: analyze_data({ query: "Find anomalies in the revenue column" })
4. Act: generate_report({ format: "pdf", findings: [...] })
5. Act: send_webhook({ url: "https://callback.../", data: { reportUrl: "..." } })
```

No spaces. No email. No chat. Just a mind processing data through a single extension.

---

## Scenario 3: Cross-Space Intelligence

```
Haseef "InsightBot"
Extensions: [ext-spaces]  ← connected to MULTIPLE spaces in one Spaces App
```

**Events from different spaces:**
- Engineering space: "Deployment failed — auth service down"
- Support space: "3 customers reporting login issues"
- Sales space: "Demo with BigCorp in 1 hour — they'll need to log in"

**Think cycle:**
```
1. Perceive: All three events are about the SAME root cause — auth service is down
2. Think: Auth outage → login failures → customers affected → demo at risk
3. Act: send_space_message(engineering-space, "FYI: auth outage is causing
   customer login failures (3 reports in support) AND we have a BigCorp demo in 1 hour.
   @oncall — this is critical priority.")
4. Act: send_space_message(support-space, "The login issues are caused by an auth
   service outage. Engineering is aware and working on it.")
5. Act: send_space_message(sales-space, "⚠️ Heads up: auth service is down.
   BigCorp demo may be affected. Recommend having a recorded backup demo ready.")
```

Three spaces, one mind, one root cause analysis. No human connected all three dots — the Haseef did.

---

## Scenario 4: Physical + Digital

```
Haseef "HomeBot"
Extensions: [ext-spaces, ext-smart-home, ext-health, ext-calendar, ext-reachy]
```

**Events:**
- ext-health: `{ person: "Husam", hr: 95, hrv: "low", activity: "resting" }`
- ext-calendar: `{ type: "reminder", event: "Board meeting tomorrow 9am" }`
- ext-smart-home: `{ type: "temperature", room: "bedroom", temp: 24 }`

**Think cycle:**
```
1. Think: Husam's stress is elevated (HR 95 at rest). Board meeting tomorrow.
   Person-model: Husam sleeps poorly before board meetings when stressed.
   Bedroom is 24°C — too warm for good sleep.
2. Act: set_thermostat({ room: "bedroom", temp: 20 })
3. Act: move_head({ yaw: 0, pitch: -15 }) — Reachy looks at Husam
4. Act: play_emotion({ emotion: "calm" }) — soothing antenna movement
5. Act: send_space_message(husam-space, "I noticed you're a bit wound up.
   Board meeting tomorrow — I've cooled the bedroom to 20°C for better sleep.
   Everything is prepped. You've got this. 🙏")
6. Act: set_plan({ time: "10pm", instruction: "Check if Husam is still awake — suggest sleep" })
```

Physical (robot, thermostat) + digital (calendar, health data, chat) in one coherent response.

---

## Scenario 5: Economy Between Haseefs

```
Haseef "BuyerBot" (Company A)
Extensions: [ext-spaces, ext-marketplace]

Haseef "SellerBot" (Company B)
Extensions: [ext-spaces, ext-marketplace, ext-inventory]
```

Two Haseefs from different organizations interact through a shared marketplace service:

**BuyerBot's event:**
- ext-marketplace: `{ type: "listing_match", item: "Industrial sensors", seller: "Company B", price: 450 }`

**BuyerBot's think cycle:**
```
1. Think: We need sensors. Company B has them at $450. Budget is $500. Good deal.
2. Act: send_marketplace_message({ to: "SellerBot", text: "Interested in 100 units at $420" })
```

**SellerBot's event:**
- ext-marketplace: `{ type: "inquiry", from: "BuyerBot", text: "Interested in 100 units at $420" }`

**SellerBot's think cycle:**
```
1. Act: check_inventory({ item: "sensors" }) → 250 in stock
2. Think: 100 units at $420 — our floor is $400. Margin is thin but volume is good.
3. Act: send_marketplace_message({ to: "BuyerBot", text: "Can do 100 at $435. Ships in 48h." })
```

Two minds, two organizations, negotiating through a shared marketplace extension. Neither knows the other's internal logic.

---

## Scenario 6: Cross-Organization Federation

```
Hospital Haseef "MedBot"
Extensions: [ext-ehr, ext-spaces, ext-pharmacy-network]

Pharmacy Haseef "PharmBot"
Extensions: [ext-pharmacy, ext-spaces, ext-pharmacy-network]
```

**MedBot's event:**
- ext-ehr: `{ type: "prescription", patient: "Patient-123", medication: "Amoxicillin 500mg", quantity: 30 }`

**MedBot's think cycle:**
```
1. Act: check_pharmacy_network({ medication: "Amoxicillin 500mg", qty: 30, location: "downtown" })
   → PharmBot responds: "In stock. Ready in 15 minutes."
2. Act: send_space_message(care-team-space, "Prescription sent to Downtown Pharmacy.
   Ready in 15 minutes. @Nurse — inform the patient.")
```

**PharmBot's event:**
- ext-pharmacy-network: `{ type: "fill_request", medication: "Amoxicillin 500mg", qty: 30 }`

**PharmBot's think cycle:**
```
1. Act: check_stock({ medication: "Amoxicillin 500mg" }) → 120 in stock
2. Act: create_fill_order({ medication: "Amoxicillin 500mg", qty: 30 })
3. Act: respond_to_network({ status: "ready", eta: "15 minutes" })
```

Two Haseefs in different organizations, coordinating through a shared network extension. Each maintains its own domain logic and auth.

---

## Scenario 7: Capability Discovery

A new extension connects → the Haseef immediately gains new capabilities:

**Before connecting ext-weather:**
```
Husam: "What's the weather tomorrow?"
Atlas: "I don't have access to weather information. I can check your calendar though."
```

**After connecting ext-weather:**
```
Husam: "What's the weather tomorrow?"
Atlas thinks: I have get_weather_forecast now.
Atlas: "Tomorrow: 28°C, sunny, 5% rain chance. Perfect for the outdoor meeting at 2pm!"
```

The mind didn't change. It just gained a new sense and new tools. This is the extension model — plug in more body parts, and the mind becomes more capable.

---

## Pattern: Every Scenario Is the Same

```
Events from extensions → Core inbox → Think cycle → Tool calls → Routed to extensions
```

No matter how many extensions, how many domains, how complex the scenario — the pattern is always the same. The core is a universal reasoning engine. Extensions are interchangeable body parts. The architecture scales to any use case.
