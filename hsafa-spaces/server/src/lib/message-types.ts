// =============================================================================
// Message Type System — TypeScript interfaces and type guards
//
// Defines the structure of message metadata for all message types.
// =============================================================================

// ── Message Types ────────────────────────────────────────────────────────────

export type MessageType =
  | "text"
  | "confirmation"
  | "vote"
  | "choice"
  | "form"
  | "image"
  | "voice"
  | "video"
  | "file"
  | "chart"
  | "card"
  | "system";

// ── Response Schema ──────────────────────────────────────────────────────────

export type ResponseSchema =
  | { type: "enum"; values: string[]; multiple?: boolean }
  | { type: "json"; schema: Record<string, unknown> }
  | { type: "text" }
  | { type: "rating"; min: number; max: number };

// ── Reply Metadata ───────────────────────────────────────────────────────────

export interface ReplyToMetadata {
  messageId: string;
  snippet: string;
  senderName: string;
  messageType: string;
}

// ── Response Summary (denormalized on message metadata) ──────────────────────

export interface ResponseSummary {
  totalResponses: number;
  counts?: Record<string, number>;
  respondedEntityIds?: string[];
  responses: Array<{
    entityId: string;
    entityName: string;
    entityType: "human" | "agent";
    value: unknown;
    respondedAt: string;
  }>;
}

// ── Resolution ───────────────────────────────────────────────────────────────

export interface Resolution {
  outcome: string;
  resolvedAt: string;
  resolvedBy: "auto" | "sender";
}

// ── Base Message Metadata ────────────────────────────────────────────────────

export interface MessageMetadata {
  type: MessageType;
  payload?: Record<string, unknown>;
  responseSchema?: ResponseSchema;
  responseSummary?: ResponseSummary;

  // Interactive message fields
  audience?: "targeted" | "broadcast";
  targetEntityIds?: string[];
  status?: "open" | "resolved" | "closed";
  resolution?: Resolution;

  // Media
  media?: Record<string, unknown>;
  files?: Array<Record<string, unknown>>;

  // Reply/threading
  replyTo?: ReplyToMetadata;

  // UI hints
  ui?: {
    priority?: "normal" | "urgent";
    pinned?: boolean;
    expiresAt?: string;
  };

  // Legacy / tool context
  toolName?: string;
  actionId?: string;
}

// ── Type Guards ──────────────────────────────────────────────────────────────

const INTERACTIVE_TYPES: MessageType[] = [
  "confirmation",
  "vote",
  "choice",
  "form",
  "card",
];

export function isInteractiveMessage(metadata: MessageMetadata | null | undefined): boolean {
  if (!metadata?.type) return false;
  return INTERACTIVE_TYPES.includes(metadata.type);
}

export function isMediaMessage(metadata: MessageMetadata | null | undefined): boolean {
  if (!metadata?.type) return false;
  return ["image", "voice", "video", "file"].includes(metadata.type);
}

export function isTextMessage(metadata: MessageMetadata | null | undefined): boolean {
  return !metadata?.type || metadata.type === "text";
}

// ── Snippet Generation ───────────────────────────────────────────────────────

export function generateSnippet(
  content: string | null,
  metadata: MessageMetadata | null | undefined,
  maxLength = 100,
): string {
  const type = metadata?.type || "text";

  switch (type) {
    case "text":
      return truncate(content || "", maxLength);

    case "confirmation": {
      const title = metadata?.payload?.title as string | undefined;
      return title ? `✅ ${truncate(title, maxLength - 2)}` : "✅ Confirmation";
    }

    case "vote": {
      const title = metadata?.payload?.title as string | undefined;
      return title ? `📊 ${truncate(title, maxLength - 2)}` : "📊 Vote";
    }

    case "choice": {
      const text = metadata?.payload?.text as string | undefined;
      return text ? `🔘 ${truncate(text, maxLength - 2)}` : "🔘 Choice";
    }

    case "form": {
      const title = metadata?.payload?.title as string | undefined;
      return title ? `📝 ${truncate(title, maxLength - 2)}` : "📝 Form";
    }

    case "image":
      return "🖼️ Image";

    case "voice":
      return "🎤 Voice message";

    case "video":
      return "🎬 Video";

    case "file": {
      const fileName = metadata?.payload?.fileName as string | undefined;
      return fileName ? `📎 ${truncate(fileName, maxLength - 2)}` : "📎 File";
    }

    case "chart": {
      const title = metadata?.payload?.title as string | undefined;
      return title ? `📈 ${truncate(title, maxLength - 2)}` : "📈 Chart";
    }

    case "card": {
      const title = metadata?.payload?.title as string | undefined;
      return title ? `🃏 ${truncate(title, maxLength - 2)}` : "🃏 Card";
    }

    case "system":
      return truncate(content || "System message", maxLength);

    default:
      return truncate(content || "", maxLength);
  }
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + "…";
}
