# Ways to Deploy Custom Scopes

> How users build and deploy their own scope plugins to give haseefs new capabilities.

---

## Core Concepts

Every custom scope follows the **template → instance** model:

| Concept | What it is | Analogy |
|---------|-----------|---------|
| **ScopeTemplate** | The reusable blueprint — Docker image, tool definitions, config schema, description | App listing in an app store |
| **ScopeInstance** | An installed copy with user-specific config (API keys, credentials, etc.) | Your installed copy of the app |

One template can have many instances (e.g., `postgres` template → `prod-db` instance + `staging-db` instance, each with different connection strings).

The CLI hides this for the simple case — `hsafa scope deploy` creates both the template and a default instance in one step.

---

## Two Ways to Deploy

| Way | Description |
|-----|-------------|
| **Platform Deploy** | `hsafa scope deploy` — CLI builds a Docker image, pushes it, platform runs it as a container |
| **Self-Hosted** | User runs the scope on their own server, registers it in Spaces UI |

Both use the same SDK and protocol. The only difference is where the process runs.

---

## Way 1: Platform Deploy (via CLI)

The CLI handles everything — Dockerfile generation, image build, push, and container orchestration. Under the hood, **every deploy is a Docker container**.

### User Flow

```bash
# 1. Install CLI
npm install -g @hsafa/cli

# 2. Authenticate
hsafa auth login

# 3. Scaffold a new scope
hsafa scope init my-weather --lang typescript
cd my-weather

# 4. Write your logic (src/index.ts is pre-filled with a working starter)
#    - Define tools in src/tools.ts
#    - Implement handlers in src/handler.ts

# 5. Test locally
npm run dev                 # connects to Core, receives tool calls

# 6. Deploy to platform
hsafa scope deploy
# → Building image...
# → Pushing to registry...
# → Creating template "my-weather"...
# → Launching default instance...
# → ✓ Deployed "my-weather"
# →   Template: my-weather
# →   Instance: my-weather (default)
# →   Scope Key: hsk_scope_mw_003
# →   Image: registry.hsafa.io/user123/my-weather:latest
# →   Status: running
```

### What Happens Under the Hood

```
hsafa scope deploy
  │
  ├── 1. Detect language
  │      package.json → Node.js
  │      requirements.txt → Python
  │      go.mod → Go
  │
  ├── 2. Generate Dockerfile (if user doesn't have one)
  │      Node.js → FROM node:20-alpine, npm install, node src/index.js
  │      Python  → FROM python:3.12-slim, pip install, python main.py
  │
  ├── 3. Build Docker image
  │      docker build -t registry.hsafa.io/user123/my-weather:latest .
  │
  ├── 4. Push to platform registry
  │      docker push registry.hsafa.io/user123/my-weather:latest
  │
  ├── 5. Upsert ScopeTemplate
  │      POST /api/scopes/templates
  │      { slug: "my-weather", imageUrl, configSchema, description, userId }
  │
  ├── 6. Create default ScopeInstance (if none exists)
  │      POST /api/scopes/instances
  │      { templateSlug: "my-weather", name: "my-weather", config: {} }
  │
  ├── 7. Deploy container for the instance
  │      Pulls image, injects env vars: SCOPE_KEY, CORE_URL, SCOPE_NAME
  │
  └── 8. Return template + instance + scope key + status
```

### Multiple Instances

After deploying, you can create additional instances of the same template with different configs:

```bash
# Deploy creates template + default instance
hsafa scope deploy
# → Template: my-weather
# → Instance: my-weather (default)

# Add another instance with different config
hsafa scope instance create my-weather --name weather-eu --config API_REGION=eu
# → Instance: weather-eu (from template: my-weather)
# → Scope Key: hsk_scope_mw_007

# Or via the Spaces UI:
# Scopes → my-weather template → "Add Instance" → fill in config
```

Each instance:
- Gets its own scope key
- Runs its own container
- Has its own config (env vars)
- Can be attached to different haseefs independently

