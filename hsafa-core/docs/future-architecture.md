# Hsafa Core — Future Architecture Notes

> Design ideas and decisions discussed on March 23, 2026.
> These are future plans, not yet implemented.

---

## 1. Remove Cycles → Event-Driven Interrupt/Rerun

### Current behavior (cycles)
Haseef runs in **cycles**: inbox fills up → cycle starts → processes all events → calls `done` → cycle ends. New events wait in the inbox for the next cycle.

### Proposed behavior (interrupt/rerun)
No cycles. Any new event **interrupts** the current run, injects the event into context, and starts a new run. More like how a human brain works — continuous reaction, not batch processing.

### How it works

```
Run 1: Haseef is planning a route to kitchen
  → tool call: get_map() ✅ completed
  → tool call: plan_path() 🔄 in progress...

NEW EVENT arrives: "Actually, go to the bedroom instead"

→ STOP Run 1
→ Rollback plan_path() (incomplete)
→ Keep get_map() result in consciousness
→ Inject new event
→ START Run 2
```

### Rollback rules

| State when interrupted | Keep | Discard |
|---|---|---|
| Before any tool call | Nothing | Everything |
| Mid tool call (not finished) | Nothing from this call | The pending call |
| After tool call finished | The completed call + result | Any subsequent incomplete calls |
| After message sent | The sent message | Any incomplete work after it |

### Key principles

- **Haseef never notices he was stopped.** The LLM is stateless — it only sees the context you provide. If you remove incomplete work from consciousness, Haseef thinks he never started it.
- **Completed work is preserved.** Finished tool calls and sent messages stay in consciousness. Haseef builds on them in the new run.
- **Mid-step cancellation is clean.** If a tool call is in progress, cancel it and remove it from the steps. Haseef will think he hasn't made that call yet and may decide to make it again.
- **Debounce rapid events.** Don't interrupt on every event — wait a short window (e.g., 500ms) to batch rapid events before interrupting. Otherwise Haseef never completes anything.

### Why this is better

- **Responsiveness**: Haseef reacts immediately to new info, not after the current cycle finishes.
- **More human-like**: Humans don't batch-process inputs — they react continuously.
- **Better for real-time**: Essential for robotics, voice, and sensor-driven scenarios.
- **Simpler model**: No inbox batching, no cycle scheduling, no `done` tool needed as cycle terminator.

### Trade-offs

- More runs = more token usage + API calls (mitigated by smarter/cheaper models over time).
- Need careful rollback logic for interrupted tool calls.
- Need debouncing to prevent thrashing.

---

## 2. Multi-Model Architecture (GPT-5.4 + Real-Time)

### The three-layer brain model

```
┌─────────────────────────────────────┐
│  Reflex Layer (non-LLM)            │  ← collision avoidance, motor control
│  < 10ms response time               │  ← deterministic, safety-critical
├─────────────────────────────────────┤
│  Reactive Layer (gpt-realtime)      │  ← voice, quick reactions
│  50-200ms response time             │  ← lightweight LLM
├─────────────────────────────────────┤
│  Deliberative Layer (Hsafa Core)    │  ← planning, decisions, memory
│  1-30s response time                │  ← deep reasoning (GPT-5.4+)
└─────────────────────────────────────┘
```

### Role separation

| Layer | Speed | Handles | Uses LLM? |
|---|---|---|---|
| **Reflex** | <10ms | collision avoidance, emergency stop, motor control | ❌ No |
| **Reactive** | 50-200ms | live voice, quick verbal responses, simple reactions | ⚡ Lightweight real-time model |
| **Deliberative** | 1-30s | planning, reasoning, complex decisions, memory, tool orchestration | 🧠 Full reasoning model |

### Important design rule

> **Never let the LLM handle fast reflexes.** LLMs are too slow (100ms+), too expensive, and not deterministic enough for safety-critical actions.

Hsafa Core = deep thinking only. Fast actions belong to lower layers.

### How real-time voice gets context

Core pushes a **context summary** to the real-time voice extension:

