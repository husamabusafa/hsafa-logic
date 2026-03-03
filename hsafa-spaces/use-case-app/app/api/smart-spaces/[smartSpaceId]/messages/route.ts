import { spacesPrisma } from "@/lib/spaces-db";
import { requireAuthWithMembership } from "@/lib/spaces-auth";
import { postSpaceMessage } from "@/lib/space-service";

// BigInt JSON serialization
(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};

type Params = { params: Promise<{ smartSpaceId: string }> };

// POST /api/smart-spaces/:smartSpaceId/messages — Send message
export async function POST(request: Request, { params }: Params) {
  const { smartSpaceId } = await params;
  const auth = await requireAuthWithMembership(request, smartSpaceId);
  if (auth instanceof Response) return auth;

  try {
    let { entityId, content, metadata: msgMeta } = await request.json();

    // Anti-impersonation: force entityId from JWT for public_key_jwt auth
    if (auth.method === "public_key_jwt") {
      entityId = auth.entityId;
    }

    if (!entityId || !content) {
      return Response.json(
        { error: "entityId and content are required" },
        { status: 400 }
      );
    }

    // Persist + emit SSE (no inbox fan-out — ext-spaces handles that)
    const result = await postSpaceMessage({
      spaceId: smartSpaceId,
      entityId,
      role: "user",
      content,
      metadata: msgMeta ?? undefined,
    });

    // Return the message in the response
    const message = await spacesPrisma.smartSpaceMessage.findUnique({
      where: { id: result.messageId },
    });

    return Response.json({ message }, { status: 201 });
  } catch (error) {
    console.error("Send message error:", error);
    return Response.json(
      { error: "Failed to send message" },
      { status: 500 }
    );
  }
}

// GET /api/smart-spaces/:smartSpaceId/messages — List messages
export async function GET(request: Request, { params }: Params) {
  const { smartSpaceId } = await params;
  const auth = await requireAuthWithMembership(request, smartSpaceId);
  if (auth instanceof Response) return auth;

  try {
    const url = new URL(request.url);
    const limit = Math.min(
      parseInt(url.searchParams.get("limit") || "50"),
      200
    );
    const afterSeq = url.searchParams.get("afterSeq")
      ? BigInt(url.searchParams.get("afterSeq")!)
      : undefined;
    const beforeSeq = url.searchParams.get("beforeSeq")
      ? BigInt(url.searchParams.get("beforeSeq")!)
      : undefined;

    const where: Record<string, unknown> = { smartSpaceId };
    if (afterSeq !== undefined) where.seq = { gt: afterSeq };
    if (beforeSeq !== undefined)
      where.seq = { ...((where.seq as any) ?? {}), lt: beforeSeq };

    const messages = await spacesPrisma.smartSpaceMessage.findMany({
      where,
      orderBy: { seq: "desc" },
      take: limit,
      include: {
        entity: { select: { id: true, displayName: true, type: true } },
      },
    });

    return Response.json({ messages: messages.reverse() });
  } catch (error) {
    console.error("List messages error:", error);
    return Response.json(
      { error: "Failed to list messages" },
      { status: 500 }
    );
  }
}
