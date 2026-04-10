# Project Blueprints — Multi-Scope Templates

> A **blueprint** defines a complete project: multiple scopes, their tools/events,
> shared infrastructure, and a haseef profile — all scaffolded with one command.

---

## The Problem

`hsafa scope init` creates **one scope**. But real projects need multiple scopes
working together. A robot needs vision + car + conversation. A SaaS app needs
postgres + scheduler + email. A smart home needs lights + thermostat + security.

Users shouldn't have to run `scope init` three times and manually wire things together.

---

## The Solution: Blueprints

A blueprint is a `.hsafa/blueprint.yaml` file that lives in a GitHub template repo
(or in the Spaces marketplace). It defines:

1. **Which scopes** to create
2. **What tools/events** each scope exposes
3. **Shared infrastructure** (shared context, process management)
4. **Haseef profile** requirements
5. **Scaffold files** for each scope

---

## CLI Flow

### From GitHub Template

```bash
hsafa project init --from github:hsafa/robot-reachy --haseef atlas
```

### From Marketplace Blueprint

```bash
hsafa project init --blueprint robot-reachy --haseef atlas
```

### What It Does

1. Clone/download the blueprint template
2. For each scope defined in `blueprint.yaml`:
   - Call `POST /api/scopes/quick-create` → get scope key
   - Write `.env` for that scope
3. Attach all scopes to the haseef
4. Write root `docker-compose.yml` or `package.json` for running everything
5. Print next steps

### Output

```
✔ Created robot-reachy/
  Scopes registered:
    vision       hsk_scope_v1a2b3...  (saved to vision/.env)
    car          hsk_scope_c4d5e6...  (saved to car/.env)
    conversation hsk_scope_f7g8h9...  (saved to conversation/.env)
  Attached to: atlas ✓

  Next:
    cd robot-reachy
    npm install
    npm run dev    # starts all 3 scopes + shared context
```

---

## Blueprint Definition Format

### `.hsafa/blueprint.yaml`

```yaml
name: robot-reachy
description: "Reachy Head + Arduino Car + Raspberry Pi — human-like robot behavior"
version: "1.0"

# Haseef profile requirements
profile:
  required:
    - robotId
    - language
  defaults:
    location: home

# Scopes to create
scopes:
  vision:
    description: "Cameras, object/person detection, head tracking, spatial awareness"
    directory: scopes/vision       # relative to project root
    language: typescript
    tools:
      - name: get_world_state
        description: "Get everything the robot currently sees"
        input: {}
      - name: find_object
        description: "Search current view for a specific object"
        input:
          query: { type: string, description: "Object description" }
      - name: find_person
        description: "Search for a person by name or description"
        input:
          query: { type: string, description: "Person name or description" }
      - name: set_attention
        description: "Tell vision what to actively watch for"
        input:
          watchFor: { type: "string[]", description: "Items to watch for" }
      - name: clear_attention
        description: "Reset attention to default scanning mode"
        input: {}
      - name: capture_photo
        description: "Take a photo of what the robot currently sees"
        input: {}
      - name: read_text
        description: "Read any visible text using OCR"
        input: {}
    events:
      - person_appeared
      - person_left
      - object_appeared
      - object_disappeared
      - gesture_detected
      - attention_match
      - scene_change

  car:
    description: "Autonomous navigation, obstacle avoidance, following, exploration"
    directory: scopes/car
    language: typescript
    tools:
      - name: go_to_person
        description: "Drive to a detected person"
        input:
          personName: { type: string }
      - name: go_to_object
        description: "Drive to a detected object"
        input:
          objectId: { type: string }
      - name: go_direction
        description: "Drive in a direction for an approximate distance"
        input:
          direction: { type: string }
          distance: { type: number }
      - name: explore
        description: "Slowly drive around and observe surroundings"
        input:
          duration: { type: number, description: "Duration in seconds" }
      - name: follow_person
        description: "Follow a person continuously"
        input:
          personName: { type: string }
      - name: stop
        description: "Stop all wheel movement immediately"
        input: {}
    events:
      - arrived
      - path_blocked
      - target_lost
      - stuck
      - following_update

  conversation:
    description: "Speech recognition, text-to-speech, real-time conversation"
    directory: scopes/conversation
    language: typescript
    tools:
      - name: say
        description: "Say something through the robot speaker"
        input:
          text: { type: string }
          priority: { type: string, enum: [interrupt, next, when_relevant] }
      - name: instruct_conversation
        description: "Give the conversation AI new context"
        input:
          instruction: { type: string }
      - name: get_conversation_history
        description: "Get recent conversation transcript"
        input:
          lastN: { type: number, optional: true }
      - name: mute
        description: "Stop auto-responding"
        input: {}
      - name: unmute
        description: "Resume auto-responding"
        input: {}
    events:
      - speech_heard
      - important_question

# Shared infrastructure
shared:
  context:
    file: shared/context.ts
    description: "In-memory shared context object read/written by all scopes"
    sections:
      plan: "Current goal, navigation target, attention targets"
      world: "Detected objects, people, free space map"
      car: "Movement state, speed, navigation status"
      dialogue: "Last speech, speaker name, conversation state"
  workers:
    - name: reflex
      description: "Safety stop layer (30fps)"
      file: workers/reflex.ts
    - name: gaze
      description: "Head direction controller (30fps)"
      file: workers/gaze.ts
    - name: idle
      description: "Idle behavior system"
      file: workers/idle.ts
    - name: salience
      description: "Event salience filter for vision"
      file: workers/salience.ts

# How to run everything
run:
  dev: "npm run dev"         # starts all scopes + workers in one process
  start: "npm start"         # production mode
  docker: "docker compose up"
```

