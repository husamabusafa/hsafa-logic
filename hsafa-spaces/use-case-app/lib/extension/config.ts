// =============================================================================
// Extension Configuration
//
// Reads extension-related env vars. The spaces-app doubles as an extension
// server — these vars configure the connection to hsafa-core.
// =============================================================================

export interface ExtensionConfig {
  coreUrl: string;
  extensionKey: string;
  secretKey: string;
  redisUrl: string;
}

export function loadExtensionConfig(): ExtensionConfig {
  const coreUrl = process.env.HSAFA_GATEWAY_URL || process.env.CORE_URL;
  const extensionKey = process.env.EXTENSION_KEY;
  const secretKey = process.env.HSAFA_SECRET_KEY;
  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

  if (!coreUrl || !extensionKey || !secretKey) {
    console.warn(
      "[extension] Missing env vars (HSAFA_GATEWAY_URL/CORE_URL, EXTENSION_KEY, HSAFA_SECRET_KEY) — extension features disabled",
    );
    return null as any;
  }

  return { coreUrl, extensionKey, secretKey, redisUrl };
}
