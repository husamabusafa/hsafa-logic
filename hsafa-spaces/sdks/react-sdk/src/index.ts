// Core client
export { HsafaClient } from './client.js';
export { HsafaApiError } from './http.js';
export { SSEStream, createSSEStream } from './sse.js';

// React context & provider
export { HsafaProvider } from './provider.js';
export type { HsafaProviderProps } from './provider.js';
export { HsafaContext, useHsafaClient } from './context.js';

// User-facing hooks
export { useSmartSpace } from './hooks/useSmartSpace.js';
export type { UseSmartSpaceReturn, ActiveRun } from './hooks/useSmartSpace.js';

export { useMessages } from './hooks/useMessages.js';
export type { UseMessagesReturn, UseMessagesOptions } from './hooks/useMessages.js';

export { useRun } from './hooks/useRun.js';
export type { UseRunReturn, ToolCall } from './hooks/useRun.js';

export { useMembers } from './hooks/useMembers.js';
export type { UseMembersReturn } from './hooks/useMembers.js';

// Admin hooks
export { useAgents } from './hooks/useAgents.js';
export type { UseAgentsReturn } from './hooks/useAgents.js';

export { useEntities } from './hooks/useEntities.js';
export type { UseEntitiesReturn, UseEntitiesOptions } from './hooks/useEntities.js';

export { useSpaces } from './hooks/useSpaces.js';
export type { UseSpacesReturn } from './hooks/useSpaces.js';

export { useRuns } from './hooks/useRuns.js';
export type { UseRunsReturn, UseRunsOptions } from './hooks/useRuns.js';

// Tool result hook
export { useToolResult } from './hooks/useToolResult.js';
export type { UseToolResultReturn } from './hooks/useToolResult.js';

// assistant-ui runtime adapter
export { useHsafaRuntime } from './runtime/useHsafaRuntime.js';
export type {
  UseHsafaRuntimeOptions,
  UseHsafaRuntimeReturn,
  ActiveAgent,
  ThreadMessageLike,
  AppendMessage,
  ThreadListAdapter,
  TextContentPart,
  ToolCallContentPart,
  ContentPart,
} from './runtime/useHsafaRuntime.js';

// Types
export type {
  HsafaClientOptions,
  Agent,
  Entity,
  SmartSpace,
  SmartSpaceMessage,
  Membership,
  Run,
  RunStatus,
  RunEvent,
  Client,
  StreamEvent,
  EventType,
  HsafaStream,
  StreamEventHandler,
  CreateAgentParams,
  CreateEntityParams,
  CreateAgentEntityParams,
  UpdateEntityParams,
  CreateSmartSpaceParams,
  UpdateSmartSpaceParams,
  AddMemberParams,
  UpdateMemberParams,
  SendMessageParams,
  ListMessagesParams,
  CreateRunParams,
  SubmitRunToolResultParams,
  RegisterClientParams,
  ListParams,
  ListRunsParams,
  ListEntitiesParams,
  SubscribeOptions,
} from './types.js';
