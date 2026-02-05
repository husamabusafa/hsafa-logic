import { type ReactNode } from "react";
import type { Entity, StreamingToolCall, PendingToolCall } from "@hsafa/react-sdk";
interface MembersContextValue {
    membersById: Record<string, Entity>;
    currentEntityId: string;
}
export declare function MembersProvider({ children, membersById, currentEntityId, }: {
    children: ReactNode;
    membersById: Record<string, Entity>;
    currentEntityId: string;
}): import("react/jsx-runtime").JSX.Element;
export declare function useMembers(): MembersContextValue;
interface StreamingToolCallsContextValue {
    streamingToolCalls: StreamingToolCall[];
    getArgsText: (toolCallId: string) => string | undefined;
}
export declare function StreamingToolCallsProvider({ streamingToolCalls, children, }: {
    streamingToolCalls: StreamingToolCall[];
    children: ReactNode;
}): import("react/jsx-runtime").JSX.Element;
export declare function useStreamingToolCalls(): StreamingToolCallsContextValue;
interface PendingToolCallsContextValue {
    pendingToolCalls: PendingToolCall[];
    submitToolResult: (toolCallId: string, result: unknown) => Promise<void>;
}
export declare function PendingToolCallsProvider({ pendingToolCalls, submitToolResult, children, }: {
    pendingToolCalls: PendingToolCall[];
    submitToolResult: (toolCallId: string, result: unknown) => Promise<void>;
    children: ReactNode;
}): import("react/jsx-runtime").JSX.Element;
export declare function usePendingToolCalls(): PendingToolCallsContextValue;
export {};
//# sourceMappingURL=contexts.d.ts.map