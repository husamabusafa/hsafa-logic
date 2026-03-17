// =============================================================================
// Mock Data — used for UI prototyping before connecting to real APIs
// =============================================================================

// ─── Types ──────────────────────────────────────────────────────────────────

export type MessageType =
  | "text" | "confirmation" | "vote" | "choice" | "form"
  | "card" | "image" | "voice" | "video" | "file"
  | "chart" | "system";

export interface MockUser {
  id: string;
  entityId: string;
  name: string;
  email: string;
  type: "human" | "agent";
  avatarColor: string;
  isOnline: boolean;
}

export interface MockHaseef {
  id: string;
  entityId: string;
  name: string;
  description: string;
  model: string;
  avatarColor: string;
  isOnline: boolean;
  connectedSpaces: string[];
  status: "active" | "idle" | "disabled";
  instructions: string;
  createdAt: string;
}

export interface MockMember {
  entityId: string;
  name: string;
  type: "human" | "agent";
  role: "owner" | "admin" | "member" | "viewer";
  avatarColor: string;
  avatarUrl?: string | null;
  isOnline: boolean;
  lastSeen?: string;
  joinedAt?: string;
}

export interface MessageResponseEntry {
  entityId: string;
  entityName: string;
  entityType: "human" | "agent";
  value: unknown;
  respondedAt: string;
}

export interface ResponseSummary {
  totalResponses: number;
  counts?: Record<string, number>;
  respondedEntityIds: string[];
  responses: MessageResponseEntry[];
}

export interface MockMessage {
  id: string;
  spaceId: string;
  entityId: string;
  senderName: string;
  senderType: "human" | "agent";
  content: string;
  createdAt: string;
  seenBy: string[];
  type: MessageType;
  replyTo?: { messageId: string; snippet: string; senderName: string; messageType: MessageType };

  // Interactive messages
  audience?: "targeted" | "broadcast";
  targetEntityIds?: string[];
  status?: "open" | "resolved" | "closed";
  responseSummary?: ResponseSummary;
  resolution?: { outcome: string; resolvedBy: "auto" | "sender"; resolvedAt: string };
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
  choiceOptions?: { label: string; value: string; style?: "default" | "primary" | "danger" }[];

  // Form
  formTitle?: string;
  formDescription?: string;
  formFields?: { name: string; label: string; type: "text" | "number" | "email" | "textarea" | "select" | "date"; required?: boolean; options?: string[]; placeholder?: string }[];

  // Card
  cardTitle?: string;
  cardBody?: string;
  cardImageUrl?: string;
  cardActions?: { label: string; value: string; style?: "default" | "primary" | "danger" }[];

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
  chartType?: "bar" | "line" | "pie";
  chartTitle?: string;
  chartData?: { label: string; value: number; color?: string }[];
}

export interface MockSpace {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  adminEntityId: string;
  members: MockMember[];
  lastMessage?: { content: string; senderName: string; time: string };
  unreadCount: number;
  isGroup: boolean;
}

export interface MockInvitation {
  id: string;
  spaceId: string;
  spaceName: string;
  inviterEntityId: string;
  inviterName: string;
  inviteeEmail?: string;
  role: "member" | "admin";
  status: "pending" | "accepted" | "declined" | "expired";
  message?: string;
  createdAt: string;
}

// ─── Current User ────────────────────────────────────────────────────────────

export const currentUser: MockUser = {
  id: "user-1",
  entityId: "entity-husam",
  name: "Husam",
  email: "husam@example.com",
  type: "human",
  avatarColor: "bg-blue-600",
  isOnline: true,
};

// ─── Users ───────────────────────────────────────────────────────────────────

export const mockUsers: MockUser[] = [
  currentUser,
  {
    id: "user-2",
    entityId: "entity-sarah",
    name: "Sarah Chen",
    email: "sarah@example.com",
    type: "human",
    avatarColor: "bg-purple-600",
    isOnline: true,
  },
  {
    id: "user-3",
    entityId: "entity-omar",
    name: "Omar Khalid",
    email: "omar@example.com",
    type: "human",
    avatarColor: "bg-amber-600",
    isOnline: false,
  },
  {
    id: "user-4",
    entityId: "entity-elena",
    name: "Elena Rodriguez",
    email: "elena@example.com",
    type: "human",
    avatarColor: "bg-rose-600",
    isOnline: true,
  },
];

