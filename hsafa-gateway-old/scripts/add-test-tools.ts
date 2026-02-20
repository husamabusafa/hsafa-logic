import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Replaces ALL tools on ALL agents with the 3 example tools:
 * 1. fetchTodo (request) — REST API call to jsonplaceholder
 * 2. generateImage (image-generator) — via OpenRouter / Gemini
 * 3. MCP tools — loaded dynamically from Hsafa MCP server
 */

const NEW_TOOLS = [
  // 1. REQUEST TOOL: REST API
  {
    name: 'fetchTodo',
    description: 'Fetch a todo item from the JSONPlaceholder API. Use when the user asks about a todo, task, or wants to look up a todo by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        todoId: { type: 'number', description: 'The todo ID to fetch (1-200)' },
      },
      required: ['todoId'],
    },
    executionType: 'request',
    execution: {
      url: 'https://jsonplaceholder.typicode.com/todos/{{todoId}}',
      method: 'GET',
    },
  },
  // 2. IMAGE GENERATOR TOOL: OpenRouter / Gemini
  {
    name: 'generateImage',
    description: 'Generate an image from a text description. Use when the user asks to create, draw, or generate any image or visual.',
    executionType: 'image-generator',
    execution: {
      provider: 'openrouter',
      model: 'google/gemini-3-pro-image-preview',
    },
  },
];

const NEW_MCP = {
  servers: [
    {
      name: 'hsafa-mcp',
      url: 'https://mcp.hsafa.com/metamcp/hsafa-endpoint/sse',
      transport: 'sse',
    },
  ],
};

const SYSTEM_PROMPT_SUFFIX = `

You have access to these tools:
1. MCP tools from the Hsafa MCP server — use whatever tools are available from the server.
2. fetchTodo — Fetches a todo item from an external API by ID. Use when asked about todos or tasks.
3. generateImage — Generates images from text descriptions using AI. Use when asked to create, draw, or generate any image.

Use these tools when the user asks about them or requests related functionality.`;

async function main() {
  const agents = await prisma.agent.findMany({ select: { id: true, name: true, configJson: true } });
  console.log(`Found ${agents.length} agent(s). Replacing tools on all:\n`);

  for (const agent of agents) {
    const config = agent.configJson as any;
    if (!config || typeof config !== 'object') {
      console.log(`  ⏭ ${agent.name} (${agent.id}) — no valid config, skipping`);
      continue;
    }

    const oldToolCount = (config.tools ?? []).length;

    // Replace tools and MCP config
    const updatedConfig = {
      ...config,
      tools: NEW_TOOLS,
      mcp: NEW_MCP,
    };

    // Update system prompt
    if (updatedConfig.agent?.system) {
      // Remove old tool mentions and add new ones
      const baseSystem = updatedConfig.agent.system
        .replace(/\n\nYou have access to these tools:[\s\S]*$/, '')
        .replace(/\n\nYou also have these additional tools:[\s\S]*$/, '');
      updatedConfig.agent.system = baseSystem + SYSTEM_PROMPT_SUFFIX;
    }

    await prisma.agent.update({
      where: { id: agent.id },
      data: { configJson: updatedConfig },
    });

    console.log(`  ✅ ${agent.name} (${agent.id}) — replaced ${oldToolCount} tools → ${NEW_TOOLS.length} tools + MCP`);
  }

  console.log('\nDone!');
}

main()
  .catch((e) => {
    console.error('❌ Failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
