// =============================================================================
// Spaces Plugin — Built-in scope (always loaded, not from DB)
//
// Implements ScopePlugin for the "spaces" scope. Handles all messaging,
// navigation, interactive, and management tools.
// =============================================================================

import type { HsafaSDK } from "@hsafa/sdk";
import type { ScopePlugin, ToolCallContext } from "../scope-plugin.js";
import type { ServiceConfig } from "../config.js";
import { SCOPE, TOOLS, SCOPE_INSTRUCTIONS } from "../manifest.js";
import { executeSpacesAction } from "../tools/index.js";
import { prisma } from "../../db.js";
import { state } from "../types.js";

export const spacesPlugin: ScopePlugin = {
  name: SCOPE,

  tools: TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),

  staticInstructions: SCOPE_INSTRUCTIONS,

  async init(_sdk: HsafaSDK, _config: ServiceConfig): Promise<void> {
    // No extra init needed — spaces is always-on, state managed by types.ts
  },

  async stop(): Promise<void> {
    // No special cleanup
  },

  async handleToolCall(
    toolName: string,
    args: Record<string, unknown>,
    ctx: ToolCallContext,
  ): Promise<unknown> {
    return executeSpacesAction(ctx.haseef.id, ctx.actionId, toolName, args);
  },

  async getDynamicInstructions(haseefId: string): Promise<string | null> {
    return buildSpacesDynamicInstructions(haseefId);
  },
};

// =============================================================================
// Dynamic Instructions — YOUR BASES + YOUR SPACES
// =============================================================================

async function buildSpacesDynamicInstructions(haseefId: string): Promise<string | null> {
  const conn = state.connections.get(haseefId);
  const sections: string[] = [];

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
