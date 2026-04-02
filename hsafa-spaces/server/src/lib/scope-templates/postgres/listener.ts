// =============================================================================
// Postgres Scope — LISTEN/NOTIFY Listener
//
// Maintains a dedicated pg.Client connection per instance that listens on
// the "hsafa_watches" channel. When a watch trigger fires, it parses the
// payload and calls the provided callback.
// =============================================================================

import pg from "pg";

export interface WatchNotification {
  watchId: string;
  table: string;
  op: string;
  row: Record<string, unknown>;
}

type NotifyCallback = (instanceId: string, payload: WatchNotification) => void;

const listeners = new Map<string, pg.Client>();
let onNotify: NotifyCallback | null = null;

const CHANNEL = "hsafa_watches";
const RECONNECT_DELAY_MS = 5_000;

/** Set the global callback for watch notifications. */
export function setNotifyCallback(cb: NotifyCallback): void {
  onNotify = cb;
}

/** Start listening on a pg instance. Reconnects automatically on error. */
export async function startListener(
  instanceId: string,
  connectionString: string,
): Promise<void> {
  if (listeners.has(instanceId)) return;
  await connectListener(instanceId, connectionString);
}

/** Stop a single listener. */
export async function stopListener(instanceId: string): Promise<void> {
  const client = listeners.get(instanceId);
  if (!client) return;
  listeners.delete(instanceId);
  try {
    await client.end();
  } catch {
    /* ignore */
  }
}

/** Stop all listeners. */
export async function stopAllListeners(): Promise<void> {
  for (const [id] of listeners) {
    await stopListener(id);
  }
}

// =============================================================================
// Internal — connect + reconnect
// =============================================================================

async function connectListener(
  instanceId: string,
  connectionString: string,
): Promise<void> {
  const client = new pg.Client({ connectionString });

  client.on("notification", (msg) => {
    if (!msg.payload || !onNotify) return;
    try {
      const payload = JSON.parse(msg.payload) as WatchNotification;
      onNotify(instanceId, payload);
    } catch {
      console.error("[postgres-listener] Failed to parse notification payload");
    }
  });

  client.on("error", (err) => {
    console.error(`[postgres-listener] Connection error (${instanceId}):`, err.message);
    listeners.delete(instanceId);
    // Reconnect after delay
    setTimeout(() => {
      if (!listeners.has(instanceId)) {
        connectListener(instanceId, connectionString).catch(() => {});
      }
    }, RECONNECT_DELAY_MS);
  });

  try {
    await client.connect();
    await client.query(`LISTEN ${CHANNEL}`);
    listeners.set(instanceId, client);
    console.log(`[postgres-listener] Listening on "${CHANNEL}" (${instanceId.slice(0, 8)})`);
  } catch (err) {
    console.error(`[postgres-listener] Failed to connect (${instanceId}):`, err);
    // Retry after delay
    setTimeout(() => {
      connectListener(instanceId, connectionString).catch(() => {});
    }, RECONNECT_DELAY_MS);
  }
}
