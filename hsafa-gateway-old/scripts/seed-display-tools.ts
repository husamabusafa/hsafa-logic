import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Updates ALL agents with displayTool-enabled tools for testing.
 *
 * Tools added:
 * 1. fetchTodo (request, displayTool: true) — REST API call, visible in space when targetSpaceId provided
 * 2. generateImage (image-generator, displayTool: true) — image gen, visible in space
 * 3. lookupWeather (request, displayTool: true) — weather API, visible in space
 *
 * The AI can:
 * - Call with targetSpaceId → tool call appears as a message in that space
 * - Call without targetSpaceId → silent execution (normal behavior)
 */

const DISPLAY_TOOLS = [
  // 1. REQUEST TOOL with displayTool: true
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
    displayTool: true,
  },
  // 2. IMAGE GENERATOR with displayTool: true
  {
    name: 'generateImage',
    description: 'Generate an image from a text description. Use when the user asks to create, draw, or generate any image or visual.',
    executionType: 'image-generator',
    execution: {
      provider: 'openrouter',
      model: 'google/gemini-3-pro-image-preview',
    },
    displayTool: true,
  },
  // 3. ANOTHER REQUEST TOOL with displayTool: true (weather-like mock)
  {
    name: 'fetchPost',
    description: 'Fetch a post from the JSONPlaceholder API. Use when the user asks about a post, article, or blog post by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        postId: { type: 'number', description: 'The post ID to fetch (1-100)' },
      },
      required: ['postId'],
    },
    executionType: 'request',
    execution: {
      url: 'https://jsonplaceholder.typicode.com/posts/{{postId}}',
      method: 'GET',
    },
    displayTool: true,
  },
  // 4. CLIENT TOOL — confirmation dialog (no server-side execution)
  {
    name: 'confirmAction',
    description: 'Show a confirmation dialog to the user and wait for their response. Use this BEFORE performing any destructive, irreversible, or important action. The run will pause until the user confirms or rejects.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short title for the confirmation dialog (e.g. "Delete account?")' },
        message: { type: 'string', description: 'Detailed message explaining what will happen if the user confirms' },
        confirmLabel: { type: 'string', description: 'Label for the confirm button. Default: "Confirm"' },
        rejectLabel: { type: 'string', description: 'Label for the cancel button. Default: "Cancel"' },
      },
      required: ['title', 'message'],
    },
    executionType: 'basic',
    // No execution → client tool. Run pauses at waiting_tool.
    displayTool: true,
  },
];

const SYSTEM_PROMPT_SUFFIX = `

You have access to these tools, all configured with displayTool — you can show their results in any space you're a member of:

1. fetchTodo — Fetches a todo item from an external API by ID. Always provide targetSpaceId to show the result in the space.
2. generateImage — Generates images from text descriptions using AI. Always provide targetSpaceId to show the result in the space.
3. fetchPost — Fetches a blog post by ID. Always provide targetSpaceId to show the result in the space.
4. confirmAction — Shows a confirmation dialog to the user. The run pauses until they confirm or reject. Use this before important actions.

IMPORTANT — displayTool routing:
- You have targetSpaceId available on all these tools (auto-injected by the gateway).
- ALWAYS provide targetSpaceId (the current space ID from your context) so the tool result is visible to the user.
- targetSpaceId MUST be provided FIRST in the JSON arguments, before any other fields.
- The gateway strips targetSpaceId before executing — you don't need to worry about it affecting the tool.`;

async function main() {
  // Load all spaces so we can log available space IDs for reference
  const spaces = await prisma.smartSpace.findMany({ select: { id: true, name: true } });
  console.log('Available spaces:');
  for (const s of spaces) {
    console.log(`  ${s.name}: ${s.id}`);
  }
  console.log();

  const agents = await prisma.agent.findMany({ select: { id: true, name: true, configJson: true } });
  console.log(`Found ${agents.length} agent(s). Updating tools:\n`);

  for (const agent of agents) {
    const config = agent.configJson as any;
    if (!config || typeof config !== 'object') {
      console.log(`  ⏭ ${agent.name} (${agent.id}) — no valid config, skipping`);
      continue;
    }

    const oldToolCount = (config.tools ?? []).length;

    const updatedConfig = {
      ...config,
      tools: DISPLAY_TOOLS,
      // Keep MCP if it exists
      ...(config.mcp ? { mcp: config.mcp } : {}),
    };

    // Update system prompt
    if (updatedConfig.agent?.system) {
      const baseSystem = updatedConfig.agent.system
        .replace(/\n\nYou have access to these tools[\s\S]*$/, '')
        .replace(/\n\nIMPORTANT — displayTool routing[\s\S]*$/, '');
      updatedConfig.agent.system = baseSystem + SYSTEM_PROMPT_SUFFIX;
    }

    await prisma.agent.update({
      where: { id: agent.id },
      data: { configJson: updatedConfig },
    });

    console.log(`  ✅ ${agent.name} (${agent.id}) — replaced ${oldToolCount} tools → ${DISPLAY_TOOLS.length} displayTool tools`);
  }

  console.log('\nDone! Agents now have displayTool-enabled tools.');
  console.log('Test by asking the agent to fetch a todo or generate an image.');
  console.log('The tool call should appear as a message in the space.');
}

main()
  .catch((e) => {
    console.error('❌ Failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
