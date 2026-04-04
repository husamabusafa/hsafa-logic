// =============================================================================
// Bootstrap Script — Generate Initial Service Key
//
// Run this once after setting up the Core database to create the first
// service key. Copy the output key into your Spaces .env as CORE_SERVICE_KEY.
//
// Usage: node --env-file=.env --import tsx scripts/bootstrap-service-key.ts
// =============================================================================

import { prisma } from '../src/lib/db.js';
import { createApiKey } from '../src/lib/api-keys.js';

async function main() {
  console.log('Generating initial service key...\n');

  const { key, record } = await createApiKey({
    type: 'service',
    description: 'Bootstrap service key for Spaces backend',
  });

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Service key created successfully!                          ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Key ID:    ${record.id}`);
  console.log(`║  Prefix:    ${record.keyPrefix}`);
  console.log('║                                                              ║');
  console.log('║  ⚠  COPY THIS KEY NOW — it will never be shown again:       ║');
  console.log('║                                                              ║');
  console.log(`║  ${key}`);
  console.log('║                                                              ║');
  console.log('║  Add to your Spaces .env:                                    ║');
  console.log(`║  CORE_SERVICE_KEY=${key}`);
  console.log('╚══════════════════════════════════════════════════════════════╝');
}

main()
  .catch((err) => {
    console.error('Failed to generate service key:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
