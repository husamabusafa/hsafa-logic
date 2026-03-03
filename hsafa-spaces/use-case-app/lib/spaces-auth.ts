import { jwtVerify, createRemoteJWKSet, type JWTPayload } from "jose";
import { spacesPrisma } from "./spaces-db";

// =============================================================================
// Auth helpers for spaces API routes (adapted from spaces-app middleware)
// =============================================================================

export interface AuthContext {
  method: "secret_key" | "public_key_jwt";
  entityId?: string;
  externalId?: string;
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
  request: Request
): Promise<AuthContext | null> {
  const secretKey = request.headers.get("x-secret-key");
  const publicKey = request.headers.get("x-public-key");
  const authHeader = request.headers.get("authorization");

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
          const entity = await spacesPrisma.entity.findUnique({
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

    const entity = await spacesPrisma.entity.findUnique({
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

  return null;
}

/**
 * Check if an entity is a member of a SmartSpace.
 */
export async function checkMembership(
  smartSpaceId: string,
  entityId: string
): Promise<boolean> {
  const membership = await spacesPrisma.smartSpaceMembership.findUnique({
    where: { smartSpaceId_entityId: { smartSpaceId, entityId } },
    select: { id: true },
  });
  return !!membership;
}

/**
 * Require secret key auth. Returns AuthContext or a Response (error).
 */
export async function requireSecretKeyAuth(
  request: Request
): Promise<AuthContext | Response> {
  const auth = await authenticateRequest(request);
  if (!auth || auth.method !== "secret_key") {
    return Response.json({ error: "Secret key required" }, { status: 401 });
  }
  return auth;
}

/**
 * Require any auth. Returns AuthContext or a Response (error).
 */
export async function requireAnyAuth(
  request: Request
): Promise<AuthContext | Response> {
  const auth = await authenticateRequest(request);
  if (!auth) {
    return Response.json(
      {
        error:
          "Authentication required. Provide x-secret-key, or x-public-key + Authorization header.",
      },
      { status: 401 }
    );
  }
  return auth;
}

/**
 * Require auth + membership in a space. Returns AuthContext or a Response (error).
 */
export async function requireAuthWithMembership(
  request: Request,
  smartSpaceId: string
): Promise<AuthContext | Response> {
  const auth = await requireAnyAuth(request);
  if (auth instanceof Response) return auth;

  // Secret key = full access
  if (auth.method === "secret_key") return auth;

  if (!auth.entityId) {
    return Response.json(
      { error: "No entity resolved from JWT" },
      { status: 403 }
    );
  }

  const isMember = await checkMembership(smartSpaceId, auth.entityId);
  if (!isMember) {
    return Response.json(
      { error: "Entity is not a member of this SmartSpace" },
      { status: 403 }
    );
  }

  return auth;
}
