// =============================================================================
// @hsafa/node — General Hsafa Core SDK
//
// Two modes:
//   Extension mode: new Hsafa({ coreUrl, extensionKey })
//   Admin mode:     new Hsafa({ coreUrl, secretKey })
//
// Build extensions:
//   const server = new ExtensionServer(hsafa, { name: 'my-ext' });
//   server.tool('do_thing', { description: '...', inputSchema: {...} }, handler);
//   await server.listen();
// =============================================================================

// Main client
export { Hsafa } from './hsafa.js';

// Extension server (for building standalone extensions)
export { ExtensionServer } from './extension-server.js';
export type { ExtensionServerOptions } from './extension-server.js';

// Webhook handler (for embedded extensions — Next.js, serverless, etc.)
export { WebhookHandler } from './webhook-handler.js';
export type { WebhookHandlerOptions } from './webhook-handler.js';

// Low-level HTTP client (rarely needed directly)
export { CoreClient } from './core-client.js';

// Types
export type {
  HsafaOptions,
  Haseef,
  Extension,
  ExtensionConnection,
  ExtensionInfo,
  ExtensionManifest,
  ToolDefinition,
  Run,
  ConsciousnessSnapshot,
  SenseEvent,
  StreamEvent,
  WebhookEvent,
  ToolCallWebhook,
  LifecycleWebhook,
  ToolHandler,
  ToolCallContext,
  LifecycleHandler,
  SystemStatus,
  HaseefStatus,
} from './types.js';

export { HsafaApiError } from './types.js';