---

## Scaffolded Project Structure

```
robot-reachy/
├── .hsafa/
│   └── blueprint.yaml           # the blueprint definition
├── shared/
│   ├── context.ts               # SharedContext type + singleton
│   └── types.ts                 # shared types (Person, Object, FreeSpace, etc.)
├── workers/
│   ├── reflex.ts                # safety stop (30fps)
│   ├── gaze.ts                  # head direction (30fps)
│   ├── idle.ts                  # idle behaviors
│   └── salience.ts              # event salience filter
├── scopes/
│   ├── vision/
│   │   ├── src/
│   │   │   ├── index.ts         # @hsafa/sdk entry, tool handlers
│   │   │   ├── tools.ts         # tool definitions (pre-filled from blueprint)
│   │   │   ├── awareness.ts     # YOLO detection worker (10fps)
│   │   │   └── free-space.ts    # free space estimator
│   │   ├── .env                 # SCOPE_NAME, SCOPE_KEY, CORE_URL (auto-written)
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── car/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── tools.ts
│   │   │   ├── navigation.ts    # navigation controller (10Hz)
│   │   │   └── arduino.ts       # serial communication
│   │   ├── .env
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── conversation/
│       ├── src/
│       │   ├── index.ts
│       │   ├── tools.ts
│       │   ├── stt.ts           # Whisper speech-to-text
│       │   ├── tts.ts           # Piper text-to-speech
│       │   └── realtime-llm.ts  # local conversation LLM
│       ├── .env
│       ├── package.json
│       └── tsconfig.json
├── main.ts                      # entry point: starts all scopes + workers
├── package.json                 # root workspace
├── tsconfig.json
├── docker-compose.yml           # for production deployment
└── README.md
```

---

## How `tools.ts` Gets Pre-Filled

The blueprint defines tools declaratively. The scaffold generates working tool definitions:

```typescript
// scopes/vision/src/tools.ts — auto-generated from blueprint

import { ScopeToolDefinition } from "@hsafa/sdk";

export const tools: ScopeToolDefinition[] = [
  {
    name: "get_world_state",
    description: "Get everything the robot currently sees. All objects, people, positions, distances, and free space for driving.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "find_object",
    description: "Search current view for a specific object by description.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Object description" },
      },
      required: ["query"],
    },
  },
  // ... rest auto-generated
];

export const instructions = `You control the vision system of a robot.
You can see the world, detect objects and people, and track attention targets.
Events are pushed automatically when important things happen in the visual field.`;
```

And `index.ts` gets a working skeleton:

```typescript
// scopes/vision/src/index.ts — auto-generated

import { HsafaScope } from "@hsafa/sdk";
import { tools, instructions } from "./tools.js";
import { sharedContext } from "../../shared/context.js";

const scope = new HsafaScope({
  name: process.env.SCOPE_NAME!,
  coreUrl: process.env.CORE_URL!,
  scopeKey: process.env.SCOPE_KEY!,
  tools,
  instructions,
});

scope.onToolCall("get_world_state", async (input, ctx) => {
  // TODO: Return current world state from shared context
  return sharedContext.world;
});

scope.onToolCall("find_object", async (input, ctx) => {
  // TODO: Search world model for matching object
  const { query } = input as { query: string };
  return { found: false, query };
});

// ... handlers for each tool

await scope.start();
console.log(`Vision scope started: ${scope.name}`);
```

---

## Blueprint Sources

### 1. GitHub Template Repos

Any GitHub repo with `.hsafa/blueprint.yaml` can be used:

```bash
hsafa project init --from github:hsafa/robot-reachy --haseef atlas
hsafa project init --from github:company/saas-starter --haseef myapp
hsafa project init --from github:user/smart-home --haseef home
```

