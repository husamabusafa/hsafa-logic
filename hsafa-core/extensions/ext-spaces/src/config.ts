// =============================================================================
// ext-spaces Configuration
// =============================================================================

export interface Config {
  coreUrl: string;
  extensionKey: string;
  secretKey: string;
  spacesAppUrl: string;
  spacesAppSecretKey: string;
  redisUrl: string;
}

export function loadConfig(): Config {
  const required = (key: string): string => {
    const val = process.env[key];
    if (!val) throw new Error(`Missing required env var: ${key}`);
    return val;
  };

  return {
    coreUrl: required('CORE_URL'),
    extensionKey: required('EXTENSION_KEY'),
    secretKey: required('HSAFA_SECRET_KEY'),
    spacesAppUrl: required('SPACES_APP_URL'),
    spacesAppSecretKey: required('SPACES_APP_SECRET_KEY'),
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  };
}

// Per-haseef connection info (from HaseefExtension.config JSON field)
export interface HaseefConnection {
  agentId: string;
  agentName: string;
  agentEntityId: string;
  // Which space IDs this haseef is connected to (filter for SSE events)
  connectedSpaceIds: string[];
}
