# Unified Scope Instance Model

> Every scope instance is an independent service. No baked-in plugin logic except "spaces".

---

## Core Concept

One concept: **instance = a running service that connects to Core via `@hsafa/sdk`**.

```
┌─────────────┐
│  Spaces UI   │  ← manages instances (create/start/stop/logs/attach)
└──────┬───────┘
       │ API
┌──────▼───────┐
│ Spaces Server │  ← platform: auth, DB, Docker management, spaces scope (built-in)
└──────┬───────┘
       │ Docker API / network
┌──────▼───────────────────────────────────────────────┐
│  Containers                                           │
│  ┌──────────┐ ┌──────────┐ ┌────────────┐            │
│  │ postgres │ │scheduler │ │ my-weather │  ...        │
│  │ instance │ │ instance │ │  (custom)  │            │
│  └────┬─────┘ └────┬─────┘ └─────┬──────┘            │
│       │             │             │                    │
│       └─────────────┼─────────────┘                   │
│             @hsafa/sdk → SSE to Core                  │
└───────────────────────────────────────────────────────┘
```

### What stays built-in

Only **"spaces"** — it IS the Spaces server. It handles chat, interactive messages, navigation, etc. It cannot be a separate container because it directly accesses the Spaces DB.

### What becomes containers

Everything else:
- **Prebuilt templates** (postgres, scheduler) → platform-maintained Docker images
- **Custom scopes** (user-built) → user-built Docker images or self-hosted

---

## Deployment Types

| Type | Image Source | Managed By | Example |
|------|-------------|------------|---------|
| `platform` | `hsafa/scope-postgres:latest` | Spaces server starts container | Postgres, Scheduler |
| `custom` | User image or `hsafa scope deploy` | Spaces server starts container | my-weather |
| `external` | N/A (user runs on own infra) | User | Self-hosted scope |
| `built-in` | N/A (part of Spaces server) | Spaces server process | Spaces |

---

## Schema Changes

### ScopeInstance — add deployment fields

```prisma
model ScopeInstance {
  // ... existing fields ...

  // ── Deployment ──────────────────────────────────────
  deploymentType  String   @default("platform") @map("deployment_type")
                           // "platform" | "custom" | "external" | "built-in"
  imageUrl        String?  @map("image_url")
                           // Docker image URL (null for external/built-in)
  containerId     String?  @map("container_id")
                           // Docker container ID (null for external/built-in)
  containerStatus String   @default("stopped") @map("container_status")
                           // "stopped" | "starting" | "running" | "error" | "building"
  statusMessage   String?  @map("status_message")
                           // Error message or status details
  lastHealthAt    DateTime? @map("last_health_at") @db.Timestamptz(6)
                           // Last successful health check / SSE heartbeat
  port            Int?     // Assigned port (if needed for HTTP scopes)
}
```

### ScopeTemplate — add image field

```prisma
model ScopeTemplate {
  // ... existing fields ...

  imageUrl  String?  @map("image_url")
                     // Default Docker image for this template
                     // e.g. "hsafa/scope-postgres:latest"
}
```

---

## Docker Management

### Library: `dockerode`

```typescript
import Docker from "dockerode";
const docker = new Docker({ socketPath: "/var/run/docker.sock" });
```

### Operations

```typescript
// scope-docker.ts — Docker container management for scope instances

async function deployInstance(instance: ScopeInstance, config: Map<string, string>): Promise<void>
async function startInstance(instanceId: string): Promise<void>
async function stopInstance(instanceId: string): Promise<void>
async function restartInstance(instanceId: string): Promise<void>
async function removeInstance(instanceId: string): Promise<void>
async function getInstanceLogs(instanceId: string, opts?: { tail?: number; follow?: boolean }): AsyncIterable<string>
async function getInstanceStatus(instanceId: string): Promise<ContainerStatus>
```

### Container Config

Each container gets these env vars injected:

```env
SCOPE_NAME=my-postgres          # from ScopeInstance.scopeName
SCOPE_KEY=hsk_scope_xxx         # auto-provisioned by Spaces
CORE_URL=http://core:3001       # internal Docker network
# + user config from ScopeInstanceConfig rows (decrypted)
CONNECTION_STRING=postgres://...
SCHEMA=public
READ_ONLY=true
```

### Docker Network

All scope containers join the same Docker network as Core:

```typescript
const container = await docker.createContainer({
  Image: instance.imageUrl,
  name: `scope-${instance.scopeName}`,
  Env: envVars,
  HostConfig: {
    NetworkMode: "hsafa-internal",  // same network as Core
    RestartPolicy: { Name: "unless-stopped" },
    Memory: 256 * 1024 * 1024,     // 256MB limit
    NanoCpus: 500000000,            // 0.5 CPU
  },
});
```

---

## API Endpoints

### Instance Lifecycle

```
POST   /api/scopes/instances/:id/deploy   → Build (if needed) + start container
POST   /api/scopes/instances/:id/start    → Start stopped container
POST   /api/scopes/instances/:id/stop     → Stop container
POST   /api/scopes/instances/:id/restart  → Restart container
GET    /api/scopes/instances/:id/logs     → Stream container logs (SSE or chunked)
DELETE /api/scopes/instances/:id          → Stop + remove container + delete DB rows
```

### Instance Creation (updated)

