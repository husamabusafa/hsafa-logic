# Hsafa CLI Reference

> Build and manage skills — the plugin system that gives Haseefs new capabilities.

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

## Skill Commands

### Scaffold a New Skill

```bash
hsafa skill init <name> [--lang <language>] [--starter <template>] [--haseef <name>]
```

Creates a project directory, registers the skill, provisions a scope key, and writes `.env`. Ready to run immediately.

| Option | Values | Default |
|--------|--------|---------|
| `--lang` | `typescript`, `javascript`, `python` | `typescript` |
| `--starter` | `blank`, `api`, `database`, `webhook` | `blank` |
| `--haseef` | Attach to a haseef by name or ID | — |

**Starters:**

| Starter | Description |
|---------|-------------|
| `blank` | Minimal setup — SDK wired, one example tool |
| `api` | Wraps an external REST API (fetch helper, auth pattern) |
| `database` | Connects to a database (connection pool, query tools) |
| `webhook` | Listens for incoming webhooks and pushes sense events |

### Register an Existing Project

```bash
hsafa skill create [--name <name>] [--haseef <name>]
```

Run from inside an existing project directory. Reads the skill name from `package.json` (or use `--name`). Provisions a scope key and writes `.env`.

### Run Locally

```bash
hsafa skill dev [--haseef <name>]
```

Auto-registers the skill if needed, then starts the dev server (`npm run dev` or `python main.py`). Your skill connects to Core via SSE — tools are live immediately.

### Install from Marketplace

```bash
hsafa skill install <slug> [--dir <path>] [--haseef <name>]
```

Downloads a marketplace skill template as a local project. You run it yourself with `hsafa skill dev`.

### Publish to Marketplace

```bash
hsafa skill publish [--name <name>] [--slug <slug>] [--description <text>] [--icon <icon>] [--private]
```

Publishes your skill so others can install it via `hsafa skill install`.

| Option | Description |
|--------|-------------|
| `--slug` | Marketplace slug (defaults to skill name) |
| `--description` | Description |
| `--icon` | Icon name (e.g. Database, Plug) |
| `--private` | Only visible to you |

### Register External Skill

```bash
hsafa skill register --key <hsk_scope_...> --name <name> [--description <text>]
```

Register a skill that's already running on your own server. You manage it — Spaces just knows about it.

### List Skills

```bash
hsafa skill list
```

Shows all your skills with connection status.

### Delete a Skill

```bash
hsafa skill delete <name> [-y]
```

### Attach / Detach from Haseef

A haseef can only use a skill's tools after the skill is attached to it.

```bash
hsafa skill attach <name> --haseef <name>
hsafa skill detach <name> --haseef <name>
```

Haseefs can be referenced by name (case-insensitive) or UUID.

## Getting Started

```bash
# 1. Scaffold + register
hsafa skill init my-weather --lang typescript

# 2. Enter project + install
cd my-weather && npm install

# 3. Run locally (auto-connects to Core)
hsafa skill dev

# 4. Attach to a haseef
hsafa skill attach my-weather --haseef atlas

# 5. Chat with the haseef — your tools are live!
# 6. Edit code → auto-restarts → changes take effect immediately
```

**Tips:**
- `hsafa skill dev` handles everything: registration, key provisioning, dev server
- Attach to a **test haseef** during development
- Never commit your `.env` (scope key) to git

## Environment Variables

Every skill needs these (auto-configured by `init` / `create` / `dev`):

| Variable | Description |
|----------|-------------|
| `SCOPE_NAME` | Skill name |
| `SCOPE_KEY` | Auth key (`hsk_scope_*`) — auto-provisioned |
| `CORE_URL` | Core API URL — auto from Spaces config |

## Quick Reference

```
hsafa auth login                              # authenticate
hsafa skill init <name> [--lang] [--starter]  # scaffold + register new skill
hsafa skill create [--name]                   # register existing project
hsafa skill dev [--haseef]                    # auto-setup + run locally
hsafa skill install <slug>                    # install from marketplace
hsafa skill publish [--name]                  # publish to marketplace
hsafa skill register --key --name             # register external skill
hsafa skill list                              # show all skills
hsafa skill attach <name> --haseef <name>     # connect to haseef
hsafa skill detach <name> --haseef <name>     # disconnect from haseef
hsafa skill delete <name>                     # remove skill
```
