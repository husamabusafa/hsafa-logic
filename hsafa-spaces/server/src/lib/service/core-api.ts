// =============================================================================
// Spaces Service — V5 Core API Helpers
//
// HTTP calls to hsafa-core for tool sync, sense events, and action results.
// =============================================================================

import { prisma } from "../db.js";
import { state } from "./types.js";
import { SCOPE, SCOPE_INSTRUCTIONS, TOOLS } from "./manifest.js";

export function coreHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-api-key": state.config!.apiKey,
  };
}

/** PUT /api/haseefs/:id/scopes/:scope/tools — Sync all tools + scope instructions */
export async function syncTools(haseefId: string): Promise<void> {
  const instructions = await buildDynamicInstructions(haseefId);
  const url = `${state.config!.coreUrl}/api/haseefs/${haseefId}/scopes/${SCOPE}/tools`;
  const res = await fetch(url, {
    method: "PUT",
    headers: coreHeaders(),
    body: JSON.stringify({ tools: TOOLS, instructions }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`syncTools failed for ${haseefId}: ${res.status} ${text}`);
  }
}

/**
 * Build per-haseef scope instructions that include the spaces list with members.
 * Static SCOPE_INSTRUCTIONS + dynamic YOUR SPACES section.
 */
async function buildDynamicInstructions(haseefId: string): Promise<string> {
  const conn = state.connections.get(haseefId);
  if (!conn || conn.spaceIds.length === 0) {
    return SCOPE_INSTRUCTIONS + '\n\nYOUR SPACES:\n  (no spaces yet)';
  }

  // Fetch space details with member counts
  const spaces = await prisma.smartSpace.findMany({
    where: { id: { in: conn.spaceIds } },
    select: {
      id: true,
      name: true,
      description: true,
      _count: { select: { memberships: true } },
    },
  });

  // Fetch members for all spaces in parallel
  const membersBySpace = await Promise.all(
    spaces.map(async (space: any) => {
      const members = await prisma.smartSpaceMembership.findMany({
        where: { smartSpaceId: space.id },
        include: {
          entity: { select: { displayName: true } },
        },
      });
      return {
        spaceId: space.id,
        memberNames: members.map((m: any) => m.entity?.displayName ?? 'Unknown'),
      };
    })
  );
  const membersMap = new Map(membersBySpace.map(m => [m.spaceId, m.memberNames]));

  const lines = spaces.map((s: any) => {
    const desc = s.description ? ` — ${s.description}` : '';
    const memberNames = membersMap.get(s.id) ?? [];
    const membersList = memberNames.join(', ') || 'empty';
    return `  - "${s.name ?? 'Unnamed'}" (spaceId: ${s.id}, ${s._count.memberships} members: ${membersList}${desc})`;
  });

  return SCOPE_INSTRUCTIONS + '\n\nYOUR SPACES:\n' + lines.join('\n');
}

/** POST /api/haseefs/:id/events — Push V5 sense events */
export async function pushSenseEvent(
  haseefId: string,
  event: {
    eventId: string;
    scope: string;
    type: string;
    data: Record<string, unknown>;
    timestamp?: string;
  },
): Promise<void> {
  const url = `${state.config!.coreUrl}/api/haseefs/${haseefId}/events`;
  const res = await fetch(url, {
    method: "POST",
    headers: coreHeaders(),
    body: JSON.stringify({
      eventId: event.eventId,
      scope: event.scope,
      type: event.type,
      data: event.data,
      timestamp: event.timestamp ?? new Date().toISOString(),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`pushSenseEvent failed: ${res.status} ${text}`);
  }
}

/** POST /api/haseefs/:id/actions/:actionId/result — Submit action result */
export async function submitActionResult(
  haseefId: string,
  actionId: string,
  result: unknown,
): Promise<void> {
  const url = `${state.config!.coreUrl}/api/haseefs/${haseefId}/actions/${actionId}/result`;
  console.log(`[spaces-service] submitActionResult: POST ${url.replace(state.config!.coreUrl, '')} (actionId=${actionId.slice(0, 8)})`);
  const res = await fetch(url, {
    method: "POST",
    headers: coreHeaders(),
    body: JSON.stringify(result),
  });
  if (!res.ok) {
    const text = await res.text();
    const errMsg = `submitActionResult failed: ${res.status} ${text}`;
    console.error(`[spaces-service] ${errMsg}`);
    throw new Error(errMsg);
  }
  console.log(`[spaces-service] submitActionResult: OK (actionId=${actionId.slice(0, 8)})`);
}
