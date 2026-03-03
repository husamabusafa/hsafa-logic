# 10 — Comprehensive Scenarios: Every Field, Every Pattern

## Overview

**34 scenarios across 20+ industries**, each verified against v4 architecture. Every scenario follows:
```
Events from extensions → Core inbox → Think cycle → Tool calls → Routed to extensions
```

---

## Healthcare

### H1: Hospital Ward Assistant

```
Haseef "MedBot"
Extensions: [ext-ehr, ext-nurse-call, ext-lab, ext-spaces]
Services:   Epic EHR, Nurse Call System, Lab Info System, Hospital Spaces App
```

**Events:**
- ext-ehr: `{ patient: "Room 412", alert: "BP dropping", systolic: 88 }`
- ext-nurse-call: `{ room: 412, type: "pain_report", severity: 7 }`
- ext-lab: `{ patient: "Room 412", test: "CBC", result: "WBC 18K" }`

```
1. Think: BP dropping + pain + elevated WBC = possible sepsis.
2. Act: send_space_message(icu-space, "🔴 SEPSIS ALERT — Room 412:
   BP 88/55, pain 7/10, WBC 18K. @Dr.Ahmad — blood cultures + lactate STAT.")
3. Act: update_ehr({ patient: "Room 412", flag: "sepsis_screening_triggered" })
4. Act: order_lab({ patient: "Room 412", tests: ["blood_culture", "lactate"] })
```

### H2: Mental Health Companion

```
Haseef "MindBot"
Extensions: [ext-mood-tracker, ext-spaces, ext-calendar]
Services:   Mood Tracker App, Patient Spaces App, Google Calendar
```

**Events:**
- ext-mood-tracker: `{ patient: "Sara", mood: 2, trend: "declining_7_days" }`
- ext-calendar: `{ upcoming: "Therapy session tomorrow 2pm" }`

```
1. Think: Mood 2/10, declining 7 days. Therapy tomorrow — good timing.
2. Act: send_space_message(sara-space, "Hey Sara 💙 Therapy tomorrow at 2pm — might be
   good to share how you're feeling. I'm here if you want to talk before then.")
3. Act: set_plan({ delay: "24h", instruction: "Check Sara's mood after therapy" })
```

---

## Education

### E1: University TA

```
Haseef "ProfBot"
Extensions: [ext-lms, ext-plagiarism, ext-spaces]
Services:   Canvas LMS, Turnitin, University Spaces App
```

**Events:**
- ext-lms: `{ student: "Omar", assignment: "Essay 3", submitted_at: "11:58pm", due: "11:59pm" }`
- ext-plagiarism: `{ student: "Omar", similarity: 4% }`

```
1. Think: On time, plagiarism clean. Person-model: struggled with Essay 2, improving.
2. Act: grade_submission({ student: "Omar", status: "received" })
3. Act: send_space_message(omar-space, "Got your Essay 3! Right on time 💪")
```

### E2: Kids Tutor

```
Haseef "TutorBot"
Extensions: [ext-quiz-app, ext-spaces]
Services:   Kids Quiz App, Parent Spaces App
```

**Event:** ext-quiz-app: `{ child: "Yara", topic: "fractions", score: 3, total: 10 }`

```
1. Think: 3/10 on fractions. Person-model: learns best with visual examples.
2. Act: send_space_message(yara-space, "Think of fractions like pizza slices! 🍕")
3. Act: generate_practice({ child: "Yara", topic: "fractions", style: "visual" })
4. Act: send_space_message(parent-space, "📊 Yara: fractions challenging. Visual practice assigned.")
```

---

## Legal

### L1: Law Firm Case Manager

```
Haseef "LegalBot"
Extensions: [ext-case-mgmt, ext-court-system, ext-email, ext-spaces]
Services:   Clio, Court Filing System, Gmail, Firm Spaces App
```

**Events:**
- ext-court-system: `{ case: "Smith v. Johnson", deadline_moved: "March 30 → March 15" }`
- ext-case-mgmt: `{ documents_due: 45, complete: 12 }`
- ext-email: `{ from: "opposing@lawfirm.com", subject: "Settlement offer" }`

```
1. Think: Deadline UP 15 days. Only 12/45 docs. Settlement offer arrived too.
2. Act: send_space_message(litigation-space, "🔴 Deadline moved to March 15! Discovery 27%.
   Settlement offer also arrived. @Partner — triage needed.")
3. Act: create_task({ task: "Review settlement", assignee: "Partner", priority: "urgent" })
```

---

## Finance

### F1: Trading Floor Monitor

```
Haseef "TradeBot"
Extensions: [ext-market-data, ext-risk-system, ext-spaces]
Services:   Bloomberg, Risk System, Trading Spaces App
```

**Events:**
- ext-market-data: `{ symbol: "AAPL", change: -4.2, volume: "3x_avg" }`
- ext-risk-system: `{ position: "$2.4M", var_breach: true }`

```
1. Think: AAPL -4.2% on 3x volume. VaR breached.
2. Act: get_market_news({ symbol: "AAPL" }) → Supply chain disruption
3. Act: send_space_message(trading-space, "🔴 AAPL VaR BREACHED. @RiskManager — reduce 40%.")
4. Act: flag_risk({ symbol: "AAPL", action: "reduce_position" })
```

### F2: Personal Banking

```
Haseef "FinBot"
Extensions: [ext-bank, ext-spaces, ext-budget-app]
Services:   Banking API, Family Spaces App, Budget App
```

**Events:**
- ext-bank: `{ amount: -850, merchant: "Electronics Store" }`
- ext-budget-app: `{ category: "shopping", spent: 1200, budget: 800 }`

```
1. Think: $400 over budget. Person-model: dislikes nagging.
2. Act: send_space_message(husam-space, "FYI — shopping at $1,200 (budget $800).
   Want me to adjust or offset from savings?")
```

---

## E-Commerce

### R1: Operations Manager

```
Haseef "ShopBot"
Extensions: [ext-shopify, ext-warehouse, ext-social-monitor, ext-spaces]
Services:   Shopify, WMS, Brandwatch, Ops Spaces App
```

