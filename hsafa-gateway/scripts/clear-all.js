import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://hsafa:hsafa123@localhost:5434/hsafa_db',
});

async function main() {
  const client = await pool.connect();
  try {
    const tables = [
      'agent_consciousness',
      'smart_space_messages',
      'runs',
      'inbox_events',
    ];

    for (const table of tables) {
      const result = await client.query(`DELETE FROM ${table}`);
      console.log(`${table}: ${result.rowCount} rows deleted`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
