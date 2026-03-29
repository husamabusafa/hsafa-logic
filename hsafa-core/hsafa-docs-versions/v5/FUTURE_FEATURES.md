# Hsafa Core v5 — Future Features

Vision features beyond the core architecture. These extend the four pillars
(Profile, Memory, Tools, Senses) without changing them.

---

## 1. Sandbox Code — The Subconscious

**Idea:** The Haseef can write code that runs in an isolated sandbox. This code
acts as a background layer — custom logic the Haseef programs for itself.

### What it is

A prebuilt tool (`run_code` / `deploy_script`) lets the Haseef write JavaScript
that executes in a V8 isolate (e.g., `isolated-vm`, Deno subprocess, or Cloudflare
Workers-style runtime). The code runs outside the think loop, independently.

### What the Haseef can do with it

| Use Case | Example |
|----------|---------|
| **Custom wake-up conditions** | "Wake me if Bitcoin drops below $50K" → script polls a price API every 5 min, pushes a sense event when triggered |
| **Scheduled behaviors** | "Check in on Husam every morning at 9am" → script fires a self-reminder event on cron |
| **Data pipelines** | "Summarize my emails every evening" → script fetches email tool, aggregates, pushes digest event |
| **Reactive rules** | "If I get more than 5 messages in 1 minute, batch them" → script buffers incoming events |
| **Personality routines** | "Every Sunday, reflect on the week" → script triggers introspection cycle |
| **Computed state** | "Track my conversation count per person" → script maintains counters, queryable via tool |
| **Monitoring** | "Alert me if the server response time exceeds 2s" → script runs health checks |

### Why this is powerful

This is the Haseef's **subconscious**. Humans don't consciously control their
heartbeat, circadian rhythm, or emotional reflexes — those run in the background.
The sandbox gives the Haseef the same capability: background processes it designs
for itself, running without consuming LLM tokens.

The Haseef evolves its own behaviors over time. It's not just responding to events —
it's programming its own responses to the world.

### Architecture sketch

```
                    ┌─────────────────┐
                    │  Sandbox Runtime │  ← V8 isolate / Deno subprocess
                    │  (per Haseef)    │
                    └──┬───────────┬──┘
                       │           │
              push events    call tools
                       │           │
                  ┌────▼───────────▼────┐
                  │     Hsafa Core       │
                  └─────────────────────┘
```

The sandbox has a limited API surface:
- `pushEvent(event)` — push a sense event to the Haseef's inbox
- `callTool(scope, name, args)` — invoke a registered tool
- `getMemories(query)` — search memories
- `setTimeout / setInterval / cron` — scheduling primitives
- `fetch(url)` — HTTP requests (with allowlist/rate limiting)

### Prebuilt tools

| Tool | Purpose |
|------|---------|
| `deploy_script` | Deploy a named script to the sandbox. Params: `{ name, code, trigger }` |
| `list_scripts` | List all running scripts |
| `remove_script` | Remove a script by name |
| `script_logs` | Get recent logs from a script |

`trigger` can be: `{ type: "cron", schedule: "0 9 * * *" }`, `{ type: "interval", ms: 300000 }`,
`{ type: "event", scope: "whatsapp", eventType: "message" }`, or `{ type: "once" }`.

### Safety

- Scripts run in **isolated V8** — no access to host filesystem, process, or core internals
- **Resource limits**: CPU time (50ms per invocation), memory (128MB), execution timeout
- **Rate limits**: max events pushed per minute, max tool calls per minute
- **Allowlisted fetch**: only approved domains or user-configured allowlist
- The Haseef can kill its own scripts. Admin can kill all scripts.
- Scripts are **versioned** — the Haseef can roll back

### Verdict: ✅ Very strong idea

This is one of the most differentiating features possible. No other AI agent
framework gives the agent the ability to program its own background behaviors.
It turns the Haseef from reactive (waits for events) to proactive (creates its
own event sources). Combined with memory and tools, the Haseef becomes genuinely
autonomous.

---

