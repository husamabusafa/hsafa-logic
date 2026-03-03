import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { spacesPrisma } from "@/lib/spaces-db";
import { signToken } from "@/lib/auth";

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