### Re-deploying (Updates)

```bash
# Edit code, then re-deploy
hsafa scope deploy
# → Rebuilds image
# → Updates template imageUrl
# → Restarts ALL instances of this template with the new image
```

The template is the single source of truth for the image. Updating it rolls out to all instances.

### Auto-Generated Dockerfiles

If the user doesn't provide a Dockerfile, the CLI generates one:

**Node.js:**
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
CMD ["node", "src/index.js"]
```

**Python:**
```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["python", "main.py"]
```

**User has their own Dockerfile:**
```bash
# CLI detects Dockerfile exists → uses it as-is
hsafa scope deploy    # builds with user's Dockerfile
```

### Custom Image (Skip Build)

Advanced users who already have a Docker image:

```bash
# Just point to an existing image
hsafa scope deploy --image ghcr.io/myuser/my-scope:latest
# → Skips build + push
# → Creates template with this image URL
# → Launches default instance
```

Or via the Spaces UI — enter the image URL in the deploy form.

### Platform-Injected Environment

The platform auto-injects these env vars into every container:

```env
SCOPE_NAME=my-weather               # instance name
SCOPE_KEY=hsk_scope_mw_003          # generated by Core (per instance)
CORE_URL=http://core:3001            # internal network (Core is reachable)
```

Plus any user config from the instance (e.g., `API_KEY=abc123`, `REGION=eu`).

The user's code reads them:

```typescript
import { HsafaSDK } from "@hsafa/sdk";

const sdk = new HsafaSDK({
  coreUrl: process.env.CORE_URL,
  apiKey: process.env.SCOPE_KEY,
  scope: process.env.SCOPE_NAME,
});

await sdk.registerTools([...]);
sdk.onToolCall("my_tool", async (args, ctx) => { ... });
sdk.connect();
```

### Container Management

```bash
# View deployed scopes (shows templates + instances)
hsafa scope list
# TEMPLATE       INSTANCE        STATUS    IMAGE                                      CREATED
# my-weather     my-weather      running   registry.hsafa.io/user123/my-weather:v1    2h ago
# my-weather     weather-eu      running   registry.hsafa.io/user123/my-weather:v1    1h ago
# my-analyzer    my-analyzer     stopped   registry.hsafa.io/user123/my-analyzer:v1   1d ago

# Manage instances
hsafa scope logs my-weather                  # logs for default instance
hsafa scope logs my-weather --instance weather-eu
hsafa scope restart my-weather               # restart default instance
hsafa scope stop my-weather
hsafa scope start my-weather

# Delete instance
hsafa scope instance delete weather-eu

# Delete template (removes all instances)
hsafa scope delete my-weather

# Update (rebuild + redeploy all instances)
hsafa scope deploy                   # rebuilds image, restarts all instances
```

### Platform Side (Spaces Server)

The Spaces server manages containers via Docker API or docker-compose:

```yaml
# Auto-generated per scope instance
services:
  scope-my-weather:
    image: registry.hsafa.io/user123/my-weather:latest
    environment:
      - SCOPE_NAME=my-weather
      - SCOPE_KEY=hsk_scope_mw_003
      - CORE_URL=http://core:3001
    restart: unless-stopped
    networks:
      - hsafa-internal
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 256M
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

---

## Way 2: Self-Hosted (External Scope)

The user runs the scope on their own infrastructure. A ScopeTemplate is still created (so the scope is browsable and can have multiple instances), but the platform doesn't manage the process.

### User Flow

```bash
# 1. Create the template + instance on Core
hsafa scope create my-weather --deployment external
# → Template: my-weather (external)
# → Instance: my-weather (default)
# → Scope Key: hsk_scope_mw_003
# → Save this key!

# 2. Build your project (any language, any framework)
mkdir my-weather && cd my-weather
# ... write your code ...

# 3. Configure .env
echo "SCOPE_KEY=hsk_scope_mw_003" >> .env
echo "CORE_URL=https://core.your-domain.com" >> .env
echo "SCOPE_NAME=my-weather" >> .env

# 4. Run on your own server
npm start                    # or docker run, or systemd, or Lambda, etc.
```

