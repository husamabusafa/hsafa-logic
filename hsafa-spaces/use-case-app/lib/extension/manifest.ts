// =============================================================================
// Spaces Service — Tool Definitions (V5)
//
// Defines the tools registered under the "spaces" scope.
// Tools are synced to Core via PUT /api/haseefs/:id/scopes/spaces/tools.
// =============================================================================

/** V5 scope name for this service */
export const SCOPE = "spaces";

/**
 * Tool definitions to register with Core.
 * Each tool has name, description, inputSchema, and optional mode/timeout.
 */
export const TOOLS = [
  {
    name: "send_message",
    description:
      "Send a message to a space. Returns {success:true, messageId} on delivery — do NOT retry on success.",
    inputSchema: {
      type: "object" as const,
      properties: {
        spaceId: {
          type: "string",
          description: "The space ID to send the message to.",
        },
        text: {
          type: "string",
          description: "The message text to send.",
        },
      },
      required: ["spaceId", "text"],
    },
    mode: "sync" as const,
  },
  {
    name: "get_messages",
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
    mode: "sync" as const,
  },
  {
    name: "get_spaces",
    description:
      "List all spaces you are a member of. Returns [{id, name, description, memberCount}].",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
    mode: "sync" as const,
  },
  {
    name: "confirmAction",
    description:
      "Show a confirmation card in the space with title, message, and Confirm/Cancel buttons. The user's choice is returned when they click. Use for approvals, confirmations, or yes/no decisions.",
    inputSchema: {
      type: "object" as const,
      properties: {
        spaceId: {
          type: "string",
          description: "The space ID to show the confirmation in.",
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
    mode: "sync" as const,
  },
  {
    name: "displayChart",
    description:
      "Display a chart (bar, line, or pie) in the space. Use to visualize data.",
    inputSchema: {
      type: "object" as const,
      properties: {
        spaceId: {
          type: "string",
          description: "The space ID to show the chart in.",
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
    mode: "sync" as const,
  },
];
