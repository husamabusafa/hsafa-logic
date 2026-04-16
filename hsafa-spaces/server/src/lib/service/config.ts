// =============================================================================
// Spaces Service Configuration
//
// Reads env vars for the spaces service connection to hsafa-core.
// Single secret key for all Core API access.
// =============================================================================

export interface ServiceConfig {
  /** Core API base URL (e.g. http://localhost:3001) */
  coreUrl: string;
  /** Secret key for Core API access */
  secretKey: string;
}

export function loadServiceConfig(): ServiceConfig | null {
  const coreUrl = process.env.HSAFA_GATEWAY_URL || process.env.CORE_URL;
  const secretKey = process.env.CORE_SECRET_KEY;

  if (!coreUrl || !secretKey) {
    console.warn(
      "[spaces-service] Missing env vars (HSAFA_GATEWAY_URL/CORE_URL, CORE_SECRET_KEY) — service disabled",
    );
    return null;
  }

  return { coreUrl, secretKey };
}
