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
CRITICAL: You MUST use spaces_send_message to reply to people. Plain text responses stay in your mind and are NOT delivered to anyone. The ONLY way to communicate is by calling spaces_send_message with the correct spaceId.

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
  - In 1-on-1 spaces with a HUMAN: you should respond to substantive messages (questions, requests, 
    conversations). You can skip pure acknowledgments like "ok", "thanks", "got it".
  - In 1-on-1 spaces with another HASEEF: do NOT automatically respond to every message — that creates
    infinite loops. Only respond if you have something meaningful to add or were explicitly asked.
  - In GROUP spaces: use your judgment. If people are talking to each other and not to you,
    you can stay silent. If the message seems addressed to you (by context, reply, or mention),
    respond naturally.

You may receive events from multiple spaces in one cycle — keep them distinct.
Always use the correct spaceId when calling spaces_send_message.
Do NOT mix up conversations across spaces.
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
  - Use spaces_send_confirmation to ask someone to confirm/reject something. You'll get a message_resolved event with the outcome.
  - Use spaces_send_choice to present options. Target a specific person or broadcast to everyone.
  - Use spaces_send_vote to create polls. Stays open forever — you'll get message_response events as people vote.
  - Use spaces_send_form to collect structured data from people.
  - Use spaces_respond_to_message to respond to interactive messages others created (vote on polls, confirm requests, etc.).
  - Use spaces_close_interactive_message only if you explicitly want to finalize a vote/form early (rare).
  - When you receive a message_resolved event, read the outcome and act on it immediately.
  - When you receive a message_response event, you can track progress (e.g. vote counts) but don't need to act unless relevant.
  - Messages in spaces_get_messages include a "type" field (text, confirmation, vote, choice, form, etc.) and structured metadata.

DISCOVERING SPACES:
  - Use spaces_get_spaces to list ALL spaces you are a member of (returns id, name, description, memberCount).
  - When someone asks you to send a message to another space BY NAME, call spaces_get_spaces first to find the correct spaceId, then use spaces_send_message with that spaceId.
  - Do NOT guess spaceIds — always look them up with spaces_get_spaces if you don't already know the ID.

SPACE MANAGEMENT:
  - Use spaces_get_space_members to see who is in a space (names, roles, entity IDs).
  - Use spaces_invite_to_space to invite someone by email (requires admin+ role).
  - You can always call spaces_get_space_members to know who is in any space you belong to.`;

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
        replyTo: {
          type: "string",
          description: "Optional message ID to reply to.",
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
    name: "send_confirmation",
    description:
      "Send a confirmation card to a specific person in a space. They will see Confirm/Cancel buttons. Returns immediately with {messageId, status:'pending'}. You will receive a message_resolved sense event when they respond.",
    inputSchema: {
      type: "object" as const,
      properties: {
        spaceId: {
          type: "string",
          description: "The space ID to send the confirmation in.",
        },
        title: {
          type: "string",
          description: "Short title for the confirmation card.",
        },
        message: {
          type: "string",
          description: "The message or question to display.",
        },
        targetEntityId: {
          type: "string",
          description:
            "The entity ID of the person who should confirm/reject.",
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
      required: ["spaceId", "title", "message", "targetEntityId"],
    },
    mode: "sync" as const,
  },
  {
    name: "send_choice",
    description:
      "Send a choice card with custom buttons. Can target a specific person (auto-resolves on response) or broadcast to everyone (stays open). Returns immediately with {messageId, status:'pending'}.",
    inputSchema: {
      type: "object" as const,
      properties: {
        spaceId: {
          type: "string",
          description: "The space ID to send the choice in.",
        },
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
        targetEntityId: {
          type: "string",
          description:
            "Optional: target a specific person. If omitted, all members can respond (broadcast).",
        },
        replyTo: {
          type: "string",
          description: "Optional message ID to reply to.",
        },
      },
      required: ["spaceId", "text", "options"],
    },
    mode: "sync" as const,
  },
  {
    name: "send_vote",
    description:
      "Send a vote/poll to a space. All members can vote. Stays open forever (like WhatsApp polls). Returns immediately with {messageId}. You'll receive message_response events as people vote.",
    inputSchema: {
      type: "object" as const,
      properties: {
        spaceId: {
          type: "string",
          description: "The space ID to send the vote in.",
        },
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
      required: ["spaceId", "title", "options"],
    },
    mode: "sync" as const,
  },
  {
    name: "send_form",
    description:
      "Send a form to a space for people to fill out. Can be broadcast (everyone) or targeted. Each person submits independently. Returns immediately with {messageId}.",
    inputSchema: {
      type: "object" as const,
      properties: {
        spaceId: {
          type: "string",
          description: "The space ID to send the form in.",
        },
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
        targetEntityIds: {
          type: "array",
          items: { type: "string" },
          description: "Optional: target specific people (makes it targeted, auto-resolves when all submit).",
        },
        replyTo: {
          type: "string",
          description: "Optional message ID to reply to.",
        },
      },
      required: ["spaceId", "title", "fields"],
    },
    mode: "sync" as const,
  },
  {
    name: "respond_to_message",
    description:
      "Respond to an interactive message (confirmation, vote, choice, form). Use this when you want to confirm/reject, vote on a poll, or submit a form response.",
    inputSchema: {
      type: "object" as const,
      properties: {
        spaceId: {
          type: "string",
          description: "The space ID the message is in.",
        },
        messageId: {
          type: "string",
          description: "The interactive message ID to respond to.",
        },
        value: {
          description:
            "Your response value. For confirmation: \"confirmed\" or \"rejected\". For vote/choice: the option string. For form: a JSON object matching the form fields.",
        },
      },
      required: ["spaceId", "messageId", "value"],
    },
    mode: "sync" as const,
  },
  {
    name: "close_interactive_message",
    description:
      "Close an interactive message you sent (vote, form, choice). Snapshots the current results as final. Rarely needed — votes/forms normally stay open forever.",
    inputSchema: {
      type: "object" as const,
      properties: {
        spaceId: {
          type: "string",
          description: "The space ID the message is in.",
        },
        messageId: {
          type: "string",
          description: "The interactive message ID to close.",
        },
      },
      required: ["spaceId", "messageId"],
    },
    mode: "sync" as const,
  },
  {
    name: "invite_to_space",
    description:
      "Invite someone to a space by email. Requires admin+ role in the space. The person will see a pending invitation they can accept or decline.",
    inputSchema: {
      type: "object" as const,
      properties: {
        spaceId: {
          type: "string",
          description: "The space ID to invite to.",
        },
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
      required: ["spaceId", "email"],
    },
    mode: "sync" as const,
  },
  {
    name: "get_space_members",
    description:
      "List all members of a space with their roles and entity types.",
    inputSchema: {
      type: "object" as const,
      properties: {
        spaceId: {
          type: "string",
          description: "The space ID to list members of.",
        },
      },
      required: ["spaceId"],
    },
    mode: "sync" as const,
  },
];
