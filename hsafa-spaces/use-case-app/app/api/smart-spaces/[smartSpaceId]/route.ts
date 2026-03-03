import { spacesPrisma } from "@/lib/spaces-db";
import {
  requireSecretKeyAuth,
  requireAuthWithMembership,
} from "@/lib/spaces-auth";

type Params = { params: Promise<{ smartSpaceId: string }> };

// GET /api/smart-spaces/:smartSpaceId — Get space
export async function GET(request: Request, { params }: Params) {
  const { smartSpaceId } = await params;
  const auth = await requireAuthWithMembership(request, smartSpaceId);
  if (auth instanceof Response) return auth;

  try {
    const smartSpace = await spacesPrisma.smartSpace.findUnique({
      where: { id: smartSpaceId },
    });
    if (!smartSpace) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json({ smartSpace });
  } catch (error) {
    console.error("Get space error:", error);
    return Response.json({ error: "Failed to get space" }, { status: 500 });
  }
}

// PATCH /api/smart-spaces/:smartSpaceId — Update space
export async function PATCH(request: Request, { params }: Params) {
  const { smartSpaceId } = await params;
  const auth = await requireSecretKeyAuth(request);
  if (auth instanceof Response) return auth;

  try {
    const { name, description, metadata } = await request.json();
    const smartSpace = await spacesPrisma.smartSpace.update({
      where: { id: smartSpaceId },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(metadata !== undefined && { metadata }),
      },
    });
    return Response.json({ smartSpace });
  } catch (error) {
    console.error("Update space error:", error);
    return Response.json({ error: "Failed to update space" }, { status: 500 });
  }
}

// DELETE /api/smart-spaces/:smartSpaceId — Delete space
export async function DELETE(request: Request, { params }: Params) {
  const { smartSpaceId } = await params;
  const auth = await requireSecretKeyAuth(request);
  if (auth instanceof Response) return auth;

  try {
    await spacesPrisma.smartSpace.delete({ where: { id: smartSpaceId } });
    return Response.json({ success: true });
  } catch (error) {
    console.error("Delete space error:", error);
    return Response.json({ error: "Failed to delete space" }, { status: 500 });
  }
}