## 2. Skill Discovery — Self-Extending Capabilities

**Idea:** The Haseef can discover and install new services from an external
registry, giving itself new tools and senses without human intervention.

### What it is

A **Service Registry** (like an app store for AI agents) where services publish
their capabilities. The Haseef can browse, evaluate, and install services —
essentially extending its own scope of abilities.

### How it works

```
1. Haseef realizes it needs a capability it doesn't have
   (e.g., "I need to check the weather but I have no weather tools")

2. Haseef calls `search_registry({ query: "weather data" })`
   → Returns: [{ name: "weather-service", description: "...", tools: [...], rating: 4.8 }]

3. Haseef calls `install_service({ serviceId: "weather-service" })`
   → Core provisions the service, registers its scope + tools

4. Haseef now has `TOOLS [weather]` available in its next cycle
```

### Service Registry

```typescript
interface ServiceListing {
  id: string;
  name: string;
  description: string;
  scope: string;                    // the scope it registers under
  tools: ToolPreview[];             // what tools it provides
  events: EventPreview[];           // what events it pushes
  pricing: "free" | "paid";
  rating: number;
  installCount: number;
  configSchema?: object;            // what config it needs (API keys, etc.)
}
```

The registry is **external** to the core — it could be:
- A hosted marketplace (like npm for AI services)
- A self-hosted catalog (for enterprise)
- A federated network (services advertise themselves)

### What the Haseef can do with it

| Scenario | Flow |
|----------|------|
| **Need new capability** | "I need to translate text" → searches → installs translation service → has `translate` tool |
| **Upgrade existing service** | "This weather service is slow" → searches for alternatives → swaps |
| **Explore and grow** | During idle time, browses registry for interesting services → installs ones that match goals |
| **Recommend to user** | "I found a service that could automate your invoicing. Want me to install it?" |

### Prebuilt tools

| Tool | Purpose |
|------|---------|
| `search_registry` | Search for services by capability description |
| `install_service` | Install a service (registers scope + tools + starts adapter) |
| `uninstall_service` | Remove a service and its scope |
| `list_installed` | List currently installed services |

### Safety

- **Admin approval mode**: Haseef proposes, admin approves (default)
- **Auto-install mode**: Haseef installs freely within budget/allowlist
- **Sandboxed services**: installed services run in containers with limited permissions
- **Cost controls**: spending limits per service, per month
- **Audit log**: every install/uninstall recorded

### Verdict: ✅ Strong idea — but phase 2

This requires a registry ecosystem to exist first. Start with manual service
connection (v5 core), then build the registry + auto-install as a layer on top.
The core architecture already supports it — installing a service is just
registering a scope with tools + starting an adapter process.

---

## 3. Two-Tier Brain — Light Model + Heavy Model

**Idea:** The Haseef has two brains. A cheap light model that runs constantly
and handles routine work. The expensive heavy model only wakes for important things.

### The human analogy

```
Human brain:
  System 1 (fast, automatic)  — breathing, reflexes, pattern matching, filtering
  System 2 (slow, deliberate)  — reasoning, planning, complex decisions

Haseef brain:
  Light brain (gpt-4o-mini)    — filtering, pre-processing, dreams, triage
  Heavy brain (claude sonnet)   — real thinking, conversations, tool use, judgment
```

### How it works

The think loop gets a new event type: **minor events**. These go to the light
brain's inbox. The light brain runs its own simplified think loop — cheap, fast,
called often. It decides what reaches the heavy brain.

```
                    ┌──────────────────┐
   ALL events ────▶ │   LIGHT BRAIN     │  ← cheap model (gpt-4o-mini)
                    │   (always on)     │     runs on every event
                    └──┬───────────┬───┘
                       │           │
              suppress │     escalate to heavy brain
              (handle  │           │
              quietly) │     ┌─────▼──────────┐
                       │     │  HEAVY BRAIN     │  ← expensive model (claude sonnet)
                       │     │  (wakes when     │     only runs when it matters
                       │     │   needed)        │
                       │     └─────────────────┘
                       │
                 low-priority work:
                 dreams, filtering, counting,
                 memory cleanup, scoring
```

