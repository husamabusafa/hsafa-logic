// =============================================================================
// Seed Prebuilt Scope Templates + Default Instances
//
// Run: npx tsx prisma/seed-scopes.ts
// Idempotent — uses upsert on slug/scopeName.
// =============================================================================

import { PrismaClient } from "./generated/client/index.js";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { TOOLS, SCOPE_INSTRUCTIONS, SCHEDULER_TOOLS } from "../src/lib/service/manifest.js";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  console.log("[seed-scopes] Seeding prebuilt scope templates...");

  // ── Spaces Template ──────────────────────────────────────────────────────
  const spacesTemplate = await prisma.scopeTemplate.upsert({
    where: { slug: "spaces" },
    update: {
      name: "Spaces",
      description: "Chat in smart spaces — send messages, images, voice, forms, polls, and more.",
      icon: "MessageSquare",
      category: "prebuilt",
      configSchema: {},
      requiredProfileFields: [],
      tools: TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
      instructions: SCOPE_INSTRUCTIONS,
    },
    create: {
      slug: "spaces",
      name: "Spaces",
      description: "Chat in smart spaces — send messages, images, voice, forms, polls, and more.",
      icon: "MessageSquare",
      category: "prebuilt",
      configSchema: {},
      requiredProfileFields: [],
      tools: TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
      instructions: SCOPE_INSTRUCTIONS,
      published: true,
    },
  });
  console.log(`[seed-scopes] Spaces template: ${spacesTemplate.id}`);

  // ── Scheduler Template ───────────────────────────────────────────────────
  const schedulerTemplate = await prisma.scopeTemplate.upsert({
    where: { slug: "scheduler" },
    update: {
      name: "Scheduler",
      description: "Set recurring schedules and one-time reminders with cron expressions.",
      icon: "Calendar",
      category: "prebuilt",
      configSchema: {},
      requiredProfileFields: [],
      tools: SCHEDULER_TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
      instructions: null,
    },
    create: {
      slug: "scheduler",
      name: "Scheduler",
      description: "Set recurring schedules and one-time reminders with cron expressions.",
      icon: "Calendar",
      category: "prebuilt",
      configSchema: {},
      requiredProfileFields: [],
      tools: SCHEDULER_TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
      instructions: null,
      published: true,
    },
  });
  console.log(`[seed-scopes] Scheduler template: ${schedulerTemplate.id}`);

  // ── Default Spaces Instance (platform-owned) ────────────────────────────
  const spacesInstance = await prisma.scopeInstance.upsert({
    where: { scopeName: "spaces" },
    update: {
      name: "Spaces",
      description: "Default spaces scope — chat in smart spaces.",
      templateId: spacesTemplate.id,
      active: true,
    },
    create: {
      templateId: spacesTemplate.id,
      name: "Spaces",
      scopeName: "spaces",
      description: "Default spaces scope — chat in smart spaces.",
      ownerId: null, // platform-owned
      active: true,
    },
  });
  console.log(`[seed-scopes] Spaces instance: ${spacesInstance.id} (scope: ${spacesInstance.scopeName})`);

  // ── Default Scheduler Instance (platform-owned) ─────────────────────────
  const schedulerInstance = await prisma.scopeInstance.upsert({
    where: { scopeName: "scheduler" },
    update: {
      name: "Scheduler",
      description: "Default scheduler scope — set schedules and reminders.",
      templateId: schedulerTemplate.id,
      active: true,
    },
    create: {
      templateId: schedulerTemplate.id,
      name: "Scheduler",
      scopeName: "scheduler",
      description: "Default scheduler scope — set schedules and reminders.",
      ownerId: null, // platform-owned
      active: true,
    },
  });
  console.log(`[seed-scopes] Scheduler instance: ${schedulerInstance.id} (scope: ${schedulerInstance.scopeName})`);

  console.log("[seed-scopes] Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
