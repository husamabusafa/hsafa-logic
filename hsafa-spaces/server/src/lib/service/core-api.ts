// =============================================================================
// Spaces Service — Core API Helpers (v7)
//
// HTTP calls to hsafa-core for tool sync and sense events.
// v7: submitActionResult removed — SDK handles result posting internally.
// Tool sync still uses per-haseef v5 endpoint for scope instructions.
// Sense events still use per-haseef v5 endpoint for backward compatibility.
// =============================================================================

import { prisma } from "../db.js";
import { state } from "./types.js";
import { SCOPE, SCOPE_INSTRUCTIONS, TOOLS, SCHEDULER_SCOPE, SCHEDULER_TOOLS } from "./manifest.js";
import { getActiveSchedules } from "./schedule-service.js";

export function coreHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-api-key": state.config!.apiKey,
  };
}

/** PUT /api/haseefs/:id/scopes/:scope/tools — Sync all tools + scope instructions */
export async function syncTools(haseefId: string): Promise<void> {
  await syncSpacesTools(haseefId);
  await syncSchedulerTools(haseefId);
}

/** Sync spaces scope tools */
async function syncSpacesTools(haseefId: string): Promise<void> {
  const instructions = await buildSpacesInstructions(haseefId);
  const url = `${state.config!.coreUrl}/api/haseefs/${haseefId}/scopes/${SCOPE}/tools`;
  const res = await fetch(url, {
    method: "PUT",
    headers: coreHeaders(),
    body: JSON.stringify({ tools: TOOLS, instructions }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`syncSpacesTools failed for ${haseefId}: ${res.status} ${text}`);
  }
}

/** Sync scheduler scope tools */
async function syncSchedulerTools(haseefId: string): Promise<void> {
  const instructions = buildSchedulerInstructions();
  const url = `${state.config!.coreUrl}/api/haseefs/${haseefId}/scopes/${SCHEDULER_SCOPE}/tools`;
  const res = await fetch(url, {
    method: "PUT",
    headers: coreHeaders(),
    body: JSON.stringify({ tools: SCHEDULER_TOOLS, instructions }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`syncSchedulerTools failed for ${haseefId}: ${res.status} ${text}`);
  }
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

/**
 * Build scheduler scope instructions — YOUR SCHEDULES section.
 */
function buildSchedulerInstructions(): string {
  const sections: string[] = [
    `You can create scheduled plans that trigger you as sense events.

HOW IT WORKS:
  Use scheduler_create_schedule to set up recurring or one-time schedules.
  When the time comes, you will receive a scheduled_plan sense event.
  Respond to these events like any other — use spaces tools to take action.`,
  ];

  return sections.join('\n\n');
}

/** POST /api/haseefs/:id/events — Push V5 sense events */
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
  const url = `${state.config!.coreUrl}/api/haseefs/${haseefId}/events`;
  const body: Record<string, unknown> = {
    eventId: event.eventId,
    scope: event.scope,
    type: event.type,
    data: event.data,
    timestamp: event.timestamp ?? new Date().toISOString(),
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
