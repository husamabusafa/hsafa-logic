# Hsafa CLI

> The command-line interface for building, deploying, and managing scopes — the plugin system that gives haseefs new capabilities.

```bash
npm install -g @hsafa/cli
```

---

## Authentication

```bash
hsafa auth login
```

Authenticates the CLI with your Hsafa account. Required before any scope or marketplace commands.

---

## Commands

### `hsafa scope init`

Scaffold a new scope project with a working starter template.

```bash
hsafa scope init <name> [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--lang <language>` | Language: `typescript`, `javascript`, `python` | `typescript` |
| `--starter <template>` | Starter template (see below) | `blank` |

**Starter templates:**

| Starter | Description |
|---------|-------------|
| `blank` | Minimal setup — SDK wired, one example tool |
| `api` | Wraps an external REST API (fetch helper, auth pattern) |
| `database` | Connects to a database (connection pool, query tools) |
| `webhook` | Listens for incoming webhooks and pushes sense events to haseefs |

**Example:**

```bash
hsafa scope init my-weather --lang typescript --starter api
cd my-weather
```

**Generated project structure:**

```
my-weather/
├── src/
│   ├── index.ts        # SDK setup, connect, register tools
│   ├── tools.ts        # Tool definitions (name, schema, description)
│   └── handler.ts      # Tool call handlers (your logic)
├── .env                # SCOPE_KEY, CORE_URL, SCOPE_NAME
├── package.json
└── README.md
```

---

### `hsafa scope create`

Register a scope on Core without deploying code. Useful for local development or self-hosted scopes.

```bash
hsafa scope create <name> [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--deployment <type>` | `platform` or `external` | `platform` |

**Output:**

```
Template: my-weather
Instance: my-weather (default)
Scope Key: hsk_scope_mw_003
```

The scope key is required for your service to connect to Core. **Save it — it's shown once.**

---

### `hsafa scope deploy`

Build, push, and launch your scope as a Docker container on the platform. Run this from inside your scope project directory.

```bash
hsafa scope deploy [options]
```

| Option | Description |
|--------|-------------|
| `--image <url>` | Skip build — use an existing Docker image instead |

**What it does:**

1. **Detects language** — `package.json` → Node.js, `requirements.txt` → Python, `go.mod` → Go
2. **Generates Dockerfile** — if you don't have one (auto-generated based on language)
3. **Builds Docker image** — `docker build` locally
4. **Pushes to registry** — `registry.hsafa.io/<user>/<scope>:latest`
5. **Creates/updates ScopeTemplate** — registers the blueprint in Core
6. **Creates default ScopeInstance** — if first deploy
7. **Launches container** — with platform-injected env vars
8. **Returns status** — template name, instance name, scope key, image URL

**First deploy:**

```bash
hsafa scope deploy
# → Building image...
# → Pushing to registry...
# → Creating template "my-weather"...
# → Launching default instance...
# → ✓ Deployed "my-weather"
#    Template: my-weather
#    Instance: my-weather (default)
#    Scope Key: hsk_scope_mw_003
#    Image: registry.hsafa.io/user123/my-weather:latest
#    Status: running
```

**Re-deploy (code update):**

```bash
hsafa scope deploy
# → Rebuilds image
# → Updates template imageUrl
# → Restarts ALL instances of this template with the new image
```

**Skip build — use existing image:**

```bash
hsafa scope deploy --image ghcr.io/myuser/my-scope:latest
```

---

### `hsafa scope list`

View all your deployed scope templates and their instances.

```bash
hsafa scope list
```

```
TEMPLATE       INSTANCE        STATUS    IMAGE                                      CREATED
my-weather     my-weather      running   registry.hsafa.io/user123/my-weather:v1    2h ago
my-weather     weather-eu      running   registry.hsafa.io/user123/my-weather:v1    1h ago
my-analyzer    my-analyzer     stopped   registry.hsafa.io/user123/my-analyzer:v1   1d ago
```

---

### `hsafa scope logs`

Stream logs from a running scope instance.

```bash
hsafa scope logs <template> [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--instance <name>` | Target a specific instance | Default instance |

```bash
hsafa scope logs my-weather
hsafa scope logs my-weather --instance weather-eu
```

---

### `hsafa scope start` / `stop` / `restart`

Control the lifecycle of a scope instance's container.

```bash
hsafa scope start <template>   [--instance <name>]
hsafa scope stop <template>    [--instance <name>]
hsafa scope restart <template> [--instance <name>]
```

---

### `hsafa scope delete`

Delete a scope template and **all of its instances**.

```bash
hsafa scope delete <template>
```

This stops and removes all containers for every instance of the template.

---

### `hsafa scope attach` / `detach`

Connect or disconnect a scope instance from a haseef. A haseef can only use a scope's tools after the scope is attached to it.

