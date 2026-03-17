import { jwtVerify, createRemoteJWKSet, type JWTPayload } from "jose";
import { prisma } from "./db.js";
import { verifyToken } from "./auth.js";
import type { Request, Response, NextFunction } from "express";

// =============================================================================
// Auth helpers for spaces API routes
// =============================================================================

export interface AuthContext {
  method: "secret_key" | "public_key_jwt" | "user_jwt";
  entityId?: string;
  externalId?: string;
  /** True when the user is not a direct member but owns a haseef that is */
  isOwnerViewer?: boolean;
}

const SPACES_SECRET_KEY = process.env.SPACES_SECRET_KEY;
const SPACES_PUBLIC_KEY = process.env.SPACES_PUBLIC_KEY;
const JWT_SECRET = process.env.JWT_SECRET;
const JWKS_URL = process.env.JWKS_URL;
const JWT_ENTITY_CLAIM = process.env.JWT_ENTITY_CLAIM || "sub";

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

  throw new Error("No JWT_SECRET or JWKS_URL configured");
}

function extractExternalId(payload: JWTPayload): string | null {
  const value = payload[JWT_ENTITY_CLAIM];
  if (typeof value === "string") return value;
  return null;
}

/**
 * Authenticate a request. Returns AuthContext or null (unauthorized).
 */
export async function authenticateRequest(
  req: Request
): Promise<AuthContext | null> {
  const secretKey = req.headers["x-secret-key"] as string | undefined;
  const publicKey = req.headers["x-public-key"] as string | undefined;
  const authHeader = req.headers["authorization"] as string | undefined;

  // Secret key auth
  if (secretKey) {
    if (!SPACES_SECRET_KEY || secretKey !== SPACES_SECRET_KEY) {
      return null;
    }

    let entityId: string | undefined;
    let externalId: string | undefined;

    // Optionally resolve entity from JWT if provided
    if (authHeader?.startsWith("Bearer ")) {
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

    return { method: "secret_key", entityId, externalId };
  }

  // Public key + JWT auth
  if (publicKey) {
    if (!SPACES_PUBLIC_KEY || publicKey !== SPACES_PUBLIC_KEY) {
      return null;
    }

    if (!authHeader?.startsWith("Bearer ")) {
      return null;
    }

    let payload: JWTPayload;
    try {
      payload = await verifyJWT(authHeader.slice(7));
    } catch {
      return null;
    }

    const externalId = extractExternalId(payload);
    if (!externalId) return null;

    const entity = await prisma.entity.findUnique({
      where: { externalId },
      select: { id: true },
    });
    if (!entity) return null;

    return {
      method: "public_key_jwt",
      entityId: entity.id,
      externalId,
    };
  }

  // Plain Bearer token — user JWT (React app / frontend)
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const userPayload = await verifyToken(authHeader.slice(7));
      if (userPayload && userPayload.entityId) {
        return {
          method: "user_jwt",
          entityId: userPayload.entityId,
          externalId: userPayload.sub,
        };
      }
    } catch {
      // Not a valid user JWT
    }
  }

  return null;
}

/**
 * Check if an entity is a member of a SmartSpace.
 */
export async function checkMembership(
  smartSpaceId: string,
  entityId: string
): Promise<boolean> {
  const membership = await prisma.smartSpaceMembership.findUnique({
    where: { smartSpaceId_entityId: { smartSpaceId, entityId } },
    select: { id: true },
  });
  return !!membership;
}

// ── Express middleware helpers ──────────────────────────────────────────────

/**
 * Require secret key auth middleware.
 */
export async function requireSecretKeyAuth(
  req: Request
): Promise<AuthContext | { status: number; error: string }> {
  const auth = await authenticateRequest(req);
  if (!auth || auth.method !== "secret_key") {
    return { status: 401, error: "Secret key required" };
  }
  return auth;
}

/**
 * Require any auth.
 */
export async function requireAnyAuth(
  req: Request
): Promise<AuthContext | { status: number; error: string }> {
  const auth = await authenticateRequest(req);
  if (!auth) {
    return {
      status: 401,
      error: "Authentication required. Provide x-secret-key, or x-public-key + Authorization header.",
    };
  }
  return auth;
}

/**
 * Require auth + membership in a space.
 */
export async function requireAuthWithMembership(
  req: Request,
  smartSpaceId: string
): Promise<AuthContext | { status: number; error: string }> {
  const auth = await requireAnyAuth(req);
  if ("error" in auth) return auth;

  // Secret key = full access
  if (auth.method === "secret_key") return auth;

  if (!auth.entityId) {
    return { status: 403, error: "No entity resolved from JWT" };
  }

  const isMember = await checkMembership(smartSpaceId, auth.entityId);
  if (isMember) return auth;

  // Fallback: check if user owns a haseef that IS a member of this space
  const ownsHaseefInSpace = await prisma.haseefOwnership.findFirst({
    where: {
      userId: auth.externalId ?? "",
      entity: {
        smartSpaceMemberships: { some: { smartSpaceId } },
      },
    },
    select: { entityId: true },
  });
  if (ownsHaseefInSpace) {
    return { ...auth, isOwnerViewer: true };
  }

  return { status: 403, error: "Entity is not a member of this SmartSpace" };
}

/**
 * Helper to check if auth result is an error.
 */
export function isAuthError(auth: AuthContext | { status: number; error: string }): auth is { status: number; error: string } {
  return "error" in auth;
}
