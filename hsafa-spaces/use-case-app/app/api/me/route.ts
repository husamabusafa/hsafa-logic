import { prisma } from "@/lib/db";
import { spacesPrisma } from "@/lib/spaces-db";
import { verifyToken } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.slice(7);
    const payload = await verifyToken(token);
    if (!payload) {
      return Response.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    // Fetch fresh user data from DB
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    // Fetch user's spaces directly from spaces DB
    let spaces: Array<{ id: string; name?: string | null }> = [];
    const entityId = user.hsafaEntityId || "";
    if (entityId) {
      try {
        const memberships = await spacesPrisma.smartSpaceMembership.findMany({
          where: { entityId },
          include: { smartSpace: { select: { id: true, name: true } } },
        });
        spaces = memberships.map((m: any) => ({
          id: m.smartSpace.id,
          name: m.smartSpace.name,
        }));
      } catch {
        // Fallback to default space
      }
    }

    if (spaces.length === 0 && user.hsafaSpaceId) {
      spaces = [{ id: user.hsafaSpaceId, name: `${user.name}'s Chat` }];
    }

    return Response.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        entityId,
        smartSpaceId: user.hsafaSpaceId || "",
        agentEntityId: user.agentEntityId || "",
        spaces,
      },
    });
  } catch (error) {
    console.error("Auth check error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
