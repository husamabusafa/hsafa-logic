import { PrismaClient } from "./generated/client/index.js";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { randomUUID } from "crypto";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding Atlas agent entity...");

  // Create (or upsert) the Atlas agent entity.
  // externalId = "atlas" so it is stable across reseeds.
  // The register route finds the first entity with type=agent and adds it
  // to every new user's space automatically.
  const atlas = await prisma.entity.upsert({
    where: { externalId: "atlas" },
    update: { displayName: "Atlas" },
    create: {
      id: randomUUID(),
      type: "agent",
      externalId: "atlas",
      displayName: "Atlas",
      metadata: { description: "A helpful general-purpose AI assistant." },
    },
  });

  console.log(`✅ Atlas agent entity — ${atlas.id}`);
  console.log("\n🎉 Seed complete!");
  console.log("\nAll new registrations will auto-create a space with Atlas.");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
