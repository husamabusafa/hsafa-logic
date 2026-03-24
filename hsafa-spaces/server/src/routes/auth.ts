import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "../lib/db.js";
import { signToken, verifyToken } from "../lib/auth.js";
import {
  generateVerificationCode,
  getCodeExpiry,
  sendVerificationEmail,
} from "../lib/email.js";

const router = Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL || "http://localhost:3005/api/auth/google/callback";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5180";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Generate a short, readable invite code */
function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function createEntityAndBase(name: string, email: string) {
  const entityId = crypto.randomUUID();
  const entity = await prisma.entity.create({
    data: {
      id: entityId,
      type: "human",
      displayName: name,
      externalId: email,
    },
  });

  // Create default Base for the user
  const base = await prisma.base.create({
    data: {
      name: `${name}'s Base`,
      inviteCode: generateInviteCode(),
      members: {
        create: {
          entityId: entity.id,
          role: "owner",
        },
      },
    },
  });

  // Resolve pending invitations for this email
  await prisma.invitation.updateMany({
    where: { inviteeEmail: email, status: "pending", inviteeId: null },
    data: { inviteeId: entity.id },
  });

  return { entity, base };
}

async function buildUserResponse(user: any) {
  const spaces = user.hsafaEntityId
    ? await prisma.smartSpaceMembership.findMany({
        where: { entityId: user.hsafaEntityId },
        include: { smartSpace: { select: { id: true, name: true } } },
      })
    : [];

  // Fetch user's bases
  const baseMemberships = user.hsafaEntityId
    ? await prisma.baseMember.findMany({
        where: { entityId: user.hsafaEntityId },
        include: { base: { select: { id: true, name: true, avatarUrl: true, inviteCode: true } } },
      })
    : [];

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    entityId: user.hsafaEntityId,
    smartSpaceId: user.hsafaSpaceId,
    defaultBaseId: user.defaultBaseId,
    avatarUrl: user.avatarUrl,
    emailVerified: user.emailVerified,
    spaces: spaces.map((s: any) => ({
      id: s.smartSpace.id,
      name: s.smartSpace.name,
    })),
    bases: baseMemberships.map((bm: any) => ({
      id: bm.base.id,
      name: bm.base.name,
      avatarUrl: bm.base.avatarUrl,
      inviteCode: bm.base.inviteCode,
      role: bm.role,
    })),
  };
}

// ── POST /api/register ───────────────────────────────────────────────────────

router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      res.status(400).json({ error: "name, email, and password are required" });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters" });
      return;
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const code = generateVerificationCode();
    const codeExpiry = getCodeExpiry();

    const { entity, base } = await createEntityAndBase(name, email);

    const user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        hsafaEntityId: entity.id,
        hsafaSpaceId: null,
        defaultBaseId: base.id,
        emailVerified: false,
        verificationCode: code,
        verificationCodeExpiry: codeExpiry,
      },
    });

    // Send verification email (fire and forget — don't block registration)
    sendVerificationEmail(email, name, code).catch((err) => {
      console.error("[auth] Failed to send verification email:", err);
    });

    const token = await signToken({
      sub: user.id,
      email: user.email,
      name: user.name,
      entityId: entity.id,
    });

    res.status(201).json({
      token,
      user: await buildUserResponse(user),
      verificationRequired: true,
    });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ error: "Registration failed" });
  }
});

// ── POST /api/verify-email ───────────────────────────────────────────────────

router.post("/verify-email", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "No token provided" });
      return;
    }

    const payload = await verifyToken(authHeader.slice(7));
    if (!payload) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }

    const { code } = req.body;
    if (!code) {
      res.status(400).json({ error: "Verification code is required" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (user.emailVerified) {
      res.json({ success: true, message: "Email already verified" });
      return;
    }

    if (!user.verificationCode || !user.verificationCodeExpiry) {
      res.status(400).json({ error: "No verification code pending. Request a new one." });
      return;
    }

    if (new Date() > user.verificationCodeExpiry) {
      res.status(400).json({ error: "Verification code expired. Request a new one." });
      return;
    }

    if (user.verificationCode !== code) {
      res.status(400).json({ error: "Invalid verification code" });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        verificationCode: null,
        verificationCodeExpiry: null,
      },
    });

    res.json({ success: true, message: "Email verified successfully" });
  } catch (error) {
    console.error("Verify email error:", error);
    res.status(500).json({ error: "Verification failed" });
  }
});

// ── POST /api/resend-code ────────────────────────────────────────────────────

router.post("/resend-code", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "No token provided" });
      return;
    }

    const payload = await verifyToken(authHeader.slice(7));
    if (!payload) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (user.emailVerified) {
      res.json({ success: true, message: "Email already verified" });
      return;
    }

    const code = generateVerificationCode();
    const codeExpiry = getCodeExpiry();

    await prisma.user.update({
      where: { id: user.id },
      data: { verificationCode: code, verificationCodeExpiry: codeExpiry },
    });

    await sendVerificationEmail(user.email, user.name, code);

    res.json({ success: true, message: "Verification code sent" });
  } catch (error) {
    console.error("Resend code error:", error);
    res.status(500).json({ error: "Failed to resend code" });
  }
});

