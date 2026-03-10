import { SCOPE, TOOLS } from "@/lib/extension/manifest";

// GET /api/extension/manifest — Returns V5 scope and tool definitions
export async function GET() {
  return Response.json({ scope: SCOPE, tools: TOOLS });
}
