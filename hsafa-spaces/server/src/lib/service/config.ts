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
  /** Core's Redis URL — used for action streams + stream bridge (may differ from spaces Redis) */
  coreRedisUrl: string;
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

  // Core's Redis URL — actions and stream bridge MUST connect to Core's Redis,
  // not the spaces-app's own Redis (they may be different instances).
  const coreRedisUrl = process.env.CORE_REDIS_URL || process.env.REDIS_URL || "redis://localhost:6379";

  return { coreUrl, apiKey, coreRedisUrl };
}
