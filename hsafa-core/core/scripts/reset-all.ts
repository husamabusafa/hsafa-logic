#!/usr/bin/env node
/**
 * Reset all spaces messages and all agents' history (consciousness).
 *
 * Clears:
 *   - Core: HaseefConsciousness, ConsciousnessSnapshot, InboxEvent, Run, PendingToolCall
 *   - Spaces: SmartSpaceMessage (all messages in all spaces)
 *
 * Usage:
 *   cd hsafa-core/core && pnpm exec tsx --env-file=.env scripts/reset-all.ts
 *
 * Or with custom spaces DB (if different from Core):
 *   USE_CASE_DATABASE_URL=postgresql://user:pass@host:5434/use_case_db pnpm exec tsx --env-file=.env scripts/reset-all.ts
 */
import { PrismaClient } from '../prisma/generated/client/index.js';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const coreUrl = process.env.DATABASE_URL;
const spacesUrl =
  process.env.USE_CASE_DATABASE_URL ??
  (coreUrl ? coreUrl.replace(/\/[^/]+$/, '/use_case_db') : undefined);

if (!coreUrl) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const corePool = new pg.Pool({ connectionString: coreUrl });
const coreAdapter = new PrismaPg(corePool);
const prisma = new PrismaClient({ adapter: coreAdapter } as any);

async function main() {
  console.log('🧹 Resetting all spaces messages and agents history...\n');

  // ─── Core: agents history ─────────────────────────────────────────────────
  const coreResults: Record<string, number | string> = {};
  const coreDeletes = [
    ['HaseefConsciousness', () => prisma.haseefConsciousness.deleteMany({})],
    ['ConsciousnessSnapshot', () => prisma.consciousnessSnapshot.deleteMany({})],
    ['InboxEvent', () => prisma.inboxEvent.deleteMany({})],
    ['Run', () => prisma.run.deleteMany({})],
    ['PendingToolCall', () => prisma.pendingToolCall.deleteMany({})],
  ] as const;

  for (const [name, fn] of coreDeletes) {
    try {
      const r = await fn();
      coreResults[name] = r.count;
    } catch (err) {
      coreResults[name] = `skip (${err instanceof Error ? err.message : err})`;
    }
  }

  console.log('  Core (agents history):');
  for (const [name, count] of Object.entries(coreResults)) {
    console.log(`    - ${name}: ${count}`);
  }

  // ─── Spaces: all messages ─────────────────────────────────────────────────
  if (spacesUrl) {
    const spacesPool = new pg.Pool({ connectionString: spacesUrl });
    try {
      const msgRes = await spacesPool.query(
        'DELETE FROM smart_space_messages RETURNING id'
      );
      const msgCount = msgRes.rowCount ?? 0;
      console.log('\n  Spaces:');
      console.log(`    - SmartSpaceMessage: ${msgCount}`);
      await spacesPool.end();
    } catch (err) {
      console.warn(
        '\n  Spaces: Could not clear messages (is USE_CASE_DATABASE_URL correct?):',
        err instanceof Error ? err.message : err
      );
    }
  } else {
    console.log('\n  Spaces: Skipped (no USE_CASE_DATABASE_URL, and could not derive from DATABASE_URL)');
  }

  console.log('\n✅ Reset complete.\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await corePool.end();
  });