// ─── Haseefs ─────────────────────────────────────────────────────────────────

export const mockHaseefs: MockHaseef[] = [
  {
    id: "haseef-1",
    entityId: "entity-atlas",
    name: "Atlas",
    description: "General-purpose research and reasoning assistant",
    model: "gpt-4o",
    avatarColor: "bg-emerald-600",
    isOnline: true,
    connectedSpaces: ["space-1", "space-2"],
    status: "active",
    instructions: "You are Atlas, a helpful research assistant. Be thorough, cite sources, and provide structured answers.",
    createdAt: "2025-01-15T10:00:00Z",
  },
  {
    id: "haseef-2",
    entityId: "entity-nova",
    name: "Nova",
    description: "Creative writing and content generation specialist",
    model: "gpt-4o-mini",
    avatarColor: "bg-violet-600",
    isOnline: true,
    connectedSpaces: ["space-3"],
    status: "active",
    instructions: "You are Nova, a creative writing specialist. Help with drafting, editing, and brainstorming content.",
    createdAt: "2025-02-01T14:30:00Z",
  },
  {
    id: "haseef-3",
    entityId: "entity-cipher",
    name: "Cipher",
    description: "Code review and software engineering assistant",
    model: "claude-sonnet-4-20250514",
    avatarColor: "bg-cyan-600",
    isOnline: false,
    connectedSpaces: ["space-1"],
    status: "idle",
    instructions: "You are Cipher, a senior software engineer. Review code, suggest improvements, and help debug issues.",
    createdAt: "2025-02-20T09:00:00Z",
  },
  {
    id: "haseef-4",
    entityId: "entity-sage",
    name: "Sage",
    description: "Data analysis and visualization helper",
    model: "gpt-4o",
    avatarColor: "bg-teal-600",
    isOnline: false,
    connectedSpaces: [],
    status: "disabled",
    instructions: "You are Sage, a data analyst. Help users understand data, create visualizations, and derive insights.",
    createdAt: "2025-03-05T16:00:00Z",
  },
];

// ─── Members Helper ──────────────────────────────────────────────────────────

function userToMember(user: MockUser, role: MockMember["role"]): MockMember {
  return {
    entityId: user.entityId,
    name: user.name,
    type: user.type,
    role,
    avatarColor: user.avatarColor,
    isOnline: user.isOnline,
    lastSeen: user.isOnline ? undefined : "2h ago",
  };
}

function haseefToMember(h: MockHaseef, role: MockMember["role"]): MockMember {
  return {
    entityId: h.entityId,
    name: h.name,
    type: "agent",
    role,
    avatarColor: h.avatarColor,
    isOnline: h.isOnline,
    lastSeen: h.isOnline ? undefined : "offline",
  };
}

// ─── Spaces ──────────────────────────────────────────────────────────────────