### What the light brain handles

| Task | Example | Heavy brain needed? |
|------|---------|-------------------|
| **Event triage** | "Is this WhatsApp message important enough to wake the heavy brain?" | No |
| **Spam/noise filtering** | Group notifications, automated emails, bot messages → suppress | No |
| **Priority scoring** | Assign urgency (1-10) to incoming events | No |
| **Memory dreams** | Consolidate, merge, clean up memories during idle | No |
| **Pattern logging** | "Sara messaged 5th time today" → update counter | No |
| **Scheduled checks** | "Is it 9am? Build morning briefing" → push to heavy brain | Pushes event |
| **Threshold alerts** | "10 messages in 2 min from same person" → escalate | Escalates |
| **Goal reminders** | "Goal deadline is tomorrow, no progress" → escalate | Escalates |
| **Context prep** | Pre-fetch relevant data before waking heavy brain | Feeds to heavy brain |

### Event classification

Events get a new field: `weight`

```typescript
interface SenseEvent {
  eventId: string;
  scope: string;
  type: string;
  data: object;
  attachments?: Attachment[];
  weight?: "light" | "heavy";   // which brain handles this
  timestamp?: string;
}
```

- `weight: "heavy"` (default) → goes to heavy brain inbox as before
- `weight: "light"` → goes to light brain only. Light brain decides if heavy brain should wake.

Services can set the weight when pushing events. Or the light brain intercepts
ALL events first and decides routing.

### Dreams (subset of light brain work)

When idle for 30+ minutes, the light brain enters dream mode:

| Dream process | What it does |
|--------------|-------------|
| **Memory consolidation** | Merge related memories, adjust importance levels |
| **Pattern discovery** | "Sara always responds faster on Tuesdays" |
| **Contradiction resolution** | Detect conflicting memories, pick the newer one |
| **Goal reflection** | Review goals, retire completed ones, flag stalled ones |
| **Knowledge compression** | Turn verbose memories into concise summaries |
| **Relationship modeling** | Update person models based on recent interactions |
| **Self-reflection** | "I've been too verbose lately" → adjust behavior memory |

### Escalation — how the light brain wakes the heavy brain

The light brain pushes a special event to the heavy brain's inbox:

```typescript
// Light brain decides this message needs real attention
await pushEvent({
  eventId: "escalation-abc",
  scope: "self",
  type: "escalation",
  data: {
    reason: "Husam sent an urgent message about the Q4 deadline",
    originalEvent: originalEvent,
    priority: 10,
    context: {
      // Pre-fetched by light brain to save heavy brain time
      recentMessages: [...],
      relevantMemories: [...],
      personModel: { ... }
    }
  }
});
```

The heavy brain wakes up with **pre-chewed context** — the light brain already
gathered relevant info, scored priority, and explained why it's escalating.
This saves the heavy brain tokens and time.

### Config

```json
{
  "lightBrain": {
    "enabled": true,
    "model": { "provider": "openai", "model": "gpt-4o-mini" },
    "interceptAll": false,
    "dreams": {
      "enabled": true,
      "idleThreshold": 1800000,
      "cooldown": 14400000
    }
  }
}
```

- `interceptAll: false` → light brain only handles `weight: "light"` events
- `interceptAll: true` → light brain sees ALL events first, decides routing

### Cost impact

```
Without light brain:
  100 events/day × heavy model = 100 expensive calls

With light brain:
  100 events/day × light model = 100 cheap calls ($0.001 each)
  Light brain escalates 20 → heavy model = 20 expensive calls
  
  = 80% cost reduction + better responses (pre-fetched context)
```

### Why this is powerful

The heavy brain is the Haseef's **conscious mind** — deliberate, thoughtful,
expensive. The light brain is the **subconscious** — always running, filtering
the noise, preparing context, maintaining the mind while the conscious rests.

Together with sandbox code (feature 1), you get three tiers:

