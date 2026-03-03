import { prisma } from "@/lib/db";
import { requireSecretKeyAuth } from "@/lib/spaces-auth";

type Params = { params: Promise<{ id: string }> };

// DELETE /api/clients/:id — Delete client
export async function DELETE(request: Request, { params }: Params) {
  const { id } = await params;
  const auth = await requireSecretKeyAuth(request);
  if (auth instanceof Response) return auth;

  try {
    await prisma.client.delete({ where: { id } });
    return Response.json({ success: true });
  } catch (error) {
    console.error("Delete client error:", error);
    return Response.json(
      { error: "Failed to delete client" },
      { status: 500 }
    );
  }
}