export const mockSpaces: MockSpace[] = [
  {
    id: "space-1",
    name: "Product Team",
    description: "Product development discussions and planning",
    createdAt: "2025-01-20T10:00:00Z",
    adminEntityId: currentUser.entityId,
    members: [
      userToMember(currentUser, "owner"),
      userToMember(mockUsers[1], "admin"),
      userToMember(mockUsers[2], "member"),
      haseefToMember(mockHaseefs[0], "member"),
      haseefToMember(mockHaseefs[2], "member"),
    ],
    lastMessage: {
      content: "I'll prepare the sprint review deck for tomorrow",
      senderName: "Sarah Chen",
      time: "2:30 PM",
    },
    unreadCount: 3,
    isGroup: true,
  },
  {
    id: "space-2",
    name: "Atlas",
    description: "Personal assistant space",
    createdAt: "2025-01-15T10:00:00Z",
    adminEntityId: currentUser.entityId,
    members: [
      userToMember(currentUser, "owner"),
      haseefToMember(mockHaseefs[0], "member"),
    ],
    lastMessage: {
      content: "Here are the key findings from the market research...",
      senderName: "Atlas",
      time: "1:15 PM",
    },
    unreadCount: 0,
    isGroup: false,
  },
  {
    id: "space-3",
    name: "Creative Lab",
    description: "Brainstorming and creative writing projects",
    createdAt: "2025-02-10T14:00:00Z",
    adminEntityId: mockUsers[1].entityId,
    members: [
      userToMember(mockUsers[1], "owner"),
      userToMember(currentUser, "admin"),
      userToMember(mockUsers[3], "member"),
      haseefToMember(mockHaseefs[1], "member"),
    ],
    lastMessage: {
      content: "The blog post draft looks great! Just a few edits needed.",
      senderName: "Nova",
      time: "11:45 AM",
    },
    unreadCount: 1,
    isGroup: true,
  },
  {
    id: "space-4",
    name: "Project Alpha",
    description: "Confidential product launch coordination",
    createdAt: "2025-03-01T09:00:00Z",
    adminEntityId: currentUser.entityId,
    members: [
      userToMember(currentUser, "owner"),
      userToMember(mockUsers[1], "member"),
      userToMember(mockUsers[2], "member"),
      userToMember(mockUsers[3], "member"),
    ],
    lastMessage: {
      content: "Let's sync on the timeline tomorrow morning",
      senderName: "Omar Khalid",
      time: "Yesterday",
    },
    unreadCount: 0,
    isGroup: true,
  },
  {
    id: "space-5",
    name: "Elena Rodriguez",
    description: "Direct messages",
    createdAt: "2025-03-10T16:00:00Z",
    adminEntityId: currentUser.entityId,
    members: [
      userToMember(currentUser, "owner"),
      userToMember(mockUsers[3], "member"),
    ],
    lastMessage: {
      content: "Thanks for the feedback! I'll update the designs.",
      senderName: "Elena Rodriguez",
      time: "Yesterday",
    },
    unreadCount: 0,
    isGroup: false,
  },
];

// ─── Messages ────────────────────────────────────────────────────────────────