`POST /api/scopes/instances` now also:
1. Creates ScopeInstance row
2. Provisions scope key from Core (`hsk_scope_*`)
3. If `deploymentType === "platform"`: pulls image + creates container + starts it
4. If `deploymentType === "custom"`: optionally builds image first, then same
5. If `deploymentType === "external"`: just creates DB row (user runs their own)

### Connection Status

The existing `GET /api/scopes/status` (reads from Core's `GET /api/scopes`) already works — Core tracks SSE connection status per scope. No change needed.

---

## Scope Key Provisioning

Currently `scope-registry.ts` provisions keys for baked-in plugins. In the unified model:

1. **Platform + custom scopes**: Spaces server provisions a `hsk_scope_*` key when creating the instance, stores it encrypted in `ScopeInstanceConfig`, injects it as `SCOPE_KEY` env var into the container.
2. **External scopes**: User provides their own API key (already handled by the "Register External" flow).

---

## Prebuilt Template Images

### Postgres Scope Service

Extracted from `scope-templates/postgres/` into a standalone Docker image:

```
hsafa-spaces/scope-images/postgres/
  src/index.ts          ← @hsafa/sdk setup + tool registration + handlers
  src/service.ts        ← pools, queries, watches (moved from scope-templates/postgres/service.ts)
  src/listener.ts       ← LISTEN/NOTIFY (moved from scope-templates/postgres/listener.ts)
  package.json          ← depends on @hsafa/sdk, pg
  Dockerfile
  tsconfig.json
```

The code is essentially the same — just uses `@hsafa/sdk` directly instead of going through the ScopePlugin interface.

### Scheduler Scope Service

```
hsafa-spaces/scope-images/scheduler/
  src/index.ts          ← @hsafa/sdk setup + tool registration + handlers
  src/service.ts        ← CRUD + Redis poller
  package.json          ← depends on @hsafa/sdk, ioredis
  Dockerfile
  tsconfig.json
```

---

## Spaces Server Changes

### Remove from scope-registry

- Remove `schedulerPlugin` and `postgresPlugin` from `ALL_PLUGINS`
- Keep only `spacesPlugin` (built-in)
- Remove `scope-templates/scheduler/` and `scope-templates/postgres/` (code moves to scope-images/)
- `loadScopes()` only loads "spaces"

### Add Docker management

New file: `src/lib/scope-docker.ts` — container lifecycle management

### Update scopes routes

- `POST /instances` → provisions scope key + starts container
- Add lifecycle endpoints (start/stop/restart/logs)
- `DELETE /instances/:id` → stops container + cleans up

### Keep ScopePlugin for "spaces" only

The `ScopePlugin` interface and `scope-registry.ts` still exist but only for the built-in "spaces" scope. All other scopes are external services managed via Docker.

---

## Migration Path

1. Add deployment fields to schema (migration)
2. Build Docker management layer
3. Add lifecycle API endpoints
4. Extract postgres into `scope-images/postgres/` (build & test Docker image)
5. Extract scheduler into `scope-images/scheduler/`
6. Remove baked-in plugins from ALL_PLUGINS
7. Update existing ScopeInstance rows: set `deploymentType = "platform"`, `imageUrl = "hsafa/scope-postgres:latest"`
8. Update UI: show container status, logs, start/stop buttons

---

## Instance Lifecycle Flow

### Create from template (platform)

```
User clicks "Create Instance" for Postgres template
  → POST /api/scopes/instances { templateId, name, configs: [{connectionString: "..."}] }
  → Server:
    1. Insert ScopeInstance row (deploymentType: "platform", imageUrl from template)
    2. Insert ScopeInstanceConfig rows (encrypted)
    3. Provision scope key from Core (POST /api/keys)
    4. Store scope key in ScopeInstanceConfig
    5. Pull Docker image (if not cached)
    6. Create + start container (inject env vars)
    7. Update containerStatus: "running", containerId: "abc123"
  → Response: { instance: { ...fields, containerStatus: "running" } }
```

### Create custom (user-built image)

```
User enters image URL + scope name in "Developer" tab
  → POST /api/scopes/instances { name, scopeName, imageUrl, deploymentType: "custom" }
  → Server:
    1. Insert ScopeInstance row
    2. Provision scope key
    3. Pull + start container
    4. Update status
```

### Create external (self-hosted)

```
User registers deployed scope in "Developer" tab
  → POST /api/scopes/instances { name, scopeName, deploymentType: "external" }
  → Server:
    1. Insert ScopeInstance row (no container management)
    2. Scope shows as "Disconnected" until user's service connects to Core
```

---

## Health Monitoring

Periodic check (every 30s):
1. For each `platform`/`custom` instance with `containerStatus === "running"`:
   - Docker: check container is alive
   - Core: check SSE connection status
2. If container died → update `containerStatus: "error"`, set `statusMessage`
3. If container alive but Core disconnected → might be starting up (grace period)

---

## What This Replaces

| Before | After |
|--------|-------|
| `scope-templates/postgres/` baked into server | `scope-images/postgres/` standalone Docker image |
| `scope-templates/scheduler/` baked into server | `scope-images/scheduler/` standalone Docker image |
| `ALL_PLUGINS = [spaces, scheduler, postgres]` | `ALL_PLUGINS = [spaces]` |
| `loadScopes()` creates SDK per plugin | `loadScopes()` only loads spaces |
| Creating instance = DB row only | Creating instance = DB row + Docker container |
| "Disconnected" after create | Immediately connected (container auto-starts) |
