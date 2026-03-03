import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { spacesPrisma } from "@/lib/spaces-db";
import { signToken } from "@/lib/auth";

let cachedAgentEntityId: string | null = null;

async function ensureAgentEntity(): Promise<string> {
  if (cachedAgentEntityId) return cachedAgentEntityId;

  // Check if an agent entity already exists
  const existing = await spacesPrisma.entity.findFirst({
    where: { type: "agent" },
  });

  if (existing) {
    cachedAgentEntityId = existing.id;
    return existing.id;
  }

  // No agent entity found — this should be created by core's seed
  throw new Error("No agent entity found. Run core seed first.");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, email, password } = body as {
      name: string;
      email: string;
      password: string;
    };

    if (!name || !email || !password) {
      return Response.json(
        { error: "Name, email, and password are required" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return Response.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    // Check if email already exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return Response.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // 1. Create user in local DB first (so we have user.id for externalId)
    const user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
      },
    });

    // 2. Ensure the agent entity exists (created by core seed)
    const agentEntityId = await ensureAgentEntity();

    // 3. Create human entity directly in spaces DB
    //    externalId = user.id so it matches the JWT sub claim
    const human = await spacesPrisma.entity.create({
      data: {
        id: crypto.randomUUID(),
        type: "human",
        externalId: user.id,
        displayName: name,
        metadata: { email },
      },
    });

    // 4. Create a SmartSpace for this user + agent
    const smartSpace = await spacesPrisma.smartSpace.create({
      data: { name: `${name}'s Chat` },
    });

    // 5. Add human as admin
    await spacesPrisma.smartSpaceMembership.create({
      data: {
        smartSpaceId: smartSpace.id,
        entityId: human.id,
        role: "admin",
      },
    });

    // 6. Add agent as member
    await spacesPrisma.smartSpaceMembership.create({
      data: {
        smartSpaceId: smartSpace.id,
        entityId: agentEntityId,
        role: "member",
      },
    });

    // 7. Update user with hsafa references
    await prisma.user.update({
      where: { id: user.id },
      data: {
        hsafaEntityId: human.id,
        hsafaSpaceId: smartSpace.id,
        agentEntityId,
      },
    });

    // 8. Generate JWT (sub = user.id, matches entity.externalId)
    const token = await signToken({
      sub: user.id,
      email: user.email,
      name: user.name,
      entityId: human.id,
      agentEntityId,
    });

    return Response.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        entityId: human.id,
        smartSpaceId: smartSpace.id,
        agentEntityId,
        spaces: [{ id: smartSpace.id, name: smartSpace.name }],
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    const message =
      error instanceof Error ? error.message : "Registration failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
