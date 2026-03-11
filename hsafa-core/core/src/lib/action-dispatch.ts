import { redis } from './redis.js';

// =============================================================================
// Action Dispatch (v5)
//
// Dispatches tool-call actions to external services via Redis Streams.
// Services consume actions with XREADGROUP per scope.
//
// For sync mode, Core subscribes to action_result:{actionId} (Pub/Sub)
// BEFORE dispatching — avoids race condition.
//
// Redis keys:
//   actions:{haseefId}:{scope}  — Stream (Core XADDs, services XREADGROUP)
//   action_result:{actionId}    — Pub/Sub (sync action results)
// =============================================================================

const DEFAULT_ACTION_TIMEOUT = 60_000; // 60s

/**
 * Dispatch an action to a scope's Redis Stream and optionally wait for a result.
 */
export async function dispatchAction(opts: {
  haseefId: string;
  scope: string;
  actionId: string;
  toolName: string;
  args: Record<string, unknown>;
  mode: 'sync' | 'fire_and_forget' | 'async';
  timeout?: number;
}): Promise<unknown> {
  const { haseefId, scope, actionId, toolName, args, mode, timeout } = opts;
  const streamKey = `actions:${haseefId}:${scope}`;

  if (mode === 'sync') {
    // Subscribe BEFORE dispatching to avoid race condition
    const result = await syncDispatch(streamKey, actionId, toolName, args, timeout ?? DEFAULT_ACTION_TIMEOUT);
    return result;
  }

  // fire_and_forget or async: just XADD and return immediately
  await redis.xadd(
    streamKey, '*',
    'actionId', actionId,
    'name', toolName,
    'args', JSON.stringify(args),
    'mode', mode,
  );

  if (mode === 'fire_and_forget') {
    return { ok: true };
  }

  // async: result arrives as a future event
  return { status: 'pending', actionId };
}

/**
 * Sync dispatch: subscribe to result channel, XADD action, wait with timeout.
 */
async function syncDispatch(
  streamKey: string,
  actionId: string,
  toolName: string,
  args: Record<string, unknown>,
  timeout: number,
): Promise<unknown> {
  const resultChannel = `action_result:${actionId}`;
  const dispatchStart = Date.now();

  return new Promise<unknown>(async (resolve) => {
    // Create a dedicated subscriber for this action
    const sub = redis.duplicate();
    let settled = false;

    const cleanup = () => {
      if (!settled) {
        settled = true;
        sub.unsubscribe(resultChannel).catch(() => {});
        sub.quit().catch(() => {});
      }
    };

    // Set timeout
    const timer = setTimeout(() => {
      const elapsed = Date.now() - dispatchStart;
      console.error(`[action-dispatch] TIMEOUT: ${toolName} (${actionId.slice(0, 8)}) after ${elapsed}ms — no result received`);
      cleanup();
      resolve({
        error: `Action "${toolName}" timed out after ${timeout}ms`,
        actionId,
      });
    }, timeout);

    // Subscribe for result
    sub.on('message', (_ch: string, message: string) => {
      const elapsed = Date.now() - dispatchStart;
      clearTimeout(timer);
      cleanup();
      if (elapsed > 2000) {
        console.warn(`[action-dispatch] SLOW: ${toolName} (${actionId.slice(0, 8)}) took ${elapsed}ms`);
      }
      try {
        resolve(JSON.parse(message));
      } catch {
        resolve({ result: message });
      }
    });

    await sub.subscribe(resultChannel);

    // Now XADD the action (after subscription is active)
    await redis.xadd(
      streamKey, '*',
      'actionId', actionId,
      'name', toolName,
      'args', JSON.stringify(args),
      'mode', 'sync',
    );
  });
}

/**
 * Submit an action result — called by services via the API.
 * Publishes to the Pub/Sub channel that syncDispatch is listening on.
 */
export async function submitActionResult(
  actionId: string,
  result: unknown,
): Promise<void> {
  const resultChannel = `action_result:${actionId}`;
  await redis.publish(resultChannel, JSON.stringify(result));
}

/**
 * Ensure a consumer group exists for a scope's action stream.
 * Called when a service starts consuming actions for a scope.
 */
export async function ensureConsumerGroup(
  haseefId: string,
  scope: string,
  groupName: string,
): Promise<void> {
  const streamKey = `actions:${haseefId}:${scope}`;
  try {
    await redis.xgroup('CREATE', streamKey, groupName, '0', 'MKSTREAM');
  } catch (err: any) {
    // BUSYGROUP = group already exists, which is fine
    if (!err.message?.includes('BUSYGROUP')) throw err;
  }
}