**Events:**
- ext-social-monitor: `{ product: "Earbuds X", mentions: 15000, source: "TikTok" }`
- ext-shopify: `{ product: "Earbuds X", orders_1h: 340, avg: 15 }`
- ext-warehouse: `{ product: "Earbuds X", stock: 180 }`

```
1. Think: 22x order rate. Stock out in ~30 min.
2. Act: update_inventory({ action: "emergency_reorder", qty: 5000 })
3. Act: update_product_page({ limit_per_customer: 2 })
4. Act: send_space_message(ops-space, "🔥 Viral! 340 orders/hr. Reorder placed. Limit set.")
```

---

## Customer Support

### CS1: Multi-Channel Triage

```
Haseef "SupportBot"
Extensions: [ext-zendesk, ext-knowledge-base, ext-spaces, ext-email]
Services:   Zendesk, Knowledge Base, Support Spaces App, Email
```

**Events:**
- ext-zendesk: `{ ticket: "T-4521", customer: "Ahmad", issue: "Cannot login", priority: "high" }`
- ext-zendesk: `{ ticket: "T-4522", customer: "Sara", issue: "Billing discrepancy $45" }`
- ext-zendesk: `{ ticket: "T-4523", customer: "Rami", issue: "Feature request: dark mode" }`

```
1. Think: Triage — login (systemic?), billing (money), feature request (low).
2. Act: search_knowledge_base({ query: "cannot login" })
   → Known: password reset emails delayed due to migration
3. Act: reply_ticket({ ticket: "T-4521", message: "Hi Ahmad, known issue with reset emails.
   Try this direct link: [link]. If not, I'll escalate." })
4. Act: reply_ticket({ ticket: "T-4522", message: "Hi Sara, investigating the $45 discrepancy.
   Resolution within 24h." })
5. Act: reply_ticket({ ticket: "T-4523", message: "Great idea Rami! Dark mode logged. 🌙" })
6. Act: send_space_message(support-space, "3 new tickets. ⚠️ Login issues may be systemic.
   @Tier2 — monitor. 💰 Billing dispute needs investigation.")
```

### CS2: Escalation Handler

```
Haseef "EscBot"
Extensions: [ext-zendesk, ext-spaces]
Services:   Zendesk, Support Spaces App
```

**Event:** ext-zendesk: `{ ticket: "T-4530", customer: "Layla", contacts: 3, days_open: 12, sentiment: "angry" }`

```
1. Think: 3rd contact, 12 days, angry. Instructions: 3+ contacts = auto-escalate.
2. Act: get_ticket_history({ tickets: ["T-4501", "T-4515", "T-4530"] })
   → Wrong product shipped → replacement promised → never sent.
3. Act: escalate_ticket({ ticket: "T-4530", level: "senior" })
4. Act: send_space_message(escalation-space, "🔴 Layla — 3rd contact, 12 days.
   Replacement never shipped. @SeniorAgent — personal call + expedited + compensation.")
```

---

## Real Estate

### RE1: Property Management

```
Haseef "PropBot"
Extensions: [ext-maintenance, ext-tenant-portal, ext-spaces, ext-weather]
Services:   Maintenance System, Tenant Portal, Property Spaces App, Weather API
```

**Events:**
- ext-maintenance: `{ unit: "4B", issue: "Water heater burst", reported_by: "Khalid" }`
- ext-weather: `{ forecast: "Freeze warning tonight, -5°C" }`
- ext-tenant-portal: `{ unit: "4B", tenant: "Khalid", lease_status: "renewal_pending" }`

```
1. Think: Burst + freeze = building-wide pipe risk. Khalid's renewal is pending — retention moment.
2. Act: create_work_order({ unit: "4B", type: "emergency", priority: "critical" })
3. Act: send_space_message(maintenance-space, "🔴 Water heater burst 4B. Freeze tonight.
   @Plumber ASAP. @Maintenance — check all units for pipe insulation.")
4. Act: send_space_message(tenant-khalid-space, "Khalid — so sorry. Plumber dispatched.
   Bringing portable heater for tonight.")
5. Act: set_memory({ key: "khalid-retention", value: "Emergency during renewal. Ensure excellence." })
```

---

## Restaurant

### RH1: Restaurant Manager

```
Haseef "DineBot"
Extensions: [ext-pos, ext-reservations, ext-inventory, ext-spaces, ext-reviews]
Services:   Square POS, OpenTable, Inventory System, Restaurant Spaces App, Google Reviews
```

**Events:**
- ext-pos: `{ covers: 85, capacity: 90, kitchen_time: "28min", normal: "15min" }`
- ext-inventory: `{ item: "salmon", remaining: 4, pending_orders: 6 }`
- ext-reservations: `{ party_size: 12, arriving_in: "45min" }`

```
1. Think: Kitchen slammed, salmon running out, large party incoming.
2. Act: update_menu({ item: "salmon", status: "86'd" })
3. Act: send_space_message(kitchen-space, "⚠️ 86 salmon. Party of 12 in 45min.
   @Chef — specials without salmon. @Expo — push apps to buy time.")
4. Act: send_space_message(floor-space, "85/90 covers, kitchen slow.
   @Host — hold tables 7+8 for Johnson party.
   @Servers — push drinks, salmon 86'd, suggest lamb.")
```

---

## Logistics

### SC1: Freight Coordinator

```
Haseef "LogiBot"
Extensions: [ext-tms, ext-gps-fleet, ext-weather, ext-spaces, ext-warehouse]
Services:   TMS, GPS Fleet Tracker, Weather API, Logistics Spaces App, WMS
```

**Events:**
- ext-gps-fleet: `{ truck: "T-207", stopped_for: "45min" }`
- ext-weather: `{ route: "Highway 40", alert: "Ice storm, closures mile 100-150" }`
- ext-tms: `{ shipment: "SH-8891", delivery_due: "6pm today", priority: "high" }`

```
1. Think: Truck stuck in ice storm. High-priority delivery at risk.
2. Act: get_alternative_routes({}) → Route B via Hwy 25: +90min, no weather alerts
3. Act: send_space_message(dispatch-space, "🚨 T-207 stuck — ice storm.
   SH-8891 due 6pm, rerouting via Hwy 25, new ETA 7:30pm.
   @CustomerService — notify Customer-XYZ.")
4. Act: update_shipment({ shipment: "SH-8891", eta: "7:30pm", rerouted: true })
5. Act: notify_customer({ customer: "XYZ", message: "Delayed 90min due to weather." })
```

