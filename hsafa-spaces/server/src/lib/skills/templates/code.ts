// =============================================================================
// Code Skill Template
//
// Run JavaScript in a realm-isolated Node `vm` sandbox with persistent
// session state (notebook-style: variables survive across run_code calls).
// Plus: programmable data sensors — the haseef creates "code watches" that
// run on a schedule and fire sense events when their condition is met.
//
// Security note:
//   We use the built-in `node:vm` module. This provides realm isolation
//   (separate global object) but is NOT a security sandbox — code can still
//   reach host state via prototype tricks. That's acceptable for LLM-generated
//   code from a trusted user, which is this skill's intended use case.
//   For stronger isolation, swap in `isolated-vm` in a future pass.
//
// Watches are kept in memory per-instance (lost on restart). They are scoped
// per haseef via ToolCallContext — each haseef only sees/deletes its own.
// =============================================================================

import vm from "node:vm";
import { randomUUID } from "node:crypto";
import type {
  SkillTemplateDefinition,
  SkillHandler,
  ToolCallContext,
  SenseLoopContext,
} from "../types.js";

// =============================================================================
// Template Definition
// =============================================================================

export const codeTemplate: SkillTemplateDefinition = {
  name: "code",
  displayName: "Code",
  description:
    "Execute JavaScript with persistent session state for calculation and data processing, plus programmable code watches that fire sense events when a condition is met.",
  category: "computation",
  configSchema: {
    type: "object",
    properties: {
      timeoutMs: {
        type: "number",
        description: "Max execution time per run_code call, in milliseconds (default: 10000).",
        default: 10000,
      },
      maxOutputLength: {
        type: "number",
        description: "Max combined stdout/stderr chars returned (default: 50000).",
        default: 50000,
      },
      persistState: {
        type: "boolean",
        description: "Keep variables across run_code calls within a session (default: true).",
        default: true,
      },
      sessionTtlMs: {
        type: "number",
        description: "Idle timeout for a session in milliseconds (default: 600000 = 10 min).",
        default: 600000,
      },
      allowNetwork: {
        type: "boolean",
        description: "Expose fetch() inside sandboxes. Required for code watches that hit external APIs (default: true).",
        default: true,
      },
      watchPollMinInterval: {
        type: "number",
        description: "Minimum allowed watch interval in minutes (default: 1).",
        default: 1,
      },
      maxWatches: {
        type: "number",
        description: "Maximum code watches per haseef (default: 20).",
        default: 20,
      },
    },
  },
  tools: [
    // ── On-demand execution ─────────────────────────────────────────────────
    {
      name: "run_code",
      description:
        "Execute JavaScript. Variables persist across calls within the same haseef's session (like a notebook). Use `await` at top level for async. The LAST EXPRESSION becomes `result`. Console.log/error output is captured.",
      inputSchema: {
        type: "object",
        properties: {
          code: { type: "string", description: "JavaScript source. Use `await` freely; fetch() is available if allowNetwork is on." },
        },
        required: ["code"],
      },
      mode: "sync",
    },
    {
      name: "run_code_with_data",
      description:
        "Execute JavaScript with a `data` variable pre-populated with the JSON you pass in. Useful for applying a transformation to a specific payload.",
      inputSchema: {
        type: "object",
        properties: {
          code: { type: "string" },
          data: { description: "Arbitrary JSON payload bound to `data` inside the sandbox." },
        },
        required: ["code"],
      },
      mode: "sync",
    },
    {
      name: "reset_session",
      description: "Clear all persisted variables in this haseef's session. Useful for starting fresh.",
      inputSchema: { type: "object", properties: {} },
      mode: "sync",
    },
    // ── Programmable sensors (code watches) ─────────────────────────────────
    {
      name: "create_code_watch",
      description:
        "Create a code watch that runs your JavaScript every N minutes. The LAST EXPRESSION of the code is the result. If `condition` is 'truthy', fires when `result.triggered` is truthy. If 'changed', fires when JSON.stringify(result) differs from the previous run. Every fire becomes a code.watch_triggered sense event carrying the result.",
      inputSchema: {
        type: "object",
        properties: {
          description: { type: "string", description: "Human-readable, e.g. 'BTC over $100k'." },
          code: { type: "string", description: "JavaScript that evaluates to an object — last expression is the result." },
          intervalMinutes: { type: "number", description: "Poll interval in minutes (min: config.watchPollMinInterval)." },
          condition: {
            type: "string",
            enum: ["truthy", "changed"],
            description: "When to fire: 'truthy' fires when result.triggered is truthy; 'changed' fires when JSON.stringify(result) differs from the last run (first run never fires for 'changed').",
          },
        },
        required: ["description", "code", "intervalMinutes", "condition"],
      },
      mode: "sync",
    },
    {
      name: "list_code_watches",
      description: "List this haseef's code watches with current status (last run, last result, consecutive failures).",
      inputSchema: { type: "object", properties: {} },
      mode: "sync",
    },
    {
      name: "delete_code_watch",
      description: "Delete a code watch by id.",
      inputSchema: {
        type: "object",
        properties: {
          watchId: { type: "string" },
        },
        required: ["watchId"],
      },
      mode: "sync",
    },
  ],
  instructions: `You can execute code AND set up programmable data sensors.

TOOLS — On-demand execution:
  - run_code: JS with persistent session state (notebook-style). Top-level await works. The LAST EXPRESSION is the result.
  - run_code_with_data: same but with a \`data\` variable bound to the JSON payload you pass in.
  - reset_session: wipe persisted variables.

SENSES — Programmable watches:
  - create_code_watch: runs your JS every N minutes and alerts you.
    • condition "truthy": fires when result.triggered is truthy.
    • condition "changed": fires when the serialized result changes between runs.
  - code.watch_triggered: fires with the full result when a watch triggers.
  - code.watch_error: fires after 5 consecutive failures — the watch is auto-paused.

RESPONDING TO SENSE EVENTS:
  - code.watch_triggered: explain what was detected using the watch description + result, then take the follow-up action the user asked for.
  - code.watch_error: surface the error, suggest a fix, and offer to recreate the watch with corrected code.

EXAMPLES:
  User: "Tell me when Bitcoin crosses $100k."
    → create_code_watch
        description: "BTC over $100k"
        intervalMinutes: 15
        condition: "truthy"
        code: \`const r = await fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot');
               const j = await r.json();
               const price = parseFloat(j.data.amount);
               ({ triggered: price > 100000, price })\`

  User: "Watch this API and ping me when the response changes."
    → create_code_watch condition: "changed", returning the parsed body.

TIPS:
  - Return a small, self-describing object from watches — include a short message field the haseef can repeat to the user.
  - Watches that keep throwing are auto-paused. Test the code once with run_code before saving as a watch.`,

  createHandler: (config: Record<string, unknown>): SkillHandler => createCodeHandler(config),
};

