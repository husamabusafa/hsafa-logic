import { spacesPrisma } from "@/lib/spaces-db";
import { verifyToken } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    // Verify the user's JWT
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.slice(7);
    const payload = await verifyToken(token);
    if (!payload) {
      return Response.json(
        { error: "Invalid or expired token" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { name } = body as { name?: string };

    // 1. Create the SmartSpace directly in spaces DB
    const smartSpace = await spacesPrisma.smartSpace.create({
      data: {
        name: name || `Chat ${new Date().toLocaleTimeString()}`,
      },
    });

    // 2. Add user as admin
    await spacesPrisma.smartSpaceMembership.create({
      data: {
        smartSpaceId: smartSpace.id,
        entityId: payload.entityId,
        role: "admin",
      },
    });

    // 3. Add agent as member
    await spacesPrisma.smartSpaceMembership.create({
      data: {
        smartSpaceId: smartSpace.id,
        entityId: payload.agentEntityId,
        role: "member",
      },
    });

    return Response.json({
      smartSpace: {
        id: smartSpace.id,
        name: smartSpace.name,
      },
    });
  } catch (error) {
    console.error("Create space error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to create space";
    return Response.json({ error: message }, { status: 500 });
  }
}
