import { prisma } from "@/lib/db";
import { requireAuthWithMembership } from "@/lib/spaces-auth";

type Params = { params: Promise<{ smartSpaceId: string }> };

// PATCH /api/smart-spaces/:smartSpaceId/read — Mark messages as seen
export async function PATCH(request: Request, { params }: Params) {
  const { smartSpaceId } = await params;
  const auth = await requireAuthWithMembership(request, smartSpaceId);
  if (auth instanceof Response) return auth;

  try {
    const entityId = auth.entityId;
    const { lastSeenMessageId } = await request.json();

    if (!entityId || !lastSeenMessageId) {
      return Response.json(
        { error: "lastSeenMessageId is required" },
        { status: 400 }
      );
    }

    await prisma.smartSpaceMembership.update({
      where: { smartSpaceId_entityId: { smartSpaceId, entityId } },
      data: { lastSeenMessageId },
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("Read receipt error:", error);
    return Response.json(
      { error: "Failed to update read receipt" },
      { status: 500 }
    );
  }
}
