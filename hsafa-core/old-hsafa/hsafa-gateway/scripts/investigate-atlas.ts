import { PrismaClient } from '../prisma/generated/client/index.js';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

async function investigate() {
  console.log('=== 1. ALL SPACES ===');
  const spaces = await prisma.smartSpace.findMany({
    select: { id: true, name: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  for (const s of spaces) {
    console.log(`  [${s.id}] "${s.name}" (created ${s.createdAt.toISOString()})`);
  }

  console.log('\n=== 2. ALL ENTITIES ===');
  const entities = await prisma.entity.findMany({
    select: { id: true, displayName: true, type: true },
    orderBy: { type: 'asc' },
  });
  for (const e of entities) {
    console.log(`  [${e.id}] "${e.displayName}" (${e.type})`);
  }

  // Find Ahmad's space
  const ahmadSpace = spaces.find(s => s.name?.toLowerCase().includes('ahmad'));
  if (ahmadSpace) {
    console.log(`\n=== 3. AHMAD'S SPACE: "${ahmadSpace.name}" [${ahmadSpace.id}] ===`);

    // Members
    const members = await prisma.smartSpaceMembership.findMany({
      where: { smartSpaceId: ahmadSpace.id },
      include: { entity: { select: { displayName: true, type: true } } },
    });
    console.log('  Members:');
    for (const m of members) {
      console.log(`    - ${m.entity.displayName} (${m.entity.type}) [${m.entityId}]`);
    }

    // Messages
    const messages = await prisma.smartSpaceMessage.findMany({
      where: { smartSpaceId: ahmadSpace.id },
      orderBy: { seq: 'desc' },
      take: 20,
      include: { entity: { select: { displayName: true, type: true } } },
    });
    console.log(`  Last ${messages.length} messages:`);
    for (const m of messages.reverse()) {
      console.log(`    [seq=${m.seq}] ${m.entity.displayName} (${m.entity.type}): "${(m.content ?? '').slice(0, 120)}"`);
    }
  } else {
    console.log('\n=== 3. NO SPACE FOUND WITH "ahmad" IN NAME ===');
  }

  // Find Atlas entity
  const atlas = entities.find(e => e.displayName?.toLowerCase().includes('atlas'));
  if (atlas) {
    console.log(`\n=== 4. ATLAS RECENT RUNS [${atlas.id}] ===`);
    const runs = await prisma.run.findMany({
      where: { agentEntityId: atlas.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        status: true,
        cycleNumber: true,
        triggerType: true,
        triggerSpaceId: true,
        stepCount: true,
        durationMs: true,
        errorMessage: true,
        createdAt: true,
      },
    });
    for (const r of runs) {
      const triggerSpace = spaces.find(s => s.id === r.triggerSpaceId);
      console.log(`  Run ${r.id} | cycle=${r.cycleNumber} | status=${r.status} | trigger=${r.triggerType} from "${triggerSpace?.name ?? 'N/A'}" | steps=${r.stepCount} | ${r.durationMs}ms | ${r.createdAt.toISOString()}`);
      if (r.errorMessage) console.log(`    ERROR: ${r.errorMessage}`);
    }

    // Check Atlas's memberships
    console.log('\n=== 5. ATLAS SPACE MEMBERSHIPS ===');
    const atlasMemberships = await prisma.smartSpaceMembership.findMany({
      where: { entityId: atlas.id },
      include: { smartSpace: { select: { name: true } } },
    });
    for (const m of atlasMemberships) {
      console.log(`    - "${m.smartSpace.name}" [${m.smartSpaceId}]`);
    }

    // Check Atlas consciousness for recent enter_space / send_message calls
    console.log('\n=== 6. ATLAS CONSCIOUSNESS — RECENT TOOL CALLS ===');
    const consciousness = await prisma.agentConsciousness.findUnique({
      where: { agentEntityId: atlas.id },
    });
    if (consciousness) {
      const msgs = consciousness.messages as any[];
      console.log(`  Total consciousness messages: ${msgs.length}`);
      // Find assistant messages with tool calls in the last N messages
      const recent = msgs.slice(-40);
      const startIdx = msgs.length - recent.length;
      for (let i = 0; i < recent.length; i++) {
        const msg = recent[i];
        const idx = startIdx + i;
        if (msg.role === 'assistant' && Array.isArray(msg.content)) {
          for (const part of msg.content) {
            if (part.type === 'tool-call') {
              const argsStr = part.args ? JSON.stringify(part.args) : '{}';
              console.log(`  [${idx}] TOOL CALL: ${part.toolName}(${argsStr.slice(0, 250)})`);
            }
          }
          // Also show internal text
          const textParts = msg.content.filter((p: any) => p.type === 'text');
          if (textParts.length > 0) {
            const text = textParts.map((p: any) => p.text).join('');
            if (text.trim()) {
              console.log(`  [${idx}] INTERNAL TEXT: "${text.trim().slice(0, 300)}"`);
            }
          }
        }
        if (msg.role === 'tool') {
          const content = Array.isArray(msg.content) ? msg.content : [{ type: 'tool-result', result: msg.content }];
          for (const part of content) {
            if (part.type === 'tool-result') {
              const res = part.result;
              const resultStr = typeof res === 'string' ? res : JSON.stringify(res ?? 'undefined');
              console.log(`  [${idx}] TOOL RESULT (${part.toolName ?? '?'}): ${resultStr.slice(0, 250)}`);
            }
          }
        }
        if (msg.role === 'user') {
          const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
          if (content.includes('INBOX')) {
            console.log(`  [${idx}] INBOX: ${content.slice(0, 300)}`);
          }
        }
      }
    } else {
      console.log('  No consciousness found for Atlas');
    }
  }

  // Find Team Chat space messages (last 10)
  const teamChat = spaces.find(s => s.name?.toLowerCase().includes('team'));
  if (teamChat) {
    console.log(`\n=== 7. TEAM CHAT RECENT MESSAGES [${teamChat.id}] ===`);
    const msgs = await prisma.smartSpaceMessage.findMany({
      where: { smartSpaceId: teamChat.id },
      orderBy: { seq: 'desc' },
      take: 15,
      include: { entity: { select: { displayName: true, type: true } } },
    });
    for (const m of msgs.reverse()) {
      console.log(`  [seq=${m.seq}] ${m.entity.displayName} (${m.entity.type}): "${(m.content ?? '').slice(0, 150)}"`);
    }
  }

  await prisma.$disconnect();
}

investigate().catch(console.error);
