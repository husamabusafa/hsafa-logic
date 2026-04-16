import type { Response } from 'express';
import { prisma } from './db.js';

// =============================================================================
// Tool Dispatcher (v7)
//
// Replaces Redis Streams with in-process SSE connections.
// Each skill has one SSE channel. Services connect and receive action requests.
// Core dispatches by sending JSON over the SSE channel and awaiting a result
// via a pending-action Promise map.
//
// Architecture:
//   dispatchToSkill() → emitToSkill(action) → service SDK receives it
//   service SDK → POST /api/actions/:actionId/result → resolveAction()
// =============================================================================

const DEFAULT_TIMEOUT_MS = 30_000;

// Per-skill SSE connections (one skill can have many connected clients)
const skillConnections = new Map<string, Set<Response>>();

// Pending tool-call Promises waiting for service results
interface PendingAction {
  resolve: (result: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
  startedAt: number;
}
const pendingActions = new Map<string, PendingAction>();

// ── Connection Management ────────────────────────────────────────────────────

export function addSkillConnection(skill: string, res: Response): void {
  if (!skillConnections.has(skill)) {
    skillConnections.set(skill, new Set());
  }
  skillConnections.get(skill)!.add(res);
  void updateSkillConnected(skill, true);
}

export function removeSkillConnection(skill: string, res: Response): void {
  const conns = skillConnections.get(skill);
  if (!conns) return;
  conns.delete(res);
  if (conns.size === 0) {
    skillConnections.delete(skill);
    void updateSkillConnected(skill, false);
  }
}

export function isSkillConnected(skill: string): boolean {
  const conns = skillConnections.get(skill);
  return conns !== undefined && conns.size > 0;
}

/** Returns all currently connected skill names. */
export function getConnectedSkills(): string[] {
  return [...skillConnections.keys()];
}

// ── Emit ─────────────────────────────────────────────────────────────────────

/**
 * Emit a JSON event to all SSE clients listening on a skill.
 * Returns true if at least one client was reached.
 */
export function emitToSkill(skill: string, event: Record<string, unknown>): boolean {
  const conns = skillConnections.get(skill);
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
    skillConnections.delete(skill);
    void updateSkillConnected(skill, false);
  }

  return conns.size > 0 || dead.length > 0;
}

// ── Dispatch ─────────────────────────────────────────────────────────────────

export interface DispatchOptions {
  skill: string;
  actionId: string;
  toolName: string;
  args: Record<string, unknown>;
  haseef: { id: string; name: string; profile: Record<string, unknown> };
  timeout?: number;
}

/**
 * Dispatch an action to a skill's connected service and wait for the result.
 * Sends to exactly ONE connected client (unicast) — not all.
 * Times out if no result arrives within `timeout` ms.
 */
export async function dispatchToSkill(opts: DispatchOptions): Promise<unknown> {
  const { skill, actionId, toolName, args, haseef, timeout = DEFAULT_TIMEOUT_MS } = opts;

  const conns = skillConnections.get(skill);
  if (!conns || conns.size === 0) {
    return { error: `Skill "${skill}" has no connected service — tool "${toolName}" cannot execute` };
  }

  // Send to ONE client only (first that accepts the write).
  // Tool call actions must be unicast — broadcasting causes duplicate execution.
  const payload = `data: ${JSON.stringify({ type: 'action', actionId, toolName, args, haseef })}\n\n`;
  let sent = false;
  const dead: Response[] = [];

  for (const res of conns) {
    try {
      res.write(payload);
      sent = true;
      break; // Stop after first successful write
    } catch {
      dead.push(res);
    }
  }

  // Clean up dead connections discovered during dispatch
  for (const res of dead) {
    conns.delete(res);
  }
  if (conns.size === 0) {
    skillConnections.delete(skill);
    void updateSkillConnected(skill, false);
  }

  if (!sent) {
    return { error: `Skill "${skill}" has no reachable service — tool "${toolName}" cannot execute` };
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

// ── Skill Lifecycle Events ───────────────────────────────────────────────────

/**
 * Broadcast a lifecycle event to all clients connected on a skill.
 * Used for run.started, run.completed, tool.input.start, etc.
 */
export function emitLifecycleToSkill(
  skill: string,
  eventType: string,
  data: Record<string, unknown>,
): void {
  emitToSkill(skill, { type: eventType, data });
}

// ── DB Sync ──────────────────────────────────────────────────────────────────

async function updateSkillConnected(skill: string, connected: boolean): Promise<void> {
  try {
    await prisma.skill.upsert({
      where: { name: skill },
      create: {
        name: skill,
        connected,
        lastSeenAt: connected ? new Date() : undefined,
      },
      update: {
        connected,
        ...(connected ? { lastSeenAt: new Date() } : {}),
      },
    });
  } catch {
    // Skill table may not exist yet (pre-migration) — ignore
  }
}