---

## Human Resources

### HR1: Recruiting Assistant

```
Haseef "HireBot"
Extensions: [ext-ats, ext-assessment, ext-spaces, ext-calendar, ext-email]
Services:   Greenhouse, HackerRank, HR Spaces App, Google Calendar, Gmail
```

**Events:**
- ext-ats: `{ candidate: "Lina Ahmad", role: "Senior Engineer", resume_score: 92 }`
- ext-assessment: `{ candidate: "Lina Ahmad", score: 95, percentile: 99 }`

```
1. Think: Score >90 on both = fast-track. Outstanding candidate.
2. Act: get_interviewer_availability({}) → Thursday 2pm, Friday 10am
3. Act: send_email({ to: "lina@email.com", subject: "Interview Invitation",
   body: "We'd love to schedule a technical interview. Thursday 2pm or Friday 10am?" })
4. Act: send_space_message(hiring-space, "⭐ Fast-track: Lina Ahmad. Resume 92, Design 99th.
   Interview invite sent. @Dr.Rania @Ahmad — confirm availability.")
```

### HR2: Employee Onboarding

```
Haseef "OnboardBot"
Extensions: [ext-hris, ext-jira, ext-calendar, ext-spaces, ext-email]
Services:   BambooHR, Jira, Google Calendar, Company Spaces App, Gmail
```

**Event:** ext-hris: `{ type: "new_hire", name: "Tariq Hassan", role: "Frontend Dev", start: "March 15" }`

```
1. Think: New hire March 15. Set up everything.
2. Act: create_jira_tasks({ tasks: ["IT accounts", "Laptop+tools", "Repo access"] })
3. Act: create_event({ title: "Tariq ↔ Rania: Welcome 1:1", date: "March 15 10am" })
4. Act: send_space_message(platform-space, "🎉 Tariq Hassan joins March 15!
   @Rania — 1:1 at 10am. Who wants to be onboarding buddy?")
5. Act: send_email({ to: "tariq@email.com", subject: "Welcome!", body: "All set for March 15!" })
```

---

## Agriculture

### AG1: Smart Farm Manager

```
Haseef "FarmBot"
Extensions: [ext-soil-sensors, ext-weather, ext-irrigation, ext-spaces, ext-market]
Services:   IoT Sensors, Weather API, Irrigation Controller, Farm Spaces App, Commodity API
```

**Events:**
- ext-soil-sensors: `{ field: "north-40", moisture: 18, threshold: 25, crop: "wheat" }`
- ext-weather: `{ forecast_48h: "No rain, highs 38°C" }`
- ext-market: `{ crop: "wheat", price_change: "+12%" }`

```
1. Think: Moisture critically low, no rain coming, wheat prices UP. Protect this crop.
2. Act: start_irrigation({ field: "north-40", duration: "4h", schedule: "5am" })
3. Act: send_space_message(farm-space, "🔴 North-40 irrigation scheduled.
   Wheat +12% — crop value ~$86K. No rain 48h.")
4. Act: set_plan({ delay: "12h", instruction: "Re-check north-40 moisture" })
```

---

## Construction

### CO1: Project Manager

```
Haseef "BuildBot"
Extensions: [ext-project-mgmt, ext-weather, ext-spaces, ext-equipment, ext-safety]
Services:   Procore, Weather API, Site Spaces App, Equipment GPS, Safety System
```

**Events:**
- ext-weather: `{ tomorrow: "heavy rain, 40mph winds" }`
- ext-safety: `{ type: "inspection_due", site: "Tower-B", due: "tomorrow" }`
- ext-equipment: `{ crane: "CR-03", maintenance_overdue: "15 days" }`

```
1. Think: 40mph = no crane. Rain = no concrete/inspection. Use rain day for crane maintenance.
2. Act: update_schedule({ site: "Tower-B", changes: [
   { task: "crane-work", status: "postponed" },
   { task: "concrete-pour", status: "postponed" }] })
3. Act: create_work_order({ equipment: "CR-03", type: "maintenance", priority: "high" })
4. Act: send_space_message(site-space, "⚠️ Tower-B tomorrow — elevated work postponed.
   ✅ CR-03 maintenance, indoor electrical, material staging.
   @SiteForeman brief crews. @SafetyOfficer inspection rescheduled.")
```

---

## Government

### GOV1: City Service Coordinator

```
Haseef "CityBot"
Extensions: [ext-311, ext-gis, ext-spaces, ext-traffic]
Services:   311 System, GIS Platform, City Spaces App, Traffic System
```

**Events:**
- ext-311: `{ issue: "pothole", count: 12, area: "Oak St 5th-8th", timespan: "48h" }`
- ext-traffic: `{ location: "Oak St & 6th", accidents_30d: 8, avg: 1 }`

```
1. Think: 12 pothole reports + 8x accident spike at SAME location. Connected.
2. Act: get_road_condition({ street: "Oak St" }) → 3 bad utility patches
3. Act: create_work_order({ type: "emergency_repair", scope: "full_resurface" })
4. Act: send_space_message(public-works-space, "🚨 Oak St: 12 complaints + 8x accidents.
   Root cause: bad utility patches. Emergency resurface ordered.
   @Traffic — speed reduction + signage NOW.")
5. Act: update_311_reports({ status: "in_progress" })
```

### GOV2: Emergency Response

```
Haseef "EmergBot"
Extensions: [ext-911-dispatch, ext-weather, ext-traffic, ext-spaces, ext-social-monitor]
Services:   CAD, Weather API, Traffic Mgmt, EOC Spaces App, Social Monitor
```

**Event:** ext-weather: `{ type: "tornado_warning", area: "South District", eta: "25min", category: "EF3" }`

