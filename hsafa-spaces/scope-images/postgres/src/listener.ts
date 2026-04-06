// =============================================================================
// Postgres Scope — LISTEN/NOTIFY Listener (standalone)
//
// Maintains a dedicated pg.Client connection that listens on the
// "hsafa_watches" channel. When a watch trigger fires, it parses the
// payload and calls the provided callback.
// =============================================================================

import pg from "pg";

export interface WatchNotification {
  watchId: string;
  table: string;
  op: string;
  row: Record<string, unknown>;
}

type NotifyCallback = (payload: WatchNotification) => void;

let client: pg.Client | null = null;
let onNotify: NotifyCallback | null = null;
let connectionString: string | null = null;

const CHANNEL = "hsafa_watches";
const BASE_RECONNECT_MS = 5_000;
const MAX_RECONNECT_MS = 60_000;
let reconnectAttempt = 0;

/** Set the global callback for watch notifications. */
export function setNotifyCallback(cb: NotifyCallback): void {
  onNotify = cb;
}

/** Start listening on the target DB. Reconnects automatically on error. */
export async function startListener(connStr: string): Promise<void> {
  connectionString = connStr;
  if (client) return;
  await connectListener();
}

/** Stop the listener. */
export async function stopListener(): Promise<void> {
  const c = client;
  client = null;
  connectionString = null;
  reconnectAttempt = 0;
  if (c) {
    try { await c.end(); } catch { /* ignore */ }
  }
}

// =============================================================================
// Internal — connect + reconnect
// =============================================================================

async function connectListener(): Promise<void> {
  if (!connectionString) return;

  const c = new pg.Client({ connectionString });

  c.on("notification", (msg) => {
    if (!msg.payload || !onNotify) return;
    try {
      const payload = JSON.parse(msg.payload) as WatchNotification;
      onNotify(payload);
    } catch {
      console.error("[postgres-listener] Failed to parse notification payload");
    }
  });

  c.on("error", (err) => {
    console.error(`[postgres-listener] Connection error:`, err.message);
    client = null;
    // Reconnect with exponential backoff
    reconnectAttempt++;
    const delay = Math.min(BASE_RECONNECT_MS * 2 ** (reconnectAttempt - 1), MAX_RECONNECT_MS);
    console.log(`[postgres-listener] Reconnecting in ${(delay / 1000).toFixed(0)}s (attempt ${reconnectAttempt})...`);
    setTimeout(() => {
      if (!client && connectionString) {
        connectListener().catch(() => {});
      }
    }, delay);
  });

  try {
    await c.connect();
    await c.query(`LISTEN ${CHANNEL}`);
    client = c;
    reconnectAttempt = 0;
    console.log(`[postgres-listener] Listening on "${CHANNEL}"`);
  } catch (err) {
    reconnectAttempt++;
    const delay = Math.min(BASE_RECONNECT_MS * 2 ** (reconnectAttempt - 1), MAX_RECONNECT_MS);
    console.error(`[postgres-listener] Failed to connect:`, (err as Error).message);
    console.log(`[postgres-listener] Retrying in ${(delay / 1000).toFixed(0)}s (attempt ${reconnectAttempt})...`);
    setTimeout(() => {
      if (!client && connectionString) {
        connectListener().catch(() => {});
      }
    }, delay);
  }
}
