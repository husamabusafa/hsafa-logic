import { PrismaClient } from "@/prisma/spaces/generated/spaces-client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const globalForSpacesPrisma = globalThis as unknown as {
  spacesPrisma: PrismaClient;
};

function createSpacesPrismaClient(): PrismaClient {
  const pool = new pg.Pool({
    connectionString: process.env.SPACES_DATABASE_URL,
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter } as any);
}

export const spacesPrisma =
  globalForSpacesPrisma.spacesPrisma || createSpacesPrismaClient();

if (process.env.NODE_ENV !== "production")
  globalForSpacesPrisma.spacesPrisma = spacesPrisma;
