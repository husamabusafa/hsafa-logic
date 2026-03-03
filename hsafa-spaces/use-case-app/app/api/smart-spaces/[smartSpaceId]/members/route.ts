import { spacesPrisma } from "@/lib/spaces-db";
import {
  requireSecretKeyAuth,
  requireAuthWithMembership,
} from "@/lib/spaces-auth";
import { invalidateSpace } from "@/lib/membership-service";

type Params = { params: Promise<{ smartSpaceId: string }> };

// POST /api/smart-spaces/:smartSpaceId/members — Add member
export async function POST(request: Request, { params }: Params) {
  const { smartSpaceId } = await params;
  const auth = await requireSecretKeyAuth(request);
  if (auth instanceof Response) return auth;

  try {
    const { entityId, role } = await request.json();
    const membership = await spacesPrisma.smartSpaceMembership.create({
      data: {
        smartSpaceId,
        entityId,
        role: role ?? undefined,
      },
    });
    invalidateSpace(smartSpaceId);
    return Response.json({ membership }, { status: 201 });
  } catch (error) {
    console.error("Add member error:", error);
    return Response.json({ error: "Failed to add member" }, { status: 500 });
  }
}

// GET /api/smart-spaces/:smartSpaceId/members — List members
export async function GET(request: Request, { params }: Params) {
  const { smartSpaceId } = await params;
  const auth = await requireAuthWithMembership(request, smartSpaceId);
  if (auth instanceof Response) return auth;

  try {
    const memberships = await spacesPrisma.smartSpaceMembership.findMany({
      where: { smartSpaceId },
      include: {
        entity: { select: { id: true, type: true, displayName: true } },
      },
    });
    return Response.json({ members: memberships });
  } catch (error) {
    console.error("List members error:", error);
    return Response.json({ error: "Failed to list members" }, { status: 500 });
  }
}