// ── POST /api/login ──────────────────────────────────────────────────────────

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: "email and password are required" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    if (!user.passwordHash) {
      res.status(401).json({
        error: "This account uses Google sign-in. Please sign in with Google.",
        code: "GOOGLE_ONLY",
      });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    if (!user.hsafaEntityId) {
      res.status(500).json({ error: "User has no entity — contact support" });
      return;
    }

    const token = await signToken({
      sub: user.id,
      email: user.email,
      name: user.name,
      entityId: user.hsafaEntityId,
    });

    res.json({
      token,
      user: await buildUserResponse(user),
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

// ── GET /api/me ──────────────────────────────────────────────────────────────

router.get("/me", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "No token provided" });
      return;
    }

    const payload = await verifyToken(authHeader.slice(7));
    if (!payload) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({ user: await buildUserResponse(user) });
  } catch (error) {
    console.error("Me error:", error);
    res.status(500).json({ error: "Failed to get user info" });
  }
});

// ── PATCH /api/me — Update profile ───────────────────────────────────────────

router.patch("/me", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "No token provided" });
      return;
    }

    const payload = await verifyToken(authHeader.slice(7));
    if (!payload) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }

    const { name } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "name is required" });
      return;
    }

    const trimmedName = name.trim();

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Update user name
    const updatedUser = await prisma.user.update({
      where: { id: payload.sub },
      data: { name: trimmedName },
    });

    // Also update entity displayName so it's consistent everywhere
    if (user.hsafaEntityId) {
      await prisma.entity.update({
        where: { id: user.hsafaEntityId },
        data: { displayName: trimmedName },
      });
    }

    res.json({ user: await buildUserResponse(updatedUser) });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// ── Google OAuth ─────────────────────────────────────────────────────────────

// GET /api/auth/google — redirect to Google consent screen
router.get("/auth/google", (req, res) => {
  if (!GOOGLE_CLIENT_ID) {
    res.status(500).json({ error: "Google OAuth not configured" });
    return;
  }

  // Carry mobile flag through OAuth state so the callback knows where to redirect
  const isMobile = req.query.mobile === "true";
  const stateObj = isMobile ? { mobile: true } : {};
  const stateStr = Buffer.from(JSON.stringify(stateObj)).toString("base64url");

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_CALLBACK_URL,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "consent",
    state: stateStr,
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

// GET /api/auth/google/callback — handle Google redirect
router.get("/auth/google/callback", async (req, res) => {
  try {
    const { code } = req.query;
    if (!code || typeof code !== "string") {
      res.redirect(`${FRONTEND_URL}/auth?error=no_code`);
      return;
    }

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      res.redirect(`${FRONTEND_URL}/auth?error=oauth_not_configured`);
      return;
    }

    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_CALLBACK_URL,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      console.error("[auth/google] Token exchange failed:", await tokenRes.text());
      res.redirect(`${FRONTEND_URL}/auth?error=token_exchange_failed`);
      return;
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // Fetch user info from Google
    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userInfoRes.ok) {
      res.redirect(`${FRONTEND_URL}/auth?error=userinfo_failed`);
      return;
    }

    const googleUser = await userInfoRes.json();
    const { id: googleId, email, name, picture } = googleUser;

    if (!email) {
      res.redirect(`${FRONTEND_URL}/auth?error=no_email`);
      return;
    }

    // Check if user exists by googleId or email
    let user = await prisma.user.findFirst({
      where: { OR: [{ googleId }, { email }] },
    });

    if (user) {
      // Ensure entity and base exist (for legacy users or incomplete registrations)
      if (!user.hsafaEntityId) {
        const { entity, base } = await createEntityAndBase(user.name, user.email);
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            hsafaEntityId: entity.id,
            hsafaSpaceId: null,
            defaultBaseId: base.id,
            googleId,
            avatarUrl: picture || user.avatarUrl,
            emailVerified: true,
          },
        });
      } else {
        // Link Google account if not already linked
        if (!user.googleId) {
          user = await prisma.user.update({
            where: { id: user.id },
            data: {
              googleId,
              avatarUrl: picture || user.avatarUrl,
              emailVerified: true,
            },
          });
        }
        // Always mark email as verified for Google users
        if (!user.emailVerified) {
          user = await prisma.user.update({
            where: { id: user.id },
            data: { emailVerified: true },
          });
        }
      }
    } else {
      // New user via Google
      const displayName = name || email.split("@")[0];
      const { entity, base } = await createEntityAndBase(displayName, email);

      user = await prisma.user.create({
        data: {
          email,
          name: displayName,
          googleId,
          avatarUrl: picture || null,
          emailVerified: true, // Google-verified email
          hsafaEntityId: entity.id,
          hsafaSpaceId: null,
          defaultBaseId: base.id,
        },
      });
    }

    if (!user.hsafaEntityId) {
      res.redirect(`${FRONTEND_URL}/auth?error=no_entity`);
      return;
    }

    const token = await signToken({
      sub: user.id,
      email: user.email,
      name: user.name,
      entityId: user.hsafaEntityId,
    });

    // Check if this was a mobile OAuth flow
    let isMobile = false;
    try {
      const stateParam = req.query.state as string | undefined;
      if (stateParam) {
        const stateObj = JSON.parse(Buffer.from(stateParam, "base64url").toString());
        isMobile = stateObj.mobile === true;
      }
    } catch {}

    if (isMobile) {
      // Redirect to the RN app deep link
      res.redirect(`hsafa://auth/callback?token=${encodeURIComponent(token)}`);
    } else {
      // Redirect to web frontend
      res.redirect(`${FRONTEND_URL}/auth/callback?token=${encodeURIComponent(token)}`);
    }
  } catch (error) {
    console.error("Google callback error:", error);
    res.redirect(`${FRONTEND_URL}/auth?error=server_error`);
  }
});

export default router;
