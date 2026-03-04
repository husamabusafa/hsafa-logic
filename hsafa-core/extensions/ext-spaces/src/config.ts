// =============================================================================
// ext-spaces Configuration
//
// All configuration comes from environment variables.
// No haseef-specific state — the extension is stateless and generic.
// =============================================================================

export interface Config {
  coreUrl: string;
  extensionKey: string;
  secretKey: string;
  spacesAppUrl: string;
  spacesAppSecretKey: string;
  spacesRedisUrl: string;
  port: number;
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
    spacesRedisUrl: process.env.SPACES_REDIS_URL || process.env.REDIS_URL || 'redis://localhost:6379',
    port: parseInt(process.env.PORT || '4100', 10),
  };
}