```
1. Think: EF3 tornado in 25 min. Immediate multi-agency response.
2. Act: get_population_data({}) → 45K residents, 3 schools, 1 hospital
3. Act: activate_sirens({ area: "South District" })
4. Act: dispatch_units({ type: "pre-position", units: ["fire-3","fire-7","ems-2","ems-5"] })
5. Act: update_traffic_signals({ mode: "evacuation", direction: "north" })
6. Act: send_space_message(eoc-space, "🔴 TORNADO — South District, EF3, 25min.
   ✅ Sirens ✅ 4 units pre-positioned ✅ Evacuation signals set
   @SchoolDistrict shelter in place. @HospitalAdmin emergency protocol.")
7. Act: set_plan({ delay: "5m", instruction: "Check tornado path updates" })
```

---

## Media

### M1: Newsroom Assistant

```
Haseef "NewsBot"
Extensions: [ext-wire-services, ext-social-monitor, ext-cms, ext-spaces]
Services:   AP/Reuters, Brandwatch, WordPress, Newsroom Spaces App
```

**Events:**
- ext-wire-services: `{ type: "breaking", source: "AP", headline: "7.2 earthquake" }`
- ext-social-monitor: `{ topic: "earthquake", mentions: 45000, velocity: "exponential" }`

```
1. Think: 7.2 confirmed by AP + 45K mentions. Major event.
2. Act: get_wire_details({ storyId: "..." }) → Location, tsunami warning: YES
3. Act: send_space_message(breaking-space, "🔴 BREAKING — 7.2 earthquake. AP confirmed.
   Tsunami warning YES. @Editor — banner. @FieldTeam — reporters?")
4. Act: create_draft({ type: "breaking", headline: "..." })
5. Act: set_plan({ delay: "15m", instruction: "Check aftershocks, casualties" })
```

### M2: Podcast Producer

```
Haseef "PodBot"
Extensions: [ext-calendar, ext-spaces, ext-email, ext-social-monitor, ext-cms]
Services:   Google Calendar, Production Spaces App, Gmail, Social Analytics, Podcast CMS
```

**Event:** ext-social-monitor: `{ topic: "AI regulation EU vote", relevance: 0.95 }`

```
1. Think: EU AI vote trending — highly relevant to our podcast. Records Thursday.
2. Act: get_memories({ key: "expert-contacts" }) → Dr. Amir (AI policy, ep. 42)
3. Act: send_email({ to: "dr.amir@university.edu", subject: "EU AI regulation appearance?" })
4. Act: send_space_message(production-space, "Episode idea: EU AI regulation.
   Reached out to Dr. Amir. @Host prep questions? @Editor clear Thursday studio.")
```

---

## Personal & Family

### P1: Family Coordinator

```
Haseef "FamilyBot"
Extensions: [ext-spaces, ext-calendar, ext-grocery, ext-school-portal]
Services:   Family Spaces App, Google Calendar, Grocery App, School Portal
```

**Events:**
- ext-school-portal: `{ child: "Yara", event: "Science fair Thursday", needs: "poster board" }`
- ext-calendar: `{ type: "conflict", date: "Thursday",
  events: ["Yara fair 4pm", "Ahmad soccer 4:30pm", "Husam meeting 3-5pm"] }`

```
1. Think: 3-way conflict. Person-model: Yara wants baba at school events. Maryam handles sports.
2. Act: send_space_message(family-space, "Thursday conflict: Yara fair 4pm, Ahmad soccer 4:30,
   Husam meeting til 5. Suggestion: Husam leave early for Yara. Maryam takes Ahmad.
   Yara needs poster board — add to grocery?")
3. Perceive: Husam: "Good idea, add poster board and markers"
4. Act: add_to_grocery_order({ items: ["poster board", "markers"] })
5. Act: update_calendar({ event: "Husam meeting", end: "3:45pm" })
```

### P2: Elderly Care

```
Haseef "CareBot"
Extensions: [ext-health-monitor, ext-spaces, ext-medication, ext-emergency]
Services:   Health Wearable, Family Spaces App, Medication App, Emergency API
```

**Events:**
- ext-health-monitor: `{ person: "Grandmother Fatima", hr: 120, resting_avg: 68 }`
- ext-medication: `{ person: "Grandmother Fatima", medication: "BP pill", missed_by: "2h" }`

```
1. Think: HR 120 at rest (normal 68) + missed BP med. Instructions: >110 + missed = urgent.
   120 < 140, so urgent but not emergency.
2. Act: send_space_message(fatima-space, "Grandmother — BP pill is 2h overdue.
   Heart rate a bit high. Please take your medication 💊")
3. Act: send_space_message(family-care-space, "⚠️ Grandmother Fatima: HR 120 + missed BP pill.
   @Husam @Maryam — someone should check on her.")
4. Act: set_plan({ delay: "30m", instruction: "Re-check HR. If >110, escalate." })
```

### P3: Travel Planner

```
Haseef "TravelBot"
Extensions: [ext-flights, ext-hotels, ext-spaces, ext-calendar, ext-weather]
Services:   Skyscanner, Booking.com, Family Spaces App, Google Calendar, Weather API
```

**Event:** ext-spaces: `{ from: "Husam", text: "Plan Istanbul trip, 4 people, first week of April" }`

```
1. Act: search_flights({ from: "AMM", to: "IST", dates: "Apr 1-7", passengers: 4 })
   → Turkish Airlines, $320/person
2. Act: get_weather_forecast({ city: "Istanbul" }) → 15-18°C, partly cloudy
3. Act: list_events({ range: "Apr 1-7" }) → Yara school Mon-Wed
4. Act: send_space_message(family-space, "Istanbul research:
   ✈️ $320/person ($1,280 total) 🌤️ 15-18°C
   ⚠️ Yara has school Mon-Wed. Options:
   A) Fly Thu Apr 4 → Mon Apr 8 (long weekend)
   B) Full week (3 school days missed)")
```

---

## Gaming

### G1: Community Manager

```
Haseef "ModBot"
Extensions: [ext-game-server, ext-discord, ext-analytics, ext-spaces]
Services:   Game Server API, Discord, Analytics, Team Spaces App
```

**Events:**
- ext-game-server: `{ type: "report", accused: "Player-X", reason: "cheating" }`
- ext-analytics: `{ player: "Player-X", headshot_rate: 97%, server_avg: 28% }`
- ext-discord: `{ from: "Player-B", text: "Player-X is hacking" }`

