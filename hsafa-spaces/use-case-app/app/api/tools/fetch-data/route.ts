import { NextRequest, NextResponse } from "next/server";

/**
 * External tool endpoint — called by the gateway when an agent uses fetchExternalData.
 * Logs the request and returns example data.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  console.log("[tools/fetch-data] Received request:", JSON.stringify(body, null, 2));

  const query = (body.query as string) ?? "default";

  // Return example data based on the query
  const exampleData: Record<string, unknown> = {
    source: "use-case-app",
    query,
    timestamp: new Date().toISOString(),
    results: [
      { id: 1, title: "Project Alpha", status: "active", progress: 78 },
      { id: 2, title: "Project Beta", status: "completed", progress: 100 },
      { id: 3, title: "Project Gamma", status: "planning", progress: 12 },
    ],
    summary: `Found 3 results for query "${query}". This data was fetched from the Next.js external API.`,
  };

  console.log("[tools/fetch-data] Returning:", JSON.stringify(exampleData, null, 2));

  return NextResponse.json(exampleData);
}
