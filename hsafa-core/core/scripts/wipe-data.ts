// =============================================================================
// Wipe All User & Haseef Data from Both Databases
//
// KEEPS: ScopeTemplates (blueprints)
// DELETES: Everything else (users, entities, haseefs, spaces, messages, keys, etc.)
//
// Usage: npx tsx scripts/wipe-data.ts
// =============================================================================

import pg from 'pg';

const CORE_DB_URL = process.env.DATABASE_URL || 'postgresql://hsafa:hsafa123@localhost:5434/hsafa_db';
const SPACES_DB_URL = process.env.SPACES_DATABASE_URL || 'postgresql://hsafa:hsafa123@localhost:5434/spaces_db';

async function wipeCore() {
  const pool = new pg.Pool({ connectionString: CORE_DB_URL });
  console.log('\n── Core DB (hsafa_db) ──────────────────────────────────');

  try {
    // Order matters: children before parents (FK constraints)
    const tables = [
      'procedural_memories',
      'social_memories',
      'semantic_memories',
      'episodic_memories',
      'runs',
      'haseefs',
      'scope_tools',
      'scopes',
      'core_api_keys',
    ];

    for (const table of tables) {
      const result = await pool.query(`DELETE FROM ${table}`);
      console.log(`  ✓ ${table} — ${result.rowCount} rows deleted`);
    }

    console.log('  ✅ Core DB wiped');
  } catch (err) {
    console.error('  ❌ Core DB error:', err);
  } finally {
    await pool.end();
  }
}

async function wipeSpaces() {
  const pool = new pg.Pool({ connectionString: SPACES_DB_URL });
  console.log('\n── Spaces DB (spaces_db) ───────────────────────────────');

  try {
    // Order: deepest children first, then parents
    // Keep: scope_templates
    const tables = [
      'message_responses',
      'smart_space_messages',
      'smart_space_memberships',
      'invitations',
      'smart_spaces',
      'media_assets',
      'clients',
      'haseef_watches',
      'haseef_schedules',
      'haseef_ownerships',
      'scope_instance_configs',
      'scope_instances',
      'base_members',
      'bases',
      'api_keys',
      'entities',
      'users',
      // scope_templates — KEPT
    ];

    for (const table of tables) {
      try {
        const result = await pool.query(`DELETE FROM ${table}`);
        console.log(`  ✓ ${table} — ${result.rowCount} rows deleted`);
      } catch (err: any) {
        // Table might not exist yet if migrations haven't run
        console.log(`  ⚠ ${table} — skipped (${err.message?.split('\n')[0]})`);
      }
    }

    // Reset sequences for smart_space_messages seq counter
    try {
      await pool.query(`
        DO $$ 
        DECLARE r RECORD;
        BEGIN
          FOR r IN SELECT sequencename FROM pg_sequences WHERE schemaname = 'public'
          LOOP
            EXECUTE 'ALTER SEQUENCE ' || quote_ident(r.sequencename) || ' RESTART WITH 1';
          END LOOP;
        END $$;
      `);
      console.log('  ✓ sequences reset');
    } catch { /* ignore */ }

    console.log('  ✅ Spaces DB wiped (scope_templates preserved)');
  } catch (err) {
    console.error('  ❌ Spaces DB error:', err);
  } finally {
    await pool.end();
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  WIPING ALL USER & HASEEF DATA FROM BOTH DATABASES         ║');
  console.log('║  Keeping: scope_templates                                  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  await wipeCore();
  await wipeSpaces();

  console.log('\n✅ Done. Both databases are clean.');
  console.log('   Next: run bootstrap-service-key.ts to generate a new service key.\n');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