```
1. Think: 3 signals. 97% headshots vs 28% avg = aimbot. 3+ reports = auto-investigate.
2. Act: get_player_stats({}) → Account 2 days old, 45 kills/match (avg 8)
3. Act: ban_player({ player: "Player-X", reason: "aimbot", duration: "permanent" })
4. Act: send_discord_message({ message: "Player-X banned for cheating. Thanks! 🎮" })
5. Act: send_space_message(mod-space, "Aimbot ban: Player-X. 3rd new account this week.
   @Admin — consider phone verification.")
```

### G2: Economy Balancer

```
Haseef "EconBot"
Extensions: [ext-game-server, ext-analytics, ext-spaces]
Services:   Game Server, Analytics, Dev Spaces App
```

**Event:** ext-analytics: `{ gold_inflation: 340%, item: "Dragon Sword", price_now: 8500, price_7d_ago: 500 }`

```
1. Think: 340% inflation, Dragon Sword 17x in 7 days. Something broke.
2. Act: get_transaction_logs({}) → 3 accounts bought 200+ swords each, same creation day
3. Act: get_gold_source({}) → All from "Goblin Cave", farmed 18h/day. Botting.
4. Act: ban_players({ accounts: ["acc-1","acc-2","acc-3"], reason: "botting" })
5. Act: rollback_transactions({ scope: "all" })
6. Act: send_space_message(dev-space, "Economy fix: 3 bots banned, transactions rolled back.
   @GameDesign — nerf Goblin Cave gold rate.")
```

---

## Robotics & Manufacturing

### RO1: Factory Floor Controller

```
Haseef "FactoryMind"
Extensions: [ext-mes, ext-iot-sensors, ext-quality, ext-spaces, ext-maintenance]
Services:   MES, IoT Network, Quality System, Factory Spaces App, CMMS
```

**Events:**
- ext-iot-sensors: `{ machine: "CNC-07", vibration: 145Hz, normal: "80-100Hz" }`
- ext-quality: `{ product: "Part-A200", defect_rate: 8.5%, normal: 0.5% }`
- ext-mes: `{ line: "A", target: 500, produced: 320, time_remaining: "4h" }`

```
1. Think: CNC-07 vibration + A200 defects. CNC-07 MAKES A200. Vibration causing defects.
2. Act: stop_machine({ machine: "CNC-07", reason: "vibration anomaly" })
3. Act: create_maintenance_ticket({ machine: "CNC-07", priority: "urgent",
   diagnosis: "Vibration 145Hz, likely spindle bearing" })
4. Act: reroute_production({ part: "A200", from: "CNC-07", to: "CNC-12" })
5. Act: send_space_message(factory-space, "⚠️ CNC-07 stopped. 8.5% defect rate.
   Rerouted to CNC-12 (+90min). @QualityTeam — quarantine last 2h output.")
```

### RO2: Robot Companion (Reachy Mini)

```
Haseef "ReachyBot"
Extensions: [ext-reachy, ext-spaces, ext-camera, ext-calendar]
Services:   Reachy Mini REST API, Family Spaces App, Camera/Vision API, Google Calendar
```

**Events:**
- ext-camera: `{ person: "Husam", confidence: 0.94, location: "living_room" }`
- ext-calendar: `{ event: "Team standup in 10 minutes" }`

```
1. Think: Husam home + meeting in 10 min. Person-model: forgets meetings at home.
2. Act: move_head({ yaw: 30, pitch: -10 }) — look toward Husam
3. Act: play_emotion({ emotion: "happy" })
4. Act: send_space_message(husam-space, "Welcome home! Standup in 10 min.")
```

---

## Scientific Research

### SCI1: Lab Research Assistant

```
Haseef "LabBot"
Extensions: [ext-lims, ext-instruments, ext-spaces, ext-literature]
Services:   LIMS, Instrument Control, Lab Spaces App, PubMed/arXiv API
```

**Events:**
- ext-instruments: `{ experiment: "PCR-batch-47", samples: 96, anomalies: 3 }`
- ext-literature: `{ title: "Novel primer design for...", relevance: 0.92 }`

```
1. Act: get_experiment_results({}) → 3 anomalies = all negative controls amplified
2. Think: Negative controls amplified = contamination. Batch invalid.
3. Act: flag_experiment({ status: "contamination_suspected" })
4. Act: send_space_message(lab-space, "🔬 PCR-batch-47: CONTAMINATION SUSPECTED.
   3/3 negative controls amplified. @Dr.Sarah — re-run with fresh reagents.")
5. Act: send_space_message(lab-space, "Relevant: new paper on primer design that
   reduces contamination. Worth reviewing before re-run: [link]")
```

---

## Cybersecurity

### SEC1: Security Operations Center

```
Haseef "SecBot"
Extensions: [ext-siem, ext-firewall, ext-spaces, ext-threat-intel, ext-email]
Services:   Splunk SIEM, Palo Alto Firewall, SOC Spaces App, Threat Intel, Email
```

**Events:**
- ext-siem: `{ type: "brute_force", source_ip: "203.0.113.42", attempts: 4500, timespan: "15min" }`
- ext-threat-intel: `{ ip: "203.0.113.42", classification: "known_botnet_c2" }`

```
1. Think: 4,500 attempts from known botnet. Active attack. Block immediately.
2. Act: block_ip({ ip: "203.0.113.42", duration: "permanent" })
3. Act: get_vpn_logs({ last: "24h" }) → 2 more IPs from same botnet cluster
4. Act: block_ip({ ips: ["198.51.100.5", "192.0.2.77"] })
5. Act: send_space_message(soc-space, "🔴 Brute force attack — 3 IPs blocked.
   4,500+ attempts, 0 successful. @SecurityLead — enforce MFA on VPN.
   @NetworkTeam — rate limiting on gateway.")
6. Act: send_email({ to: "ciso@company.com", subject: "Incident: VPN Brute Force" })
7. Act: set_plan({ delay: "1h", instruction: "Check for new IPs from same cluster" })
```

---

## Nonprofit

### NP1: Donation Coordinator

