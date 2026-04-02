// =============================================================================
// Spaces Service — Core API Helpers (v7)
//
// HTTP calls to hsafa-core for tool sync and sense events.
// v7: Tools registered globally by scope-registry via SDK.registerTools().
//     Per-haseef instructions pushed via PATCH /api/haseefs/:id configJson.
//     submitActionResult removed — SDK handles result posting internally.
// =============================================================================

import { prisma } from "../db.js";
import { state } from "./types.js";
import { SCOPE_INSTRUCTIONS } from "./manifest.js";
import { scopeRegistry } from "./scope-registry.js";
import { getActiveSchedules } from "./schedule-service.js";

export function coreHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-api-key": state.config!.apiKey,
  };
}

/**
 * Sync per-haseef scope instructions to Core via PATCH configJson.instructions.
 * In v7, tools are registered globally by the scope registry — this only pushes
 * the dynamic context (YOUR BASES, YOUR SPACES, etc.) into the haseef's prompt.
 */
export async function syncTools(haseefId: string): Promise<void> {
  const instructions = await buildAllInstructions(haseefId);

  try {
    // Read current haseef configJson to avoid overwriting model/voice config
    const getUrl = `${state.config!.coreUrl}/api/haseefs/${haseefId}`;
    const getRes = await fetch(getUrl, { headers: coreHeaders() });
    if (!getRes.ok) {
      console.warn(`[core-api] Failed to read haseef ${haseefId}: ${getRes.status}`);
      return;
    }
    const { haseef } = (await getRes.json()) as { haseef: { configJson: Record<string, unknown> } };
    const currentConfig = haseef?.configJson ?? {};

    // Merge instructions into configJson
    const patchUrl = `${state.config!.coreUrl}/api/haseefs/${haseefId}`;
    const patchRes = await fetch(patchUrl, {
      method: "PATCH",
      headers: coreHeaders(),
      body: JSON.stringify({ configJson: { ...currentConfig, instructions } }),
    });
    if (!patchRes.ok) {
      const text = await patchRes.text();
      console.warn(`[core-api] Failed to sync instructions for ${haseefId}: ${patchRes.status} ${text}`);
    }
  } catch (err) {
    console.warn(`[core-api] syncTools error for ${haseefId}:`, err);
  }
}

/**
 * Build combined instructions for all active scopes.
 * Spaces scope has its own dynamic builder (YOUR BASES, YOUR SPACES).
 * Plugin scopes get their static instructions from the scope registry.
 */
async function buildAllInstructions(haseefId: string): Promise<string> {
  const sections: string[] = [];

  // 1. Built-in spaces scope — dynamic context
  sections.push(await buildSpacesInstructions(haseefId));

  // 2. Plugin scopes — static instructions from registry (loaded from templates)
  for (const [scopeName, entry] of scopeRegistry) {
    if (entry.builtIn) continue; // spaces already handled above
    if (entry.instructions) {
      sections.push(entry.instructions);
    }
  }

  return sections.filter(Boolean).join('\n\n---\n\n');
}

/**
 * Build spaces scope instructions — static SCOPE_INSTRUCTIONS + YOUR SPACES.
 */
