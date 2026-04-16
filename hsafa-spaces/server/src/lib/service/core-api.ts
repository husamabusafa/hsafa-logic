// =============================================================================
// Spaces Service — Core API Helpers (v7)
//
// HTTP calls to hsafa-core for instruction sync and sense events.
// v7: Tools registered globally via SDK.registerTools().
//     Per-haseef instructions pushed via PATCH /api/haseefs/:id configJson.
//     submitActionResult removed — SDK handles result posting internally.
// =============================================================================

import { state } from "./types.js";
import { SKILL_INSTRUCTIONS } from "./manifest.js";
import { prisma } from "../db.js";

export function coreHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-api-key": state.config!.secretKey,
  };
}

// =============================================================================
// Instruction Sync — push per-haseef dynamic instructions to Core
// =============================================================================

/**
 * Build and push per-haseef skill instructions to Core via PATCH configJson.
 *
 * In v7, tools are registered globally — this only pushes
 * the dynamic context (YOUR BASES, YOUR SPACES, YOUR SCHEDULES, etc.) into
 * the haseef's prompt.
 *
 * Each loaded plugin contributes:
 *   - staticInstructions (always included)
 *   - getDynamicInstructions(haseefId) (per-haseef context, if implemented)
 */
export async function syncInstructions(haseefId: string): Promise<void> {
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
    console.warn(`[core-api] syncInstructions error for ${haseefId}:`, err);
  }
}


// =============================================================================
// Instruction Assembly — centralized, queries all loaded plugins
// =============================================================================

/**
 * Build combined instructions: static skill instructions + dynamic per-haseef context.
 */
async function buildAllInstructions(haseefId: string): Promise<string> {
  const sections: string[] = [];

  // Static instructions
  if (SKILL_INSTRUCTIONS) {
    sections.push(SKILL_INSTRUCTIONS);
  }

  // Dynamic per-haseef instructions (YOUR BASES + YOUR SPACES)
  try {
    const dynamic = await buildDynamicInstructions(haseefId);
    if (dynamic) sections.push(dynamic);
  } catch {
    // Non-fatal
  }

  return sections.filter(Boolean).join('\n\n');
}

/**
 * Build dynamic per-haseef instructions: YOUR BASES + YOUR SPACES.
 */
async function buildDynamicInstructions(haseefId: string): Promise<string | null> {
  const conn = state.connections.get(haseefId);
  const parts: string[] = [];

  // ── YOUR BASES ──
  if (conn?.agentEntityId) {
    const baseMembers = await prisma.baseMember.findMany({
      where: { entityId: conn.agentEntityId },
      select: { baseId: true },
    });
    const baseIds = baseMembers.map((b: any) => b.baseId);

    if (baseIds.length === 0) {
      parts.push('YOUR BASES:\n  (no bases yet)');
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

      const membersByBase = new Map<string, typeof allMembers>();
      for (const m of allMembers) {
        const arr = membersByBase.get(m.baseId) ?? [];
        arr.push(m);
        membersByBase.set(m.baseId, arr);
      }

      const baseLines = bases.map((b: any) => {
        const members = membersByBase.get(b.id) ?? [];
        const memberList = members.map((m: any) => {
          const isYou = m.entity.id === conn.agentEntityId;
          return `${m.entity.displayName}${isYou ? ' (You)' : ''} [${m.entity.type}, entityId: ${m.entity.id}]`;
        }).join(', ');
        return `  - "${b.name}" (baseId: ${b.id}, ${members.length} members): ${memberList}`;
      });

      parts.push('YOUR BASES:\n' + baseLines.join('\n'));
    }
  } else {
    parts.push('YOUR BASES:\n  (no bases yet)');
  }

  // ── YOUR SPACES ──
  if (!conn || conn.spaceIds.length === 0) {
    parts.push('YOUR SPACES:\n  (no spaces yet)');
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
    const membersMap = new Map(membersBySpace.map((m: any) => [m.spaceId, m.memberNames]));

    const spaceLines = spaces.map((s: any) => {
      const desc = s.description ? ` — ${s.description}` : '';
      const memberNames = membersMap.get(s.id) ?? [];
      const membersList = memberNames.join(', ') || 'empty';
      return `  - "${s.name ?? 'Unnamed'}" (spaceId: ${s.id}, ${s._count.memberships} members: ${membersList}${desc})`;
    });

    parts.push('YOUR SPACES:\n' + spaceLines.join('\n'));
  }

  return parts.join('\n\n');
}

/** POST /api/events — Push sense events (v7 global events endpoint) */
export async function pushSenseEvent(
  haseefId: string,
  event: {
    eventId: string;
    skill: string;
    type: string;
    data: Record<string, unknown>;
    attachments?: Array<{ type: "image" | "audio" | "file"; mimeType: string; url?: string; name?: string }>;
    timestamp?: string;
  },
): Promise<void> {
  const url = `${state.config!.coreUrl}/api/events`;
  const body: Record<string, unknown> = {
    haseefId,
    skill: event.skill,
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
