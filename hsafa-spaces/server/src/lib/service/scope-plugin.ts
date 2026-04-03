// =============================================================================
// Scope Plugin Interface
//
// Every scope (spaces, scheduler, postgres, future custom scopes) implements
// this interface. The scope registry iterates plugins uniformly:
//   create SDK → registerTools → wire onToolCall → call init() → connect
//
// No more 3-way fork. No more SELF_MANAGED_SCOPES. One path for all.
// =============================================================================

import type { HsafaSDK } from "@hsafa/sdk";
import type { ServiceConfig } from "./config.js";

export interface ToolCallContext {
  haseef: { id: string; name: string };
  actionId: string;
}

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  mode?: string;
  timeout?: number;
}

/**
 * Unified interface for all scope plugins.
 *
 * Lifecycle (managed by scope-registry):
 *   1. Registry creates HsafaSDK for the scope
 *   2. Registry calls sdk.registerTools(plugin.tools)
 *   3. Registry wires sdk.onToolCall → plugin.handleToolCall
 *   4. Registry calls plugin.init(sdk, config) — plugin does its own setup
 *   5. Registry calls sdk.connect()
 *   6. On shutdown: plugin.stop() then sdk.disconnect()
 */
export interface ScopePlugin {
  /** Unique scope name (e.g. "spaces", "scheduler", "postgres") */
  readonly name: string;

  /** Tool definitions to register with Core */
  readonly tools: ToolDef[];

  /** Static instructions (shown in prompt for all haseefs with this scope) */
  readonly staticInstructions: string | null;

  /**
   * Called after SDK is created and tools are registered, before connect().
   * Use this for scope-specific setup (DB connections, pollers, listeners, etc.)
   */
  init(sdk: HsafaSDK, config: ServiceConfig): Promise<void>;

  /**
   * Called on shutdown. Clean up resources (pools, timers, listeners).
   */
  stop(): Promise<void>;

  /**
   * Handle a tool call dispatched by Core.
   * toolName is unprefixed (e.g. "send_message", not "spaces_send_message").
   */
  handleToolCall(
    toolName: string,
    args: Record<string, unknown>,
    ctx: ToolCallContext,
  ): Promise<unknown>;

  /**
   * Optional: return per-haseef dynamic instructions (e.g. YOUR SCHEDULES, YOUR DATABASE).
   * Called when building instructions for a specific haseef.
   * Return null to skip.
   */
  getDynamicInstructions?(haseefId: string): Promise<string | null>;

  /**
   * Whether this scope should be loaded. Called before SDK creation.
   * Return false to skip (e.g. postgres with no active instances).
   * Default: true (if not implemented).
   */
  shouldLoad?(config: ServiceConfig): Promise<boolean>;
}
