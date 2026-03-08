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
    {
      name: "confirmAction",
      description:
        "Show a confirmation card in the space with title, message, and Confirm/Cancel buttons. The user's choice is returned when they click. Use for approvals, confirmations, or yes/no decisions. MUST call enter_space first.",
      inputSchema: {
        type: "object" as const,
        properties: {
          spaceId: {
            type: "string",
            description: "The space ID to show the confirmation in. MUST be provided.",
          },
          title: {
            type: "string",
            description: "Short title for the confirmation card.",
          },
          message: {
            type: "string",
            description: "The message or question to display.",
          },
          confirmLabel: {
            type: "string",
            description: "Label for the confirm button (default: Confirm).",
          },
          rejectLabel: {
            type: "string",
            description: "Label for the cancel/reject button (default: Cancel).",
          },
        },
        required: ["spaceId", "title", "message"],
      },
    },
    {
      name: "displayChart",
      description:
        "Display a chart (bar, line, or pie) in the space. Use to visualize data. MUST call enter_space first.",
      inputSchema: {
        type: "object" as const,
        properties: {
          spaceId: {
            type: "string",
            description: "The space ID to show the chart in. MUST be provided.",
          },
          type: {
            type: "string",
            enum: ["bar", "line", "pie"],
            description: "Chart type: bar, line, or pie.",
          },
          title: {
            type: "string",
            description: "Chart title.",
          },
          data: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                value: { type: "number" },
                color: { type: "string", description: "Optional hex color" },
              },
              required: ["label", "value"],
            },
            description: "Data points: [{ label, value, color? }, ...]",
          },
          xLabel: { type: "string", description: "Optional X-axis label." },
          yLabel: { type: "string", description: "Optional Y-axis label." },
        },
        required: ["spaceId", "type", "title", "data"],
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
- Your text output is INTERNAL reasoning — only tool calls are visible to others.
- Use confirmAction(spaceId, title, message, ...) when you need user approval before an action. The user's choice (confirmed/rejected) is returned.
- Use displayChart(spaceId, type, title, data, ...) to show bar/line/pie charts in the space.`,
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
  contextUrl: "/context",
};
