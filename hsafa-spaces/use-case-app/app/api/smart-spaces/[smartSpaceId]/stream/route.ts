import Redis from "ioredis";
import { requireAuthWithMembership } from "@/lib/spaces-auth";
import { redis } from "@/lib/redis";
import { emitSmartSpaceEvent } from "@/lib/smartspace-events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ smartSpaceId: string }> };

// GET /api/smart-spaces/:smartSpaceId/stream — SSE event stream
export async function GET(request: Request, { params }: Params) {
  const { smartSpaceId } = await params;
  const auth = await requireAuthWithMembership(request, smartSpaceId);
  if (auth instanceof Response) return auth;

  const entityId = auth.entityId;
  const onlineKey = `smartspace:${smartSpaceId}:online`;

  const encoder = new TextEncoder();
  const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

  const stream = new ReadableStream({
    async start(controller) {
      const subscriber = new Redis(REDIS_URL, {
        maxRetriesPerRequest: null,
      });
      const channel = `smartspace:${smartSpaceId}`;

      // Track user presence — only for authenticated entities
      if (entityId) {
        const count = await redis.hincrby(onlineKey, entityId, 1);
        if (count === 1) {
          emitSmartSpaceEvent(smartSpaceId, {
            type: "user.online",
            entityId,
            data: { entityId },
          }).catch(() => {});
        }
      }

      // Include current online users in connected event
      const onlineUsers = await redis.hkeys(onlineKey);

      // Send connected event
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: "connected", smartSpaceId, onlineUsers })}\n\n`
        )
      );

      subscriber
        .subscribe(channel)
        .then(() => {
          subscriber.on("message", (_ch: string, message: string) => {
            try {
              // Parse the event type from the payload for named SSE events
              const parsed = JSON.parse(message);
              const eventType = parsed.type || "message";
              controller.enqueue(
                encoder.encode(`event: ${eventType}\ndata: ${message}\n\n`)
              );
            } catch {
              // Stream closed or parse error
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
        // User offline tracking
        if (entityId) {
          redis.hincrby(onlineKey, entityId, -1).then((count) => {
            if (count <= 0) {
              redis.hdel(onlineKey, entityId).catch(() => {});
              emitSmartSpaceEvent(smartSpaceId, {
                type: "user.offline",
                entityId,
                data: { entityId },
              }).catch(() => {});
            }
          }).catch(() => {});
        }
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
