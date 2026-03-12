import { SignJWT, jwtVerify } from "jose";

const JWT_SECRET_RAW = process.env.JWT_SECRET;
if (!JWT_SECRET_RAW) {
  console.warn("[auth] JWT_SECRET env var not set — using insecure default. Set it in .env!");
}
const JWT_SECRET = new TextEncoder().encode(
  JWT_SECRET_RAW || "dev-jwt-secret-change-in-prod"
);

const JWT_ISSUER = "hsafa-spaces";
const JWT_EXPIRATION = "7d";

export interface JwtPayload {
  sub: string; // user id
  email: string;
  name: string;
  entityId: string;
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
