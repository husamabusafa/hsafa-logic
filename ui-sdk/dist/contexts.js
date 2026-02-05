"use client";
import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext } from "react";
const MembersContext = createContext({
    membersById: {},
    currentEntityId: "",
});
export function MembersProvider({ children, membersById, currentEntityId, }) {
    return (_jsx(MembersContext.Provider, { value: { membersById, currentEntityId }, children: children }));
}
export function useMembers() {
    return useContext(MembersContext);
}
const StreamingToolCallsContext = createContext(null);
export function StreamingToolCallsProvider({ streamingToolCalls, children, }) {
    const getArgsText = (toolCallId) => {
        const tc = streamingToolCalls.find((t) => t.toolCallId === toolCallId);
        return tc?.argsText;
    };
    return (_jsx(StreamingToolCallsContext.Provider, { value: { streamingToolCalls, getArgsText }, children: children }));
}
export function useStreamingToolCalls() {
    const ctx = useContext(StreamingToolCallsContext);
    if (!ctx) {
        return { streamingToolCalls: [], getArgsText: () => undefined };
    }
    return ctx;
}
const PendingToolCallsContext = createContext(null);
export function PendingToolCallsProvider({ pendingToolCalls, submitToolResult, children, }) {
    return (_jsx(PendingToolCallsContext.Provider, { value: { pendingToolCalls, submitToolResult }, children: children }));
}
export function usePendingToolCalls() {
    const ctx = useContext(PendingToolCallsContext);
    if (!ctx) {
        return { pendingToolCalls: [], submitToolResult: async () => { } };
    }
    return ctx;
}
//# sourceMappingURL=contexts.js.map