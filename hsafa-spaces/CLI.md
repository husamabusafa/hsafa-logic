# Hsafa CLI

> Build and manage skills — the plugin system that gives haseefs new capabilities.

```bash
npm install -g @hsafa/cli
```

---

## Authentication

```bash
hsafa auth login       # interactive login
hsafa auth logout      # clear credentials
hsafa auth whoami      # show current user
```

---

## Getting Started

```bash
# 1. Scaffold + register a new skill
hsafa skill init my-weather

# 2. Install deps + run
cd my-weather && npm install
hsafa skill dev

# 3. Attach to a haseef — tools are live!
hsafa skill attach my-weather --haseef atlas
```

That's it. `skill dev` handles registration, key provisioning, and starts the dev server.

---

## Commands

### `hsafa skill init <name>`

Scaffold a new skill project with a working starter template.

```bash
hsafa skill init <name> [--lang <language>] [--starter <template>] [--haseef <name>]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--lang` | `typescript`, `javascript`, `python` | `typescript` |
| `--starter` | `blank`, `api`, `database`, `webhook` | `blank` |
| `--haseef` | Attach to a haseef | — |

**Generated project:**

```
my-weather/
├── src/
│   ├── index.ts        # SDK setup, connect, register tools
│   ├── tools.ts        # Tool definitions (name, schema, description)
│   └── handler.ts      # Tool call handlers (your logic)
├── .env                # SCOPE_NAME, SCOPE_KEY, CORE_URL (auto-filled)
├── package.json
└── README.md
```

### `hsafa skill create`

Register an existing project as a skill. Run from inside the project directory.

```bash
hsafa skill create [--name <name>] [--haseef <name>]
```

Reads the skill name from `package.json` or use `--name`. Provisions a scope key and writes `.env`.

### `hsafa skill dev`

Auto-register + start the local dev server. The one command you need for development.

```bash
hsafa skill dev [--haseef <name>]
```

- Registers the skill if no `.env` key exists
- Starts `npm run dev` (Node) or `python main.py` (Python)
- Your skill connects to Core via SSE — tools are live immediately
- Edit code → auto-restarts → changes take effect

### `hsafa skill install <slug>`

Install a skill from the marketplace as a local project.

```bash
hsafa skill install <slug> [--dir <path>] [--haseef <name>]
```

Downloads the marketplace template, scaffolds locally. You run it with `hsafa skill dev`.

### `hsafa skill publish`

Publish your skill to the marketplace so others can install it.

```bash
hsafa skill publish [--name <name>] [--slug <slug>] [--description <text>] [--icon <icon>] [--private]
```

### `hsafa skill register`

Register a skill that's already running on your own server.

```bash
hsafa skill register --key <hsk_scope_...> --name <name> [--description <text>]
```

### `hsafa skill list`

```bash
hsafa skill list
```

```
SKILL                STATUS         CREATED
my-weather           connected      1h ago
postgres             disconnected   2d ago
```

### `hsafa skill attach / detach`

```bash
hsafa skill attach <name> --haseef <name>
hsafa skill detach <name> --haseef <name>
```

### `hsafa skill delete`

```bash
hsafa skill delete <name> [-y]
```

---

## Environment Variables

Every skill needs these (auto-configured by `init` / `create` / `dev`):

| Variable | Description |
|----------|-------------|
| `SCOPE_NAME` | Skill name |
| `SCOPE_KEY` | Auth key (`hsk_scope_*`) — auto-provisioned |
| `CORE_URL` | Core API URL — auto from Spaces config |

---

## How It Works

```
CLI ──→ Spaces Server ──→ Core
         (provisions keys,
          knows Core URL)
```

- CLI talks only to Spaces. Never to Core directly.
- Spaces provisions scope keys from Core.
- Scope keys are written to `.env` automatically.
- Skills connect to Core via SSE using the scope key.
- You run your skills yourself (locally or on your own server).

---

## Quick Reference

```
hsafa auth login                              # authenticate
hsafa auth logout                             # clear credentials
hsafa auth whoami                             # show current user
hsafa config set server|frontend <url>        # configure
hsafa config show                             # show config

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
