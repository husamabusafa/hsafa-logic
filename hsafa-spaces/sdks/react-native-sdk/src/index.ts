// Core client
export { HsafaClient } from './client';
export { HsafaApiError } from './http';
export { SSEStream, createSSEStream } from './sse';

// React context & provider
export { HsafaProvider } from './provider';
export type { HsafaProviderProps } from './provider';
export { HsafaContext, useHsafaClient } from './context';

// User-facing hooks
export { useSmartSpace } from './hooks/useSmartSpace';
export type { UseSmartSpaceReturn, ActiveRun } from './hooks/useSmartSpace';

export { useMessages } from './hooks/useMessages';
export type { UseMessagesReturn, UseMessagesOptions } from './hooks/useMessages';

export { useRun } from './hooks/useRun';
export type { UseRunReturn, ToolCall } from './hooks/useRun';

export { useMembers } from './hooks/useMembers';
export type { UseMembersReturn } from './hooks/useMembers';

// Admin hooks
export { useAgents } from './hooks/useAgents';
export type { UseAgentsReturn } from './hooks/useAgents';

export { useEntities } from './hooks/useEntities';
export type { UseEntitiesReturn, UseEntitiesOptions } from './hooks/useEntities';

export { useSpaces } from './hooks/useSpaces';
export type { UseSpacesReturn } from './hooks/useSpaces';

export { useRuns } from './hooks/useRuns';
export type { UseRunsReturn, UseRunsOptions } from './hooks/useRuns';

// Tool result hook
export { useToolResult } from './hooks/useToolResult';
export type { UseToolResultReturn } from './hooks/useToolResult';

// Runtime adapter (full streaming + tool calls + active agents)
export { useHsafaRuntime } from './runtime/useHsafaRuntime';
export type {
  UseHsafaRuntimeOptions,
  UseHsafaRuntimeReturn,
  ActiveAgent,
  ThreadMessageLike,
  AppendMessage,
  TextContentPart,
  ToolCallContentPart,
  ContentPart,
} from './runtime/useHsafaRuntime';

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
} from './types';