// =============================================================================
// Config
// =============================================================================

interface CodeConfig {
  timeoutMs: number;
  maxOutputLength: number;
  persistState: boolean;
  sessionTtlMs: number;
  allowNetwork: boolean;
  watchPollMinInterval: number;
  maxWatches: number;
}

function parseConfig(raw: Record<string, unknown>): CodeConfig {
  return {
    timeoutMs: Number(raw.timeoutMs ?? 10000),
    maxOutputLength: Number(raw.maxOutputLength ?? 50000),
    persistState: raw.persistState !== false,
    sessionTtlMs: Number(raw.sessionTtlMs ?? 600000),
    allowNetwork: raw.allowNetwork !== false,
    watchPollMinInterval: Number(raw.watchPollMinInterval ?? 1),
    maxWatches: Number(raw.maxWatches ?? 20),
  };
}

// =============================================================================
// Per-haseef session + per-instance watches
// =============================================================================

interface Session {
  context: vm.Context;
  /** Exposed to the sandbox as the sticky global object (so user code can stash state). */
  lastAccessed: number;
}

interface CodeWatch {
  id: string;
  haseefId: string;
  description: string;
  code: string;
  intervalMs: number;
  condition: "truthy" | "changed";
  createdAt: Date;
  nextRunAt: number;
  lastRunAt: number | null;
  lastResult: unknown;
  lastSerialized: string | null;
  consecutiveFailures: number;
  active: boolean;
}

// =============================================================================
// Handler
// =============================================================================

