// =============================================================================
// Spaces Service — Shared Types & State (V5)
// =============================================================================

import Redis from "ioredis";

// =============================================================================
// Shared State (module-level singleton)
// =============================================================================

export interface ActiveConnection {
  haseefId: string;
  haseefName: string;
  agentEntityId: string;
  spaceIds: string[];
  /** runId → triggerSpaceId — routes tool streaming events to the correct space */
  runSpaces: Map<string, string>;
  /** Auto-set trigger space for the current run (set on run.started, cleared on run.finished) */
  activeSpace: { spaceId: string; spaceName: string } | null;
  /** Explicitly entered space (set by enter_space tool, persists across cycles until changed) */
  enteredSpace: { spaceId: string; spaceName: string } | null;
  /** Current run ID (set by run.started, cleared by run.finished) — used as fallback for space lookup */
  currentRunId: string | null;
  /** Current typing activity — 'typing' or 'recording'. */
  typingActivity: "typing" | "recording";
  /** Pending seen messages — flushed when run.started confirms events were consumed from inbox */
  pendingSeenMessages: Array<{ spaceId: string; messageId: string }>;
  /** Voice gender for TTS — "male" or "female" (read from haseef configJson.voice.gender) */
  voiceGender?: "male" | "female";
  /** Custom ElevenLabs voice ID override (read from haseef configJson.voice.voiceId) */
  voiceId?: string;
}

export interface ServiceState {
  config: import("./config.js").ServiceConfig | null;
  connections: Map<string, ActiveConnection>;
  /** Single shared Redis subscriber for all haseef stream bridges */
  sharedSubscriber: InstanceType<typeof Redis> | null;
  /** Redis client for action stream consumption (XREADGROUP) */
  actionConsumer: InstanceType<typeof Redis> | null;
  /** Whether the action listener loop is running */
  actionListenerRunning: boolean;
  /** Heartbeat interval for keeping haseef entities online */
  presenceInterval: ReturnType<typeof setInterval> | null;
}

export const state: ServiceState = {
  config: null,
  connections: new Map(),
  sharedSubscriber: null,
  actionConsumer: null,
  actionListenerRunning: false,
  presenceInterval: null,
};

/** Find all connections interested in a given space */
export function getConnectionsForSpace(
  spaceId: string,
): ActiveConnection[] {
  return [...state.connections.values()].filter((c) =>
    c.spaceIds.includes(spaceId),
  );
}

/** Get the live connection state for a specific haseef (used by context route) */
export function getConnectionForHaseef(haseefId: string): ActiveConnection | undefined {
  return state.connections.get(haseefId);
}
