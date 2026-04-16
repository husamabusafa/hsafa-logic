// =============================================================================
// Bootstrap Script — Generate a Secret Key
//
// Generates a random secret key string. Set it as SECRET_KEY in Core's .env
// and as CORE_SECRET_KEY in Spaces' .env.
//
// Usage: npx tsx scripts/bootstrap-service-key.ts
// =============================================================================

import { randomBytes } from 'node:crypto';

const key = randomBytes(32).toString('hex');

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║  Secret key generated!                                      ║');
console.log('╠══════════════════════════════════════════════════════════════╣');
console.log('║                                                              ║');
console.log(`║  ${key}`);
console.log('║                                                              ║');
console.log('║  Add to Core .env:                                           ║');
console.log(`║  SECRET_KEY=${key}`);
console.log('║                                                              ║');
console.log('║  Add to Spaces .env:                                         ║');
console.log(`║  CORE_SECRET_KEY=${key}`);
console.log('╚══════════════════════════════════════════════════════════════╝');