function createCodeHandler(rawConfig: Record<string, unknown>): SkillHandler {
  const config = parseConfig(rawConfig);
  const sessions = new Map<string, Session>();
  const watches = new Map<string, CodeWatch>();
  let watchTimer: ReturnType<typeof setInterval> | null = null;
  let senseCtx: SenseLoopContext | null = null;

  function getSession(haseefId: string): Session {
    let session = sessions.get(haseefId);
    if (!session || (config.sessionTtlMs > 0 && Date.now() - session.lastAccessed > config.sessionTtlMs)) {
      session = { context: createSandboxContext(config), lastAccessed: Date.now() };
      sessions.set(haseefId, session);
    } else {
      session.lastAccessed = Date.now();
    }
    return session;
  }

  return {
    async execute(toolName: string, args: Record<string, unknown>, ctx: ToolCallContext): Promise<unknown> {
      switch (toolName) {
        case "run_code":
          return runInSession(config, getSession(ctx.haseefId), String(args.code ?? ""), undefined);
        case "run_code_with_data":
          return runInSession(
            config,
            getSession(ctx.haseefId),
            String(args.code ?? ""),
            args.data,
          );
        case "reset_session":
          sessions.delete(ctx.haseefId);
          return { success: true };
        case "create_code_watch":
          return handleCreateWatch(args, ctx, watches, config);
        case "list_code_watches":
          return handleListWatches(ctx, watches);
        case "delete_code_watch":
          return handleDeleteWatch(args, ctx, watches);
        default:
          return { error: `Unknown tool: ${toolName}` };
      }
    },
    async startSenseLoop(ctxIn: SenseLoopContext) {
      senseCtx = ctxIn;
      const tickMs = 30_000; // check every 30s, individual watches gated by nextRunAt
      watchTimer = setInterval(() => {
        tickWatches(watches, config, senseCtx).catch((err) => {
          console.warn("[skill:code] tick error:", err);
        });
      }, tickMs);
    },
    async stopSenseLoop() {
      if (watchTimer) {
        clearInterval(watchTimer);
        watchTimer = null;
      }
    },
    async destroy() {
      sessions.clear();
      watches.clear();
    },
  };
}

// =============================================================================
// Sandbox execution
// =============================================================================

interface RunResult {
  stdout: string;
  stderr: string;
  result: unknown;
  executionTimeMs: number;
  error?: string;
}

function createSandboxContext(config: CodeConfig): vm.Context {
  const globals: Record<string, unknown> = {
    console: createCapturedConsole(),
    Buffer,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
  };
  if (config.allowNetwork && typeof fetch === "function") {
    globals.fetch = fetch;
  }
  return vm.createContext(globals, {
    name: "hsafa-code-sandbox",
    codeGeneration: { strings: true, wasm: false },
  });
}

interface CapturedConsole {
  console: {
    log: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
    debug: (...args: unknown[]) => void;
  };
  stdout: string[];
  stderr: string[];
}

function createCapturedConsole() {
  return {
    log: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
  };
}

/**
 * Install a capturing console onto the sandbox context for a single execution,
 * then restore whatever the user may have assigned afterwards.
 */
function installCapturedConsole(context: vm.Context): { stdout: string[]; stderr: string[]; restore: () => void } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const prev = (context as Record<string, unknown>).console;
  const captured = {
    log: (...args: unknown[]) => stdout.push(args.map(fmt).join(" ")),
    info: (...args: unknown[]) => stdout.push(args.map(fmt).join(" ")),
    debug: (...args: unknown[]) => stdout.push(args.map(fmt).join(" ")),
    warn: (...args: unknown[]) => stderr.push(args.map(fmt).join(" ")),
    error: (...args: unknown[]) => stderr.push(args.map(fmt).join(" ")),
  };
  (context as Record<string, unknown>).console = captured;
  return {
    stdout,
    stderr,
    restore: () => {
      (context as Record<string, unknown>).console = prev;
    },
  };
}

