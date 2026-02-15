// Core client
export { HsafaClient } from './client.js';
export { HsafaApiError } from './http.js';
export { SSEStream } from './sse.js';

// Auth utilities
export { buildAuthHeaders } from './auth.js';

// Resource classes
export { AgentsResource } from './resources/agents.js';
export { EntitiesResource } from './resources/entities.js';
export { SpacesResource } from './resources/spaces.js';
export { MessagesResource } from './resources/messages.js';
export { RunsResource } from './resources/runs.js';
export { ToolsResource } from './resources/tools.js';
export { ClientsResource } from './resources/clients.js';

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
  TriggerAgentParams,
  TriggerAgentResult,
  SubmitRunToolResultParams,
  RegisterClientParams,
  ListParams,
  ListRunsParams,
  ListEntitiesParams,
  SubscribeOptions,
  SendAndWaitOptions,
  SendAndWaitResponse,
  CreateSpaceSetupParams,
  CreateSpaceSetupResult,
} from './types.js';

// SSE types
export type { SSEStreamOptions } from './sse.js';
