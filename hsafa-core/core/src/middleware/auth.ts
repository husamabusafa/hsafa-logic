import { Request, Response, NextFunction } from 'express';

// =============================================================================
// Auth Middleware (v5) — Single API Key
//
// All routes protected by x-api-key header. Scoped keys later.
// =============================================================================

declare global {
  namespace Express {
    interface Request {
      auth?: { method: 'api_key' };
    }
  }
}

const API_KEY = process.env.HSAFA_API_KEY;

/**
 * Require a valid x-api-key header.
 */
export function requireApiKey() {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.headers['x-api-key'] as string | undefined;

    if (!key) {
      res.status(401).json({ error: 'Missing x-api-key header' });
      return;
    }

    if (!API_KEY || key !== API_KEY) {
      res.status(401).json({ error: 'Invalid API key' });
      return;
    }

    req.auth = { method: 'api_key' };
    next();
  };
}
