import { spacesPrisma } from "@/lib/spaces-db";
import {
  requireSecretKeyAuth,
  requireAnyAuth,
} from "@/lib/spaces-auth";

// POST /api/smart-spaces — Create space
export async function POST(request: Request) {
  const auth = await requireSecretKeyAuth(request);
  if (auth instanceof Response) return auth;

  try {
    const { name, description, metadata } = await request.json();
    const smartSpace = await spacesPrisma.smartSpace.create({
      data: { name, description, metadata: metadata ?? undefined },
    });
    return Response.json({ smartSpace }, { status: 201 });
  } catch (error) {
    console.error("Create space error:", error);
    return Response.json({ error: "Failed to create space" }, { status: 500 });
  }
}

// GET /api/smart-spaces — List spaces
export async function GET(request: Request) {
  const auth = await requireAnyAuth(request);
  if (auth instanceof Response) return auth;

  try {
    const url = new URL(request.url);
    const filterEntityId =
      url.searchParams.get("entityId") ||
      (auth.method !== "secret_key" ? auth.entityId : undefined);

    let smartSpaces;
    if (filterEntityId) {
      const memberships = await spacesPrisma.smartSpaceMembership.findMany({
        where: { entityId: filterEntityId },
        include: { smartSpace: true },
      });
      smartSpaces = memberships.map((m: any) => m.smartSpace);
    } else if (auth.method === "secret_key") {
      smartSpaces = await spacesPrisma.smartSpace.findMany({
        orderBy: { createdAt: "desc" },
      });
    } else {
      return Response.json({ error: "No entity" }, { status: 403 });
    }

    return Response.json({ smartSpaces });
  } catch (error) {
    console.error("List spaces error:", error);
    return Response.json({ error: "Failed to list spaces" }, { status: 500 });
  }
}