export const mockMessages: Record<string, MockMessage[]> = {
  "space-1": [
    // System message
    {
      id: "msg-1-0",
      spaceId: "space-1",
      entityId: "system",
      senderName: "System",
      senderType: "human",
      content: "Husam created this space",
      type: "system",
      createdAt: "2025-03-12T08:55:00Z",
      seenBy: [],
    },
    // Text
    {
      id: "msg-1-1",
      spaceId: "space-1",
      entityId: "entity-husam",
      senderName: "Husam",
      senderType: "human",
      content: "Hey team, let's plan the sprint for next week. What are the priorities?",
      type: "text",
      createdAt: "2025-03-12T09:00:00Z",
      seenBy: ["entity-sarah", "entity-omar", "entity-atlas"],
    },
    // Text with reply
    {
      id: "msg-1-2",
      spaceId: "space-1",
      entityId: "entity-atlas",
      senderName: "Atlas",
      senderType: "agent",
      content: "Based on the backlog, here are the top priorities:\n\n1. **User authentication flow** — 5 story points\n2. **Dashboard redesign** — 8 story points\n3. **API rate limiting** — 3 story points\n4. **Mobile responsive fixes** — 5 story points\n\nTotal: 21 story points, fits within average velocity.",
      type: "text",
      createdAt: "2025-03-12T09:01:00Z",
      seenBy: ["entity-husam", "entity-sarah", "entity-omar"],
      replyTo: { messageId: "msg-1-1", snippet: "Hey team, let's plan the sprint for next week...", senderName: "Husam", messageType: "text" },
    },
    // Vote (broadcast, open)
    {
      id: "msg-1-3",
      spaceId: "space-1",
      entityId: "entity-sarah",
      senderName: "Sarah Chen",
      senderType: "human",
      content: "",
      type: "vote",
      title: "Where should we go for team lunch?",
      options: ["Pizza", "Sushi", "Tacos", "Thai"],
      audience: "broadcast",
      status: "open",
      responseSummary: {
        totalResponses: 3,
        counts: { "Pizza": 1, "Sushi": 2, "Tacos": 0, "Thai": 0 },
        respondedEntityIds: ["entity-husam", "entity-atlas", "entity-omar"],
        responses: [
          { entityId: "entity-husam", entityName: "Husam", entityType: "human", value: "Sushi", respondedAt: "2025-03-12T09:10:00Z" },
          { entityId: "entity-atlas", entityName: "Atlas", entityType: "agent", value: "Sushi", respondedAt: "2025-03-12T09:11:00Z" },
          { entityId: "entity-omar", entityName: "Omar Khalid", entityType: "human", value: "Pizza", respondedAt: "2025-03-12T09:12:00Z" },
        ],
      },
      createdAt: "2025-03-12T09:05:00Z",
      seenBy: ["entity-husam", "entity-atlas", "entity-omar"],
    },
    // Confirmation (targeted, resolved)
    {
      id: "msg-1-4",
      spaceId: "space-1",
      entityId: "entity-atlas",
      senderName: "Atlas",
      senderType: "agent",
      content: "",
      type: "confirmation",
      title: "Deploy v2.3 to production?",
      message: "This will deploy the latest changes including the auth flow and rate limiting to all production servers.",
      confirmLabel: "Deploy",
      rejectLabel: "Cancel",
      audience: "targeted",
      targetEntityIds: ["entity-husam"],
      status: "resolved",
      resolution: { outcome: "confirmed", resolvedBy: "auto", resolvedAt: "2025-03-12T09:22:00Z" },
      responseSummary: {
        totalResponses: 1,
        respondedEntityIds: ["entity-husam"],
        responses: [
          { entityId: "entity-husam", entityName: "Husam", entityType: "human", value: "confirmed", respondedAt: "2025-03-12T09:22:00Z" },
        ],
      },
      createdAt: "2025-03-12T09:20:00Z",
      seenBy: ["entity-husam", "entity-sarah", "entity-omar"],
    },
    // Choice (targeted, open — waiting for Omar)
    {
      id: "msg-1-5",
      spaceId: "space-1",
      entityId: "entity-cipher",
      senderName: "Cipher",
      senderType: "agent",
      content: "",
      type: "choice",
      title: "Which auth strategy should we use?",
      choiceOptions: [
        { label: "JWT + Refresh Tokens", value: "jwt-refresh", style: "primary" },
        { label: "Session-based Auth", value: "session" },
        { label: "OAuth2 + PKCE", value: "oauth2" },
      ],
      audience: "targeted",
      targetEntityIds: ["entity-omar"],
      status: "open",
      responseSummary: { totalResponses: 0, respondedEntityIds: [], responses: [] },
      createdAt: "2025-03-12T09:25:00Z",
      seenBy: ["entity-husam", "entity-sarah", "entity-omar"],
    },
    // Form (broadcast, open)
    {
      id: "msg-1-6",
      spaceId: "space-1",
      entityId: "entity-husam",
      senderName: "Husam",
      senderType: "human",
      content: "",
      type: "form",
      formTitle: "Sprint Retrospective Feedback",
      formDescription: "Share your thoughts on the last sprint. All responses are visible to the team.",
      formFields: [
        { name: "went_well", label: "What went well?", type: "textarea", required: true, placeholder: "Share positives..." },
        { name: "improve", label: "What could improve?", type: "textarea", required: true, placeholder: "Share areas for improvement..." },
        { name: "rating", label: "Sprint rating (1-10)", type: "number", required: true, placeholder: "1-10" },
        { name: "focus", label: "Next sprint focus area", type: "select", required: false, options: ["Performance", "Features", "Bug fixes", "Documentation", "Testing"] },
      ],
      audience: "broadcast",
      status: "open",
      responseSummary: {
        totalResponses: 2,
        respondedEntityIds: ["entity-sarah", "entity-omar"],
        responses: [
          { entityId: "entity-sarah", entityName: "Sarah Chen", entityType: "human", value: { went_well: "Great collaboration", improve: "More code reviews", rating: 8, focus: "Features" }, respondedAt: "2025-03-12T10:00:00Z" },
          { entityId: "entity-omar", entityName: "Omar Khalid", entityType: "human", value: { went_well: "Clear goals", improve: "Better estimates", rating: 7, focus: "Testing" }, respondedAt: "2025-03-12T10:05:00Z" },
        ],
      },
      createdAt: "2025-03-12T09:30:00Z",
      seenBy: ["entity-sarah", "entity-omar", "entity-atlas"],
    },
    // Card (with actions)
    {
      id: "msg-1-7",
      spaceId: "space-1",
      entityId: "entity-atlas",
      senderName: "Atlas",
      senderType: "agent",
      content: "",
      type: "card",
      cardTitle: "New Feature: SmartSpaces v2.3",
      cardBody: "SmartSpaces v2.3 includes role-based access control, interactive messages, and media support. This release represents a major milestone in our collaboration platform.",
      cardImageUrl: "https://images.unsplash.com/photo-1551434678-e076c223a692?w=600&h=300&fit=crop",
      cardActions: [
        { label: "View Release Notes", value: "view_notes", style: "primary" },
        { label: "Report Issue", value: "report_issue", style: "danger" },
      ],
      audience: "broadcast",
      status: "open",
      responseSummary: { totalResponses: 0, respondedEntityIds: [], responses: [] },
      createdAt: "2025-03-12T10:00:00Z",
      seenBy: ["entity-husam", "entity-sarah"],
    },
    // Image
    {
      id: "msg-1-8",
      spaceId: "space-1",
      entityId: "entity-sarah",
      senderName: "Sarah Chen",
      senderType: "human",
      content: "",
      type: "image",
      imageUrl: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&h=500&fit=crop",
      imageCaption: "Here's the dashboard mockup I've been working on",
      imageWidth: 800,
      imageHeight: 500,
      createdAt: "2025-03-12T10:15:00Z",
      seenBy: ["entity-husam", "entity-atlas"],
    },
    // Voice
    {
      id: "msg-1-9",
      spaceId: "space-1",
      entityId: "entity-omar",
      senderName: "Omar Khalid",
      senderType: "human",
      content: "",
      type: "voice",
      audioUrl: "#",
      audioDuration: 23,
      transcription: "Hey team, just a quick update — I finished the auth implementation and the tests are passing. Cipher, I'll send you the PR link in a bit.",
      createdAt: "2025-03-12T11:00:00Z",
      seenBy: ["entity-husam", "entity-sarah"],
    },
    // File
    {
      id: "msg-1-10",
      spaceId: "space-1",
      entityId: "entity-husam",
      senderName: "Husam",
      senderType: "human",
      content: "",
      type: "file",
      fileName: "sprint-plan-q2.pdf",
      fileSize: 2450000,
      fileMimeType: "application/pdf",
      fileUrl: "#",
      createdAt: "2025-03-12T11:30:00Z",
      seenBy: ["entity-sarah", "entity-omar"],
    },
    // Chart
    {
      id: "msg-1-11",
      spaceId: "space-1",
      entityId: "entity-atlas",
      senderName: "Atlas",
      senderType: "agent",
      content: "",
      type: "chart",
      chartType: "bar",
      chartTitle: "Sprint Velocity — Last 6 Sprints",
      chartData: [
        { label: "Sprint 18", value: 21 },
        { label: "Sprint 19", value: 26 },
        { label: "Sprint 20", value: 24 },
        { label: "Sprint 21", value: 19 },
        { label: "Sprint 22", value: 28 },
        { label: "Sprint 23", value: 24 },
      ],
      createdAt: "2025-03-12T12:00:00Z",
      seenBy: ["entity-husam", "entity-sarah"],
    },
    // Video
    {
      id: "msg-1-12",
      spaceId: "space-1",
      entityId: "entity-elena",
      senderName: "Elena Rodriguez",
      senderType: "human",
      content: "",
      type: "video",
      videoUrl: "#",
      videoThumbnailUrl: "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=400&h=225&fit=crop",
      videoDuration: 45,
      createdAt: "2025-03-12T12:30:00Z",
      seenBy: ["entity-husam"],
      replyTo: { messageId: "msg-1-8", snippet: "🖼️ Here's the dashboard mockup...", senderName: "Sarah Chen", messageType: "image" },
    },
    // Confirmation (targeted, open — waiting)
    {
      id: "msg-1-13",
      spaceId: "space-1",
      entityId: "entity-cipher",
      senderName: "Cipher",
      senderType: "agent",
      content: "",
      type: "confirmation",
      title: "Merge PR #142: Auth flow refactor",
      message: "I've reviewed the PR and it looks clean. 12 files changed, all tests passing. Ready to merge?",
      confirmLabel: "Merge",
      rejectLabel: "Request Changes",
      audience: "targeted",
      targetEntityIds: ["entity-husam"],
      status: "open",
      responseSummary: { totalResponses: 0, respondedEntityIds: [], responses: [] },
      createdAt: "2025-03-12T14:30:00Z",
      seenBy: ["entity-husam", "entity-sarah"],
    },
    // Text (last message)
    {
      id: "msg-1-14",
      spaceId: "space-1",
      entityId: "entity-sarah",
      senderName: "Sarah Chen",
      senderType: "human",
      content: "Great progress everyone! I'll prepare the sprint review deck for tomorrow.",
      type: "text",
      createdAt: "2025-03-12T14:35:00Z",
      seenBy: ["entity-husam"],
    },
  ],

  "space-2": [
    {
      id: "msg-2-1",
      spaceId: "space-2",
      entityId: "entity-husam",
      senderName: "Husam",
      senderType: "human",
      content: "Can you research the latest trends in AI agent frameworks?",
      type: "text",
      createdAt: "2025-03-12T12:00:00Z",
      seenBy: ["entity-atlas"],
    },
    {
      id: "msg-2-2",
      spaceId: "space-2",
      entityId: "entity-atlas",
      senderName: "Atlas",
      senderType: "agent",
      content: "Here are the key findings from the market research:\n\n**Top AI Agent Frameworks (2025):**\n\n1. **LangGraph** — Graph-based agent orchestration\n2. **CrewAI** — Multi-agent collaboration\n3. **AutoGen** — Microsoft's conversational framework\n4. **Semantic Kernel** — Enterprise-focused\n\n**Key Trends:**\n- Multi-agent systems gaining traction\n- Tool use becoming standard\n- Memory management improving\n- Real-time streaming expected\n\nWould you like me to dive deeper?",
      type: "text",
      createdAt: "2025-03-12T13:15:00Z",
      seenBy: ["entity-husam"],
    },
    // Chart
    {
      id: "msg-2-3",
      spaceId: "space-2",
      entityId: "entity-atlas",
      senderName: "Atlas",
      senderType: "agent",
      content: "",
      type: "chart",
      chartType: "pie",
      chartTitle: "Framework Popularity (GitHub Stars)",
      chartData: [
        { label: "LangGraph", value: 42000, color: "#3b82f6" },
        { label: "CrewAI", value: 35000, color: "#10b981" },
        { label: "AutoGen", value: 28000, color: "#f59e0b" },
        { label: "Semantic Kernel", value: 18000, color: "#8b5cf6" },
      ],
      createdAt: "2025-03-12T13:16:00Z",
      seenBy: ["entity-husam"],
    },
  ],

  "space-3": [
    {
      id: "msg-3-1",
      spaceId: "space-3",
      entityId: "entity-sarah",
      senderName: "Sarah Chen",
      senderType: "human",
      content: "Nova, can you help draft a blog post about our new feature release?",
      type: "text",
      createdAt: "2025-03-12T10:00:00Z",
      seenBy: ["entity-husam", "entity-nova", "entity-elena"],
    },
    {
      id: "msg-3-2",
      spaceId: "space-3",
      entityId: "entity-nova",
      senderName: "Nova",
      senderType: "agent",
      content: "I've structured the blog post as:\n1. **Hook** — Why collaboration matters\n2. **Problem** — The gap in current tools\n3. **Solution** — SmartSpaces\n4. **Features** — Key capabilities\n5. **CTA** — Try it today\n\nShall I flesh out each section?",
      type: "text",
      createdAt: "2025-03-12T11:45:00Z",
      seenBy: ["entity-sarah", "entity-elena"],
    },
    // Image
    {
      id: "msg-3-3",
      spaceId: "space-3",
      entityId: "entity-nova",
      senderName: "Nova",
      senderType: "agent",
      content: "",
      type: "image",
      imageUrl: "https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=800&h=500&fit=crop",
      imageCaption: "Generated blog header image — modern collaboration theme",
      imageWidth: 800,
      imageHeight: 500,
      createdAt: "2025-03-12T11:50:00Z",
      seenBy: ["entity-sarah", "entity-elena"],
    },
  ],

  "space-4": [
    {
      id: "msg-4-1",
      spaceId: "space-4",
      entityId: "entity-husam",
      senderName: "Husam",
      senderType: "human",
      content: "Team, Project Alpha kickoff is next Monday. Please review the requirements doc.",
      type: "text",
      createdAt: "2025-03-11T15:00:00Z",
      seenBy: ["entity-sarah", "entity-omar", "entity-elena"],
    },
    // File
    {
      id: "msg-4-2",
      spaceId: "space-4",
      entityId: "entity-husam",
      senderName: "Husam",
      senderType: "human",
      content: "",
      type: "file",
      fileName: "project-alpha-requirements.docx",
      fileSize: 1280000,
      fileMimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      fileUrl: "#",
      createdAt: "2025-03-11T15:01:00Z",
      seenBy: ["entity-sarah", "entity-omar", "entity-elena"],
    },
    {
      id: "msg-4-3",
      spaceId: "space-4",
      entityId: "entity-omar",
      senderName: "Omar Khalid",
      senderType: "human",
      content: "Let's sync on the timeline tomorrow morning",
      type: "text",
      createdAt: "2025-03-11T16:00:00Z",
      seenBy: ["entity-husam", "entity-sarah", "entity-elena"],
    },
  ],

  "space-5": [
    {
      id: "msg-5-1",
      spaceId: "space-5",
      entityId: "entity-husam",
      senderName: "Husam",
      senderType: "human",
      content: "Hey Elena, great work on the design system updates!",
      type: "text",
      createdAt: "2025-03-11T14:00:00Z",
      seenBy: ["entity-elena"],
    },
    {
      id: "msg-5-2",
      spaceId: "space-5",
      entityId: "entity-elena",
      senderName: "Elena Rodriguez",
      senderType: "human",
      content: "Thanks for the feedback! I'll update the designs.",
      type: "text",
      createdAt: "2025-03-11T14:30:00Z",
      seenBy: ["entity-husam"],
    },
    // Voice reply
    {
      id: "msg-5-3",
      spaceId: "space-5",
      entityId: "entity-elena",
      senderName: "Elena Rodriguez",
      senderType: "human",
      content: "",
      type: "voice",
      audioUrl: "#",
      audioDuration: 12,
      transcription: "Also, check out the new color palette I uploaded to Figma — I think it matches the brand better.",
      createdAt: "2025-03-11T14:35:00Z",
      seenBy: ["entity-husam"],
    },
  ],
};

