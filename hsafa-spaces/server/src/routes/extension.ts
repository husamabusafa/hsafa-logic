import { Router } from "express";
import type { Request, Response } from "express";
import { prisma } from "../lib/db.js";
import { getConnectionForHaseef } from "../lib/service/index.js";
import { SCOPE, TOOLS } from "../lib/service/manifest.js";

const router = Router();

// GET /api/extension/manifest — Returns V5 scope and tool definitions
router.get("/manifest", async (_req: Request, res: Response) => {
  res.json({ scope: SCOPE, tools: TOOLS });
});

// POST /api/extension/context — Dynamic context for haseef runs
router.post("/context", async (req: Request, res: Response) => {
  try {
    const { haseefId, config } = req.body as {
      haseefId?: string;
      config?: Record<string, unknown>;
    };

    if (!haseefId) {
      res.json({ instructions: "" });
      return;
    }

    let agentEntityId: string | undefined =
      getConnectionForHaseef(haseefId)?.agentEntityId ??
      (config?.agentEntityId as string | undefined);

    if (!agentEntityId) {
      const entity = await prisma.entity.findUnique({
        where: { externalId: haseefId },
        select: { id: true },
      });
      agentEntityId = entity?.id;
    }

    if (!agentEntityId) {
      res.json({ instructions: "" });
      return;
    }

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
      res.json({
        instructions:
          "SPACES CONTEXT:\nYou are not currently a member of any spaces. " +
          "Wait for someone to add you to a space, or for a sense event.",
      });
      return;
    }

    const spaceBlocks = memberships.map((m: any) => {
      const space = m.smartSpace;
      const spaceName = space.name ?? "Unnamed";

      const members = space.memberships
        .map((sm: any) => sm.entity)
        .filter((e: any) => e.id !== agentEntityId);

      const memberList =
        members.length > 0
          ? members
              .map(
                (e: any) =>
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

    res.json({ instructions });
  } catch (err) {
    console.error("[extension/context] Error:", err);
    res.json({ instructions: "" });
  }
});

export default router;
