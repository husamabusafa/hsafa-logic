import { prisma } from "@/lib/db";
import { requireAnyAuth } from "@/lib/spaces-auth";

type Params = { params: Promise<{ id: string }> };

// GET /api/entities/:id — Get entity
export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const auth = await requireAnyAuth(request);
  if (auth instanceof Response) return auth;

  try {
    const entity = await prisma.entity.findUnique({
      where: { id },
    });
    if (!entity) {
      return Response.json({ error: "Entity not found" }, { status: 404 });
    }
    return Response.json({ entity });
  } catch (error) {
    console.error("Get entity error:", error);
    return Response.json(
      { error: "Failed to get entity" },
      { status: 500 }
    );
  }
}
