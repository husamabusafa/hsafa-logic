// =============================================================================
// Spaces Service — Core API Helpers (v7)
//
// HTTP calls to hsafa-core for instruction sync and sense events.
// v7: Tools registered globally by scope-registry via SDK.registerTools().
//     Per-haseef instructions pushed via PATCH /api/haseefs/:id configJson.
//     submitActionResult removed — SDK handles result posting internally.
// =============================================================================

import { state } from "./types.js";
import { getLoadedPlugins } from "./scope-registry.js";

export function coreHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-api-key": state.config!.apiKey,
  };
}

// =============================================================================
// Instruction Sync — push per-haseef dynamic instructions to Core
// =============================================================================

/**
 * Build and push per-haseef scope instructions to Core via PATCH configJson.
 *
 * In v7, tools are registered globally by the scope registry — this only pushes
 * the dynamic context (YOUR BASES, YOUR SPACES, YOUR SCHEDULES, etc.) into
 * the haseef's prompt.
 *
 * Each loaded plugin contributes:
 *   - staticInstructions (always included)
 *   - getDynamicInstructions(haseefId) (per-haseef context, if implemented)
 */
export async function syncInstructions(haseefId: string): Promise<void> {
  const instructions = await buildAllInstructions(haseefId);

  try {
    // Read current haseef configJson to avoid overwriting model/voice config
    const getUrl = `${state.config!.coreUrl}/api/haseefs/${haseefId}`;
    const getRes = await fetch(getUrl, { headers: coreHeaders() });
    if (!getRes.ok) {
      console.warn(`[core-api] Failed to read haseef ${haseefId}: ${getRes.status}`);
      return;
    }
    const { haseef } = (await getRes.json()) as { haseef: { configJson: Record<string, unknown> } };
    const currentConfig = haseef?.configJson ?? {};

    const patchUrl = `${state.config!.coreUrl}/api/haseefs/${haseefId}`;
    const patchRes = await fetch(patchUrl, {
      method: "PATCH",
      headers: coreHeaders(),
      body: JSON.stringify({ configJson: { ...currentConfig, instructions } }),
    });
    if (!patchRes.ok) {
      const text = await patchRes.text();
      console.warn(`[core-api] Failed to sync instructions for ${haseefId}: ${patchRes.status} ${text}`);
    }
  } catch (err) {
    console.warn(`[core-api] syncInstructions error for ${haseefId}:`, err);
  }
}


// =============================================================================
// Instruction Assembly — centralized, queries all loaded plugins
// =============================================================================

/**
 * Build combined instructions for all loaded plugins.
 *
 * For each plugin:
 *   1. Include staticInstructions (if any)
 *   2. Call getDynamicInstructions(haseefId) (if implemented)
 * Sections are joined with dividers.
 */
async function buildAllInstructions(haseefId: string): Promise<string> {
  const sections: string[] = [];

  for (const plugin of getLoadedPlugins()) {
    const pluginSections: string[] = [];

    // Static instructions (scope-level, same for all haseefs)
    if (plugin.staticInstructions) {
      pluginSections.push(plugin.staticInstructions);
    }

    // Dynamic instructions (per-haseef context)
    if (plugin.getDynamicInstructions) {
      try {
        const dynamic = await plugin.getDynamicInstructions(haseefId);
        if (dynamic) pluginSections.push(dynamic);
      } catch {
        // Non-fatal — skip if dynamic instruction provider fails
      }
    }

    if (pluginSections.length > 0) {
      sections.push(pluginSections.join('\n\n'));
    }
  }

  return sections.filter(Boolean).join('\n\n---\n\n');
}

/** POST /api/events — Push sense events (v7 global events endpoint) */
export async function pushSenseEvent(
  haseefId: string,
  event: {
    eventId: string;
    scope: string;
    type: string;
    data: Record<string, unknown>;
    attachments?: Array<{ type: "image" | "audio" | "file"; mimeType: string; url?: string; name?: string }>;
    timestamp?: string;
  },
): Promise<void> {
  const url = `${state.config!.coreUrl}/api/events`;
  const body: Record<string, unknown> = {
    haseefId,
    scope: event.scope,
    type: event.type,
    data: event.data,
  };
  if (event.attachments && event.attachments.length > 0) {
    body.attachments = event.attachments;
  }
  const res = await fetch(url, {
    method: "POST",
    headers: coreHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`pushSenseEvent failed: ${res.status} ${text}`);
  }
}

// NOTE: submitActionResult was removed in v7. The @hsafa/sdk handles
// posting tool call results internally after onToolCall handlers return.
