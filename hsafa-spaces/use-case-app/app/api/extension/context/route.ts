import { prisma } from "@/lib/db";
import { getConnectionForHaseef } from "@/lib/extension";

/**
 * POST /api/extension/context
 *
 * Called by Core at the start of each haseef run cycle (via contextUrl in manifest).
 * Returns dynamic instructions injected into the haseef's system prompt — the
 * list of spaces this haseef is a member of, who's in each space, and their roles.
 *
 * Body: { haseefId: string, config: Record<string, unknown> }
 * Response: { instructions: string }
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      haseefId?: string;
      config?: Record<string, unknown>;
    };
    const { haseefId, config } = body;

    if (!haseefId) {
      return Response.json({ instructions: "" });
    }

    // Resolve agentEntityId — prefer live state, fallback to config
    let agentEntityId: string | undefined =
      getConnectionForHaseef(haseefId)?.agentEntityId ??
      (config?.agentEntityId as string | undefined);

    // Last resort: find agent entity by external_id = haseefId
    if (!agentEntityId) {
      const entity = await prisma.entity.findUnique({
        where: { externalId: haseefId },
        select: { id: true },
      });
      agentEntityId = entity?.id;
    }

    if (!agentEntityId) {
      return Response.json({ instructions: "" });
    }

    // Fetch spaces + members in a single query via memberships
    const memberships = await prisma.smartSpaceMembership.findMany({
      where: { entityId: agentEntityId },
      include: {
        smartSpace: {
          select: {
            id: true,
            name: true,
            description: true,
            memberships: {
              select: {
                entity: {
                  select: { id: true, displayName: true, type: true },
                },
              },
            },
          },
        },
      },
      orderBy: { joinedAt: "asc" },
    });

    if (memberships.length === 0) {
      return Response.json({
        instructions:
          "SPACES CONTEXT:\nYou are not currently a member of any spaces. " +
          "Wait for someone to add you to a space, or for a sense event.",
      });
    }

    const spaceBlocks = memberships.map((m) => {
      const space = m.smartSpace;
      const spaceName = space.name ?? "Unnamed";

      const members = space.memberships
        .map((sm) => sm.entity)
        .filter((e) => e.id !== agentEntityId);

      const memberList =
        members.length > 0
          ? members
              .map(
                (e) =>
                  `    - ${e.displayName ?? "Unknown"} (${e.type}, entityId: ${e.id})`,
              )
              .join("\n")
          : "    (no other members)";

      let block = `  "${spaceName}" (spaceId: ${space.id})`;
      if (space.description) {
        block += `\n    Description: ${space.description}`;
      }
      block += `\n    Members:\n${memberList}`;
      return block;
    });

    const instructions = `SPACES CONTEXT:
You are currently a member of ${memberships.length} space(s):
${spaceBlocks.join("\n\n")}

When you receive a message sense event, it includes the spaceId and senderName. Use the correct spaceId from the list above when calling space tools.`;

    return Response.json({ instructions });
  } catch (err) {
    console.error("[extension/context] Error:", err);
    return Response.json({ instructions: "" });
  }
}
