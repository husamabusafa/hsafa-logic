import { prisma } from "@/lib/db";
import { requireAnyAuth, requireSecretKeyAuth } from "@/lib/spaces-auth";

// POST /api/clients — Register a client
export async function POST(request: Request) {
  const auth = await requireAnyAuth(request);
  if (auth instanceof Response) return auth;

  try {
    let { entityId, clientKey, clientType, displayName, capabilities } =
      await request.json();

    // Anti-impersonation: force entityId from JWT for public_key_jwt auth
    if (auth.method === "public_key_jwt") {
      entityId = auth.entityId;
    }

    if (!entityId || !clientKey) {
      return Response.json(
        { error: "entityId and clientKey are required" },
        { status: 400 }
      );
    }

    const client = await prisma.client.upsert({
      where: { clientKey },
      create: {
        entityId,
        clientKey,
        clientType: clientType ?? undefined,
        displayName: displayName ?? undefined,
        capabilities: capabilities ?? {},
        lastSeenAt: new Date(),
      },
      update: {
        lastSeenAt: new Date(),
        ...(clientType !== undefined && { clientType }),
        ...(displayName !== undefined && { displayName }),
        ...(capabilities !== undefined && { capabilities }),
      },
    });

    return Response.json({ client }, { status: 201 });
  } catch (error) {
    console.error("Register client error:", error);
    return Response.json(
      { error: "Failed to register client" },
      { status: 500 }
    );
  }
}

// GET /api/clients — List clients
export async function GET(request: Request) {
  const auth = await requireSecretKeyAuth(request);
  if (auth instanceof Response) return auth;

  try {
    const url = new URL(request.url);
    const entityId = url.searchParams.get("entityId") || undefined;
    const where: Record<string, unknown> = {};
    if (entityId) where.entityId = entityId;

    const clients = await prisma.client.findMany({
      where,
      orderBy: { lastSeenAt: "desc" },
    });

    return Response.json({ clients });
  } catch (error) {
    console.error("List clients error:", error);
    return Response.json(
      { error: "Failed to list clients" },
      { status: 500 }
    );
  }
}
