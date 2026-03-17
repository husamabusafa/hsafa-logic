// Fix existing direct spaces to have metadata.isDirect = true
// Run with: npx tsx scripts/fix-direct-spaces-metadata.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Finding direct spaces without metadata.isDirect...");

  // Find all spaces with 2 or fewer members (likely direct spaces)
  const spaces = await prisma.smartSpace.findMany({
    include: {
      memberships: {
        select: { entityId: true },
      },
    },
  });

  let updated = 0;
  for (const space of spaces) {
    const memberCount = space.memberships.length;
    const metadata = (space.metadata || {}) as Record<string, unknown>;
    
    // If space has 2 members and no isDirect flag, it's likely a direct space
    if (memberCount === 2 && !metadata.isDirect) {
      await prisma.smartSpace.update({
        where: { id: space.id },
        data: {
          metadata: { ...metadata, isDirect: true },
        },
      });
      console.log(`✓ Updated space: ${space.name} (${space.id})`);
      updated++;
    }
  }

  console.log(`\nDone! Updated ${updated} space(s).`);
}

main()
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
