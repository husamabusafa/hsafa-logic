# Hsafa Gateway v2 — Engineering Rules

> These rules apply to every file, feature, and decision made while building the gateway.
> Read them before writing any code. Refer back when something feels off.

---

## 1. Keep Files Small

- One file = one clear responsibility.
- If a file grows past ~200 lines, ask: should this be split?
- Avoid putting routing logic, business logic, and DB access in the same file.

**In this codebase:**
- Routes (`routes/`) handle HTTP only — no business logic inline.
- Business logic lives in `lib/` (run-runner, stream-processor, agent-trigger, etc.).
- DB access goes through dedicated helpers (`smartspace-db.ts`, not inline Prisma calls scattered everywhere).

---

## 2. Single Responsibility

Each file, function, and module does **one thing**.

- `run-runner.ts` → orchestrates a run lifecycle. Not a tool executor. Not a DB helper.
- `stream-processor.ts` → processes the AI stream. Not a space event emitter. Not a run status manager.
- `builder.ts` → builds the agent configuration. Not a prompt writer. Not a tool resolver.

If a function does A and B and C → break it into three functions.

---

## 3. No Hardcoding

Never hardcode:
- URLs, base paths, port numbers → use `process.env`
- Limits (max depth, max retries, timeouts) → define as named constants at the top of the file
- Role names, statuses, event type strings → use shared enums or const maps
- Model names or API types → come from agent config in DB, never baked in

```ts
// ❌ Wrong
const MAX = 10;
if (depth > 10) throw ...

// ✅ Right
const MAX_CHAIN_DEPTH = 10;
if (depth > MAX_CHAIN_DEPTH) throw ...
```

---

## 4. No Quick Hacks

If you think "I'll fix this later" — that is the bug. Fix it now.

Signs of a quick hack:
- A magic string that only works for one specific case
- A condition that exists to paper over a deeper design problem
- A `// TODO` that's been there for more than one session
- A workaround that bypasses validation "just this once"

If the fix requires rethinking the design → rethink the design. Don't patch over it.

---

## 5. Don't Break Other Parts

Before changing shared logic (event types, DB helpers, auth middleware, stream-processor):

- Ask: **what else calls this?**
- Grep for usages before changing signatures.
- If the change touches a public interface → update all call sites, don't leave dead params.
- Run `npx tsc --noEmit` after every non-trivial change. Catch errors early.

**Especially careful with:**
- `smartspace-events.ts` — emits events consumed by React SDK
- `stream-processor.ts` — called by run-runner, output shapes consumed downstream
- `types.ts` in each SDK — changing these breaks compile across packages

---

## 6. Plan for Growth

Write code as if:
- 1,000 spaces, not 5.
- 50 agents per space, not 2.
- 10 concurrent runs per agent, not 1.
- New tool types will be added.
- New trigger types will be added.

**Practically:**
- Avoid hardcoded lists of tool names or event types.
- Keep tool resolution generic — don't write special-case logic per tool name.
- Keep event emission decoupled from processing logic.
- Space context should be passable, not global state.

---

## 7. Clear Naming

Names should tell you **what the thing does**, not how it's implemented.

```ts
// ❌ Unclear
const d = await db.run.findFirst(...);
const res = process(d);

// ✅ Clear
const activeRun = await db.run.findFirst(...);
const streamResult = await processStream(activeRun);
```

**In this codebase:**
- `runId`, `spaceId`, `entityId` → never just `id`
- `triggerSpaceId` vs `activeSpaceId` → different things, never mix them
- `streamResult` vs `runResult` → keep them distinct
- Event names: `smartSpace.message`, `agent.active`, `run.waiting_tool` → dot-namespaced, consistent

---

## 8. No Duplicate Logic

If the same logic appears in two places → it will diverge and become two different bugs.

Extract into:
- A utility function in `lib/`
- A shared helper module
- A shared type or validator

**Common duplication traps in this system:**
- Auth header building → `buildAuthHeaders()` already exists, use it
- Run status transitions → centralize in run-runner, not scattered across routes
- Event emission to spaces → use `emitSmartSpaceEvent()`, not raw Redis publish calls
- Tool input validation → use Zod schemas defined in `types.ts`, not inline `.trim()` checks