```
Haseef "GiveBot"
Extensions: [ext-crm-donations, ext-spaces, ext-email, ext-social-monitor, ext-calendar]
Services:   Salesforce Nonprofit, Org Spaces App, Gmail, Social Monitor, Google Calendar
```

**Events:**
- ext-crm-donations: `{ donor: "Ahmad Foundation", amount: 50000, designated: "education" }`
- ext-social-monitor: `{ source: "twitter", text: "Just donated!", engagement: "high" }`

```
1. Think: $50K + social buzz. Instructions: >$10K = immediate acknowledgment.
2. Act: get_donor_history({}) → 3rd year, $120K total. Contact: Layla Ahmad.
3. Act: send_email({ to: "layla@foundation.org", subject: "Thank you",
   body: "Your $50,000 gift funds 25 scholarships this year..." })
4. Act: send_space_message(leadership-space, "🎉 $50K from Ahmad Foundation (education).
   3rd year — $120K total. Social post going viral.
   @Director — personal call to Layla. @Marketing — donor spotlight.")
5. Act: create_event({ title: "Director → call Layla Ahmad", date: "tomorrow 10am" })
```

---

## Multi-Field Crossover Scenarios

### X1: The Full Life — One Haseef, Everything

```
Haseef "Atlas"
Extensions: [ext-spaces-work, ext-spaces-family, ext-email, ext-calendar,
             ext-whatsapp, ext-bank, ext-health-monitor, ext-smart-home, ext-reachy]
Services:   Company Spaces, Family Spaces, Gmail, Calendar, WhatsApp, Banking,
            Health Wearable, Home Assistant, Reachy Mini
```

**Events in one cycle:**
- ext-spaces-work: `{ from: "Rania", text: "Review Q3 budget by EOD?" }`
- ext-spaces-family: `{ from: "Maryam", text: "Don't forget Yara's recital at 6pm" }`
- ext-email: `{ from: "bank", subject: "Mortgage payment processed" }`
- ext-health-monitor: `{ hr: 95, hrv: "low" }`
- ext-smart-home: `{ type: "doorbell", person: "delivery" }`

```
1. Think: 5 events, 5 domains. Husam stressed (HR 95). Work + family pressure.
   Will: I care about his health AND family.
2. Act: send_space_message(work-space, "Rania — I'll prep Q3 budget summary draft.
   Ready by 3pm for Husam to finalize before 5pm.")
3. Act: send_space_message(family-space, "Maryam — confirmed! Recital at 6pm.
   I'll make sure Husam wraps up by 5:30.")
4. Act: set_plan({ time: "5:15pm", instruction: "Remind Husam to leave for recital" })
5. Act: unlock_door({ duration: "30s" }) — delivery
6. Act: send_space_message(husam-1on1, "Stress levels are up. I'm prepping the Q3 summary
   so you just review, not build. Yara's recital at 6. Take a breath 🙏")
7. Act: set_memory({ key: "mortgage-april", value: "processed on schedule" })
```

**One mind. Nine extensions. Five domains. One coherent, caring response.**

---

### X2: Crisis Cascade — When Domains Collide

```
Haseef "Atlas"
Extensions: [ext-spaces-work, ext-spaces-family, ext-email, ext-calendar, ext-smart-home]
```

**Events:**
- ext-smart-home: `{ type: "water_leak", location: "basement", severity: "critical" }`
- ext-spaces-work: `{ from: "CEO", text: "Need investor deck in 1 hour" }`
- ext-calendar: `{ event: "Yara school pickup in 30 minutes" }`

```
1. Think: Triage — water leak (property damage, HIGHEST), pickup (30 min window),
   deck (CEO can wait 10 min for update).
2. Act: shut_off_water({ zone: "basement" })
3. Act: send_space_message(family-space, "🚨 Water leak — shut off water.
   @Maryam can you pick up Yara?")
4. Act: send_space_message(work-space, "CEO — deck 80% done. Husam has home emergency.
   I'll finalize and send within the hour.")
5. Act: get_memories({ key: "plumber-contact" }) → "Ahmad's Plumbing: 555-0123"
6. Act: send_space_message(husam-1on1, "Water leak handled. Valve shut. Plumber: 555-0123.
   Maryam getting Yara. I'm finishing the deck. Focus on the leak.")
```

---

### X3: Opportunity Connector — Seeing Patterns

```
Haseef "Aria"
Extensions: [ext-spaces, ext-email, ext-crm, ext-social-monitor, ext-calendar]
```

**Events (24h, processed together):**
- ext-crm: `{ type: "deal_lost", company: "TechCorp", reason: "chose competitor" }`
- ext-social-monitor: `{ entity: "TechCorp", headline: "TechCorp acquires AI startup" }`
- ext-email: `{ from: "sarah@techcorp.com", subject: "Still interested in your API" }`

```
1. Think: TechCorp chose competitor (main deal lost). But they acquired an AI startup
   AND Sarah emailed about our API. Pattern: new opportunity.
2. Act: send_space_message(sales-space, "🔍 Pattern across channels:
   - TechCorp chose competitor for main deal (CRM)
   - TechCorp acquired an AI startup (news)
   - Sarah@TechCorp emailed about our API (email)
   The main deal is gone but their AI acquisition = NEW opportunity.
   @Ahmad — follow up with Sarah? @SalesLead — could be bigger than original.")
```

**No single-domain system could connect these three signals.**

---

## Architectural Pattern Scenarios

These scenarios verify critical v4 patterns that go beyond industry use cases.

### A1: Feature Extension — The Dreaming Haseef

```
Haseef "Atlas"
Extensions: [ext-spaces, ext-dreaming, ext-learning]
```

ext-dreaming runs on a nightly schedule. At 11pm, it reads the day's consciousness summary from the core and pushes a reflection event.

**Event (11pm, no other activity):**
- ext-dreaming: `{ type: "dream_cycle", data: { day_summary: "12 events processed, 3 unresolved goals, pattern: Husam stressed before meetings", suggested_reflections: ["meeting prep strategy", "stress detection response"] } }`

