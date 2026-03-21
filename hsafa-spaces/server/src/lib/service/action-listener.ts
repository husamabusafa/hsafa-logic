// =============================================================================
// Spaces Service — Action Listener (Redis Streams XREADGROUP)
//
// Listens for tool-call actions dispatched by Core for the "spaces" scope.
// Each action contains: actionId, name (tool name), args, mode.
// After execution, submits result back to Core.
// =============================================================================

import Redis from "ioredis";
import { state } from "./types.js";
import { SCOPE } from "./manifest.js";
import { executeAction } from "./tool-handlers.js";
import { submitActionResult } from "./core-api.js";

export async function startActionListener(): Promise<void> {
  if (state.actionListenerRunning) return;
  state.actionListenerRunning = true;

  // MUST use Core's Redis — actions are dispatched there by Core
  const redisUrl = state.config!.coreRedisUrl;
  const consumer = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  state.actionConsumer = consumer;

  const consumerGroup = `${SCOPE}-consumer`;
  const consumerName = `spaces-service-${Date.now()}`;

  // Create consumer groups for all connected haseef action streams
  for (const haseefId of state.connections.keys()) {
    const streamKey = `actions:${haseefId}:${SCOPE}`;
    try {
      await consumer.xgroup("CREATE", streamKey, consumerGroup, "0", "MKSTREAM");
    } catch (err: any) {
      if (!err.message?.includes("BUSYGROUP")) {
        console.error(`[spaces-service] Failed to create consumer group for ${streamKey}:`, err.message);
      }
    }
  }

  console.log(`[spaces-service] Action listener started (consumer: ${consumerName}, ${state.connections.size} haseefs)`);

  // Track streams that already have consumer groups (avoid re-creating every poll)
  const knownGroups = new Set<string>();
  for (const haseefId of state.connections.keys()) {
    knownGroups.add(`actions:${haseefId}:${SCOPE}`);
  }

  // Poll loop
  const poll = async () => {
    while (state.actionListenerRunning) {
      try {
        const streamKeys = [...state.connections.keys()].map(
          (id) => `actions:${id}:${SCOPE}`,
        );

        // If no haseefs connected, sleep and retry later
        if (streamKeys.length === 0) {
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }

        // Only create consumer groups for NEW streams (dynamically added haseefs)
        for (const streamKey of streamKeys) {
          if (knownGroups.has(streamKey)) continue;
          try {
            await consumer.xgroup("CREATE", streamKey, consumerGroup, "0", "MKSTREAM");
            knownGroups.add(streamKey);
          } catch (err: any) {
            if (err.message?.includes("BUSYGROUP")) {
              knownGroups.add(streamKey); // Already exists — remember it
            } else {
              console.warn(`[spaces-service] Failed to ensure consumer group for ${streamKey}:`, err.message);
            }
          }
        }

        const results = await (consumer as any).xreadgroup(
          "GROUP", consumerGroup, consumerName,
          "BLOCK", 5000,
          "STREAMS",
          ...streamKeys,
          ...Array(streamKeys.length).fill(">"),
        );

        if (!results) continue;

        for (const [streamKey, messages] of results) {
          // Extract haseefId from stream key: actions:{haseefId}:spaces
          const haseefId = (streamKey as string).split(":")[1];

          for (const [messageId, fields] of messages) {
            const data: Record<string, string> = {};
            for (let i = 0; i < fields.length; i += 2) {
              data[fields[i]] = fields[i + 1];
            }

            const actionId = data.actionId;
            const toolName = data.name;
            const args = data.args ? JSON.parse(data.args) : {};

            // Per-action try-catch: ALWAYS submit a result back to Core
            // to prevent Core from hanging indefinitely on sync actions.
            try {
              const result = await executeAction(haseefId, actionId, toolName, args);
              await submitActionResult(haseefId, actionId, result);
            } catch (actionErr: any) {
              const errMsg = actionErr instanceof Error ? actionErr.message : String(actionErr);
              console.error(`[spaces-service] Action failed (${toolName}/${actionId.slice(0, 8)}):`, errMsg);
              // Submit error result so Core doesn't hang
              try {
                await submitActionResult(haseefId, actionId, { error: errMsg });
              } catch (submitErr: any) {
                console.error(`[spaces-service] Failed to submit error result:`, submitErr.message);
              }
            }

            // ACK the message regardless of success/failure
            await (consumer as any).xack(streamKey, consumerGroup, messageId);
          }
        }
      } catch (err: any) {
        if (state.actionListenerRunning) {
          console.error("[spaces-service] Action stream error:", err.message);
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    }
  };

  poll().catch((err) => {
    console.error("[spaces-service] Action poll loop crashed:", err);
    state.actionListenerRunning = false;
  });
}
