import { prisma } from "@/lib/db";
import { requireSecretKeyAuth } from "@/lib/spaces-auth";
import { invalidateSpace } from "@/lib/membership-service";
import { handleMembershipChanged } from "@/lib/extension";

type Params = {
  params: Promise<{ smartSpaceId: string; entityId: string }>;
};

// DELETE /api/smart-spaces/:smartSpaceId/members/:entityId — Remove member
export async function DELETE(request: Request, { params }: Params) {
  const { smartSpaceId, entityId } = await params;
  const auth = await requireSecretKeyAuth(request);
  if (auth instanceof Response) return auth;

  try {
    await prisma.smartSpaceMembership.delete({
      where: {
        smartSpaceId_entityId: { smartSpaceId, entityId },
      },
    });
    invalidateSpace(smartSpaceId);
    handleMembershipChanged(entityId, smartSpaceId, "removed");
    return Response.json({ success: true });
  } catch (error) {
    console.error("Remove member error:", error);
    return Response.json(
      { error: "Failed to remove member" },
      { status: 500 }
    );
  }
}
