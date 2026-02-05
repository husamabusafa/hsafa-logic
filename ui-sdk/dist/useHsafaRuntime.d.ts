import type { AssistantRuntime } from "@assistant-ui/react";
import { type HsafaClient, type SmartSpace, type Entity, type PendingToolCall, type StreamingToolCall } from "@hsafa/react-sdk";
export type ToolExecutor = (toolName: string, args: unknown) => Promise<unknown>;
export interface UseHsafaRuntimeOptions {
    client: HsafaClient;
    entityId: string;
    smartSpaceId: string | null;
    smartSpaces?: SmartSpace[];
    onSwitchThread?: (smartSpaceId: string) => void;
    onNewThread?: () => void;
    toolExecutor?: ToolExecutor;
}
export interface UseHsafaRuntimeReturn {
    runtime: AssistantRuntime;
    membersById: Record<string, Entity>;
    pendingToolCalls: PendingToolCall[];
    submitToolResult: (toolCallId: string, result: unknown) => Promise<void>;
    streamingToolCalls: StreamingToolCall[];
}
export declare function useHsafaRuntime(options: UseHsafaRuntimeOptions): UseHsafaRuntimeReturn;
//# sourceMappingURL=useHsafaRuntime.d.ts.map