```
Tier 1: Sandbox code     — deterministic logic, $0, instant
Tier 2: Light brain       — simple AI judgment, very cheap, fast
Tier 3: Heavy brain       — full reasoning, expensive, only when needed
```

Most events never reach tier 3. The Haseef gets smarter AND cheaper.

### Verdict: ✅ Very strong — this is the real architecture

This is theoretically sound but needs careful design. Ship v5 with heavy brain
only, then add light brain as a layer. The core architecture supports it —
it's just a second think loop with a cheaper model and different inbox routing.

---

## 4. Theory of Mind — People Models

**Idea:** The Haseef builds structured psychological profiles of every person it
interacts with. Not just memory facts — rich mental models that evolve.

### What it is

A dedicated `PersonModel` that goes beyond key-value memories. Each person the
Haseef interacts with gets a living profile:

```typescript
interface PersonModel {
  name: string;
  relationship: string;           // "creator", "colleague", "friend", "client"
  communicationStyle: string;     // "direct", "verbose", "formal", "casual"
  emotionalPatterns: string;      // "calm under pressure", "gets frustrated with delays"
  preferences: string[];          // ["prefers PDF", "likes charts", "morning person"]
  boundaries: string[];           // ["don't message after 10pm", "hates small talk"]
  trustLevel: number;             // 1-10, earned over time
  interactionCount: number;
  lastInteraction: string;
  recentMood: string;             // inferred from recent messages
  notes: string;                  // freeform observations
}
```

### What the Haseef can do with it

| Capability | Example |
|------------|---------|
| **Adaptive communication** | Speaks formally to clients, casually to friends |
| **Emotional awareness** | Detects frustration in messages, adjusts tone |
| **Proactive care** | "Haven't heard from Sara in 2 weeks — she mentioned being stressed" |
| **Conflict prevention** | Knows not to message Husam with non-urgent things after 10pm |
| **Relationship building** | Remembers birthdays, follows up on personal topics |
| **Trust-based disclosure** | Shares more detail with high-trust people |

### Implementation

This can be built on top of existing memory with a `person:*` key convention:
```
person:Husam:model → { full PersonModel JSON }
person:Sara:model → { full PersonModel JSON }
```

A prebuilt tool `update_person_model` runs after interactions to update the model.
During light brain dream cycles (feature 3), the Haseef reviews and refines all person models.

The system prompt surfaces relevant person models when events mention or involve
that person (using the memory relevance engine).

### Why this matters

Current AI agents treat every user the same. A Haseef with person models has
**social intelligence** — it adapts to each person naturally. This is one of the
most human-like capabilities possible: understanding people, not just tasks.

### Verdict: ✅ Strong — builds on existing memory system

No new tables needed. Uses memory importance + relevance engine. Person models
are just high-importance structured memories that the Haseef manages itself.

---

## Priority & Dependencies

| Feature | Priority | Depends on | Complexity |
|---------|----------|------------|------------|
| **Theory of Mind** | 🟢 Ship first | Core v5 (memory system) | Low — convention on memory keys |
| **Two-Tier Brain** | � Phase 2 | Core v5 + light brain think loop | Medium — second think loop + routing |
| **Sandbox Code** | 🟡 Phase 2 | Core v5 + V8 isolate runtime | Medium — needs sandbox infra |
| **Skill Discovery** | 🟡 Phase 2 | Core v5 + Service Registry | High — needs ecosystem |

Theory of Mind can ship with v5 launch — it only uses existing memory primitives.
Two-Tier Brain, Sandbox Code, and Skill Discovery need additional infrastructure.

### The three-tier vision

```
Tier 1: Sandbox code     — deterministic logic, $0, instant
Tier 2: Light brain       — simple AI judgment, very cheap, fast  
Tier 3: Heavy brain       — full reasoning, expensive, only when needed
```

Ship v5 with tier 3 only. Add tier 2 (light brain) in phase 2. Add tier 1
(sandbox) alongside or after. Each tier reduces the load on the tier above it.
