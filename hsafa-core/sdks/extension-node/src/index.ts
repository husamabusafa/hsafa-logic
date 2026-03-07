// =============================================================================
// @hsafa/extension — DEPRECATED
//
// This package is deprecated. Use @hsafa/node instead.
//
// For standalone extensions:
//   import { Hsafa, ExtensionServer } from '@hsafa/node';
//
// For embedded extensions (Next.js, serverless):
//   import { Hsafa, WebhookHandler } from '@hsafa/node';
//
// Migration guide:
//   - HsafaExtension class         → ExtensionServer (standalone) or WebhookHandler (embedded)
//   - CoreClient                   → Hsafa class (covers both extension + admin modes)
//   - Redis/polling tool listeners → Not needed. Core POSTs to /webhook directly.
//   - ext.tool(name, opts)         → server.tool(name, definition, handler)
//   - ext.instructions(text)       → Pass instructions in ExtensionServer/WebhookHandler options
//   - ext.pushSenseEvent()         → hsafa.pushSense()
//   - ext.start()                  → server.listen()
// =============================================================================

console.warn(
  '[@hsafa/extension] This package is deprecated. Use @hsafa/node instead. ' +
  'See https://github.com/hsafa/hsafa-logic for migration guide.'
);

export { HsafaExtension } from './extension.js';
export { CoreClient } from './client.js';
export type {
  HsafaExtensionConfig,
  ToolDefinition,
  ToolCallContext,
  ToolCallEvent,
  SenseEventInput,
  HaseefConnectionInfo,
  ExtensionSelfInfo,
} from './types.js';
