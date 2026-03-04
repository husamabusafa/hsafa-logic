import { loadConfig } from './config.js';
import { CoreClient } from './core-client.js';
import { SpacesClient } from './spaces-client.js';
import { SpacesListener } from './spaces-listener.js';
import { StreamBridge } from './stream-bridge.js';
import { ToolHandler } from './tool-handler.js';
import type { HaseefConnection } from './config.js';

// =============================================================================
// ext-spaces — Spaces Extension
//
// Bridges hsafa-spaces/spaces-app ↔ hsafa-core.
//
// Lifecycle:
//   1. Bootstrap: discover self via GET /api/extensions/me
//   2. Sync tools (enter_space, send_space_message, read_space_messages) with core
//   3. Update instructions in core
//   4. For each connected haseef:
//      a. Start SSE listener → push SenseEvents to core
//      b. Subscribe to Redis channel for tool calls → execute via spaces-app API
// =============================================================================

const TOOLS = [
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
];

const INSTRUCTIONS = `[Extension: Spaces]
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
- Your text output is INTERNAL reasoning — only tool calls are visible to others.`;

// =============================================================================
// Active state
// =============================================================================

const listeners: SpacesListener[] = [];
let toolHandler: ToolHandler | null = null;
let streamBridge: StreamBridge | null = null;

// =============================================================================
// Bootstrap
// =============================================================================

async function main(): Promise<void> {
  const config = loadConfig();
  const coreClient = new CoreClient(config);
  const spacesClient = new SpacesClient(config);

  console.log('[ext-spaces] Starting...');
  console.log(`[ext-spaces] Core: ${config.coreUrl}`);
  console.log(`[ext-spaces] Spaces App: ${config.spacesAppUrl}`);

  // 1. Self-discover
  const me = await coreClient.getMe();
  console.log(`[ext-spaces] Extension ID: ${me.id}, name: ${me.name}`);
  console.log(`[ext-spaces] Connected to ${me.connections.length} haseef(s)`);

  // 2. Sync tools with core
  await coreClient.syncTools(me.id, TOOLS);
  console.log(`[ext-spaces] Tools synced: ${TOOLS.map((t) => t.name).join(', ')}`);

  // 3. Update instructions
  await coreClient.updateInstructions(me.id, INSTRUCTIONS);
  console.log('[ext-spaces] Instructions updated');

  // 4. Parse connections and auto-resolve agentEntityId + connectedSpaceIds from spaces-app
  const rawConnections = me.connections.map((c) => coreClient.parseConnection(c));

  if (rawConnections.length === 0) {
    console.log('[ext-spaces] No haseefs connected — waiting for connections...');
    return;
  }

  const connections: HaseefConnection[] = [];
  for (const raw of rawConnections) {
    let entityId = raw.agentEntityId;
    let spaceIds = raw.connectedSpaceIds;

    // Auto-resolve agentEntityId from spaces-app by matching haseef name → entity displayName
    if (!entityId) {
      const entity = await spacesClient.findAgentEntityByName(raw.agentName);
      if (entity) {
        entityId = entity.id;
        console.log(`[ext-spaces] Resolved ${raw.agentName} → entityId ${entityId}`);
      } else {
        console.warn(`[ext-spaces] Could not resolve entityId for ${raw.agentName} — skipping`);
        continue;
      }
    }

    // Auto-resolve connectedSpaceIds from spaces-app memberships
    if (spaceIds.length === 0) {
      const spaces = await spacesClient.getEntitySpaces(entityId);
      spaceIds = spaces.map((s) => s.id);
      console.log(`[ext-spaces] Resolved ${raw.agentName} spaces: ${spaceIds.length} space(s)`);
    }

    connections.push({
      agentId: raw.agentId,
      agentName: raw.agentName,
      agentEntityId: entityId,
      connectedSpaceIds: spaceIds,
    });
  }

  if (connections.length === 0) {
    console.log('[ext-spaces] No resolvable haseef connections — exiting');
    return;
  }

  // 5. Start tool handler (one subscriber for all haseefs)
  toolHandler = new ToolHandler(config, coreClient, spacesClient, me.id, connections);
  await toolHandler.start();
  console.log('[ext-spaces] Tool handler started');

  // 6. Start stream bridge (forwards LLM streaming to spaces-app SSE)
  streamBridge = new StreamBridge(config, connections);
  await streamBridge.start();
  console.log('[ext-spaces] Stream bridge started');

  // 7. Start SSE listeners (one per haseef)
  for (const conn of connections) {
    const listener = new SpacesListener(config, coreClient, conn);
    listener.start();
    listeners.push(listener);
    console.log(`[ext-spaces] SSE listener started for ${conn.agentName} (${conn.agentEntityId})`);
  }

  console.log('[ext-spaces] Ready — bridging Spaces App ↔ Core');
}

// =============================================================================
// Graceful shutdown
// =============================================================================

async function shutdown(): Promise<void> {
  console.log('\n[ext-spaces] Shutting down...');

  for (const listener of listeners) {
    listener.stop();
  }

  if (toolHandler) {
    await toolHandler.stop();
  }

  if (streamBridge) {
    await streamBridge.stop();
  }

  console.log('[ext-spaces] Stopped');
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start
main().catch((err) => {
  console.error('[ext-spaces] Fatal error:', err);
  process.exit(1);
});