function fmt(v: unknown): string {
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

async function runInSession(
  config: CodeConfig,
  session: Session,
  code: string,
  data: unknown,
): Promise<RunResult> {
  if (!code) return { stdout: "", stderr: "", result: null, executionTimeMs: 0, error: "code is required" };

  // Inject optional `data` into the context for this run.
  if (data !== undefined) {
    (session.context as Record<string, unknown>).data = data;
  }

  const cap = installCapturedConsole(session.context);
  const startedAt = Date.now();

  // Wrap user code in an async IIFE so top-level await works and the
  // last expression becomes the result.
  const wrapped = `(async () => {
${transformLastExprToReturn(code)}
})()`;

  try {
    const script = new vm.Script(wrapped, { filename: "user-code.js" });
    const resultPromise = script.runInContext(session.context, {
      timeout: Math.max(100, config.timeoutMs),
      breakOnSigint: true,
    }) as Promise<unknown>;

    const result = await withTimeout(resultPromise, config.timeoutMs);
    const executionTimeMs = Date.now() - startedAt;
    return {
      stdout: truncate(cap.stdout.join("\n"), config.maxOutputLength),
      stderr: truncate(cap.stderr.join("\n"), config.maxOutputLength),
      result: normalizeResult(result),
      executionTimeMs,
    };
  } catch (err: any) {
    return {
      stdout: truncate(cap.stdout.join("\n"), config.maxOutputLength),
      stderr: truncate(cap.stderr.join("\n"), config.maxOutputLength),
      result: null,
      executionTimeMs: Date.now() - startedAt,
      error: err?.message ?? String(err),
    };
  } finally {
    cap.restore();
    if (!config.persistState) {
      // Wipe anything the run touched.
      // (Easiest: drop this session entirely so next call starts fresh.)
    }
  }
}

function transformLastExprToReturn(src: string): string {
  // Lightweight: if the last non-empty line starts with an identifier / call /
  // object / expression (not a keyword like const/let/var/return/for/if/{}),
  // prepend `return `. Otherwise emit as-is. This is a best-effort notebook
  // behavior; users can always `return` explicitly.
  const lines = src.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (trimmed.length === 0 || trimmed.startsWith("//")) continue;

    if (/^(return|const|let|var|if|for|while|switch|try|throw|function|class|import|export|\}|\{|;)\b/.test(trimmed)) {
      return src;
    }
    // Don't touch assignments or blocks ending with semicolons — those aren't expressions.
    if (trimmed.endsWith(";") || /^[a-zA-Z_$][\w.$]*\s*=(?!=)/.test(trimmed)) {
      return src;
    }
    // Rewrite to return this line.
    lines[i] = `return ${lines[i]};`;
    return lines.join("\n");
  }
  return src;
}