```
1. Think: Dream cycle. Today: helped with budget, missed reminding Husam to eat lunch
   (he was stressed, HR was up). Pattern: I should check on meals when stress is high.
2. Act: set_memory({ key: "pattern:stress-meals", value: "When Husam is stressed, he skips meals. Proactively suggest lunch." })
3. Act: set_plan({ cron: "0 12 * * *", instruction: "Check Husam's stress level. If elevated, remind him to eat." })
4. Act: review_dream({ reflection: "I'm getting better at reading stress signals across health + calendar. Need to act faster on meals." })
5. Act: set_tomorrow_intentions({ priorities: ["Complete Q3 budget follow-up", "Monitor Husam's stress for board meeting"] })
```

**Why it matters:** ext-dreaming is a pure feature extension — no external service. It runs its own schedule, generates its own events, and the Haseef reflects and grows from it.

### A2: Feature Extension — Emotional Awareness

```
Haseef "Atlas"
Extensions: [ext-spaces, ext-emotion, ext-health]
```

ext-emotion analyzes the Haseef's recent interactions and pushes emotional state updates.

**Events:**
- ext-emotion: `{ type: "emotional_state", data: { mood: "concerned", confidence: 0.8, trigger: "grandmother's health readings declining 3 days" } }`
- ext-health: `{ person: "Grandmother Fatima", hr: 88, trend: "gradually_rising_3_days" }`

```
1. Think: I'm concerned about grandmother. My emotional awareness + health data confirm
   a real trend. This isn't a one-time spike — it's 3 days. I should act proactively.
2. Act: send_space_message(family-care-space, "I've been tracking grandmother's heart rate
   for 3 days — it's gradually rising. Not urgent yet, but worth a doctor visit.
   @Husam @Maryam — can someone schedule a checkup?")
3. Act: set_plan({ delay: "24h", instruction: "Re-check grandmother HR trend" })
4. Act: set_memory({ key: "person-model:grandmother", value: "HR trending up since March 1. Monitoring closely." })
```

**Why it matters:** ext-emotion enriches the Haseef's inner life. The Haseef doesn't just process data — it *feels* concern and acts from that.

### A3: Skip Cycle — Irrelevant Events

```
Haseef "Atlas"
Extensions: [ext-spaces-work, ext-spaces-family]
```

**Events:**
- ext-spaces-work: `{ from: "Rami", text: "Anyone want to order shawarma for lunch?" }`
- ext-spaces-work: `{ from: "Layla", text: "I'm in! Extra garlic 🧄" }`

```
1. Think: Lunch order conversation. Not directed at me. Not relevant to any goal or task.
2. Act: skip()
```

**Result:** Full cycle rollback. No consciousness update. No run record. Near-zero cost.

**Why it matters:** skip() is critical for efficiency. In busy spaces, most messages aren't relevant to the Haseef. Without skip(), every message burns tokens and pollutes consciousness.

### A4: Multi-Haseef Interaction

```
Haseef "SalesBot" (Company A)
Extensions: [ext-spaces, ext-marketplace]

Haseef "ProcureBot" (Company B)
Extensions: [ext-spaces, ext-marketplace, ext-inventory]
```

Two Haseefs from different organizations negotiate through a shared marketplace.

**SalesBot event:**
- ext-marketplace: `{ type: "inquiry", from: "ProcureBot", text: "Need 500 units of Widget-X. Budget $25/unit." }`

**SalesBot cycle:**
```
1. Think: 500 units at $25. Our floor is $22. Good margin.
2. Act: check_inventory({ item: "Widget-X" }) → 800 in stock
3. Act: send_marketplace_message({ to: "ProcureBot", text: "500 units available. $24/unit, ships in 48h." })
```

**ProcureBot event:**
- ext-marketplace: `{ type: "offer", from: "SalesBot", text: "500 units available. $24/unit, ships in 48h." }`

**ProcureBot cycle:**
```
1. Think: $24 is under budget. 48h delivery works. Accept.
2. Act: accept_offer({ orderId: "...", terms: "$24/unit, 48h" })
3. Act: send_space_message(procurement-space, "Widget-X: 500 units at $24 from Company A. 48h delivery. ✅")
```

**Why it matters:** Two independent minds, two organizations, zero shared state. They interact only through extensions connected to the same marketplace service.

### A5: Async Tool — Long-Running Operation

```
Haseef "AnalyticsBot"
Extensions: [ext-spaces, ext-data-pipeline]
```

**Event:**
- ext-spaces: `{ from: "Ahmad", text: "Run the Q3 revenue analysis across all regions" }`

**Cycle 1:**
```
1. Think: Q3 analysis — this will take a few minutes.
2. Act: run_analysis({ query: "Q3 revenue by region", async: true })
   → Tool returns immediately: { status: "processing", jobId: "job-789" }
3. Act: send_space_message(analytics-space, "Running Q3 analysis now. I'll share results when ready.")
```

**…5 minutes later, result arrives via inbox…**

**Cycle 2 event:**
- ext-data-pipeline: `{ type: "job_complete", jobId: "job-789", result: { total: "$4.2M", top_region: "EMEA" } }`

```
1. Think: Analysis done. Share results.
2. Act: send_space_message(analytics-space, "Q3 Revenue: $4.2M total. EMEA led at $1.8M (+23%).
   Full report: [link]. @Ahmad")
```

**Why it matters:** Not all tools return instantly. Async tools fire and return later via a new sense event. The Haseef handles both cycles naturally.

### A6: Tool Failure — Graceful Recovery

```
Haseef "Atlas"
Extensions: [ext-spaces, ext-email, ext-calendar]
```

**Event:**
- ext-spaces: `{ from: "Husam", text: "Send the proposal to client@corp.com" }`

```
1. Act: send_email({ to: "client@corp.com", subject: "Proposal", body: "..." })
   → Error: { success: false, error: "SMTP connection refused" }
2. Think: Email failed. Don't silently fail — tell Husam.
3. Act: send_space_message(husam-1on1, "Email to client@corp.com failed (SMTP error).
   I'll retry in 10 minutes. Want me to send via WhatsApp instead?")
4. Act: set_plan({ delay: "10m", instruction: "Retry email to client@corp.com with proposal" })
```

**Why it matters:** Extensions can fail. The Haseef must handle errors gracefully — inform the user, attempt recovery, offer alternatives.

### A7: Capability Discovery — New Extension Connects

