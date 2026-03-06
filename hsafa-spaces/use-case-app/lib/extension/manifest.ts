// =============================================================================
// Extension Manifest
//
// Defines the tools and instructions this extension provides to haseefs.
// Served at GET /api/extension/manifest.
// =============================================================================

export const MANIFEST = {
  name: "ext-spaces",
  description: "Bridges the Spaces communication platform to Haseefs",
  version: "3.0.0",
  tools: [
    {
      name: "enter_space",
      description:
        "Enter a space to load its context: space info, members, and recent conversation history. You MUST call this before sending messages to a space. Returns {space, members, messages}.",
      inputSchema: {
        type: "object" as const,
        properties: {
          spaceId: {
            type: "string",
            description:
              "The space ID to enter. Use the spaceId from your inbox sense events.",
          },
        },
        required: ["spaceId"],
      },
    },
    {
      name: "send_space_message",
      description:
        "Send a message to a space. You MUST call enter_space first to load context. Returns {success:true, messageId} on delivery — do NOT retry on success.",
      inputSchema: {
        type: "object" as const,
        properties: {
          spaceId: {
            type: "string",
            description: "The space ID to send the message to. MUST be provided.",
          },
          text: {
            type: "string",
            description: "The message text to send.",
          },
        },
        required: ["spaceId", "text"],
      },
    },
    {
      name: "read_space_messages",
      description:
        "Read recent messages from a space. Returns the latest messages in chronological order.",
      inputSchema: {
        type: "object" as const,
        properties: {
          spaceId: {
            type: "string",
            description: "The space ID to read messages from.",
          },
          limit: {
            type: "number",
            description: "Number of messages to read (default 20, max 100).",
          },
        },
        required: ["spaceId"],
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
    type: "object",
    properties: {
      agentEntityId: {
        type: "string",
        description:
          "The entity ID of this haseef in spaces-app. If omitted, auto-resolved by matching haseef name.",
      },
      connectedSpaceIds: {
        type: "array",
        items: { type: "string" },
        description:
          "Space IDs to listen to. If omitted, auto-resolved from entity memberships.",
      },
    },
  },
  events: ["message"],
  autoConnect: false,
  requiredConfig: [],
  healthCheck: "/api/health",
  capabilities: ["sense", "act"],
};
