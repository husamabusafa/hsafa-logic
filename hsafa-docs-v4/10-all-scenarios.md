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

## Architecture Verification

Every scenario works because they all follow the same pattern:

```
┌─────────────────────────────────────────────────────────────────┐
│  1. SERVICES are independent (own DB, API, auth)               │
│  2. EXTENSIONS are thin adapters (senses + actions + instructions)│
│  3. CORE is pure cognition (consciousness, think cycle, tools)  │
│  4. AUTH flows correctly (service → extension → core)           │
│  5. MULTI-EXTENSION composition is natural (flat tool list)     │
└─────────────────────────────────────────────────────────────────┘
```

### Checklist: All 34 Scenarios Pass

| Scenario | Services | Extensions | Core | Auth | Multi-Ext |
|----------|----------|-----------|------|------|-----------|
| H1 Hospital | ✅ | ✅ | ✅ | ✅ | 4 ext |
| H2 Mental Health | ✅ | ✅ | ✅ | ✅ | 3 ext |
| E1 University | ✅ | ✅ | ✅ | ✅ | 3 ext |
| E2 Kids Tutor | ✅ | ✅ | ✅ | ✅ | 2 ext |
| L1 Law Firm | ✅ | ✅ | ✅ | ✅ | 4 ext |
| F1 Trading | ✅ | ✅ | ✅ | ✅ | 3 ext |
| F2 Banking | ✅ | ✅ | ✅ | ✅ | 3 ext |
| R1 E-Commerce | ✅ | ✅ | ✅ | ✅ | 4 ext |
| CS1 Support | ✅ | ✅ | ✅ | ✅ | 4 ext |
| CS2 Escalation | ✅ | ✅ | ✅ | ✅ | 2 ext |
| RE1 Property | ✅ | ✅ | ✅ | ✅ | 4 ext |
| RH1 Restaurant | ✅ | ✅ | ✅ | ✅ | 5 ext |
| SC1 Logistics | ✅ | ✅ | ✅ | ✅ | 5 ext |
| HR1 Recruiting | ✅ | ✅ | ✅ | ✅ | 5 ext |
| HR2 Onboarding | ✅ | ✅ | ✅ | ✅ | 5 ext |
| AG1 Agriculture | ✅ | ✅ | ✅ | ✅ | 5 ext |
| CO1 Construction | ✅ | ✅ | ✅ | ✅ | 5 ext |
| GOV1 City | ✅ | ✅ | ✅ | ✅ | 4 ext |
| GOV2 Emergency | ✅ | ✅ | ✅ | ✅ | 5 ext |
| M1 Newsroom | ✅ | ✅ | ✅ | ✅ | 4 ext |
| M2 Podcast | ✅ | ✅ | ✅ | ✅ | 5 ext |
| P1 Family | ✅ | ✅ | ✅ | ✅ | 4 ext |
| P2 Elderly Care | ✅ | ✅ | ✅ | ✅ | 4 ext |
| P3 Travel | ✅ | ✅ | ✅ | ✅ | 5 ext |
| G1 Game Mod | ✅ | ✅ | ✅ | ✅ | 4 ext |
| G2 Game Economy | ✅ | ✅ | ✅ | ✅ | 3 ext |
| RO1 Factory | ✅ | ✅ | ✅ | ✅ | 5 ext |
| RO2 Robot | ✅ | ✅ | ✅ | ✅ | 4 ext |
| SCI1 Lab | ✅ | ✅ | ✅ | ✅ | 4 ext |
| SEC1 Security | ✅ | ✅ | ✅ | ✅ | 5 ext |
| NP1 Nonprofit | ✅ | ✅ | ✅ | ✅ | 5 ext |
| X1 Full Life | ✅ | ✅ | ✅ | ✅ | 9 ext |
| X2 Crisis | ✅ | ✅ | ✅ | ✅ | 5 ext |
| X3 Opportunity | ✅ | ✅ | ✅ | ✅ | 5 ext |

**34 scenarios. 20+ industries. 0 architecture gaps.**

The core never changes. Extensions never need to know about each other. Services stay independent. Auth flows correctly. And the Haseef — the mind — reasons across all of them as one consciousness.

**One mind. Any number of bodies. Infinite possibilities.**
