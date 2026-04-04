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
const RECONNECT_DELAY_MS = 5_000;

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
    // Reconnect after delay
    setTimeout(() => {
      if (!client && connectionString) {
        connectListener().catch(() => {});
      }
    }, RECONNECT_DELAY_MS);
  });

  try {
    await c.connect();
    await c.query(`LISTEN ${CHANNEL}`);
    client = c;
    console.log(`[postgres-listener] Listening on "${CHANNEL}"`);
  } catch (err) {
    console.error(`[postgres-listener] Failed to connect:`, err);
    setTimeout(() => {
      if (!client && connectionString) {
        connectListener().catch(() => {});
      }
    }, RECONNECT_DELAY_MS);
  }
}
