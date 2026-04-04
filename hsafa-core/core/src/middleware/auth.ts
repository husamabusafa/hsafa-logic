import { Request, Response, NextFunction } from 'express';
import { validateKey, type KeyType } from '../lib/api-keys.js';

// =============================================================================
// Auth Middleware (v8) — Per-Resource API Keys
//
// Three key types:
//   hsk_service_* — full admin access (Spaces backend)
//   hsk_haseef_*  — per-haseef operations
//   hsk_scope_*   — per-scope operations (SSE, tools, results)
//
// Keys are read from:
//   x-api-key header (primary)
//   x-haseef-key header (for haseef-scoped ops)
//   x-scope-key header (for scope-scoped ops)
//   api_key query param (SSE fallback)
// =============================================================================

declare global {
  namespace Express {
    interface Request {
      auth?: {
        method: 'api_key';
        keyType: KeyType;
        keyId: string;
        resourceId: string | null;
      };
    }
  }
}

/**
 * Require any valid API key (service, haseef, or scope).
 * Attaches key metadata to req.auth for downstream route checks.
 */
export function requireApiKey() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key =
      (req.headers['x-api-key'] as string | undefined) ||
      (req.headers['x-haseef-key'] as string | undefined) ||
      (req.headers['x-scope-key'] as string | undefined) ||
      (req.query.api_key as string | undefined);

    if (!key) {
      res.status(401).json({ error: 'Missing API key' });
      return;
    }

    const validated = await validateKey(key);
    if (!validated) {
      res.status(401).json({ error: 'Invalid or revoked API key' });
      return;
    }

    req.auth = {
      method: 'api_key',
      keyType: validated.keyType,
      keyId: validated.id,
      resourceId: validated.resourceId,
    };

    next();
  };
}

/**
 * Require a service key (full admin access).
 * Use on admin-only endpoints.
 */
export function requireServiceKey() {
  return async (req: Request, res: Response, next: NextFunction) => {
    // If auth already resolved by requireApiKey upstream
    if (req.auth) {
      if (req.auth.keyType !== 'service') {
        res.status(403).json({ error: 'Service key required' });
        return;
      }
      next();
      return;
    }

    // Standalone usage
    const key =
      (req.headers['x-api-key'] as string | undefined) ||
      (req.query.api_key as string | undefined);

    if (!key) {
      res.status(401).json({ error: 'Missing API key' });
      return;
    }

    const validated = await validateKey(key);
    if (!validated || validated.keyType !== 'service') {
      res.status(403).json({ error: 'Service key required' });
      return;
    }

    req.auth = {
      method: 'api_key',
      keyType: validated.keyType,
      keyId: validated.id,
      resourceId: validated.resourceId,
    };

    next();
  };
}

/**
 * Check that the authenticated key can access a specific haseef.
 * Service keys always pass. Haseef keys must match the haseef ID.
 */
export function assertHaseefAccess(req: Request, haseefId: string): boolean {
  if (!req.auth) return false;
  if (req.auth.keyType === 'service') return true;
  if (req.auth.keyType === 'haseef' && req.auth.resourceId === haseefId) return true;
  return false;
}

/**
 * Check that the authenticated key can access a specific scope.
 * Service keys always pass. Scope keys must match the scope name.
 */
export function assertScopeAccess(req: Request, scopeName: string): boolean {
  if (!req.auth) return false;
  if (req.auth.keyType === 'service') return true;
  if (req.auth.keyType === 'scope' && req.auth.resourceId === scopeName) return true;
  return false;
}
