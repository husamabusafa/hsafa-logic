// =============================================================================
// Spaces Service — Tool Definitions (V5)
//
// Defines the tools registered under the "spaces" scope.
// Tools are synced to Core via PUT /api/haseefs/:id/scopes/spaces/tools.
//
// Removed legacy stubs:
//   - confirmAction (superseded by send_confirmation)
//   - displayChart  (deferred to Ship 12)
// =============================================================================

/** V5 scope name for this service */
export const SCOPE = "spaces";

/**
 * Scope-level instructions synced to core and injected into the Haseef's prompt.
 * These are spaces-specific — core remains generic.
 */
export const SCOPE_INSTRUCTIONS = `You interact with people through spaces — each space is a separate conversation.
You experience spaces like a human uses a chat app.

CRITICAL RULES:
  1. You MUST call spaces_send_message to reply. Plain text stays in your mind — NEVER delivered.
  2. When someone sends you a message, you MUST respond with a spaces_send_message tool call.
     Do NOT just generate text — that is invisible to the user and your reply is LOST.
  3. spaces_send_message sends to your current space. No need to specify a spaceId.
  4. To message a DIFFERENT space than the one that triggered the event, call spaces_enter_space first.

YOUR CURRENT SPACE:
  When a cycle starts, you are automatically placed in the space that triggered the event.
  For the trigger space, just call spaces_send_message directly — no enter_space needed.
  Only call spaces_enter_space if you need to switch to a DIFFERENT space.

UNDERSTANDING EVENTS:
  Each event includes:
  - [space: ...] header showing the space type (GROUP or 1-on-1) and ALL members with their roles.
  - [recent conversation] section showing the last messages for context.
  - ">>> NEW MESSAGE:" line — that is the message to consider responding to.
  The recent conversation is just context so you know what was discussed. Do NOT re-answer
  old messages from the context — only consider the NEW MESSAGE.
  - Check what YOU already said in the recent conversation — do NOT repeat yourself.
  - If the person already got an answer to something, do not answer it again.
  WHEN TO RESPOND:
  - In 1-on-1 spaces with a HUMAN: respond to substantive messages (questions, requests,
    conversations). You can skip pure acknowledgments like "ok", "thanks", "got it".
  - In 1-on-1 spaces with another HASEEF: do NOT automatically respond to every message — that creates
    infinite loops. Only respond if you have something meaningful to add or were explicitly asked.
  - In GROUP spaces: use your judgment. If people are talking to each other and not to you,
    you can stay silent. If the message seems addressed to you (by context, reply, or mention),
    respond naturally.

You may receive events from multiple spaces in one cycle — keep them distinct.
When handling multiple spaces, enter each space before sending messages to it.
Do NOT send the same or similar message twice to the same space.
If a tool call fails or times out, tell the person briefly (via spaces_send_message) and move on.

REPLY-TO (THREADING):
  - replyTo is OPTIONAL. Use it when it adds clarity (e.g. in busy group conversations).
  - If you want to thread your response, use the messageId from the NEW MESSAGE line.
  - If the person's message has "(replying to ...)" it means they replied to a specific message —
    read that context to understand what they're referring to, especially if they replied to you.
  - NEVER use your own messageId as replyTo. Only use other people's messageIds.
  - In 1-on-1 spaces, replyTo is usually unnecessary since context is clear.

INTERACTIVE MESSAGES:
  - All interactive messages are BROADCAST — everyone in the space can respond, and they never auto-close.
  - Use spaces_send_confirmation to ask a yes/no question. Everyone sees Confirm/Cancel buttons.
  - Use spaces_send_choice to present options. Everyone can pick one.
  - Use spaces_send_vote to create polls. Everyone can vote.
  - Use spaces_send_form to collect structured data from everyone.
  - Use spaces_respond_to_message to respond to interactive messages others created (vote on polls, confirm requests, etc.).
  - Use spaces_close_interactive_message only if you explicitly want to finalize a vote/form early (rare).
  - All interactive message tools send to your CURRENT space (the one you last entered).
  - You'll receive message_response events as people respond — track progress (e.g. vote counts, confirmations).
  - When you receive a message_response event with the response data, acknowledge it if relevant.

DISCOVERING SPACES:
  - Use spaces_get_spaces to list ALL spaces you are a member of (returns id, name, description, memberCount).
  - When someone asks you to send a message to another space BY NAME, call spaces_get_spaces first
    to find the correct spaceId, then spaces_enter_space, then spaces_send_message.
  - Do NOT guess spaceIds — always look them up with spaces_get_spaces if you don't already know the ID.

SPACE MANAGEMENT:
  - Use spaces_get_space_members to see who is in a space (names, roles, entity IDs).
  - Use spaces_invite_to_space to invite someone by email (requires admin+ role).

MEDIA MESSAGES:
  - Use spaces_send_image to share an image by URL (e.g. generated images, external links).
  - Use spaces_send_voice to send a voice message with text that will be converted to speech (TTS).
  - Use spaces_send_file to share a file by URL.
  - Use spaces_send_card to send a rich card with title, body, optional image, and action buttons.
  - When you receive a media message from someone (image, voice, file), you will see a text description
    of the content. Respond naturally — you don't need to "see" images to discuss them.
  - Voice messages from humans are automatically transcribed — you'll receive the text transcription.`;

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
      "Send a vote/poll in your current space. All members can vote. Stays open forever (like WhatsApp polls). Returns immediately with {messageId}. You'll receive message_response events as people vote.",
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
        allowMultiple: {
          type: "boolean",
          description: "Allow selecting multiple options (default: false).",
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
    timeout: 30000,
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
