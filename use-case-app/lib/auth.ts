import { SignJWT, jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "use-case-app-dev-secret-change-me"
);

const JWT_ISSUER = "hsafa-use-case-app";
const JWT_EXPIRATION = "7d";

export interface JwtPayload {
  sub: string; // user id
  email: string;
  name: string;
  entityId: string;
  agentEntityId: string;
}

export async function signToken(payload: JwtPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setExpirationTime(JWT_EXPIRATION)
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
    });
    return payload as unknown as JwtPayload;
  } catch {
    return null;
  }
}