function normalizeResult(value: unknown): unknown {
  if (value === undefined) return null;
  try {
    // Round-trip to ensure it's JSON-serializable. Strips functions, cycles, etc.
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  if (!Number.isFinite(ms) || ms <= 0) return p;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Execution exceeded ${ms}ms timeout`)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + "\n… [truncated]";
}

// =============================================================================
// Code watches (programmable sensors)
// =============================================================================

function handleCreateWatch(
  args: Record<string, unknown>,
  ctx: ToolCallContext,
  watches: Map<string, CodeWatch>,
  config: CodeConfig,
): unknown {
  const description = String(args.description ?? "");
  const code = String(args.code ?? "");
  const intervalMinutes = Number(args.intervalMinutes ?? 0);
  const condition = args.condition === "changed" ? "changed" : "truthy";
  if (!description) return { error: "description is required" };
  if (!code) return { error: "code is required" };
  if (!Number.isFinite(intervalMinutes) || intervalMinutes < config.watchPollMinInterval) {
    return { error: `intervalMinutes must be >= ${config.watchPollMinInterval}` };
  }

  // Enforce per-haseef quota.
  const mineCount = Array.from(watches.values()).filter((w) => w.haseefId === ctx.haseefId).length;
  if (mineCount >= config.maxWatches) {
    return { error: `Max watches per haseef reached (${config.maxWatches}). Delete some first.` };
  }

  const id = randomUUID();
  const intervalMs = Math.max(60_000, Math.floor(intervalMinutes * 60_000));
  const watch: CodeWatch = {
    id,
    haseefId: ctx.haseefId,
    description,
    code,
    intervalMs,
    condition,
    createdAt: new Date(),
    nextRunAt: Date.now() + intervalMs,
    lastRunAt: null,
    lastResult: null,
    lastSerialized: null,
    consecutiveFailures: 0,
    active: true,
  };
  watches.set(id, watch);

  return {
    success: true,
    watch: serializeWatch(watch),
    note: "You'll receive code.watch_triggered events when the condition is met. After 5 consecutive failures the watch auto-pauses with code.watch_error.",
  };
}

function handleListWatches(ctx: ToolCallContext, watches: Map<string, CodeWatch>): unknown {
  const mine = Array.from(watches.values())
    .filter((w) => w.haseefId === ctx.haseefId)
    .map(serializeWatch);
  return { watches: mine, count: mine.length };
}

function handleDeleteWatch(
  args: Record<string, unknown>,
  ctx: ToolCallContext,
  watches: Map<string, CodeWatch>,
): unknown {
  const id = String(args.watchId ?? "");
  if (!id) return { error: "watchId is required" };
  const w = watches.get(id);
  if (!w) return { error: "Watch not found" };
  if (w.haseefId !== ctx.haseefId) return { error: "Watch does not belong to this haseef" };
  watches.delete(id);
  return { success: true, deletedId: id };
}

function serializeWatch(w: CodeWatch) {
  return {
    id: w.id,
    description: w.description,
    intervalMinutes: Math.round(w.intervalMs / 60_000),
    condition: w.condition,
    active: w.active,
    createdAt: w.createdAt.toISOString(),
    lastRunAt: w.lastRunAt ? new Date(w.lastRunAt).toISOString() : null,
    nextRunAt: new Date(w.nextRunAt).toISOString(),
    consecutiveFailures: w.consecutiveFailures,
    lastResult: w.lastResult,
  };
}

async function tickWatches(
  watches: Map<string, CodeWatch>,
  config: CodeConfig,
  senseCtx: SenseLoopContext | null,
): Promise<void> {
  if (!senseCtx) return;
  const now = Date.now();
  for (const watch of watches.values()) {
    if (!watch.active) continue;
    if (watch.nextRunAt > now) continue;
    await runWatchOnce(watch, config, senseCtx);
  }
}

async function runWatchOnce(
  watch: CodeWatch,
  config: CodeConfig,
  senseCtx: SenseLoopContext,
): Promise<void> {
  // Each watch runs in a fresh context so user session state can't poison it.
  const ctx = createSandboxContext(config);
  const session: Session = { context: ctx, lastAccessed: Date.now() };
  const result = await runInSession(config, session, watch.code, undefined);

  watch.lastRunAt = Date.now();
  watch.nextRunAt = watch.lastRunAt + watch.intervalMs;

  if (result.error) {
    watch.consecutiveFailures += 1;
    if (watch.consecutiveFailures >= 5) {
      watch.active = false;
      await senseCtx.pushEvent(watch.haseefId, {
        type: "code.watch_error",
        data: {
          watchId: watch.id,
          description: watch.description,
          error: result.error,
          consecutiveFailures: watch.consecutiveFailures,
          detectedAt: new Date().toISOString(),
          note: "Watch auto-paused. Fix the code and recreate it with create_code_watch.",
        },
      });
    }
    return;
  }

  watch.consecutiveFailures = 0;
  const previous = watch.lastResult;
  const previousSerialized = watch.lastSerialized;
  const newSerialized = safeStringify(result.result);
  watch.lastResult = result.result;
  watch.lastSerialized = newSerialized;

  let shouldFire = false;
  if (watch.condition === "truthy") {
    shouldFire = isTriggered(result.result);
  } else {
    // "changed": never fire on first run (no previous), only fire when different.
    if (previousSerialized !== null && previousSerialized !== newSerialized) {
      shouldFire = true;
    }
  }

  if (!shouldFire) return;

  await senseCtx.pushEvent(watch.haseefId, {
    type: "code.watch_triggered",
    data: {
      watchId: watch.id,
      description: watch.description,
      condition: watch.condition,
      result: result.result,
      previousResult: previous,
      executionTimeMs: result.executionTimeMs,
      detectedAt: new Date().toISOString(),
    },
  });
}

function isTriggered(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "object" && value !== null && "triggered" in value) {
    return Boolean((value as { triggered: unknown }).triggered);
  }
  return Boolean(value);
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export default codeTemplate;
