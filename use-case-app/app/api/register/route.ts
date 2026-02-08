import { HsafaClient } from "@hsafa/node";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { signToken } from "@/lib/auth";

const GATEWAY_URL = process.env.HSAFA_GATEWAY_URL || "http://localhost:3001";
const ADMIN_KEY = process.env.HSAFA_ADMIN_KEY || "gk_default_admin_key";

const AGENT_CONFIG = {
  version: "1.0",
  agent: {
    name: "hsafa-assistant",
    description: "A helpful AI assistant for Hsafa users.",
    system:
      "You are a helpful assistant.\nKeep answers concise and helpful.\nBe friendly and approachable.",
  },
  model: {
    provider: "openai",
    name: "gpt-4o-mini",
    temperature: 0.7,
    maxOutputTokens: 800,
  },
  loop: {
    maxSteps: 5,
  },
  runtime: {
    response: {
      type: "ui-message-stream",
    },
  },
};

let cachedAgentEntityId: string | null = null;

async function ensureAgent(client: HsafaClient): Promise<string> {
  if (cachedAgentEntityId) return cachedAgentEntityId;

  const { agentId } = await client.agents.create({
    name: "hsafa-assistant",
    config: AGENT_CONFIG,
  });

  const { entity: agentEntity } = await client.entities.createAgent({
    agentId,
    displayName: "Hsafa Assistant",
  });

  cachedAgentEntityId = agentEntity.id;
  return agentEntity.id;
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

    const hsafaClient = new HsafaClient({
      gatewayUrl: GATEWAY_URL,
      adminKey: ADMIN_KEY,
    });

    // 1. Ensure the agent + agent entity exist
    const agentEntityId = await ensureAgent(hsafaClient);

    // 2. Create human entity in hsafa gateway
    const { entity: human } = await hsafaClient.entities.create({
      type: "human",
      externalId: email,
      displayName: name,
      metadata: { email },
    });

    // 3. Create a SmartSpace for this user + agent
    const { smartSpace } = await hsafaClient.spaces.create({
      name: `${name}'s Chat`,
      visibility: "private",
    });

    // 4. Add human as admin
    await hsafaClient.spaces.addMember(smartSpace.id, {
      entityId: human.id,
      role: "admin",
    });

    // 5. Add agent as member
    await hsafaClient.spaces.addMember(smartSpace.id, {
      entityId: agentEntityId,
      role: "member",
    });

    // 6. Store user in local database
    const user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        hsafaEntityId: human.id,
        hsafaSpaceId: smartSpace.id,
        hsafaSecretKey: smartSpace.secretKey,
        hsafaPublicKey: smartSpace.publicKey,
        agentEntityId,
      },
    });

    // 7. Generate JWT
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
        secretKey: smartSpace.secretKey,
        publicKey: smartSpace.publicKey,
        agentEntityId,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    const message =
      error instanceof Error ? error.message : "Registration failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
