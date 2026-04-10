// =============================================================================
// Spaces Service — Tool Definitions (v7)
//
// Defines the tools registered under the "spaces" scope.
// Tools are registered globally via scope-registry → SDK.registerTools()
// → PUT /api/scopes/:scope/tools.
// =============================================================================

/** Scope name for this service */
export const SCOPE = "spaces";

/**
 * Scope-level instructions synced to core and injected into the Haseef's prompt.
 * These are spaces-specific — core remains generic.
 */
export const SCOPE_INSTRUCTIONS = `You interact with people through spaces — each space is a separate conversation.

HOW IT WORKS:
  Use spaces_send_message to reply. Your text output is internal thought — only tool calls reach people.
  When a message triggers you, you are automatically placed in that space — just send your reply.
  Use spaces_enter_space only when you need to switch to a DIFFERENT space than the one that triggered you.
  Events show [YOU ARE: YourName], the space info, recent conversation, and the new message.
  In recent conversation, "You" = your past messages. Only respond to the NEW MESSAGE.

IMPORTANT — ALWAYS REPLY:
  You MUST call spaces_send_message (or another messaging tool) before calling done.
  If you use a skill tool and it returns data, format it nicely and send it via spaces_send_message.
  If a tool call fails or returns an error, tell the user what happened via spaces_send_message.
  NEVER finish silently — the user cannot see tool results or your thoughts, only sent messages.

BASES:
  You belong to one or more "bases" — groups of humans and haseefs who work together.
  Use create_space to start conversations with anyone in your base.
  You can create 1-on-1 direct spaces or group spaces with multiple members from your base.
  Your bases and their members are listed below.

MESSAGE FORMAT:
  NEVER prefix your message with your name, a colon, ">" quotes, or any formatting.
  WRONG: "Nova: hello"  WRONG: "> hello"  WRONG: ": hello"
  RIGHT: "hello"
  The text you pass to send_message is displayed exactly as-is — just write the message content directly.

TIPS:
  Don't repeat yourself — check what you already said in the recent conversation.
  In group spaces, respond when addressed. In 1-on-1 with another haseef, avoid infinite loops.
  Use replyTo (with the sender's messageId) for threading when it adds clarity.
  Your spaces are listed below — use their spaceId with spaces_enter_space to switch to one.

VOICE MESSAGES:
  Mix voice and text — don't always use text. Use send_voice for friendly, casual, or emotional replies.
  Use text for detailed explanations, code, lists, or when precision matters. Vary your style naturally.`;

/**
 * Tool definitions to register with Core.
 * Each tool has name, description, inputSchema, and optional mode/timeout.
 */