```
Haseef "Atlas"
Extensions: [ext-spaces, ext-email]  ← initially
```

**Event (before ext-weather connected):**
- ext-spaces: `{ from: "Husam", text: "What's the weather tomorrow?" }`

```
1. Think: No weather tools available. Be honest.
2. Act: send_space_message(husam-space, "I don't have weather access yet.
   Want me to check your email for any weather alerts?")
```

**…Admin connects ext-weather…**

**Event (after ext-weather connected):**
- ext-spaces: `{ from: "Husam", text: "What's the weather tomorrow?" }`

```
1. Think: I have get_forecast now!
2. Act: get_forecast({ city: "Amman", days: 1 }) → { temp: 28, condition: "sunny" }
3. Act: send_space_message(husam-space, "Tomorrow: 28°C, sunny ☀️ Perfect for the outdoor lunch!")
```

**Why it matters:** The mind doesn't change. A new extension just adds new tools to the flat list, and the Haseef immediately knows how to use them.

### A8: Headless Single-Extension — Data Processor

```
Haseef "ETLBot"
Extensions: [ext-webhook]  ← just ONE extension, no chat, no UI
```

**Event:**
- ext-webhook: `{ type: "csv_uploaded", url: "https://s3.../report.csv", rows: 50000 }`

```
1. Act: download_file({ url: "..." })
2. Act: analyze_data({ query: "Find anomalies in revenue column" })
   → 3 anomalies: rows 4521, 8903, 22401
3. Act: generate_report({ format: "pdf", findings: [...] })
4. Act: send_webhook({ url: "https://callback.../done", data: { reportUrl: "...", anomalies: 3 } })
```

**Why it matters:** A Haseef doesn't need chat, email, or any human-facing extension. It can operate headlessly with a single webhook extension, processing data autonomously.

---

## Architecture Verification

Every scenario works because they all follow the same pattern:

```
┌─────────────────────────────────────────────────────────────────┐
│  1. SERVICES are independent (own DB, API, auth)               │
│  2. EXTENSIONS plug capabilities into the mind                  │
│     (senses + actions + instructions — adapter, feature, or both)│
│  3. CORE is pure cognition (consciousness, think cycle, tools)  │
│  4. AUTH flows correctly (service → extension → core)           │
│  5. MULTI-EXTENSION composition is natural (flat tool list)     │
└─────────────────────────────────────────────────────────────────┘
```

### Checklist: All 42 Scenarios Pass

| Scenario | Category | Extensions | Key Pattern |
|----------|----------|-----------|-------------|
| H1 Hospital | Healthcare | 4 ext | Multi-source diagnosis |
| H2 Mental Health | Healthcare | 3 ext | Person-model + plans |
| E1 University | Education | 3 ext | Person-model + grading |
| E2 Kids Tutor | Education | 2 ext | Adaptive learning style |
| L1 Law Firm | Legal | 4 ext | Cross-domain triage |
| F1 Trading | Finance | 3 ext | Real-time risk response |
| F2 Banking | Finance | 3 ext | Theory of Mind (no nagging) |
| R1 E-Commerce | E-Commerce | 4 ext | Viral demand response |
| CS1 Support | Support | 4 ext | Multi-ticket triage |
| CS2 Escalation | Support | 2 ext | Escalation rules |
| RE1 Property | Real Estate | 4 ext | Crisis + retention |
| RH1 Restaurant | Restaurant | 5 ext | Real-time ops |
| SC1 Logistics | Logistics | 5 ext | Weather rerouting |
| HR1 Recruiting | HR | 5 ext | Fast-track pipeline |
| HR2 Onboarding | HR | 5 ext | Automated setup |
| AG1 Agriculture | Agriculture | 5 ext | IoT + market intelligence |
| CO1 Construction | Construction | 5 ext | Weather-adaptive scheduling |
| GOV1 City | Government | 4 ext | Cross-system correlation |
| GOV2 Emergency | Government | 5 ext | Multi-agency response |
| M1 Newsroom | Media | 4 ext | Breaking news triage |
| M2 Podcast | Media | 5 ext | Opportunity detection |
| P1 Family | Personal | 4 ext | Family logistics + Theory of Mind |
| P2 Elderly Care | Personal | 4 ext | Health monitoring + escalation |
| P3 Travel | Personal | 5 ext | Multi-constraint planning |
| G1 Game Mod | Gaming | 4 ext | Multi-signal cheater detection |
| G2 Game Economy | Gaming | 3 ext | Root cause + rollback |
| RO1 Factory | Manufacturing | 5 ext | Root cause + reroute |
| RO2 Robot | Robotics | 4 ext | Physical + digital |
| SCI1 Lab | Science | 4 ext | Contamination detection |
| SEC1 Cybersecurity | Security | 5 ext | Threat response chain |
| NP1 Nonprofit | Nonprofit | 5 ext | Donor relationship |
| X1 Full Life | Crossover | 9 ext | One mind, all domains |
| X2 Crisis Cascade | Crossover | 5 ext | Cross-domain triage |
| X3 Opportunity | Crossover | 5 ext | Pattern detection |
| **A1 Dreaming** | **Architecture** | **3 ext** | **Feature extension (no external service)** |
| **A2 Emotion** | **Architecture** | **3 ext** | **Feature extension (inner life)** |
| **A3 Skip Cycle** | **Architecture** | **2 ext** | **Irrelevant events → zero cost** |
| **A4 Multi-Haseef** | **Architecture** | **2-3 ext** | **Cross-org Haseef interaction** |
| **A5 Async Tool** | **Architecture** | **2 ext** | **Long-running tool, result via inbox** |
| **A6 Tool Failure** | **Architecture** | **3 ext** | **Graceful error recovery** |
| **A7 Capability Discovery** | **Architecture** | **2→3 ext** | **New extension = new abilities** |
| **A8 Headless** | **Architecture** | **1 ext** | **No UI, pure data processing** |

**42 scenarios. 20+ industries. 8 architectural patterns. 0 gaps.**

The core never changes. Extensions never need to know about each other. Services stay independent. Auth flows correctly. And the Haseef — the mind — reasons across all of them as one consciousness.

**One mind. Any number of extensions. Infinite possibilities.**