The CLI:
1. Downloads/clones the repo
2. Reads `.hsafa/blueprint.yaml`
3. Registers all scopes
4. Writes `.env` files
5. Attaches to haseef

### 2. Spaces Marketplace (Future)

Blueprints published to the Spaces platform:

```bash
hsafa project init --blueprint robot-reachy --haseef atlas
hsafa project init --blueprint saas-postgres-scheduler --haseef myapp
```

### 3. Local Blueprint

Create a blueprint from an existing project:

```bash
hsafa project publish    # reads .hsafa/blueprint.yaml, publishes to marketplace
```

---

## Example Blueprints

### Robot (This Spec)

```bash
hsafa project init --from github:hsafa/robot-reachy --haseef atlas
```
- 3 scopes: vision, car, conversation
- Shared context in RAM
- Workers: reflex, gaze, idle, salience
- Single process on Raspberry Pi

### SaaS Starter

```bash
hsafa project init --from github:hsafa/saas-starter --haseef myapp
```
- 3 scopes: postgres (database), scheduler (cron jobs), email (notifications)
- Each scope runs as a Docker container
- Platform-managed deployment

### Smart Home

```bash
hsafa project init --from github:hsafa/smart-home --haseef home
```
- 4 scopes: lights, thermostat, security, music
- Each scope wraps a different hardware API
- External deployment (runs on home server)

### Dream Journal (Dreaming Template)

```bash
hsafa project init --from github:hsafa/dream-journal --haseef dreamer
```
- 2 scopes: journal (stores/retrieves dreams), analysis (pattern detection)
- Journal scope: tools for save_dream, search_dreams, get_dream_stats
- Analysis scope: tools for find_patterns, interpret_symbols, dream_timeline

---

## API Changes Required

### New: `POST /api/projects/init`

Bulk scope creation for blueprints. Creates N scopes in one request.

**Request:**
```json
{
  "blueprint": "robot-reachy",
  "scopes": [
    { "scopeName": "vision", "displayName": "Vision" },
    { "scopeName": "car", "displayName": "Car Navigation" },
    { "scopeName": "conversation", "displayName": "Conversation" }
  ],
  "haseefName": "atlas"
}
```

**Response:**
```json
{
  "project": "robot-reachy",
  "scopes": [
    { "scopeName": "vision", "scopeKey": "hsk_scope_...", "instanceId": "..." },
    { "scopeName": "car", "scopeKey": "hsk_scope_...", "instanceId": "..." },
    { "scopeName": "conversation", "scopeKey": "hsk_scope_...", "instanceId": "..." }
  ],
  "coreUrl": "http://localhost:3001",
  "haseef": { "id": "...", "name": "atlas" }
}
```

This is more efficient than N separate `quick-create` calls and ensures all scopes
are registered atomically.

### New: `GET /api/blueprints` (Future)

List available blueprints from the marketplace.

### New: `GET /api/blueprints/:slug` (Future)

Get blueprint details including scope definitions, description, and usage stats.

---

## CLI Commands

```
hsafa project init [name]              Scaffold a multi-scope project from a blueprint
  --from <github:user/repo>            GitHub template repo
  --blueprint <slug>                   Marketplace blueprint
  --haseef <name>                      Attach all scopes to this haseef
  --dir <path>                         Output directory (default: ./<name>)

hsafa project publish                  Publish current project as a blueprint
hsafa project list                     List marketplace blueprints
```

---

## Relationship to Existing System

| Concept | Single Scope | Blueprint |
|---------|-------------|-----------|
| Command | `hsafa scope init <name>` | `hsafa project init --from <source>` |
| Creates | 1 templateless ScopeInstance | N templateless ScopeInstances |
| Scaffold | 1 directory with src/ | Multi-directory workspace |
| Template | Not needed (templateless) | Not needed (all templateless) |
| Haseef | Optional `--haseef` | Optional `--haseef` (attaches all) |

Blueprints build on top of the templateless scope model. Each scope in a blueprint
is still a regular templateless ScopeInstance — the blueprint just automates creating
multiple at once and scaffolding the project structure.

---

## Summary

1. **Blueprint = multi-scope project template** stored in GitHub repos or marketplace
2. **One command** scaffolds everything: code, .env files, scope registrations, haseef attachment
3. **Tools are pre-defined** in YAML, scaffolded into working TypeScript/Python code
4. **Shared infrastructure** (context, workers) is included in the scaffold
5. **No new abstractions needed** — each scope is still a regular templateless ScopeInstance
6. **Extensible** — add new scopes to an existing blueprint project anytime
