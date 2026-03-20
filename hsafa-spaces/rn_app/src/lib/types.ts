// =============================================================================
// Shared types used across the mobile app
// Mirrors react_app/src/lib/mock-data.ts types
// =============================================================================

export type MessageType =
  | 'text'
  | 'confirmation'
  | 'vote'
  | 'choice'
  | 'form'
  | 'card'
  | 'image'
  | 'voice'
  | 'video'
  | 'file'
  | 'chart'
  | 'system';

export interface Member {
  entityId: string;
  name: string;
  type: 'human' | 'agent';
  role: 'owner' | 'admin' | 'member' | 'viewer';
  avatarUrl?: string | null;
  isOnline: boolean;
  joinedAt?: string;
}

export interface MessageResponseEntry {
  entityId: string;
  entityName: string;
  entityType: 'human' | 'agent';
  value: unknown;
  respondedAt: string;
}

export interface ResponseSummary {
  totalResponses: number;
  counts?: Record<string, number>;
  respondedEntityIds: string[];
  responses: MessageResponseEntry[];
}

export interface Message {
  id: string;
  spaceId: string;
  entityId: string;
  senderName: string;
  senderType: 'human' | 'agent';
  content: string;
  createdAt: string;
  seenBy: string[];
  type: MessageType;
  replyTo?: {
    messageId: string;
    snippet: string;
    senderName: string;
    messageType: MessageType;
  };

  // Interactive messages
  audience?: 'targeted' | 'broadcast';
  targetEntityIds?: string[];
  status?: 'open' | 'resolved' | 'closed';
  responseSummary?: ResponseSummary;
  resolution?: {
    outcome: string;
    resolvedBy: 'auto' | 'sender';
    resolvedAt: string;
  };
  allowUpdate?: boolean;

  // Confirmation
  title?: string;
  message?: string;
  confirmLabel?: string;
  rejectLabel?: string;

  // Vote
  options?: string[];
  allowMultiple?: boolean;

  // Choice
  choiceOptions?: {
    label: string;
    value: string;
    style?: 'default' | 'primary' | 'danger';
  }[];

  // Form
  formTitle?: string;
  formDescription?: string;
  formFields?: {
    name: string;
    label: string;
    type: 'text' | 'number' | 'email' | 'textarea' | 'select' | 'date';
    required?: boolean;
    options?: string[];
    placeholder?: string;
  }[];

  // Card
  cardTitle?: string;
  cardBody?: string;
  cardImageUrl?: string;
  cardActions?: {
    label: string;
    value: string;
    style?: 'default' | 'primary' | 'danger';
  }[];

  // Image
  imageUrl?: string;
  imageCaption?: string;
  imageWidth?: number;
  imageHeight?: number;

  // Voice
  audioUrl?: string;
  audioDuration?: number;
  transcription?: string;

  // Video
  videoUrl?: string;
  videoThumbnailUrl?: string;
  videoDuration?: number;

  // File
  fileName?: string;
  fileSize?: number;
  fileMimeType?: string;
  fileUrl?: string;

  // Chart
  chartType?: 'bar' | 'line' | 'pie';
  chartTitle?: string;
  chartData?: { label: string; value: number; color?: string }[];

  // Attachments (multi-file)
  attachments?: Array<{
    url: string;
    fileName: string;
    fileSize: number;
    fileMimeType: string;
    thumbnailUrl?: string;
    type: 'image' | 'file' | 'video';
  }>;
}

export interface AgentActivity {
  agentEntityId: string;
  agentName?: string;
  runId?: string;
}

export interface TypingUser {
  entityId: string;
  entityName: string;
  activity?: 'typing' | 'recording';
}

// Navigation param types
export type RootStackParamList = {
  Auth: undefined;
  VerifyEmail: undefined;
  AuthCallback: { token: string };
  Main: undefined;
  JoinByCode: { code: string };
  JoinSpaceByCode: { code: string };
  Chat: { spaceId: string; spaceName?: string };
  SpaceSettings: { spaceId: string };
  InviteToSpace: { spaceId: string; spaceName: string };
  CreateSpace: undefined;
};

export type MainTabParamList = {
  SpacesTab: undefined;
  HaseefsTab: undefined;
  BasesTab: undefined;
  InvitesTab: undefined;
  SettingsTab: undefined;
};

export type SpacesStackParamList = {
  SpacesList: undefined;
};

export type HaseefsStackParamList = {
  HaseefsList: undefined;
  HaseefDetail: { haseefId: string };
  HaseefCreate: undefined;
  HaseefEdit: { haseefId: string };
};

export type BasesStackParamList = {
  BasesList: undefined;
  BaseDetail: { baseId: string };
  CreateBase: undefined;
};

export type InvitesStackParamList = {
  InvitationsList: undefined;
};

export type SettingsStackParamList = {
  SettingsMain: undefined;
  Profile: undefined;
  ApiKeys: undefined;
};