```
┌──────────────────────────────────────┐
│         Hsafa Core (GPT-5.4)         │
│  memory, goals, plans, decisions     │
│                                      │
│  Pushes context updates:             │
│  - current_plan: "going to kitchen"  │
│  - current_mood: "helpful"           │
│  - user_name: "Husam"               │
│  - recent_decision: "take route B"   │
└──────────────┬───────────────────────┘
               │ (context update)
               ▼
┌──────────────────────────────────────┐
│    Real-Time Voice Extension          │
│    (gpt-realtime)                     │
│                                      │
│  System prompt (from core):           │
│  "You are Haseef. You're currently   │
│   going to the kitchen via route B.  │
│   The user's name is Husam."         │
│                                      │
│  Handles: live speech in/out          │
└──────────────────────────────────────┘
```

The real-time model doesn't need full memory — just enough to sound coherent: current task, user's name, recent decisions, personality/tone.

---

## 3. Computer Vision Integration

### How it connects to Hsafa

Computer vision runs as a **local fast process** (not an LLM). It pushes **sense events** to Core only when decisions are needed.

```
Camera feed (30fps)
    │
    ▼
CV Processing (local, fast, non-LLM)
    │
    ├── Obstacle detected → Reflex layer (avoid immediately, never touches Core)
    │
    ├── Person detected → Send to Core:
    │     { scope: "vision", type: "person_detected", data: { name: "Husam", confidence: 0.92 } }
    │     Core decides: greet? ignore? ask something?
    │
    ├── Object found (Core asked for it) → Send to Core:
    │     { scope: "vision", type: "object_found", data: { object: "glass", location: [x,y,z] } }
    │     Core decides: grab it? tell user?
    │
    └── Nothing interesting → Don't send anything (save tokens)
```

### When to send events to Core vs. handle locally

| Event | Send to Core? | Why |
|---|---|---|
| Person detected (face recognition) | ✅ Yes | Core decides how to greet, what to say |
| Person says something (voice transcript) | ✅ Yes | Core reasons about the request |
| Obstacle detected | ❌ No → reflex layer | Too fast for LLM, safety-critical |
| Object detected (glass on table) | ⚠️ Only if Core asked for it | During a plan like "find a glass" |
| Low battery | ✅ Yes | Core decides: tell user? Go charge? |
| Collision imminent | ❌ No → reflex layer | Must react in <10ms |
| Grab object (motor control) | ❌ No → reflex layer | Core says "grab glass", low-level executes motion |
| Navigation path blocked | ⚠️ Depends | Reflex avoids, but if stuck → tell Core to replan |
| User facial expression (angry/happy) | ✅ Yes | Core adapts tone and behavior |
| Timer/schedule fired | ✅ Yes | Core decides what to do |

### The rule

> **Send to Core when a DECISION is needed. Handle locally when a REACTION is needed.**

Don't flood Core with every camera frame. The CV extension should filter and only report meaningful state changes.

### Face recognition specifics

- CV systems (FaceNet, DeepFace, etc.) convert faces into **embeddings** (vectors).
- Match against a database of known people.
- Needs training data (multiple images per person).
- Limitations: low light, different angles, masks/glasses, similar faces.
- The flow is: `Camera → Face embedding → Vector DB → Match → Sense event to Core`

---

## 4. Robot Example — Full Flow

User says: "Go to the kitchen and bring me water"

```
Step 1 — Real-time voice extension
  → Understands voice instantly
  → Pushes transcript to Core as sense event
  → Replies immediately: "Okay, going now"

Step 2 — Hsafa Core (deliberative)
  → Receives sense event: { type: "voice_transcript", text: "Go to kitchen, bring water" }
  → Reasons and plans:
     - Where is kitchen? (memory)
     - What path? (calls plan_path tool)
     - What to look for? (glass/bottle)
  → Dispatches actions via tools:
     - navigate_to("kitchen")
     - search_for("water container")

Step 3 — Reflex/robotics layer
  → Executes navigation (motor control, obstacle avoidance)
  → CV scans for water containers
  → Reports back: { type: "object_found", object: "water_bottle" }

Step 4 — Core receives CV event
  → Decides: grab it
  → Calls: grab_object({ object: "water_bottle", location: [x,y,z] })

Step 5 — Real-time voice extension (context updated by Core)
  → "I found a bottle, bringing it to you"

Step 6 — Core dispatches return navigation
  → navigate_to("user_location")
```