export const TOOLS = [
  {
    name: "enter_space",
    description:
      "Enter a space — like opening a chat. Sets this as your current space. All subsequent send_message and interactive tool calls go here until you enter a different space. Returns the space name and member list so you know where you are.",
    inputSchema: {
      type: "object" as const,
      properties: {
        spaceId: {
          type: "string",
          description: "The space ID to enter.",
        },
      },
      required: ["spaceId"],
    },
    mode: "sync" as const,
  },
  {
    name: "send_message",
    description:
      "Send a message to your current space (the one you last entered). Returns {success:true, messageId} on delivery — do NOT retry on success.",
    inputSchema: {
      type: "object" as const,
      properties: {
        text: {
          type: "string",
          description: "The message text to send.",
        },
        replyTo: {
          type: "string",
          description: "Optional message ID to reply to.",
        },
      },
      required: ["text"],
    },
    mode: "sync" as const,
  },
  {
    name: "get_messages",
    description:
      "Read recent messages from a space. Defaults to your current space if no spaceId given.",
    inputSchema: {
      type: "object" as const,
      properties: {
        spaceId: {
          type: "string",
          description: "Optional space ID. Defaults to your current space.",
        },
        limit: {
          type: "number",
          description: "Number of messages to read (default 20, max 100).",
        },
      },
    },
    mode: "sync" as const,
  },
  {
    name: "send_confirmation",
    description:
      "Send a confirmation card to your current space. All members can confirm or reject. Stays open — you'll receive message_response events as people respond. Returns immediately with {messageId, status:'open'}.",
    inputSchema: {
      type: "object" as const,
      properties: {
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
          description: "Label for the reject button (default: Cancel).",
        },
        allowUpdate: {
          type: "boolean",
          description: "Allow users to change their response after submitting (default: true).",
        },
        replyTo: {
          type: "string",
          description: "Optional message ID to reply to.",
        },
      },
      required: ["title", "message"],
    },
    mode: "sync" as const,
  },
  {
    name: "send_choice",
    description:
      "Send a choice card with custom buttons in your current space. All members can respond. Stays open. Returns immediately with {messageId, status:'open'}.",
    inputSchema: {
      type: "object" as const,
      properties: {
        text: {
          type: "string",
          description: "The question or prompt text.",
        },
        options: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string", description: "Button display text." },
              value: { type: "string", description: "Value sent on click." },
            },
            required: ["label", "value"],
          },
          description: "The options to choose from: [{label, value}, ...]",
        },
        allowUpdate: {
          type: "boolean",
          description: "Allow users to change their response after submitting (default: true).",
        },
        replyTo: {
          type: "string",
          description: "Optional message ID to reply to.",
        },
      },
      required: ["text", "options"],
    },
    mode: "sync" as const,
  },
  {
    name: "send_vote",
    description:
      "Send a vote/poll in your current space. All members can vote. Votes can always be changed. Stays open forever (like WhatsApp polls). Returns immediately with {messageId}. You'll receive message_response events as people vote.",
    inputSchema: {
      type: "object" as const,
      properties: {
        title: {
          type: "string",
          description: "The vote question/title.",
        },
        options: {
          type: "array",
          items: { type: "string" },
          description: "The options to vote on: [\"Pizza\", \"Sushi\", \"Tacos\"]",
        },
        replyTo: {
          type: "string",
          description: "Optional message ID to reply to.",
        },
      },
      required: ["title", "options"],
    },
    mode: "sync" as const,
  },
  {
    name: "send_form",
    description:
      "Send a form in your current space for people to fill out. All members can submit independently. Stays open. Returns immediately with {messageId}.",
    inputSchema: {
      type: "object" as const,
      properties: {
        title: {
          type: "string",
          description: "Form title.",
        },
        description: {
          type: "string",
          description: "Optional description shown above the form.",
        },
        fields: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Field key/name." },
              label: { type: "string", description: "Display label." },
              type: {
                type: "string",
                enum: ["text", "number", "email", "select", "textarea"],
                description: "Field input type.",
              },
              required: { type: "boolean", description: "Is this field required?" },
              options: {
                type: "array",
                items: { type: "string" },
                description: "Options for select fields.",
              },
            },
            required: ["name", "label", "type"],
          },
          description: "Form fields definition.",
        },
        allowUpdate: {
          type: "boolean",
          description: "Allow users to edit their submission after submitting (default: true).",
        },
        replyTo: {
          type: "string",
          description: "Optional message ID to reply to.",
        },
      },
      required: ["title", "fields"],
    },
    mode: "sync" as const,
  },
  {
    name: "respond_to_message",
    description:
      "Respond to an interactive message in your current space (confirmation, vote, choice, form). Use this when you want to confirm/reject, vote on a poll, or submit a form response.",
    inputSchema: {
      type: "object" as const,
      properties: {
        messageId: {
          type: "string",
          description: "The interactive message ID to respond to.",
        },
        value: {
          description:
            "Your response value. For confirmation: \"confirmed\" or \"rejected\". For vote/choice: the option string. For form: a JSON object matching the form fields.",
        },
      },
      required: ["messageId", "value"],
    },
    mode: "sync" as const,
  },
  {
    name: "close_interactive_message",
    description:
      "Close an interactive message you sent in your current space (vote, form, choice). Snapshots the current results as final. Rarely needed — votes/forms normally stay open forever.",
    inputSchema: {
      type: "object" as const,
      properties: {
        messageId: {
          type: "string",
          description: "The interactive message ID to close.",
        },
      },
      required: ["messageId"],
    },
    mode: "sync" as const,
  },
  {
    name: "invite_to_space",
    description:
      "Invite someone to your current space by email. Requires admin+ role. The person will see a pending invitation they can accept or decline.",
    inputSchema: {
      type: "object" as const,
      properties: {
        email: {
          type: "string",
          description: "Email address of the person to invite.",
        },
        role: {
          type: "string",
          enum: ["member", "admin"],
          description: "Role to assign (default: member).",
        },
        message: {
          type: "string",
          description: "Optional personal message with the invitation.",
        },
      },
      required: ["email"],
    },
    mode: "sync" as const,
  },
  {
    name: "get_space_members",
    description:
      "List all members of a space with their roles and entity types. Defaults to your current space if no spaceId given.",
    inputSchema: {
      type: "object" as const,
      properties: {
        spaceId: {
          type: "string",
          description: "Optional space ID. Defaults to your current space.",
        },
      },
    },
    mode: "sync" as const,
  },
  {
    name: "send_image",
    description:
      "Send an image message to your current space. Provide a URL to an image (e.g. a generated image, an external link). Returns {success:true, messageId}.",
    inputSchema: {
      type: "object" as const,
      properties: {
        imageUrl: {
          type: "string",
          description: "URL of the image to send.",
        },
        caption: {
          type: "string",
          description: "Optional caption/description for the image.",
        },
        replyTo: {
          type: "string",
          description: "Optional message ID to reply to.",
        },
      },
      required: ["imageUrl"],
    },
    mode: "sync" as const,
  },
  {
    name: "send_voice",
    description:
      "Send a voice message to your current space. Provide the text you want spoken — it will be converted to audio via TTS. Returns {success:true, messageId, audioUrl}.",
    inputSchema: {
      type: "object" as const,
      properties: {
        text: {
          type: "string",
          description: "The text to convert to speech and send as a voice message.",
        },
        replyTo: {
          type: "string",
          description: "Optional message ID to reply to.",
        },
      },
      required: ["text"],
    },
    mode: "sync" as const,
  },
  {
    name: "send_file",
    description:
      "Send a file message to your current space. Provide a URL to the file. Returns {success:true, messageId}.",
    inputSchema: {
      type: "object" as const,
      properties: {
        fileUrl: {
          type: "string",
          description: "URL of the file to send.",
        },
        fileName: {
          type: "string",
          description: "Display name for the file.",
        },
        fileMimeType: {
          type: "string",
          description: "MIME type of the file (e.g. application/pdf).",
        },
        fileSize: {
          type: "number",
          description: "File size in bytes.",
        },
        replyTo: {
          type: "string",
          description: "Optional message ID to reply to.",
        },
      },
      required: ["fileUrl", "fileName"],
    },
    mode: "sync" as const,
  },
  {
    name: "send_chart",
    description:
      "Send a chart/data visualization to your current space. Supports bar, line, and pie charts. Returns {success:true, messageId}.",
    inputSchema: {
      type: "object" as const,
      properties: {
        title: {
          type: "string",
          description: "Chart title.",
        },
        chartType: {
          type: "string",
          enum: ["bar", "line", "pie"],
          description: "Type of chart (default: bar).",
        },
        data: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string", description: "Data point label." },
              value: { type: "number", description: "Data point value." },
              color: { type: "string", description: "Optional color hex (e.g. #3b82f6)." },
            },
            required: ["label", "value"],
          },
          description: "Chart data points: [{label, value, color?}, ...]",
        },
        replyTo: {
          type: "string",
          description: "Optional message ID to reply to.",
        },
      },
      required: ["title", "data"],
    },
    mode: "sync" as const,
  },
  {
    name: "create_space",
    description:
      "Create a new space (conversation) and add members from your base. You can create a direct 1-on-1 space or a group space with multiple members. You are automatically added as a member. Returns the new space info.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: {
          type: "string",
          description: "Name for the space. For direct spaces, can be omitted (auto-named). Required for group spaces.",
        },
        memberEntityIds: {
          type: "array",
          items: { type: "string" },
          description: "Entity IDs of members to add. Must be from your base. You are added automatically.",
        },
        description: {
          type: "string",
          description: "Optional description for the space.",
        },
      },
      required: ["memberEntityIds"],
    },
    mode: "sync" as const,
  },
  {
    name: "send_card",
    description:
      "Send a rich card message to your current space. Cards have a title, body text, optional image, and optional action buttons. Action buttons are broadcast interactive (anyone can click). Returns {success:true, messageId}.",
    inputSchema: {
      type: "object" as const,
      properties: {
        title: {
          type: "string",
          description: "Card title.",
        },
        body: {
          type: "string",
          description: "Card body text/description.",
        },
        imageUrl: {
          type: "string",
          description: "Optional image URL for the card header.",
        },
        actions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string", description: "Button display text." },
              value: { type: "string", description: "Value sent on click." },
              style: { type: "string", enum: ["default", "primary", "danger"], description: "Button style." },
            },
            required: ["label", "value"],
          },
          description: "Optional action buttons on the card.",
        },
        replyTo: {
          type: "string",
          description: "Optional message ID to reply to.",
        },
      },
      required: ["title", "body"],
    },
    mode: "sync" as const,
  },
];

