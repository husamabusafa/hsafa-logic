// =============================================================================
// Spaces Service Configuration (V5)
//
// Reads env vars for the spaces service connection to hsafa-core.
// The spaces-app acts as a V5 service: registers tools under the "spaces"
// scope, listens for actions via Redis Streams, and pushes sense events.
// =============================================================================

export interface ServiceConfig {
  /** Core API base URL (e.g. http://localhost:3001) */
  coreUrl: string;
  /** V5 API key for authenticating with Core (x-api-key header) */
  apiKey: string;
}

export function loadServiceConfig(): ServiceConfig | null {
  const coreUrl = process.env.HSAFA_GATEWAY_URL || process.env.CORE_URL;
  const apiKey = process.env.CORE_API_KEY || process.env.EXTENSION_KEY;

  if (!coreUrl || !apiKey) {
    console.warn(
      "[spaces-service] Missing env vars (HSAFA_GATEWAY_URL/CORE_URL, CORE_API_KEY) — service disabled",
    );
    return null;
  }

  return { coreUrl, apiKey };
}
