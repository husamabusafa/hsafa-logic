import { HsafaClient } from "@hsafa/node";

const GATEWAY_URL = process.env.HSAFA_GATEWAY_URL || "http://localhost:3001";
const ADMIN_KEY = process.env.HSAFA_ADMIN_KEY || "gk_default_admin_key";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email } = body as { email: string };

    if (!email) {
      return Response.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const client = new HsafaClient({
      gatewayUrl: GATEWAY_URL,
      adminKey: ADMIN_KEY,
    });

    // 1. Find the human entity by externalId (email)
    const { entities } = await client.entities.list({ type: "human" });
    const entity = entities.find((e) => e.externalId === email);

    if (!entity) {
      return Response.json(
        { error: "No account found with that email" },
        { status: 404 }
      );
    }

    // 2. Find spaces this entity is a member of
    const { smartSpaces } = await client.spaces.list({
      entityId: entity.id,
    });

    if (smartSpaces.length === 0) {
      return Response.json(
        { error: "No spaces found for this account" },
        { status: 404 }
      );
    }

    // 3. Use the first space (the one created during registration)
    const space = smartSpaces[0];

    // 4. Find the agent entity in this space
    const { members } = await client.spaces.listMembers(space.id);
    const agentMember = members.find(
      (m) => m.entity && m.entity.type === "agent"
    );

    return Response.json({
      entityId: entity.id,
      smartSpaceId: space.id,
      secretKey: space.secretKey,
      publicKey: space.publicKey,
      agentEntityId: agentMember?.entityId || "",
      displayName: entity.displayName || email,
    });
  } catch (error) {
    console.error("Login error:", error);
    const message =
      error instanceof Error ? error.message : "Login failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
