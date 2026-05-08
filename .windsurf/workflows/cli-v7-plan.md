---
description: CLI v7 implementation plan — align CLI with Hsafa Core v7 (skill terminology, /api/v7 endpoints, publish to npm)
---

# CLI v7 Implementation Plan

## Goal

Make `@hsafa/cli` use the latest Core v7 with "skill" terminology, versioned `/api/v7` endpoints, and publish to npm so users can `npm install -g @hsafa/cli@latest`.

---

## Phase 1: CLI Source Refactor ✅ COMPLETED

- [x] **1.1** Rename `scope` → `skill` in all CLI commands
  - File: `src/commands/skill.ts` (was `scope.ts`)
  - Commands: `hsafa skill init`, `skill dev`, `skill templates`, `skill list`, `skill create`, `skill delete`, `skill attach`, `skill detach`, `skill show`
- [x] **1.2** Update API client to use Spaces server `/api/skills/*` endpoints
  - File: `src/api.ts`
  - Endpoints: `GET /api/skills/templates`, `GET/POST /api/skills/instances`, `POST /api/skills/instances/:id/attach`, `DELETE /api/skills/instances/:id/detach`, `GET /api/skills/haseefs/:id`
- [x] **1.3** Update scaffold to generate v7 projects
  - File: `src/scaffold.ts`
  - Pins `@hsafa/sdk` to `0.1.0`
  - Env vars: `SKILL_NAME`, `HSAFA_CORE_URL`, `HSAFA_CORE_KEY`
  - Python comments reference `/api/v7/*` paths
- [x] **1.4** Update embedded `.hsafa` context docs
  - File: `src/hsafa-context.ts`
  - Renamed `scope-development-guide.md` → `skill-development-guide.md`
  - All docs reference v7 terminology and patterns
- [x] **1.5** Update CLI entry point
  - File: `src/index.ts`
  - Version bumped to `7.0.0`
  - Imports `registerSkillCommands` instead of old scope commands

---

## Phase 2: SDK Alignment ✅ COMPLETED

- [x] **2.1** Add `apiBase` option to SDK
  - File: `sdks/hsafa-sdk/src/types.ts` — added `apiBase?: string` to `SdkOptions`
  - File: `sdks/hsafa-sdk/src/sdk.ts` — routes all fetch calls through `apiBase`, default `/api/v7`
- [x] **2.2** Add `memory`, `haseef`, `runs` namespaces to SDK
  - File: `sdks/hsafa-sdk/src/sdk.ts`
- [x] **2.3** Bump SDK version to `0.1.0`
  - File: `sdks/hsafa-sdk/package.json`

---

## Phase 3: Core API Versioning ✅ COMPLETED

- [x] **3.1** Mount API routes under `/api/v7` (canonical) and `/api` (deprecated alias)
  - File: `core/src/index.ts`
  - Legacy alias adds `Deprecation: true`, `Sunset: v8`, `Link` headers
- [x] **3.2** Add rate limiting middleware
  - File: `core/src/index.ts`
  - Keyed by `x-api-key` with IP fallback
  - SSE streams exempt (`/skills/:skill/actions/stream`)
  - Configurable via `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX`
- [x] **3.3** Add `express-rate-limit` dependency
  - File: `core/package.json`

---

## Phase 4: Spaces Server Alignment ✅ COMPLETED

- [x] **4.1** Update Core proxy to use `/api/v7`
  - File: `spaces/server/src/lib/core-proxy.ts`
- [x] **4.2** Update Core API helpers to use versioned base
  - File: `spaces/server/src/lib/service/core-api.ts`
- [x] **4.3** Add `apiBase` to service config
  - File: `spaces/server/src/lib/service/config.ts`
  - Reads from `HSAFA_CORE_API_BASE` env var, default `/api/v7`
- [x] **4.4** Update skill manager to use versioned base
  - File: `spaces/server/src/lib/skills/manager.ts`
- [x] **4.5** Wire `apiBase` through Spaces server startup
  - File: `spaces/server/src/index.ts`