// ─── Typing state (simulated) ────────────────────────────────────────────────

export const mockTypingUsers: Record<string, string[]> = {
  "space-1": ["entity-sarah", "entity-atlas"], // Multiple entities typing
  "space-2": [],
  "space-3": ["entity-nova"],
  "space-4": [],
  "space-5": [],
};

// ─── Invitations ────────────────────────────────────────────────────────────

export const mockInvitations: MockInvitation[] = [
  {
    id: "inv-1",
    spaceId: "space-99",
    spaceName: "Design Systems Guild",
    inviterEntityId: "entity-elena",
    inviterName: "Elena Rodriguez",
    role: "member",
    status: "pending",
    message: "Hey Husam! We're building a design system community. Would love to have you join!",
    createdAt: "2025-03-11T10:00:00Z",
  },
  {
    id: "inv-2",
    spaceId: "space-98",
    spaceName: "AI Research Lab",
    inviterEntityId: "entity-sarah",
    inviterName: "Sarah Chen",
    role: "admin",
    status: "pending",
    message: "Need your help leading the AI research efforts.",
    createdAt: "2025-03-10T16:00:00Z",
  },
  {
    id: "inv-3",
    spaceId: "space-97",
    spaceName: "Weekend Hackathon",
    inviterEntityId: "entity-omar",
    inviterName: "Omar Khalid",
    role: "member",
    status: "pending",
    createdAt: "2025-03-09T12:00:00Z",
  },
];
