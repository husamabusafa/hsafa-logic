// POST /api/extension/webhook — DEPRECATED in V5
//
// In V5, tool-call actions are dispatched via Redis Streams, not webhooks.
// This route is kept for backward compatibility but returns a notice.
export async function POST() {
  return Response.json(
    {
      error: "This endpoint is deprecated in V5. Actions are dispatched via Redis Streams.",
      see: "https://github.com/hsafa/hsafa-core/blob/main/V5_PLAN.md",
    },
    { status: 410 },
  );
}