---

## Phase 5: Publish to NPM ⬜ PENDING

- [ ] **5.1** Verify npm login
  ```bash
  npm whoami
  ```
  Must be logged into an account with publish rights to `@hsafa` scope.

- [ ] **5.2** Publish SDK
  ```bash
  cd /Users/Husam/Dev/hsafa-logic/sdks/hsafa-sdk
  npm publish --access public
  ```
  Publishes `@hsafa/sdk@0.1.0` (currently `0.0.1` on npm).

- [ ] **5.3** Publish CLI
  ```bash
  cd /Users/Husam/Dev/hsafa-logic/hsafa-core/cli
  npm publish --access public
  ```
  Publishes `@hsafa/cli@7.0.0` (currently `3.0.2` on npm).

- [ ] **5.4** Verify published versions
  ```bash
  npm view @hsafa/sdk version   # should be 0.1.0
  npm view @hsafa/cli version   # should be 7.0.0
  ```

- [ ] **5.5** Test install from npm
  ```bash
  npm install -g @hsafa/cli@latest
  hsafa --version               # should print 7.0.0
  hsafa skill init test-skill --lang typescript --starter blank
  cd test-skill && cat package.json  # should show @hsafa/sdk@0.1.0
  ```

---

## Phase 6: Post-Publish Verification ⬜ PENDING

- [ ] **6.1** End-to-end test: scaffold → install → run
  ```bash
  hsafa skill init e2e-test --lang typescript --starter blank
  cd e2e-test
  npm install
  # Set HSAFA_CORE_URL and HSAFA_CORE_KEY in .env
  hsafa skill dev
  ```
  Verify the skill connects to Core and registers tools.

- [ ] **6.2** Verify CLI commands against Spaces server
  ```bash
  hsafa config set-server http://localhost:3005
  hsafa auth login --email test@hsafa.com --password test
  hsafa skill templates
  hsafa skill list
  ```

---

## Current State Summary

| Component | Local Version | NPM Version | Status |
|---|---|---|---|
| `@hsafa/sdk` | `0.1.0` | `0.0.1` | ⚠️ Needs publish |
| `@hsafa/cli` | `7.0.0` | `3.0.2` | ❌ Old v3 on npm |
| `hsafa-core` | `7.0.0` | N/A (private) | ✅ Ready |
| `hsafa-spaces` | `7.0.0` | N/A (private) | ✅ Ready |

## Key Files

| File | Purpose |
|---|---|
| `hsafa-core/cli/src/index.ts` | CLI entry point, version 7.0.0 |
| `hsafa-core/cli/src/api.ts` | API client → Spaces server `/api/skills/*` |
| `hsafa-core/cli/src/commands/skill.ts` | All `hsafa skill *` commands |
| `hsafa-core/cli/src/scaffold.ts` | Project generator (pins SDK 0.1.0) |
| `hsafa-core/cli/src/hsafa-context.ts` | Embedded `.hsafa` docs for AI |
| `hsafa-core/core/src/index.ts` | Core server, `/api/v7` + `/api` mounts |
| `sdks/hsafa-sdk/src/sdk.ts` | SDK with `apiBase` support |
| `hsafa-spaces/server/src/lib/service/config.ts` | Spaces config with `apiBase` |

## Architecture

```
User runs: hsafa skill init my-skill
  └─> CLI scaffolds project with @hsafa/sdk@0.1.0

User runs: hsafa skill dev
  └─> Delegates to npm run dev (tsx watch src/index.ts)

Skill process (via @hsafa/sdk):
  └─> PUT  /api/v7/skills/my-skill/tools          → Core
  └─> GET  /api/v7/skills/my-skill/actions/stream  → Core (SSE)
  └─> POST /api/v7/actions/:id/result              → Core

User runs: hsafa skill create my-db --template database
  └─> POST /api/skills/instances                   → Spaces server
  └─> Spaces server syncs tools to Core via /api/v7/skills/*/tools
```
