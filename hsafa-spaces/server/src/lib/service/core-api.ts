// =============================================================================
// Spaces Service — V5 Core API Helpers
//
// HTTP calls to hsafa-core for tool sync, sense events, and action results.
// =============================================================================

import { state } from "./types.js";
import { SCOPE, SCOPE_INSTRUCTIONS, TOOLS } from "./manifest.js";

export function coreHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-api-key": state.config!.apiKey,
  };
}

/** PUT /api/haseefs/:id/scopes/:scope/tools — Sync all tools + scope instructions */
export async function syncTools(haseefId: string): Promise<void> {
  const url = `${state.config!.coreUrl}/api/haseefs/${haseefId}/scopes/${SCOPE}/tools`;
  const res = await fetch(url, {
    method: "PUT",
    headers: coreHeaders(),
    body: JSON.stringify({ tools: TOOLS, instructions: SCOPE_INSTRUCTIONS }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`syncTools failed for ${haseefId}: ${res.status} ${text}`);
  }
}

/** POST /api/haseefs/:id/events — Push V5 sense events */
export async function pushSenseEvent(
  haseefId: string,
  event: {
    eventId: string;
    scope: string;
    type: string;
    data: Record<string, unknown>;
    timestamp?: string;
  },
): Promise<void> {
  const url = `${state.config!.coreUrl}/api/haseefs/${haseefId}/events`;
  const res = await fetch(url, {
    method: "POST",
    headers: coreHeaders(),
    body: JSON.stringify({
      eventId: event.eventId,
      scope: event.scope,
      type: event.type,
      data: event.data,
      timestamp: event.timestamp ?? new Date().toISOString(),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`pushSenseEvent failed: ${res.status} ${text}`);
  }
}

/** POST /api/haseefs/:id/actions/:actionId/result — Submit action result */
export async function submitActionResult(
  haseefId: string,
  actionId: string,
  result: unknown,
): Promise<void> {
  const url = `${state.config!.coreUrl}/api/haseefs/${haseefId}/actions/${actionId}/result`;
  console.log(`[spaces-service] submitActionResult: POST ${url.replace(state.config!.coreUrl, '')} (actionId=${actionId.slice(0, 8)})`);
  const res = await fetch(url, {
    method: "POST",
    headers: coreHeaders(),
    body: JSON.stringify(result),
  });
  if (!res.ok) {
    const text = await res.text();
    const errMsg = `submitActionResult failed: ${res.status} ${text}`;
    console.error(`[spaces-service] ${errMsg}`);
    throw new Error(errMsg);
  }
  console.log(`[spaces-service] submitActionResult: OK (actionId=${actionId.slice(0, 8)})`);
}
