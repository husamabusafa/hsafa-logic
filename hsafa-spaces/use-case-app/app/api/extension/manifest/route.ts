import { MANIFEST } from "@/lib/extension/manifest";

// GET /api/extension/manifest — Served to Core when it fetches the manifest
export async function GET() {
  return Response.json(MANIFEST);
}
