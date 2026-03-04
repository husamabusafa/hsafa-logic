import http from 'node:http';
import { loadConfig } from './config.js';
import { CoreClient } from './core-client.js';
import { SpacesClient } from './spaces-client.js';
import { SpacesListener, type ListenerOptions } from './spaces-listener.js';
import { HaseefStreamBridge, type StreamBridgeOptions } from './stream-bridge.js';

// =============================================================================
// ext-spaces — Spaces Extension (Manifest + Webhook)
//
// A generic, stateless HTTP server that bridges hsafa-spaces/spaces-app ↔
// hsafa-core. No haseef-specific data stored — all config comes via webhooks
// or is resolved dynamically from spaces-app.
//
// Endpoints:
//   GET  /manifest  — Returns the extension manifest (tools, instructions)
//   POST /webhook   — Handles tool_call + lifecycle events from Core
//
// Sense events:
//   SpacesListeners connect to spaces-app SSE and push events to Core.
//   Listeners are started/stopped via haseef.connected/disconnected webhooks.
// =============================================================================

// =============================================================================
// Manifest — served at GET /manifest
// =============================================================================

const MANIFEST = {
  name: 'ext-spaces',
  description: 'Bridges the Spaces communication platform to Haseefs',
  version: '2.0.0',
  tools: [
    {
      name: 'enter_space',
      description: 'Enter a space to load its context: space info, members, and recent conversation history. You MUST call this before sending messages to a space. Returns {space, members, messages}.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          spaceId: {
            type: 'string',
            description: 'The space ID to enter. Use the spaceId from your inbox sense events.',
          },
        },
        required: ['spaceId'],
      },
    },
    {
      name: 'send_space_message',
      description: 'Send a message to a space. You MUST call enter_space first to load context. Returns {success:true, messageId} on delivery — do NOT retry on success.',
      messageTool: true,
      inputSchema: {
        type: 'object' as const,
        properties: {
          spaceId: {
            type: 'string',
            description: 'The space ID to send the message to. MUST be provided.',
          },
          text: {
            type: 'string',
            description: 'The message text to send.',
          },
        },
        required: ['spaceId', 'text'],
      },
    },
    {
      name: 'read_space_messages',
      description: 'Read recent messages from a space. Returns the latest messages in chronological order.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          spaceId: {
            type: 'string',
            description: 'The space ID to read messages from.',
          },
          limit: {
            type: 'number',
            description: 'Number of messages to read (default 20, max 100).',
          },
        },
        required: ['spaceId'],
      },
    },
  ],
  instructions: `[Extension: Spaces]
You are connected to the Spaces communication platform.
When you receive a message from a space in your sense events:
  1. FIRST call enter_space(spaceId) to load the space context (info, members, conversation history).
  2. Read the conversation history returned by enter_space to understand the full context.
  3. Then call send_space_message(spaceId, text) to respond.
- ALWAYS call enter_space BEFORE sending a message. Without it you have no conversation context.
- ALWAYS provide spaceId when calling space tools.
- Messages are delivered reliably — do NOT retry on success.
- Use read_space_messages(spaceId) if you need to refresh history mid-conversation.
- When someone messages you in a space, respond in that same space.
- Your text output is INTERNAL reasoning — only tool calls are visible to others.`,
  configSchema: {
    type: 'object',
    properties: {
      agentEntityId: {
        type: 'string',
        description: 'The entity ID of this haseef in spaces-app. If omitted, auto-resolved by matching haseef name.',
      },
      connectedSpaceIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Space IDs to listen to. If omitted, auto-resolved from entity memberships.',
      },
    },
  },
  events: ['message'],
};

// =============================================================================
// Active state — listeners managed by lifecycle webhooks
// =============================================================================

// Derive set of message_tool names from manifest
const MESSAGE_TOOL_NAMES = new Set(
  MANIFEST.tools.filter((t) => (t as any).messageTool).map((t) => t.name),
);

const activeListeners = new Map<string, SpacesListener>(); // haseefId → listener
const activeBridges = new Map<string, HaseefStreamBridge>(); // haseefId → stream bridge
const resolvedConfigs = new Map<string, Record<string, unknown>>(); // haseefId → auto-resolved config

