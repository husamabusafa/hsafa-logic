// =============================================================================
// Spaces Service Configuration (v8)
//
// Reads env vars for the spaces service connection to hsafa-core.
// v8: per-resource API keys. Service key for admin ops, scope keys for SDK.
// =============================================================================

export interface ServiceConfig {
  /** Core API base URL (e.g. http://localhost:3001) */
  coreUrl: string;
  /** Service key for admin operations (hsk_service_*) */
  serviceKey: string;
}

export function loadServiceConfig(): ServiceConfig | null {
  const coreUrl = process.env.HSAFA_GATEWAY_URL || process.env.CORE_URL;
  const serviceKey = process.env.CORE_SERVICE_KEY;

  if (!coreUrl || !serviceKey) {
    console.warn(
      "[spaces-service] Missing env vars (HSAFA_GATEWAY_URL/CORE_URL, CORE_SERVICE_KEY) — service disabled",
    );
    return null;
  }

  return { coreUrl, serviceKey };
}
