import { handleToolCall, handleLifecycle } from "@/lib/extension";

// POST /api/extension/webhook — Receives tool_call + lifecycle events from Core
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const type = body.type as string;

    if (type === "tool_call") {
      const result = await handleToolCall(body);
      return Response.json(result);
    }

    if (type?.startsWith("haseef.")) {
      // Lifecycle events — handle async, respond immediately
      handleLifecycle(body).catch((err) =>
        console.error(`[extension/webhook] Lifecycle error (${type}):`, err),
      );
      return Response.json({ ok: true });
    }

    return Response.json(
      { error: `Unknown webhook type: ${type}` },
      { status: 400 },
    );
  } catch (err) {
    console.error("[extension/webhook] Error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
