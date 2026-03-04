import { HsafaClient } from "@hsafa/node";
import { prisma } from "@/lib/db";
import { verifyToken } from "@/lib/auth";

const GATEWAY_URL = process.env.HSAFA_GATEWAY_URL || "http://localhost:3001";
const SECRET_KEY = process.env.HSAFA_SECRET_KEY || "";

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

    // Fetch user's spaces from gateway
    let spaces: Array<{ id: string; name?: string | null }> = [];
    const entityId = user.hsafaEntityId || "";
    if (entityId) {
      try {
        const hsafaClient = new HsafaClient({ gatewayUrl: GATEWAY_URL, secretKey: SECRET_KEY });
        const { smartSpaces } = await hsafaClient.spaces.list({ entityId });
        spaces = smartSpaces.map((s) => ({ id: s.id, name: s.name }));
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