---

## 9. Validate Everything at the Boundary

The gateway is a public API. Treat every incoming request as potentially malicious or malformed.

- All route inputs → validate with Zod before touching them.
- External tool outputs → validate before injecting into the agent's message history.
- DB results → never assume a relation is present; use optional chaining or explicit checks.
- SSE inputs from clients → validate tool result payloads before resuming a run.

**Specific to this system:**
- Validate `spaceId` is a real UUID before Redis publish.
- Validate `entityId` matches JWT `sub` for public key auth — never trust client-supplied entity IDs.
- Validate run status before state transitions (don't resume a `completed` run).

---

## 10. Separate Layers

```
Route handler  →  validates input, calls service, returns response
Service layer  →  business logic, orchestration, no HTTP concerns
DB helpers     →  raw Prisma calls only, no business logic
Event layer    →  Redis emit only, no business decisions
```

Never:
- Write Prisma queries directly in route handlers.
- Emit Redis events from DB helpers.
- Make HTTP decisions inside business logic.

---

## 11. Write for the Next Developer (Future You)

- Add a one-line comment above any non-obvious decision.
- If a function has a subtle constraint ("must be called after X"), say so at the top.
- If you delete a feature or stub something out, leave a `// Removed: reason` comment.
- Complex Zod schemas → add a comment with what shape they expect.

You will forget why you wrote something in 2 weeks. Comment the *why*, not the *what*.

---

## 12. Improve Gradually — Don't Over-Engineer

- Ship the simplest version that correctly models the problem.
- Optimize only when there's a real reason (measured slowness, real scale).
- Don't add abstraction layers "for future flexibility" that nobody needs yet.
- Refactor when you touch something and it hurts. Not preemptively.

---

## 13. Compile Before Commit

Every change must pass:

```bash
npx tsc --noEmit   # in hsafa-gateway
```

And ideally all affected packages:

```bash
pnpm --filter @hsafa/react-sdk run build
pnpm --filter @hsafa/node run build
pnpm --filter @hsafa/ui run build
```

**Stale lint errors from Prisma client** (after schema changes) are not real errors — restart TS server or run `prisma generate` first.

---

## 14. Hsafa-Specific Rules

These rules are specific to the v2 architecture and protect against mistakes made in v1.

### 14a. Runs Are Stateless
- A run does not "own" a space. It has a `triggerSpaceId`, nothing more.
- A run's LLM output is **internal**. It never goes to a space directly.
- All space communication happens through `send_message` tool only.

### 14b. No Special Agent Roles
- There is no admin agent, router, or orchestrator at the architecture level.
- Every agent is equal. Privilege is set by space membership config, not by code.
- If you're writing an `if (isAdmin)` block in the agent loop → stop, rethink.

### 14c. Active Space Is Run State
- The active space (`activeSpaceId`) is stored on the Run record.
- Tools operate on the active space — they do NOT take `spaceId` as a parameter.
- `enter_space(spaceId)` is the only way to change the active space.

### 14d. Tools Are Generic
- A tool must not contain routing logic, space logic, or agent-triggering logic.
- A tool executes its function and returns a result. That's it.
- The gateway decides what to do with the result (visibility, streaming, persistence).

### 14e. Events Are Namespaced
- Space events: `smartSpace.message`, `agent.active`, `agent.inactive`, `member.*`
- Run events: `run.created`, `run.waiting_tool`, `run.canceled`, `run.completed`
- Tool events: `tool-call.start`, `tool-call`, `tool-call.result`, `tool-call.error`
- Stream events: `text-start`, `text-delta`, `text-end`, `reasoning-delta`, `finish`

Never invent new event names. Add to this list and update SDK types in one commit.

### 14f. Never Trust Partial State
- Partial JSON streaming (tool args during stream) → validate UUID format before storing.
- Pending tool calls in `waiting_tool` → store in run metadata, never assume they're in DB.
- Agent history → always include the trigger message; never assume the agent "already knows".

---

## Golden Rule

> If future you will read this code and ask "why did I do it this way?" — stop now and write it better.

Good code doesn't need to be clever. It needs to be **clear, correct, and maintainable**.
