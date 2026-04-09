# Scope CLI — All Scenarios

> This document defines every user scenario for the redesigned CLI.
> The core principle: **the user never talks to Core directly.** CLI → Spaces → Core.

---

## Commands Overview

| Command | Purpose |
|---------|---------|
| `hsafa scope init <name>` | Scaffold + register + get key + write .env + attach |
| `hsafa scope create` | Register an existing project (no scaffold) |
| `hsafa scope dev` | Auto-create if needed + attach + start dev server |
| `hsafa scope deploy` | Build Docker image + deploy to platform |
| `hsafa scope attach <name> --haseef <name>` | Attach scope to haseef (by name) |
| `hsafa scope detach <name> --haseef <name>` | Detach scope from haseef |
| `hsafa scope list` | List all scopes |
| `hsafa scope logs <name>` | View container logs |
| `hsafa scope start/stop/restart <name>` | Container lifecycle |
| `hsafa scope delete <name>` | Delete scope |

---

## Scenario 1: Brand New Scope (Most Common)

User wants to build a new scope from scratch.

```bash
hsafa scope init my-weather --haseef atlas
cd my-weather
npm install
npm run dev
```

### What `init` does internally:
1. Scaffold project files (src/, package.json, tsconfig, .gitignore, README, .hsafa/)
2. Call Spaces API: `POST /api/scopes/quick-create { scopeName: "my-weather" }`
   - Spaces creates a **templateless** ScopeInstance (no ScopeTemplate needed)
   - Spaces calls Core to provision a scope key (`hsk_scope_*`)
   - Returns: `{ instance, scopeKey, coreUrl }`
3. Write `.env`:
   ```
   SCOPE_NAME=my-weather
   SCOPE_KEY=hsk_scope_abc123...
   CORE_URL=http://localhost:3001
   ```
4. If `--haseef atlas` provided:
   - Resolve "atlas" → haseef ID (via Spaces API)
   - Call attach API
   - Print: `Attached to atlas ✓`
5. Print success + next steps:
   ```
   ✔ Created my-weather/
     Scope Key: hsk_scope_abc... (saved to .env)
     Attached to: atlas ✓

     Next: cd my-weather && npm install && npm run dev
   ```

### Flags:
- `--lang typescript|javascript|python` (default: typescript)
- `--starter blank|api|database|webhook` (default: blank)
- `--haseef <name-or-id>` — attach to haseef after creation

---

## Scenario 2: Existing Project, Not Registered

User already has a project with code, wants to register it as a scope.

```bash
cd my-existing-project
hsafa scope create --haseef atlas
```

### What `create` does internally:
1. Read scope name from `package.json` → `hsafa.scope` or `name` field
   - If no package.json, read from `requirements.txt` dir name, or prompt
2. Call Spaces API: `POST /api/scopes/quick-create { scopeName }`
3. Write `SCOPE_KEY` and `CORE_URL` to `.env` (append if exists, create if not)
4. If `--haseef` provided → resolve + attach
5. Print success with scope key

### Flags:
- `--name <name>` — override scope name (instead of reading from package.json)
- `--haseef <name-or-id>` — attach after creation

---

## Scenario 3: Quick Dev Session

User wants to start working immediately, don't care about manual steps.

```bash
cd my-scope
hsafa scope dev --haseef atlas
```

### What `dev` does internally:
1. Check if `.env` has SCOPE_KEY
   - If missing → auto-run `create` flow (register + provision key + write .env)
2. If `--haseef` provided and not already attached → attach
3. Detect language:
   - package.json exists → `npx tsx watch src/index.ts`
   - requirements.txt exists → `python main.py`
4. Run the dev server (child process, stream output)

### Flags:
- `--haseef <name-or-id>` — attach if not already
- `--port <port>` — for webhook scopes

---

## Scenario 4: Deploy to Platform

User wants to deploy their scope to be managed by Spaces.

```bash
cd my-scope
hsafa scope deploy
```

### What `deploy` does internally:
1. Read scope name from project
2. Find or create instance on Spaces
3. Build Docker image (if no --image)
4. Push + deploy container
5. Print status

No change from current behavior — this flow works fine.

---

## Scenario 5: Attach/Detach by Name

```bash
hsafa scope attach my-weather --haseef atlas
hsafa scope detach my-weather --haseef atlas
```

### Haseef resolution:
- If input looks like a UUID → use directly
- Otherwise → call `GET /api/haseefs` → find by name (case-insensitive)
- If multiple matches → error with list
- If no match → error with suggestion

---

## Scenario 6: Already Deployed Scope

User has a scope deployed somewhere (their own server, cloud, etc.) and already has a scope key from Core.

```bash
hsafa scope register --key hsk_scope_... --name my-external-scope
```

### What `register` does:
1. Verify the scope key against Core (via Spaces)
2. Register in Spaces as external
3. Print success

This replaces the confusing `hsafa scope create --deployment external` flow.

---

## Scenario 7: List and Manage

```bash
hsafa scope list                          # table of all scopes
hsafa scope logs my-weather               # container logs
hsafa scope start|stop|restart my-weather # lifecycle
hsafa scope delete my-weather             # delete (with confirmation)
```

No change from current behavior.

---

## API Changes (Spaces Server)

### New: `POST /api/scopes/quick-create`

One-shot scope creation for CLI. Creates a **templateless** ScopeInstance + provisions key synchronously.

Local/external scopes do not need a ScopeTemplate. Templates are only used for prebuilt/platform scopes (postgres, scheduler, etc.).

**Request:**
```json
{
  "scopeName": "my-weather",
  "displayName": "my-weather",
  "description": "optional"
}
```

**Response:**
```json
{
  "instance": { "id": "...", "scopeName": "my-weather", ... },
  "scopeKey": "hsk_scope_abc123...",
  "coreUrl": "http://localhost:3001"
}
```

### New: `GET /api/haseefs?name=atlas`

Add name filtering to existing haseefs list endpoint.

### New: `GET /api/config/core-url`

Returns the Core URL that the Spaces server is connected to. So the CLI can auto-fill CORE_URL in .env.

Or: include `coreUrl` in the quick-create response (simpler).

---

## CLI Config

The CLI stores auth in `~/.hsafa/config.json`:
```json
{
  "serverUrl": "http://localhost:3005",
  "token": "jwt...",
  "user": { "id": "...", "name": "Husam" }
}
```

No additional config needed. The CLI always talks to Spaces, and Spaces provides Core URL.

---

## Summary of Principles

1. **User never talks to Core** — CLI → Spaces → Core
2. **Haseefs by name** — not UUID
3. **Auto-write .env** — scope key + core URL written automatically
4. **init = scaffold + register** — one command, everything done
5. **create = register existing** — for projects not scaffolded with init
6. **dev = just make it work** — auto-create, auto-attach, auto-start
7. **No --deployment flag** — create = register, deploy = deploy. Simple.
8. **Service key is invisible** — internal to Spaces ↔ Core communication
