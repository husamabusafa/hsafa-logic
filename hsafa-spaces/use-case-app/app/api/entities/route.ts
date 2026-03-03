import crypto from "crypto";
import { prisma } from "@/lib/db";
import { requireSecretKeyAuth, requireAnyAuth } from "@/lib/spaces-auth";

// POST /api/entities — Create a human entity
export async function POST(request: Request) {
  const auth = await requireSecretKeyAuth(request);
  if (auth instanceof Response) return auth;

  try {
    const { type, externalId, displayName, metadata } = await request.json();

    if (type !== "human") {
      return Response.json(
        { error: "Spaces App can only create human entities" },
        { status: 400 }
      );
    }

    // Upsert by externalId if provided
    if (externalId) {
      const existing = await prisma.entity.findUnique({
        where: { externalId },
      });
      if (existing) {
        const updated = await prisma.entity.update({
          where: { externalId },
          data: {
            ...(displayName !== undefined && { displayName }),
            ...(metadata !== undefined && { metadata }),
          },
        });
        return Response.json({ entity: updated });
      }
    }

    const entity = await prisma.entity.create({
      data: {
        id: crypto.randomUUID(),
        type: "human",
        externalId: externalId ?? undefined,
        displayName: displayName ?? undefined,
        metadata: metadata ?? undefined,
      },
    });

    return Response.json({ entity }, { status: 201 });
  } catch (error) {
    console.error("Create entity error:", error);
    return Response.json(
      { error: "Failed to create entity" },
      { status: 500 }
    );
  }
}

// GET /api/entities — List entities
export async function GET(request: Request) {
  const auth = await requireAnyAuth(request);
  if (auth instanceof Response) return auth;

  try {
    const url = new URL(request.url);
    const type = url.searchParams.get("type") || undefined;
    const where: Record<string, unknown> = {};
    if (type) where.type = type;

    const entities = await prisma.entity.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return Response.json({ entities });
  } catch (error) {
    console.error("List entities error:", error);
    return Response.json(
      { error: "Failed to list entities" },
      { status: 500 }
    );
  }
}
