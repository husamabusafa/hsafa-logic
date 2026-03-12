import crypto from "crypto";
import { PrismaClient } from "./generated/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

const PASSWORD = "password123";

interface SeedUser {
  name: string;
  email: string;
}

const SEED_USERS: SeedUser[] = [
  { name: "Husam Abusafa", email: "husam@hsafa.com" },
  { name: "Demo User",    email: "demo@hsafa.com"  },
];

async function seedUser(name: string, email: string, passwordHash: string) {
  // Idempotent: skip if already exists
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`  ⏭  ${name} (${email}) — already exists, skipping`);
    return existing;
  }

  // Find the first agent entity (created when spaces-app bootstraps Atlas)
  const agentEntity = await prisma.entity.findFirst({
    where: { type: "agent" },
  });
  if (!agentEntity) {
    throw new Error(
      "No agent entity found in use_case_db. Start the spaces-app first so ext-spaces bootstraps Atlas."
    );
  }

  // 1. Create user
  const user = await prisma.user.create({
    data: { email, name, passwordHash },
  });

  // 2. Create human entity (externalId = user.id so JWT sub matches)
  const human = await prisma.entity.create({
    data: {
      id: crypto.randomUUID(),
      type: "human",
      externalId: user.id,
      displayName: name,
      metadata: { email },
    },
  });

  // 3. Create a private SmartSpace for this user + agent
  const smartSpace = await prisma.smartSpace.create({
    data: { name: `${name}'s Chat` },
  });

  // 4. Add human + agent as members
  await prisma.smartSpaceMembership.createMany({
    data: [
      { smartSpaceId: smartSpace.id, entityId: human.id,          role: "admin"  },
      { smartSpaceId: smartSpace.id, entityId: agentEntity.id,    role: "member" },
    ],
  });

  // 5. Link references back to user
  await prisma.user.update({
    where: { id: user.id },
    data: { hsafaEntityId: human.id, hsafaSpaceId: smartSpace.id, agentEntityId: agentEntity.id },
  });

  console.log(`  ✅ ${name} (${email})`);
  console.log(`     entityId:   ${human.id}`);
  console.log(`     spaceId:    ${smartSpace.id}`);
  return user;
}

async function main() {
  console.log("🌱 Seeding use-case-app users...\n");

  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  for (const u of SEED_USERS) {
    await seedUser(u.name, u.email, passwordHash);
  }

  console.log("\n🎉 Seed complete!");
  console.log(`\nLogin credentials (password: ${PASSWORD}):`);
  for (const u of SEED_USERS) {
    console.log(`  ${u.email}`);
  }
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
