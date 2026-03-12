import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "../lib/db.js";
import { signToken, verifyToken } from "../lib/auth.js";

const router = Router();

// POST /api/register
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

    // Create the human entity
    const entityId = crypto.randomUUID();
    const entity = await prisma.entity.create({
      data: {
        id: entityId,
        type: "human",
        displayName: name,
        externalId: email,
      },
    });

    // Create a default SmartSpace
    const smartSpace = await prisma.smartSpace.create({
      data: { name: `${name}'s Space` },
    });

    // Add human as admin of the space
    await prisma.smartSpaceMembership.create({
      data: {
        smartSpaceId: smartSpace.id,
        entityId: entity.id,
        role: "admin",
      },
    });

    // Create the user record
    const user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        hsafaEntityId: entity.id,
        hsafaSpaceId: smartSpace.id,
      },
    });

    const token = await signToken({
      sub: user.id,
      email: user.email,
      name: user.name,
      entityId: entity.id,
    });

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        entityId: entity.id,
        smartSpaceId: smartSpace.id,
      },
    });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ error: "Registration failed" });
  }
});

// POST /api/login
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

    // Fetch user's spaces
    const spaces = await prisma.smartSpaceMembership.findMany({
      where: { entityId: user.hsafaEntityId },
      include: { smartSpace: { select: { id: true, name: true } } },
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        entityId: user.hsafaEntityId,
        smartSpaceId: user.hsafaSpaceId,
        spaces: spaces.map((s: any) => ({
          id: s.smartSpace.id,
          name: s.smartSpace.name,
        })),
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

// GET /api/me
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

    const spaces = user.hsafaEntityId
      ? await prisma.smartSpaceMembership.findMany({
          where: { entityId: user.hsafaEntityId },
          include: { smartSpace: { select: { id: true, name: true } } },
        })
      : [];

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        entityId: user.hsafaEntityId,
        smartSpaceId: user.hsafaSpaceId,
        spaces: spaces.map((s: any) => ({
          id: s.smartSpace.id,
          name: s.smartSpace.name,
        })),
      },
    });
  } catch (error) {
    console.error("Me error:", error);
    res.status(500).json({ error: "Failed to get user info" });
  }
});

export default router;
