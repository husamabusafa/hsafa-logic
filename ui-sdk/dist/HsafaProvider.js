"use client";
import { jsx as _jsx } from "react/jsx-runtime";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useHsafaClient } from "@hsafa/react-sdk";
import { useHsafaRuntime } from "./useHsafaRuntime";
import { MembersProvider, StreamingToolCallsProvider, PendingToolCallsProvider, } from "./contexts";
export function HsafaProvider({ children, gatewayUrl, entityId, smartSpaceId, smartSpaces = [], onSwitchThread, onNewThread, toolExecutor, client: externalClient, }) {
    const defaultClient = useHsafaClient({ gatewayUrl });
    const client = externalClient ?? defaultClient;
    const { runtime, membersById, pendingToolCalls, submitToolResult, streamingToolCalls, } = useHsafaRuntime({
        client,
        entityId,
        smartSpaceId,
        smartSpaces,
        onSwitchThread,
        onNewThread,
        toolExecutor,
    });
    return (_jsx(AssistantRuntimeProvider, { runtime: runtime, children: _jsx(MembersProvider, { membersById: membersById, currentEntityId: entityId, children: _jsx(StreamingToolCallsProvider, { streamingToolCalls: streamingToolCalls, children: _jsx(PendingToolCallsProvider, { pendingToolCalls: pendingToolCalls, submitToolResult: submitToolResult, children: children }) }) }) }));
}
//# sourceMappingURL=HsafaProvider.js.map