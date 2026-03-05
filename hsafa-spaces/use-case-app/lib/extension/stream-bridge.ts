// @ts-nocheck — EventSource types differ between packages
// =============================================================================
// Haseef Stream Bridge
//
// Subscribes to Core's haseef stream SSE and forwards events to spaces Redis.
// Simplified: uses emitSmartSpaceEvent directly (same process, same Redis).
//
// Event mapping (Core → spaces Redis):
//
// For message_tools (messageTool: true in manifest):
//   tool.started     → space.message.streaming (phase: start, toolName)
//   tool-input.delta → space.message.streaming (phase: delta, toolName, partialArgs)
//   tool.ready       → space.message.streaming (phase: args_complete, toolName, args)
//   tool.done        → (no-op — tool handler persists the message)
//
// For regular tools:
//   tool-input.delta → tool.streaming
//   tool.started     → tool.started
//   tool.ready       → tool.ready (with args)
//   tool.done        → tool.done (with result)
//
// Always:
//   text.delta       → space.message.streaming (phase: delta)
//   run.start        → agent.active
//   run.finish       → agent.inactive + space.message.streaming (phase: done)
// =============================================================================

import { EventSource } from "eventsource";
import { emitSmartSpaceEvent } from "../smartspace-events";
import type { ExtensionConfig } from "./config";

const RECONNECT_DELAY_MS = 3000;

export interface StreamBridgeOptions {
  haseefId: string;
  haseefName: string;
  agentEntityId: string;
  spaceIds: string[];
  messageToolNames: Set<string>;
}

export class HaseefStreamBridge {
  private config: ExtensionConfig;
  private opts: StreamBridgeOptions;
  private es: EventSource | null = null;
  private running = false;
  private messageToolNames: Set<string>;

  constructor(config: ExtensionConfig, opts: StreamBridgeOptions) {
    this.config = config;
    this.opts = opts;
    this.messageToolNames = opts.messageToolNames;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.connect();
  }

  stop(): void {
    this.running = false;
    if (this.es) {
      this.es.close();
      this.es = null;
    }
  }

  private connect(): void {
    if (!this.running) return;

    const url = `${this.config.coreUrl}/api/haseefs/${this.opts.haseefId}/stream`;
    console.log(
      `[stream-bridge] Connecting to haseef stream for ${this.opts.haseefName}`,
    );

    this.es = new EventSource(url, {
      fetch: (input: any, init: any) =>
        fetch(input, {
          ...init,
          headers: {
            ...(init?.headers as Record<string, string> | undefined),
            "x-secret-key": this.config.secretKey,
          },
        }),
    });

    this.es.onopen = () => {
      console.log(
        `[stream-bridge] Connected to haseef stream for ${this.opts.haseefName}`,
      );
    };

    this.es.onmessage = (event: MessageEvent) => {
      this.handleEvent(event.data).catch((err) =>
        console.error(`[stream-bridge] Error handling event:`, err),
      );
    };

    this.es.onerror = () => {
      console.error(
        `[stream-bridge] SSE error for ${this.opts.haseefName}`,
      );
      if (this.es) {
        this.es.close();
        this.es = null;
      }
      if (this.running) {
        setTimeout(() => this.connect(), RECONNECT_DELAY_MS);
      }
    };
  }

