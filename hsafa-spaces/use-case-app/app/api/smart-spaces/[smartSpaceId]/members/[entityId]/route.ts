import { spacesPrisma } from "@/lib/spaces-db";
import { requireSecretKeyAuth } from "@/lib/spaces-auth";
import { invalidateSpace } from "@/lib/membership-service";

type Params = {
  params: Promise<{ smartSpaceId: string; entityId: string }>;
};

// DELETE /api/smart-spaces/:smartSpaceId/members/:entityId — Remove member
export async function DELETE(request: Request, { params }: Params) {
  const { smartSpaceId, entityId } = await params;
  const auth = await requireSecretKeyAuth(request);
  if (auth instanceof Response) return auth;

  try {
    await spacesPrisma.smartSpaceMembership.delete({
      where: {
        smartSpaceId_entityId: { smartSpaceId, entityId },
      },
    });
    invalidateSpace(smartSpaceId);
    return Response.json({ success: true });
  } catch (error) {
    console.error("Remove member error:", error);
    return Response.json(
      { error: "Failed to remove member" },
      { status: 500 }
    );
  }
}
