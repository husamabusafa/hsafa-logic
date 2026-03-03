import Redis from "ioredis";
import { requireAuthWithMembership } from "@/lib/spaces-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ smartSpaceId: string }> };

// GET /api/smart-spaces/:smartSpaceId/stream — SSE event stream
export async function GET(request: Request, { params }: Params) {
  const { smartSpaceId } = await params;
  const auth = await requireAuthWithMembership(request, smartSpaceId);
  if (auth instanceof Response) return auth;

  const encoder = new TextEncoder();
  const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

  const stream = new ReadableStream({
    start(controller) {
      const subscriber = new Redis(REDIS_URL, {
        maxRetriesPerRequest: null,
      });
      const channel = `smartspace:${smartSpaceId}`;

      // Send connected event
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: "connected", smartSpaceId })}\n\n`
        )
      );

      subscriber
        .subscribe(channel)
        .then(() => {
          subscriber.on("message", (_ch: string, message: string) => {
            try {
              controller.enqueue(encoder.encode(`data: ${message}\n\n`));
            } catch {
              // Stream closed
            }
          });
        })
        .catch((err: Error) => {
          console.error("SSE subscribe error:", err);
        });

      // Keepalive ping every 30s
      const pingInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          clearInterval(pingInterval);
        }
      }, 30_000);

      // Cleanup on client disconnect
      request.signal.addEventListener("abort", () => {
        clearInterval(pingInterval);
        subscriber.unsubscribe(channel).catch(() => {});
        subscriber.disconnect();
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