---

## 5. Hsafa Core as Separate Server — Architecture

### Current architecture (already implemented)

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│ Hsafa Core   │◄───►│  Redis       │◄───►│ Hsafa Spaces │
│ (port 3001)  │     │ (pub/sub +   │     │ (port 3005)  │
│              │     │  streams)    │     │              │
│ LLM calls    │     └──────────────┘     │ Messages     │
│ Memory       │                          │ SSE          │
│ Tool routing │                          │ Auth         │
│ Extensions   │                          │ UI/API       │
└─────────────┘                           └──────────────┘
```

### Why separate servers is correct

- **Independent scaling** — Core needs more CPU/memory than Spaces
- **Independent deployment** — Update Core without touching Spaces and vice versa
- **Failure isolation** — If Core crashes, Spaces still works (messages flow, UI loads)
- **Different runtime needs** — Core: heavy LLM calls, long-running processes. Spaces: WebSockets, fast DB reads.
- **Team independence** — Different people can work on different services

### Is this common?

Yes — this is **microservices architecture**, the industry standard:

- Uber: ~4,000 microservices
- Netflix: ~1,000 microservices
- Most production AI systems: separate inference server, API server, worker processes

3-5 services (Core + Spaces + Extensions) is modest and very manageable.

### Is Redis common for this?

Yes — Redis is one of the most popular choices for inter-service communication:

- **Redis Pub/Sub** — real-time event broadcasting (tool dispatch)
- **Redis Streams** — durable event queues (action dispatch)
- **Redis as cache** — shared state between services

Alternatives: RabbitMQ, Kafka, NATS. But Redis is simplest and works perfectly at this scale.

---

## 6. Will Hsafa Stay Useful as Models Get Smarter?

**Yes — more useful, not less.**

Smarter models make the **infrastructure around them more valuable**:

| What Hsafa provides | Why it stays important |
|---|---|
| **Memory** | Even GPT-10 won't remember last month's conversations without a memory system |
| **Identity** | Models are stateless. Hsafa gives persistent identity, goals, relationships |
| **Tool orchestration** | Smarter models need MORE tools, not fewer. Core manages that complexity. |
| **Multi-model routing** | Swap GPT-5.4 for GPT-7 without changing anything. Core is model-agnostic. |
| **Extensions ecosystem** | Senses and actions grow independently of the model |
| **Consciousness** | Long-term continuity across thousands of interactions |

### What becomes less important over time
- Prompt engineering (models understand instructions better)
- Workarounds for model limitations (fewer hallucinations)
- Complex chain-of-thought scaffolding (native reasoning)

### What becomes more important over time
- Memory systems (longer-lived agents need better memory)
- Identity preservation (more interactions → identity matters more)
- Extension ecosystem (more capabilities → more value)
- Event-driven architecture (real-time responsiveness)

> Think of it like this: A human brain gets smarter, but it still needs a body, senses, and memories. Hsafa Core is that body.

---

## 7. Future Extensions Roadmap

| Extension | Scope | What it does |
|---|---|---|
| `ext-spaces` | `spaces` | Social — messages, conversations (✅ exists) |
| `ext-vision` | `vision` | Camera feeds → detected objects, faces, scenes |
| `ext-robotics` | `robotics` | Movement, manipulation, navigation |
| `ext-realtime` | `voice` | Live audio via gpt-realtime, speech-to-text, text-to-speech |
| `ext-sensors` | `sensors` | Temperature, proximity, battery, location |

All follow the same pattern:
1. **Sense events IN**: Extension pushes events to Core via `POST /api/haseefs/:id/senses`
2. **Actions OUT**: Core dispatches tool calls via Redis → Extension executes them
