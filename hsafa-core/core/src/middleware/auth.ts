import { Request, Response, NextFunction } from 'express';

// =============================================================================
// Auth Middleware — Single Secret Key
//
// One key: SECRET_KEY env var. All authenticated requests have full access.
// Read from: x-api-key header or api_key query param (SSE fallback).
// =============================================================================

const SECRET_KEY = process.env.SECRET_KEY;

/**
 * Require a valid secret key. Rejects if SECRET_KEY is not configured or doesn't match.
 */
export function requireApiKey() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!SECRET_KEY) {
      console.error('[auth] SECRET_KEY env var is not set');
      res.status(500).json({ error: 'Server auth not configured' });
      return;
    }

    const key =
      (req.headers['x-api-key'] as string | undefined) ||
      (req.query.api_key as string | undefined);

    if (!key) {
      res.status(401).json({ error: 'Missing API key' });
      return;
    }

    if (key !== SECRET_KEY) {
      res.status(401).json({ error: 'Invalid API key' });
      return;
    }

    next();
  };
}