  private async handleEvent(rawData: string): Promise<void> {
    const event = JSON.parse(rawData) as Record<string, unknown>;
    const type = event.type as string;

    if (!type || type === "connected") return;

    console.log(`[stream-bridge] event: ${type}`, type === 'tool-input.delta' ? { toolName: event.toolName, hasPartialArgs: !!event.partialArgs, partialText: (event.partialArgs as any)?.text?.slice(0, 50) } : '');

    const runId = event.runId as string | undefined;
    const streamId = runId || this.opts.haseefId;

    switch (type) {
      case "text.delta": {
        const textDelta = (event.text as string) ?? "";
        await this.emitToSpaces({
          type: "space.message.streaming",
          agentEntityId: this.opts.agentEntityId,
          runId: streamId,
          data: {
            streamId,
            agentEntityId: this.opts.agentEntityId,
            phase: "delta",
            delta: textDelta,
          },
        });
        break;
      }

      case "tool-input.delta":
      case "tool.started":
      case "tool.ready":
      case "tool.done": {
        const toolName = event.toolName as string;
        const toolStreamId = (event.streamId ?? event.toolCallId) as string;
        const isMsgTool = this.messageToolNames.has(toolName);

        if (isMsgTool) {
          await this.handleMessageToolEvent(
            type, event, toolStreamId, toolName, streamId,
          );
        } else {
          await this.handleRegularToolEvent(
            type, event, toolStreamId, toolName, streamId,
          );
        }
        break;
      }

      case "run.start": {
        await this.emitToSpaces({
          type: "agent.active",
          agentEntityId: this.opts.agentEntityId,
          runId: event.runId as string,
          data: {
            runId: event.runId,
            agentEntityId: this.opts.agentEntityId,
            agentName: this.opts.haseefName,
          },
        });
        break;
      }

      case "run.finish": {
        await this.emitToSpaces({
          type: "space.message.streaming",
          agentEntityId: this.opts.agentEntityId,
          runId: streamId,
          data: { streamId, phase: "done" },
        });
        await this.emitToSpaces({
          type: "agent.inactive",
          agentEntityId: this.opts.agentEntityId,
          runId: event.runId as string,
          data: {
            runId: event.runId,
            agentEntityId: this.opts.agentEntityId,
          },
        });
        break;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // message_tool events → space.message.streaming
  // ---------------------------------------------------------------------------

  private async handleMessageToolEvent(
    type: string,
    event: Record<string, unknown>,
    toolStreamId: string,
    toolName: string,
    runStreamId: string,
  ): Promise<void> {
    switch (type) {
      case "tool.started":
        await this.emitToSpaces({
          type: "space.message.streaming",
          agentEntityId: this.opts.agentEntityId,
          runId: runStreamId,
          data: {
            streamId: toolStreamId,
            agentEntityId: this.opts.agentEntityId,
            phase: "start",
            toolName,
          },
        });
        break;

      case "tool-input.delta": {
        // Core sends pre-parsed partialArgs — extract text field directly
        const partialArgs = event.partialArgs as Record<string, unknown> | undefined;
        const partialText = partialArgs?.text as string | undefined;
        if (typeof partialText === 'string' && partialText.length > 0) {
          await this.emitToSpaces({
            type: "space.message.streaming",
            agentEntityId: this.opts.agentEntityId,
            runId: runStreamId,
            data: {
              streamId: toolStreamId,
              agentEntityId: this.opts.agentEntityId,
              phase: "delta",
              toolName,
              text: partialText,
            },
          });
        }
        break;
      }

      case "tool.ready":
        await this.emitToSpaces({
          type: "space.message.streaming",
          agentEntityId: this.opts.agentEntityId,
          runId: runStreamId,
          data: {
            streamId: toolStreamId,
            agentEntityId: this.opts.agentEntityId,
            phase: "args_complete",
            toolName,
            args: event.args,
          },
        });
        break;

      case "tool.done":
        // No-op — the tool handler persists the final message
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Regular tool events → tool.*
  // ---------------------------------------------------------------------------

  private async handleRegularToolEvent(
    type: string,
    event: Record<string, unknown>,
    toolStreamId: string,
    toolName: string,
    runStreamId: string,
  ): Promise<void> {
    switch (type) {
      case "tool.started":
        await this.emitToSpaces({
          type: "tool.started",
          agentEntityId: this.opts.agentEntityId,
          runId: runStreamId,
          data: { streamId: toolStreamId, toolName },
        });
        break;

      case "tool-input.delta":
        await this.emitToSpaces({
          type: "tool.streaming",
          agentEntityId: this.opts.agentEntityId,
          runId: runStreamId,
          data: {
            streamId: toolStreamId,
            toolName,
            delta: event.delta as string,
            partialArgs: event.partialArgs,
          },
        });
        break;

      case "tool.ready":
        await this.emitToSpaces({
          type: "tool.ready",
          agentEntityId: this.opts.agentEntityId,
          runId: runStreamId,
          data: { streamId: toolStreamId, toolName, args: event.args },
        });
        break;

      case "tool.done":
        await this.emitToSpaces({
          type: "tool.done",
          agentEntityId: this.opts.agentEntityId,
          runId: runStreamId,
          data: { streamId: toolStreamId, toolName, result: event.result },
        });
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Emit to all connected spaces (uses shared Redis — no separate connection)
  // ---------------------------------------------------------------------------

  private async emitToSpaces(event: Record<string, unknown>): Promise<void> {
    for (const spaceId of this.opts.spaceIds) {
      await emitSmartSpaceEvent(spaceId, event as any).catch((err: unknown) =>
        console.error(`[stream-bridge] Emit error:`, err),
      );
    }
  }
}
