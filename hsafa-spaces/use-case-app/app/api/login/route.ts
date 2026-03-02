import { HsafaClient } from "@hsafa/node";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { signToken } from "@/lib/auth";

const GATEWAY_URL = process.env.HSAFA_GATEWAY_URL || "http://localhost:3001";
const SECRET_KEY = process.env.HSAFA_SECRET_KEY || "";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body as { email: string; password: string };

    if (!email || !password) {
      return Response.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    // 1. Find user in local database
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return Response.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    // 2. Verify password
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return Response.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    // 3. Generate JWT
    const token = await signToken({
      sub: user.id,
      email: user.email,
      name: user.name,
      entityId: user.hsafaEntityId || "",
      agentEntityId: user.agentEntityId || "",
    });

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
      token,
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
    console.error("Login error:", error);
    const message =
      error instanceof Error ? error.message : "Login failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
