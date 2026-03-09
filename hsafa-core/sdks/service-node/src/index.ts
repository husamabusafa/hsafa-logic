// =============================================================================
// @hsafa/service — Node.js SDK for building services that connect to Hsafa Core
//
// A service connects to a Haseef by:
//   1. Registering tools under a scope
//   2. Pushing sense events
//   3. Handling action requests (tool calls from the Haseef)
//   4. Submitting action results
// =============================================================================

export { HsafaService } from './service.js';
export type { HsafaServiceOptions } from './service.js';
export { CoreClient } from './client.js';
export type {
  HsafaServiceConfig,
  ToolDefinition,
  ToolCallContext,
  ActionEvent,
  SenseEventInput,
} from './types.js';
