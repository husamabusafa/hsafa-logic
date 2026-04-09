# Hsafa CLI Reference

> All CLI commands for managing scopes — the plugin system that gives Haseefs new capabilities.

## Install

```bash
npm install -g @hsafa/cli
```

## Authentication

```bash
hsafa auth login          # Interactive login (browser, token paste, or email/password)
hsafa auth login --browser               # Force browser login
hsafa auth login --token <token>         # Authenticate with existing token
hsafa auth login --email e --password p  # Non-interactive (CI)
hsafa auth logout         # Clear stored credentials
hsafa auth whoami         # Show current user
```

## Scope Commands

### Scaffold a New Scope

```bash
hsafa scope init <name> [--lang <language>] [--starter <template>]
```

| Option | Values | Default |
|--------|--------|---------|
| `--lang` | `typescript`, `javascript`, `python` | `typescript` |
| `--starter` | `blank`, `api`, `database`, `webhook` | `blank` |

**Starters:**

| Starter | Description |
|---------|-------------|
| `blank` | Minimal setup — SDK wired, one example tool |
| `api` | Wraps an external REST API (fetch helper, auth pattern) |
| `database` | Connects to a database (connection pool, query tools) |
| `webhook` | Listens for incoming webhooks and pushes sense events |

### Register a Scope (No Deploy)

```bash
hsafa scope create <name> [--deployment <type>]
```

- `--deployment platform` (default) — Platform-managed scope
- `--deployment external` — Self-hosted scope (you provide the scope key)

Outputs a **scope key** (`hsk_scope_*`). Save it — shown once.

### Deploy to Platform

```bash
hsafa scope deploy [--image <url>]
```

Run from inside your scope project directory. It:
1. Detects language (package.json → Node, requirements.txt → Python, go.mod → Go)
2. Generates Dockerfile if missing
3. Builds + pushes Docker image
4. Creates/updates template + instance
5. Launches container

Use `--image` to skip build and deploy an existing Docker image.

### List Scopes

```bash
hsafa scope list
```

Shows all templates and instances with status.

### View Logs

```bash
hsafa scope logs <name> [--instance <name>] [--tail <n>]
```

### Container Lifecycle

```bash
hsafa scope start <name>   [--instance <name>]
hsafa scope stop <name>    [--instance <name>]
hsafa scope restart <name> [--instance <name>]
```

### Delete a Scope

```bash
hsafa scope delete <name> [-y]
```

Deletes template and ALL instances.

### Attach / Detach from Haseef

A Haseef can only use a scope's tools after the scope is attached to it.

```bash
hsafa scope attach <name> --haseef <haseef-id> [--instance <name>]
hsafa scope detach <name> --haseef <haseef-id>
```

### Instance Management

Create additional instances of an existing template with different config:

```bash
hsafa scope instance create <template> --name <instance-name> --config KEY=VALUE [KEY=VALUE ...]
hsafa scope instance delete <instance-name> [-y]
```

Each instance gets its own scope key, container, and config.

## Local Development Workflow

```bash
# 1. Scaffold
hsafa scope init my-weather --lang typescript

# 2. Enter project
cd my-weather

# 3. Install dependencies
npm install

# 4. Register scope on Core (get a scope key)
hsafa scope create my-weather

# 5. Configure .env with the scope key
#    SCOPE_NAME=my-weather
#    SCOPE_KEY=hsk_scope_...
#    CORE_URL=http://localhost:3001

# 6. Run locally
npm run dev
#    → Registers tools with Core
#    → Opens SSE stream for tool calls
#    → Console: [my-weather] Connected to Core — ready for tool calls

# 7. Attach to a haseef
hsafa scope attach my-weather --haseef <haseef-id>

# 8. Chat with the haseef — your tools are live

# 9. Edit code → restart npm run dev → changes take effect immediately

# 10. When ready, deploy to platform
hsafa scope deploy
```

**Tips:**
- Use `tsx watch src/index.ts` for auto-restart on file changes
- Attach to a **test haseef** during development
- The same scope key works for both local dev and production
- Never commit your scope key to git

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
```
