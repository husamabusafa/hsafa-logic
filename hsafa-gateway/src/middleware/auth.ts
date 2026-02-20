import { Request, Response, NextFunction } from 'express';
import { jwtVerify, createRemoteJWKSet, JWTPayload } from 'jose';
import { prisma } from '../lib/db.js';

// =============================================================================
// Types
// =============================================================================

export interface AuthContext {
  method: 'secret_key' | 'public_key_jwt';
  entityId?: string;
  externalId?: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

// =============================================================================
// JWT Configuration
// =============================================================================

const HSAFA_SECRET_KEY = process.env.HSAFA_SECRET_KEY;
const HSAFA_PUBLIC_KEY = process.env.HSAFA_PUBLIC_KEY;
const JWT_SECRET = process.env.JWT_SECRET;
const JWKS_URL = process.env.JWKS_URL;
const JWT_ENTITY_CLAIM = process.env.JWT_ENTITY_CLAIM || 'sub';

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJWKS() {
  if (!jwks && JWKS_URL) {
    jwks = createRemoteJWKSet(new URL(JWKS_URL));
  }
  return jwks;
}

async function verifyJWT(token: string): Promise<JWTPayload> {
  if (JWT_SECRET) {
    const secret = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    return payload;
  }

  const jwksSet = getJWKS();
  if (jwksSet) {
    const { payload } = await jwtVerify(token, jwksSet);
    return payload;
  }

  throw new Error('No JWT_SECRET or JWKS_URL configured');
}

function extractExternalId(payload: JWTPayload): string | null {
  const value = payload[JWT_ENTITY_CLAIM];
  if (typeof value === 'string') return value;
  return null;
}

// =============================================================================
// Middleware: Secret Key (Full Access)
// =============================================================================

export function requireSecretKey() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const secretKey = req.headers['x-secret-key'] as string | undefined;

      if (!secretKey) {
        res.status(401).json({ error: 'Missing x-secret-key header' });
        return;
      }

      if (!HSAFA_SECRET_KEY || secretKey !== HSAFA_SECRET_KEY) {
        res.status(401).json({ error: 'Invalid secret key' });
        return;
      }

      // Optionally resolve entity from JWT if provided
      let entityId: string | undefined;
      let externalId: string | undefined;
      const authHeader = req.headers['authorization'] as string | undefined;

      if (authHeader?.startsWith('Bearer ')) {
        try {
          const payload = await verifyJWT(authHeader.slice(7));
          externalId = extractExternalId(payload) ?? undefined;
          if (externalId) {
            const entity = await prisma.entity.findUnique({
              where: { externalId },
              select: { id: true },
            });
            if (entity) entityId = entity.id;
          }
        } catch {
          // JWT is optional with secret key
        }
      }

      req.auth = { method: 'secret_key', entityId, externalId };
      next();
    } catch (error) {
      console.error('Secret key auth error:', error);
      res.status(500).json({ error: 'Authentication failed' });
    }
  };
}

// =============================================================================
// Middleware: Public Key + JWT (Limited Access)
// =============================================================================

export function requirePublicKeyJWT() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const publicKey = req.headers['x-public-key'] as string | undefined;
      const authHeader = req.headers['authorization'] as string | undefined;

      if (!publicKey) {
        res.status(401).json({ error: 'Missing x-public-key header' });
        return;
      }

      if (!HSAFA_PUBLIC_KEY || publicKey !== HSAFA_PUBLIC_KEY) {
        res.status(401).json({ error: 'Invalid public key' });
        return;
      }

      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Missing or invalid Authorization header' });
        return;
      }

      let payload: JWTPayload;
      try {
        payload = await verifyJWT(authHeader.slice(7));
      } catch {
        res.status(401).json({ error: 'Invalid or expired JWT' });
        return;
      }

      const externalId = extractExternalId(payload);
      if (!externalId) {
        res.status(401).json({ error: `JWT missing claim: ${JWT_ENTITY_CLAIM}` });
        return;
      }

      const entity = await prisma.entity.findUnique({
        where: { externalId },
        select: { id: true },
      });

      if (!entity) {
        res.status(403).json({ error: 'No entity found for this user' });
        return;
      }

      req.auth = { method: 'public_key_jwt', entityId: entity.id, externalId };
      next();
    } catch (error) {
      console.error('Public key + JWT auth error:', error);
      res.status(500).json({ error: 'Authentication failed' });
    }
  };
}

// =============================================================================
// Middleware: Either Secret Key OR Public Key + JWT
// =============================================================================

export function requireAuth() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const secretKey = req.headers['x-secret-key'] as string | undefined;
    const publicKey = req.headers['x-public-key'] as string | undefined;

    if (secretKey) {
      return requireSecretKey()(req, res, next);
    }

    if (publicKey) {
      return requirePublicKeyJWT()(req, res, next);
    }

    res.status(401).json({
      error: 'Authentication required. Provide x-secret-key, or x-public-key + Authorization header.',
    });
  };
}

// =============================================================================
// Middleware: Space Membership Check
// =============================================================================

export function requireMembership() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.auth) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      // Secret key = full access
      if (req.auth.method === 'secret_key') {
        return next();
      }

      const entityId = req.auth.entityId;
      if (!entityId) {
        res.status(403).json({ error: 'No entity resolved from JWT' });
        return;
      }

      const smartSpaceId = req.params.smartSpaceId;
      if (!smartSpaceId) {
        res.status(403).json({ error: 'No SmartSpace ID in route params' });
        return;
      }

      const membership = await prisma.smartSpaceMembership.findUnique({
        where: { smartSpaceId_entityId: { smartSpaceId, entityId } },
        select: { id: true },
      });

      if (!membership) {
        res.status(403).json({ error: 'Entity is not a member of this SmartSpace' });
        return;
      }

      next();
    } catch (error) {
      console.error('Membership check error:', error);
      res.status(500).json({ error: 'Membership check failed' });
    }
  };
}