async function buildSpacesInstructions(haseefId: string): Promise<string> {
  const conn = state.connections.get(haseefId);
  const sections: string[] = [SCOPE_INSTRUCTIONS];

  // ── YOUR BASES ──────────────────────────────────────────────────────
  if (conn?.agentEntityId) {
    const baseMembers = await prisma.baseMember.findMany({
      where: { entityId: conn.agentEntityId },
      select: { baseId: true },
    });
    const baseIds = baseMembers.map((b) => b.baseId);

    if (baseIds.length === 0) {
      sections.push('YOUR BASES:\n  (no bases yet)');
    } else {
      const bases = await prisma.base.findMany({
        where: { id: { in: baseIds } },
        select: { id: true, name: true },
      });

      const allMembers = await prisma.baseMember.findMany({
        where: { baseId: { in: baseIds } },
        include: {
          entity: { select: { id: true, displayName: true, type: true } },
        },
      });

      // Group members by baseId
      const membersByBase = new Map<string, typeof allMembers>();
      for (const m of allMembers) {
        const arr = membersByBase.get(m.baseId) ?? [];
        arr.push(m);
        membersByBase.set(m.baseId, arr);
      }

      const baseLines = bases.map((b) => {
        const members = membersByBase.get(b.id) ?? [];
        const memberList = members.map((m: any) => {
          const isYou = m.entity.id === conn.agentEntityId;
          return `${m.entity.displayName}${isYou ? ' (You)' : ''} [${m.entity.type}, entityId: ${m.entity.id}]`;
        }).join(', ');
        return `  - "${b.name}" (baseId: ${b.id}, ${members.length} members): ${memberList}`;
      });

      sections.push('YOUR BASES:\n' + baseLines.join('\n'));
    }
  } else {
    sections.push('YOUR BASES:\n  (no bases yet)');
  }

  // ── YOUR SCHEDULES ──────────────────────────────────────────────────
  if (conn) {
    try {
      const schedules = await getActiveSchedules(haseefId);
      if (schedules.length > 0) {
        const scheduleLines = schedules.map((s) => {
          const nextRun = s.nextRunAt ? new Date(s.nextRunAt).toISOString() : 'unknown';
          if (s.type === 'recurring') {
            return `  - "${s.description}" (scheduleId: ${s.id}, cron: ${s.cronExpression}, tz: ${s.timezone}, nextRun: ${nextRun})`;
          } else {
            return `  - "${s.description}" (scheduleId: ${s.id}, one-time: ${s.scheduledAt?.toISOString() ?? nextRun}, tz: ${s.timezone})`;
          }
        });
        sections.push(
          'YOUR SCHEDULES:\n' +
          '  To stop a schedule, use scheduler_delete_schedule with the scheduleId.\n' +
          '  If someone asks you to stop, cancel, or delete a schedule — DO IT immediately with delete_schedule. Do not just say "understood".\n' +
          scheduleLines.join('\n'),
        );
      } else {
        sections.push('YOUR SCHEDULES:\n  (none active)');
      }
    } catch {
      // Non-fatal — skip if schedule lookup fails
    }
  }

  // ── YOUR SPACES ──────────────────────────────────────────────────────
  if (!conn || conn.spaceIds.length === 0) {
    sections.push('YOUR SPACES:\n  (no spaces yet)');
  } else {
    const spaces = await prisma.smartSpace.findMany({
      where: { id: { in: conn.spaceIds } },
      select: {
        id: true,
        name: true,
        description: true,
        _count: { select: { memberships: true } },
      },
    });

    const membersBySpace = await Promise.all(
      spaces.map(async (space: any) => {
        const members = await prisma.smartSpaceMembership.findMany({
          where: { smartSpaceId: space.id },
          include: { entity: { select: { displayName: true } } },
        });
        return {
          spaceId: space.id,
          memberNames: members.map((m: any) => m.entity?.displayName ?? 'Unknown'),
        };
      })
    );
    const membersMap = new Map(membersBySpace.map(m => [m.spaceId, m.memberNames]));

    const spaceLines = spaces.map((s: any) => {
      const desc = s.description ? ` — ${s.description}` : '';
      const memberNames = membersMap.get(s.id) ?? [];
      const membersList = memberNames.join(', ') || 'empty';
      return `  - "${s.name ?? 'Unnamed'}" (spaceId: ${s.id}, ${s._count.memberships} members: ${membersList}${desc})`;
    });

    sections.push('YOUR SPACES:\n' + spaceLines.join('\n'));
  }

  return sections.join('\n\n');
}

/** POST /api/events — Push sense events (v7 global events endpoint) */
export async function pushSenseEvent(
  haseefId: string,
  event: {
    eventId: string;
    scope: string;
    type: string;
    data: Record<string, unknown>;
    attachments?: Array<{ type: "image" | "audio" | "file"; mimeType: string; url?: string; name?: string }>;
    timestamp?: string;
  },
): Promise<void> {
  const url = `${state.config!.coreUrl}/api/events`;
  const body: Record<string, unknown> = {
    haseefId,
    scope: event.scope,
    type: event.type,
    data: event.data,
  };
  if (event.attachments && event.attachments.length > 0) {
    body.attachments = event.attachments;
  }
  const res = await fetch(url, {
    method: "POST",
    headers: coreHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`pushSenseEvent failed: ${res.status} ${text}`);
  }
}

// NOTE: submitActionResult was removed in v7. The @hsafa/sdk handles
// posting tool call results internally after onToolCall handlers return.
