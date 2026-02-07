import { HsafaClient } from "@hsafa/node";

const GATEWAY_URL = process.env.HSAFA_GATEWAY_URL || "http://localhost:3001";
const ADMIN_KEY = process.env.HSAFA_ADMIN_KEY || "gk_default_admin_key";

// The agent config to use — a basic helpful assistant
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

// Cache the agent entity ID so we don't re-create every time
let cachedAgentEntityId: string | null = null;

async function ensureAgent(
  client: HsafaClient
): Promise<string> {
  if (cachedAgentEntityId) return cachedAgentEntityId;

  // Create or get the agent config
  const { agentId } = await client.agents.create({
    name: "hsafa-assistant",
    config: AGENT_CONFIG,
  });

  // Create or get the agent entity
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
    const { name, email } = body as { name: string; email: string };

    if (!name || !email) {
      return Response.json(
        { error: "Name and email are required" },
        { status: 400 }
      );
    }

    const client = new HsafaClient({
      gatewayUrl: GATEWAY_URL,
      adminKey: ADMIN_KEY,
    });

    // 1. Ensure the agent + agent entity exist
    const agentEntityId = await ensureAgent(client);

    // 2. Create human entity with externalId = email (simulated auth)
    const { entity: human } = await client.entities.create({
      type: "human",
      externalId: email,
      displayName: name,
      metadata: { email },
    });

    // 3. Create a SmartSpace for this user + agent
    const { smartSpace } = await client.spaces.create({
      name: `${name}'s Chat`,
      visibility: "private",
    });

    // 4. Add human as admin
    await client.spaces.addMember(smartSpace.id, {
      entityId: human.id,
      role: "admin",
    });

    // 5. Add agent as member
    await client.spaces.addMember(smartSpace.id, {
      entityId: agentEntityId,
      role: "member",
    });

    return Response.json({
      entityId: human.id,
      smartSpaceId: smartSpace.id,
      secretKey: smartSpace.secretKey,
      publicKey: smartSpace.publicKey,
      agentEntityId,
      displayName: name,
    });
  } catch (error) {
    console.error("Registration error:", error);
    const message =
      error instanceof Error ? error.message : "Registration failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