### What the User Manages

| Responsibility | Managed By |
|---------------|------------|
| Code + dependencies | User |
| Server / hosting | User |
| Uptime + restarts | User |
| TLS / networking | User |
| Logs | User |
| Core URL must be reachable | User |

### Requirements

- The scope service must be able to reach Core's URL over the network
- The scope key must match a valid scope registered in Core
- The service must use the SDK (or implement the protocol: HTTP for tool registration/results, SSE for tool dispatch)

---

## Local Development & Testing

Before deploying, you'll want to test your scope locally against a real haseef. Here's the full workflow.

### 1. Create the Scope on Core

You need a scope key before your service can connect — even locally.

```bash
# Create the scope (one-time)
hsafa scope create my-weather
# → Template: my-weather
# → Instance: my-weather (default)
# → Scope Key: hsk_scope_mw_003
# → Save this key!
```

This registers the template and a default instance in Core so it can accept connections.

### 2. Configure Your Local .env

```env
SCOPE_NAME=my-weather
SCOPE_KEY=hsk_scope_mw_003
CORE_URL=http://localhost:3001       # local Core instance
```

If Core is running on a remote server:
```env
CORE_URL=https://core.your-domain.com
```

### 3. Run Your Scope Locally

```bash
# Node.js / TypeScript
npx tsx src/index.ts

# Or with the generated dev script
npm run dev
```

Your service will:
1. Call `sdk.registerTools([...])` → tells Core what tools are available
2. Call `sdk.connect()` → opens SSE stream, starts listening for tool calls
3. Console shows: `[my-weather] Connected to Core — ready for tool calls`

### 4. Attach to a Haseef

Your scope is running but no haseef is using it yet. Attach it:

```bash
# Via CLI
hsafa scope attach my-weather --haseef <haseef-id>

# Or via Spaces UI
# Haseefs → (select haseef) → Scopes tab → Attach → select "my-weather"
```

Now the haseef sees your tools. When you talk to the haseef and it decides to use one of your tools, Core dispatches the call through the SSE stream to your locally running service.

### 5. Test the Flow

```
You (chat with haseef): "What's the weather in Tokyo?"
  │
  ├── Haseef sees tool: my-weather_get_weather
  ├── LLM decides to call it: { city: "Tokyo" }
  ├── Core dispatches via SSE → your local service
  ├── Your handler runs: fetches weather API → returns result
  ├── Core feeds result back to LLM
  └── Haseef replies: "It's 22°C and sunny in Tokyo"
```

Watch your local terminal — you'll see the tool call arrive and the result being sent back.

### 6. Iterate

Since your service is running locally, you can:
- **Edit code** → restart `npm run dev` → changes take effect immediately
- **Add new tools** → `sdk.registerTools()` re-syncs on every startup
- **Check logs** → all in your terminal
- **Debug** → attach a debugger, add breakpoints, use `console.log`

### 7. Detach When Done Testing

```bash
hsafa scope detach my-weather --haseef <haseef-id>
```

Or leave it attached — when your local service stops, Core just won't be able to dispatch tool calls to it (the haseef will see the tools but calls will time out).

### Dev vs Production Checklist

| Step | Local Dev | Production |
|------|-----------|------------|
| **Create scope** | `hsafa scope create` | Same (one-time) |
| **Configure** | `.env` with `localhost:3001` | `.env` with production Core URL |
| **Run** | `npm run dev` (local process) | `hsafa scope deploy` (Docker container) |
| **Attach** | `hsafa scope attach` (same) | `hsafa scope attach` (same) |
| **Logs** | Terminal | `hsafa scope logs` or Spaces UI |
| **Restart** | Ctrl+C + `npm run dev` | `hsafa scope restart` |

### Tips