```bash
hsafa scope attach <template> --haseef <haseef-id> [--instance <name>]
hsafa scope detach <template> --haseef <haseef-id> [--instance <name>]
```

**Example:**

```bash
hsafa scope attach my-weather --haseef 949f6425-a813-485c-9f37-b100e0cfd371
```

After attaching, the haseef sees the scope's tools and can call them during conversations.

---

### `hsafa scope instance create`

Create an additional instance of an existing template with different configuration.

```bash
hsafa scope instance create <template> --name <instance-name> --config KEY=VALUE [KEY=VALUE ...]
```

**Example:**

```bash
hsafa scope instance create my-weather --name weather-eu --config API_REGION=eu
# → Instance: weather-eu (from template: my-weather)
# → Scope Key: hsk_scope_mw_007
```

Each instance gets its own scope key, container, and config. Useful for connecting to different environments (prod vs staging) or different API accounts.

---

### `hsafa scope instance delete`

Delete a specific instance (stops container, removes scope key).

```bash
hsafa scope instance delete <instance-name>
```

---

## Marketplace Commands

> Future feature — publish and install community-built scopes.

### `hsafa scope publish`

Publish a template to the marketplace so other users can install it.

```bash
hsafa scope publish <template> \
  --description "Real-time weather data for your haseef" \
  --category "Data & APIs" \
  --config-schema '{ "API_KEY": { "type": "string", "required": true, "description": "OpenWeather API key" } }'
```

### `hsafa marketplace search`

Browse published scopes.

```bash
hsafa marketplace search weather
# → my-weather by user123 — Real-time weather data for your haseef
```

### `hsafa marketplace install`

Install a published scope — creates an instance from the published template.

```bash
hsafa marketplace install my-weather --config API_KEY=your_key_here
# → Instance: my-weather
# → Scope Key: hsk_scope_mw_042
# → Status: running
```

---

## Local Development Workflow

The recommended workflow for building a new scope:

```bash
# 1. Scaffold
hsafa scope init my-weather --lang typescript
cd my-weather

# 2. Create scope on Core (get a scope key)
hsafa scope create my-weather

# 3. Configure .env
#    SCOPE_NAME=my-weather
#    SCOPE_KEY=hsk_scope_mw_003
#    CORE_URL=http://localhost:3001

# 4. Run locally
npm run dev
#    → Registers tools with Core
#    → Opens SSE stream for tool calls
#    → Console: [my-weather] Connected to Core — ready for tool calls

# 5. Attach to a test haseef
hsafa scope attach my-weather --haseef <haseef-id>

# 6. Chat with the haseef — your tools are live

# 7. Edit code → restart npm run dev → changes take effect immediately

# 8. When ready, deploy to platform
hsafa scope deploy
```

**Tips:**

- Use `tsx watch src/index.ts` or `nodemon` for auto-restart on file changes
- Attach to a **test haseef** during development, not your main one
- The same scope key works for both local dev and production
- Don't commit your scope key to git

---

## Environment Variables

Every scope service (local or deployed) needs these:

| Variable | Description | Source |
|----------|-------------|--------|
| `SCOPE_NAME` | Instance name | Set by user (local) or injected by platform |
| `SCOPE_KEY` | Auth key for Core | Generated on `scope create` or `scope deploy` |
| `CORE_URL` | Core API endpoint | `http://localhost:3001` (local) or platform internal URL |

Platform containers get these injected automatically. For local dev, set them in `.env`.

User-defined config values (from `--config` or the UI) are also injected as env vars (e.g., `API_KEY`, `REGION`).

---

## Dockerfile Generation

If your project doesn't include a Dockerfile, the CLI auto-generates one based on your language:

**Node.js** (detected via `package.json`):
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
CMD ["node", "src/index.js"]
```

**Python** (detected via `requirements.txt`):
```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["python", "main.py"]
```

If a `Dockerfile` already exists in the project root, the CLI uses it as-is.

---

## Quick Reference

```
hsafa auth login                              # authenticate
hsafa scope init <name> [--lang] [--starter]  # scaffold new scope
hsafa scope create <name> [--deployment]      # register without deploying
hsafa scope deploy [--image]                  # build + deploy to platform
hsafa scope list                              # show all templates + instances
hsafa scope logs <name> [--instance]          # view container logs
hsafa scope start|stop|restart <name>         # container lifecycle
hsafa scope attach <name> --haseef <id>       # connect scope to haseef
hsafa scope detach <name> --haseef <id>       # disconnect scope from haseef
hsafa scope instance create <tpl> --name <n>  # add instance with config
hsafa scope instance delete <name>            # remove instance
hsafa scope delete <name>                     # remove template + all instances
hsafa scope publish <name>                    # publish to marketplace
hsafa marketplace search <query>              # browse marketplace
hsafa marketplace install <name> --config ... # install from marketplace
```
