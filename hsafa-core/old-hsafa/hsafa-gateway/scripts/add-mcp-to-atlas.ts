import { prisma } from '../src/lib/db.js';

async function main() {
  const atlas = await prisma.agent.findUnique({ where: { name: 'Atlas' } });
  if (!atlas) {
    console.error('Atlas agent not found');
    process.exit(1);
  }

  const config = atlas.configJson as any;

  // Add MCP server config
  config.mcp = {
    servers: [
      {
        name: 'hsafa-endpoint',
        url: 'https://mcp.hsafa.com/metamcp/hsafa-endpoint/sse',
        transport: 'sse',
      },
    ],
  };

  await prisma.agent.update({
    where: { id: atlas.id },
    data: { configJson: config },
  });

  console.log('✅ MCP server added to Atlas config:');
  console.log(JSON.stringify(config.mcp, null, 2));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect().catch(() => {}));
