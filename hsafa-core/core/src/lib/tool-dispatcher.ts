import type { Response } from 'express';
import { prisma } from './db.js';

// =============================================================================
// Tool Dispatcher (v7)
//
// Replaces Redis Streams with in-process SSE connections.
// Each scope has one SSE channel. Services connect and receive action requests.
// Core dispatches by sending JSON over the SSE channel and awaiting a result
// via a pending-action Promise map.
//
// Architecture:
//   dispatchToScope() → emitToScope(action) → service SDK receives it
//   service SDK → POST /api/actions/:actionId/result → resolveAction()
// =============================================================================

const DEFAULT_TIMEOUT_MS = 30_000;

// Per-scope SSE connections (one scope can have many connected clients)
const scopeConnections = new Map<string, Set<Response>>();

// Pending tool-call Promises waiting for service results
interface PendingAction {
  resolve: (result: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
  startedAt: number;
}
const pendingActions = new Map<string, PendingAction>();

// ── Connection Management ────────────────────────────────────────────────────

export function addScopeConnection(scope: string, res: Response): void {
  if (!scopeConnections.has(scope)) {
    scopeConnections.set(scope, new Set());
  }
  scopeConnections.get(scope)!.add(res);
  void updateScopeConnected(scope, true);
}

export function removeScopeConnection(scope: string, res: Response): void {
  const conns = scopeConnections.get(scope);
  if (!conns) return;
  conns.delete(res);
  if (conns.size === 0) {
    scopeConnections.delete(scope);
    void updateScopeConnected(scope, false);
  }
}

export function isScopeConnected(scope: string): boolean {
  const conns = scopeConnections.get(scope);
  return conns !== undefined && conns.size > 0;
}

/** Returns all currently connected scope names. */
export function getConnectedScopes(): string[] {
  return [...scopeConnections.keys()];
}

// ── Emit ─────────────────────────────────────────────────────────────────────

/**
 * Emit a JSON event to all SSE clients listening on a scope.
 * Returns true if at least one client was reached.
 */
export function emitToScope(scope: string, event: Record<string, unknown>): boolean {
  const conns = scopeConnections.get(scope);
  if (!conns || conns.size === 0) return false;

  const data = `data: ${JSON.stringify(event)}\n\n`;
  const dead: Response[] = [];

  for (const res of conns) {
    try {
      res.write(data);
    } catch {
      dead.push(res);
    }
  }

  // Clean up dead connections
  for (const res of dead) {
    conns.delete(res);
  }
  if (conns.size === 0) {
    scopeConnections.delete(scope);
    void updateScopeConnected(scope, false);
  }

  return conns.size > 0 || dead.length > 0;
}

// ── Dispatch ─────────────────────────────────────────────────────────────────

export interface DispatchOptions {
  scope: string;
  actionId: string;
  toolName: string;
  args: Record<string, unknown>;
  haseef: { id: string; name: string; profile: Record<string, unknown> };
  timeout?: number;
}

/**
 * Dispatch an action to a scope's connected service and wait for the result.
 * Times out if no result arrives within `timeout` ms.
 */
export async function dispatchToScope(opts: DispatchOptions): Promise<unknown> {
  const { scope, actionId, toolName, args, haseef, timeout = DEFAULT_TIMEOUT_MS } = opts;

  const sent = emitToScope(scope, {
    type: 'action',
    actionId,
    toolName,
    args,
    haseef,
  });

  if (!sent) {
    return { error: `Scope "${scope}" has no connected service — tool "${toolName}" cannot execute` };
  }

  return new Promise<unknown>((resolve) => {
    const timer = setTimeout(() => {
      pendingActions.delete(actionId);
      resolve({ error: `Tool "${toolName}" timed out after ${timeout}ms` });
    }, timeout);

    pendingActions.set(actionId, { resolve, timer, startedAt: Date.now() });
  });
}

// ── Result Submission ────────────────────────────────────────────────────────

/**
 * Resolve a pending action with a result. Called from the actions result route.
 * Returns true if the action was found and resolved, false if already expired/unknown.
 */
export function resolveAction(actionId: string, result: unknown): boolean {
  const pending = pendingActions.get(actionId);
  if (!pending) return false;

  clearTimeout(pending.timer);
  pendingActions.delete(actionId);
  pending.resolve(result);
  return true;
}

// ── Scope Lifecycle Events ───────────────────────────────────────────────────

/**
 * Broadcast a lifecycle event to all clients connected on a scope.
 * Used for run.started, run.completed, tool.input.start, etc.
 */
export function emitLifecycleToScope(
  scope: string,
  eventType: string,
  data: Record<string, unknown>,
): void {
  emitToScope(scope, { type: eventType, data });
}

// ── DB Sync ──────────────────────────────────────────────────────────────────

async function updateScopeConnected(scope: string, connected: boolean): Promise<void> {
  try {
    await prisma.scope.upsert({
      where: { name: scope },
      create: {
        name: scope,
        connected,
        lastSeenAt: connected ? new Date() : undefined,
      },
      update: {
        connected,
        ...(connected ? { lastSeenAt: new Date() } : {}),
      },
    });
  } catch {
    // Scope table may not exist yet (pre-migration) — ignore
  }
}