- **Keep your scope key safe** — it's the same key for local dev and production. Don't commit it to git.
- **Use `--haseef` flag** — attach to a test haseef during development, not your main one.
- **Hot reload** — use `tsx watch src/index.ts` or `nodemon` to auto-restart on file changes.
- **Multiple haseefs** — you can attach the same scope to multiple haseefs simultaneously. Useful for testing with different haseef configurations.

---

## Comparison

| Feature | Platform Deploy | Self-Hosted |
|---------|----------------|-------------|
| **Deploy command** | `hsafa scope deploy` | N/A (user manages) |
| **Where it runs** | Platform containers | User's own infra |
| **Template created** | Yes (auto) | Yes (manual) |
| **Multiple instances** | Yes (CLI or UI) | Yes (each with own key) |
| **Languages** | Any (Docker) | Any |
| **Infra management** | Platform | User |
| **Logs** | `hsafa scope logs` + UI | User manages |
| **Auto-restart** | Yes (container restart policy) | User configures |
| **Resource limits** | Platform-enforced (CPU/mem) | User controls |
| **Networking** | Internal (Core always reachable) | User must ensure Core is reachable |
| **Isolation** | Container-level | Full (own server) |
| **Cost** | Included in plan (with limits) | User's own infra costs |
| **Best for** | Most users, quick iteration | Enterprise, existing infra, special requirements |

---

## Attach to Haseefs

After deploying (either way), scope instances need to be attached to haseefs:

```bash
# Via CLI
hsafa scope attach my-weather --haseef <haseef-id>

# Via Spaces UI
# Haseefs → (select haseef) → Scopes tab → Attach → select "my-weather"
```

Both keys are needed (haseef key + scope key). The Spaces platform stores both and sends them to Core behind the scenes.

---

## Marketplace (Future)

The template-first model enables a scope marketplace where developers publish templates and users install them.

### How It Works

- **Publisher** creates a ScopeTemplate with a public Docker image, description, config schema (what the user needs to fill in), and documentation.
- **Consumer** browses the marketplace, picks a template, fills in their config (API keys, credentials, etc.) → creates a ScopeInstance from it.
- Multiple consumers install the same template independently, each with their own config and container.

### Publishing

```bash
# Mark a template as public (available on marketplace)
hsafa scope publish my-weather \
  --description "Real-time weather data for your haseef" \
  --category "Data & APIs" \
  --config-schema '{ "API_KEY": { "type": "string", "required": true, "description": "OpenWeather API key" } }'
```

### Installing from Marketplace

```bash
# Browse
hsafa marketplace search weather
# → my-weather by user123 — Real-time weather data for your haseef

# Install (creates instance from published template)
hsafa marketplace install my-weather --config API_KEY=your_key_here
# → Instance: my-weather
# → Scope Key: hsk_scope_mw_042
# → Status: running
```

Or via the Spaces UI — browse marketplace → click "Install" → fill in config → done.

### Template = The Marketplace Unit

| Concept | Role |
|---------|------|
| **ScopeTemplate** | The published listing — image, tools, config schema, description, author |
| **ScopeInstance** | The user's installed copy — their config, their container, their scope key |

This is the same model used for prebuilt platform scopes (scheduler, postgres). Custom scopes and marketplace scopes are the same thing — just with different visibility.

---

## Starter Templates

The CLI `hsafa scope init` provides starters for common patterns:

```bash
hsafa scope init my-scope --lang typescript    # Node.js/TypeScript
hsafa scope init my-scope --lang javascript    # Node.js/JavaScript
hsafa scope init my-scope --lang python        # Python

# With a starter for common use cases
hsafa scope init my-scope --starter api        # Wraps an external REST API
hsafa scope init my-scope --starter database   # Connects to a database
hsafa scope init my-scope --starter webhook    # Listens for webhooks + pushes sense events
hsafa scope init my-scope --starter blank      # Minimal starter
```

Each starter includes:
- Pre-filled `src/index.ts` (or `main.py`) with SDK setup
- Example tool definitions
- Example handler logic
- `.env` template
- `README.md` with instructions