// =============================================================================
// Webhook Handlers
// =============================================================================

async function handleToolCall(
  body: Record<string, unknown>,
  spacesClient: SpacesClient,
): Promise<unknown> {
  const toolName = body.toolName as string;
  const args = body.args as Record<string, unknown>;
  const haseefId = body.haseefId as string;
  const dbConfig = (body.config ?? {}) as Record<string, unknown>;
  const resolved = resolvedConfigs.get(haseefId) ?? {};
  const config = { ...resolved, ...dbConfig };
  const agentEntityId = config.agentEntityId as string | undefined;

  switch (toolName) {
    case 'enter_space': {
      const spaceId = args.spaceId as string;
      if (!spaceId) return { error: 'spaceId is required' };

      const [space, members, messagesResult] = await Promise.all([
        spacesClient.getSpace(spaceId).catch(() => ({ id: spaceId, name: null })),
        spacesClient.getMembers(spaceId).catch(() => []),
        spacesClient.readMessages(spaceId, 20).catch(() => ({ messages: [] })),
      ]);

      return { space, members, messages: messagesResult.messages };
    }

    case 'send_space_message': {
      const spaceId = args.spaceId as string;
      const text = args.text as string;
      if (!spaceId || !text) return { error: 'spaceId and text are required' };
      if (!agentEntityId) return { error: 'agentEntityId not configured — set it in the extension config for this haseef' };

      // messageTool: persist as SmartSpaceMessage with metadata
      const toolCallId = body.toolCallId as string | undefined;
      const result = await spacesClient.sendMessage(spaceId, agentEntityId, text, {
        type: 'message_tool',
        toolName,
        ...(toolCallId ? { toolCallId } : {}),
      });
      return { success: true, messageId: result.message.id };
    }

    case 'read_space_messages': {
      const spaceId = args.spaceId as string;
      const limit = (args.limit as number) || 20;
      if (!spaceId) return { error: 'spaceId is required' };

      const result = await spacesClient.readMessages(spaceId, Math.min(limit, 100));
      return { messages: result.messages };
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

async function handleLifecycle(
  body: Record<string, unknown>,
  config_obj: ReturnType<typeof loadConfig>,
  coreClient: CoreClient,
  spacesClient: SpacesClient,
): Promise<void> {
  const type = body.type as string;
  const haseefId = body.haseefId as string;
  const haseefName = (body.haseefName as string) ?? haseefId;
  const webhookConfig = (body.config ?? {}) as Record<string, unknown>;

  if (type === 'haseef.connected' || type === 'haseef.config_updated') {
    // Stop existing listener + bridge if any
    const existing = activeListeners.get(haseefId);
    if (existing) {
      existing.stop();
      activeListeners.delete(haseefId);
    }
    const existingBridge = activeBridges.get(haseefId);
    if (existingBridge) {
      await existingBridge.stop();
      activeBridges.delete(haseefId);
    }

    // Resolve agentEntityId
    let agentEntityId = webhookConfig.agentEntityId as string | undefined;
    if (!agentEntityId) {
      const entity = await spacesClient.findAgentEntityByName(haseefName);
      if (entity) {
        agentEntityId = entity.id;
        console.log(`[ext-spaces] Resolved ${haseefName} → entityId ${agentEntityId}`);
      }
    }

    if (!agentEntityId) {
      console.warn(`[ext-spaces] Cannot resolve entityId for ${haseefName} — no listener started`);
      return;
    }

    // Resolve spaceIds
    let spaceIds = (webhookConfig.connectedSpaceIds as string[]) ?? [];
    if (spaceIds.length === 0) {
      const spaces = await spacesClient.getEntitySpaces(agentEntityId);
      spaceIds = spaces.map((s) => s.id);
      console.log(`[ext-spaces] Resolved ${haseefName} spaces: ${spaceIds.length} space(s)`);
    }

    // Start listener
    const opts: ListenerOptions = { haseefId, haseefName, agentEntityId, spaceIds };
    const listener = new SpacesListener(config_obj, coreClient, opts);
    listener.start();
    activeListeners.set(haseefId, listener);

    // Start stream bridge (forwards haseef LLM streaming to spaces-app SSE)
    const bridgeOpts: StreamBridgeOptions = { haseefId, haseefName, agentEntityId, spaceIds, messageToolNames: MESSAGE_TOOL_NAMES };
    const bridge = new HaseefStreamBridge(config_obj, bridgeOpts);
    await bridge.start();
    activeBridges.set(haseefId, bridge);

    // Store resolved config so tool calls can access agentEntityId
    resolvedConfigs.set(haseefId, { agentEntityId, connectedSpaceIds: spaceIds });

    console.log(`[ext-spaces] Listener + bridge started for ${haseefName} (${spaceIds.length} spaces)`);

  } else if (type === 'haseef.disconnected') {
    const existing = activeListeners.get(haseefId);
    if (existing) {
      existing.stop();
      activeListeners.delete(haseefId);
    }
    const existingBridge = activeBridges.get(haseefId);
    if (existingBridge) {
      await existingBridge.stop();
      activeBridges.delete(haseefId);
    }
    resolvedConfigs.delete(haseefId);
    if (existing || existingBridge) {
      console.log(`[ext-spaces] Listener + bridge stopped for ${haseefName}`);
    }
  }
}

// =============================================================================
// HTTP Server
// =============================================================================

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

async function main(): Promise<void> {
  const config = loadConfig();
  const coreClient = new CoreClient(config);
  const spacesClient = new SpacesClient(config);

  console.log('[ext-spaces] Starting...');
  console.log(`[ext-spaces] Core: ${config.coreUrl}`);
  console.log(`[ext-spaces] Spaces App: ${config.spacesAppUrl}`);

  // Bootstrap: discover existing connections and start listeners
  try {
    const me = await coreClient.getMe();
    console.log(`[ext-spaces] Extension: ${me.name} (${me.id})`);
    console.log(`[ext-spaces] ${me.connections.length} existing connection(s)`);

    for (const conn of me.connections) {
      await handleLifecycle(
        { type: 'haseef.connected', haseefId: conn.haseefId, haseefName: conn.haseefName, config: conn.config },
        config, coreClient, spacesClient,
      );
    }
  } catch (err) {
    console.warn('[ext-spaces] Bootstrap self-discovery failed (will rely on webhooks):', err);
  }

  // Start HTTP server
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${config.port}`);

    // GET /manifest
    if (req.method === 'GET' && url.pathname === '/manifest') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(MANIFEST));
      return;
    }

    // GET /health
    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, listeners: activeListeners.size }));
      return;
    }

    // POST /webhook
    if (req.method === 'POST' && url.pathname === '/webhook') {
      try {
        const rawBody = await readBody(req);
        const body = JSON.parse(rawBody) as Record<string, unknown>;
        const type = body.type as string;

        if (type === 'tool_call') {
          const result = await handleToolCall(body, spacesClient);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } else if (type?.startsWith('haseef.')) {
          // Lifecycle events — handle async, respond immediately
          handleLifecycle(body, config, coreClient, spacesClient).catch((err) =>
            console.error(`[ext-spaces] Lifecycle error (${type}):`, err),
          );
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Unknown webhook type: ${type}` }));
        }
      } catch (err) {
        console.error('[ext-spaces] Webhook error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }));
      }
      return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  server.listen(config.port, () => {
    console.log(`[ext-spaces] HTTP server listening on port ${config.port}`);
    console.log('[ext-spaces] Ready — GET /manifest, POST /webhook');
  });
}

// =============================================================================
// Graceful shutdown
// =============================================================================

async function shutdown(): Promise<void> {
  console.log('\n[ext-spaces] Shutting down...');
  for (const listener of activeListeners.values()) {
    listener.stop();
  }
  activeListeners.clear();
  for (const bridge of activeBridges.values()) {
    await bridge.stop();
  }
  activeBridges.clear();
  console.log('[ext-spaces] Stopped');
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

main().catch((err) => {
  console.error('[ext-spaces] Fatal error:', err);
  process.exit(1);
});
