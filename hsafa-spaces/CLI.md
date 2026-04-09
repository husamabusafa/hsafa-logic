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

```bash
hsafa scope list
```

```
TEMPLATE         INSTANCE         STATUS       TYPE       CREATED
postgres         postgres         running      platform   2d ago
spaces           spaces           connected    built-in   14d ago
my-weather       my-weather       stopped      external   1h ago
```

---

### `hsafa scope attach / detach`

```bash
hsafa scope attach <scope-name> --haseef <haseef-name>
hsafa scope detach <scope-name> --haseef <haseef-name>
```

Haseefs can be referenced by **name** (case-insensitive) or UUID.

---

### `hsafa scope logs / start / stop / restart / delete`

```bash
hsafa scope logs <name> [--tail <n>]
hsafa scope start <name>
hsafa scope stop <name>
hsafa scope restart <name>
hsafa scope delete <name> [-y]
```

---

### `hsafa scope instance`

Manage multiple instances of one template:

```bash
hsafa scope instance create <template> --name <name> --config KEY=VALUE
hsafa scope instance delete <name> [-y]
```

---

## Environment Variables

Every scope needs these (auto-configured by `init` / `create`):

| Variable | Description | Source |
|----------|-------------|--------|
| `SCOPE_NAME` | Scope name | Auto from project name |
| `SCOPE_KEY` | Auth key (`hsk_scope_*`) | Auto-provisioned by Spaces |
| `CORE_URL` | Core API URL | Auto from Spaces config |

Add scope-specific variables (API keys, DB URLs, etc.) to `.env`. When deployed, instance config is injected as container env vars.

---

## How It Works

```
CLI ──→ Spaces Server ──→ Core
         (provisions keys,
          manages instances,
          knows Core URL)
```

- The CLI talks only to Spaces. Never to Core directly.
- Spaces provisions scope keys from Core using its service key.
- The user never sees or manages service keys.
- Scope keys are written to `.env` automatically.
- Haseefs are resolved by name (not UUID).

---

## Marketplace (coming soon)

```bash
hsafa marketplace browse
hsafa marketplace install <scope-slug>
```

---

## Quick Reference

```
hsafa auth login                              # authenticate
hsafa auth logout                             # clear credentials
hsafa auth whoami                             # show current user
hsafa config set server|frontend <url>        # configure
hsafa config show                             # show config

hsafa scope init <name> [--haseef] [--lang] [--starter]  # new scope
hsafa scope create [--name] [--haseef]                    # register existing
hsafa scope dev [--haseef]                                # auto-create + run
hsafa scope deploy [--image]                              # build + deploy
hsafa scope register --key --name                         # register external
hsafa scope list                                          # show all
hsafa scope logs <name>                                   # view logs
hsafa scope start|stop|restart <name>                     # lifecycle
hsafa scope attach <name> --haseef <name>                 # connect to haseef
hsafa scope detach <name> --haseef <name>                 # disconnect
hsafa scope delete <name>                                 # delete
hsafa scope instance create <tpl> --name <n> --config ... # add instance
hsafa scope instance delete <name>                        # remove instance
