"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Entity, StreamingToolCall, PendingToolCall } from "@hsafa/react-sdk";

// Members Context
interface MembersContextValue {
  membersById: Record<string, Entity>;
  currentEntityId: string;
}

const MembersContext = createContext<MembersContextValue>({
  membersById: {},
  currentEntityId: "",
});

export function MembersProvider({
  children,
  membersById,
  currentEntityId,
}: {
  children: ReactNode;
  membersById: Record<string, Entity>;
  currentEntityId: string;
}) {
  return (
    <MembersContext.Provider value={{ membersById, currentEntityId }}>
      {children}
    </MembersContext.Provider>
  );
}

export function useMembers() {
  return useContext(MembersContext);
}

// Streaming Tool Calls Context
interface StreamingToolCallsContextValue {
  streamingToolCalls: StreamingToolCall[];
  getArgsText: (toolCallId: string) => string | undefined;
}

const StreamingToolCallsContext = createContext<StreamingToolCallsContextValue | null>(null);

export function StreamingToolCallsProvider({
  streamingToolCalls,
  children,
}: {
  streamingToolCalls: StreamingToolCall[];
  children: ReactNode;
}) {
  const getArgsText = (toolCallId: string): string | undefined => {
    const tc = streamingToolCalls.find((t) => t.toolCallId === toolCallId);
    return tc?.argsText;
  };

  return (
    <StreamingToolCallsContext.Provider value={{ streamingToolCalls, getArgsText }}>
      {children}
    </StreamingToolCallsContext.Provider>
  );
}

export function useStreamingToolCalls() {
  const ctx = useContext(StreamingToolCallsContext);
  if (!ctx) {
    return { streamingToolCalls: [], getArgsText: () => undefined };
  }
  return ctx;
}

// Pending Tool Calls Context (for manual tool execution UI)
interface PendingToolCallsContextValue {
  pendingToolCalls: PendingToolCall[];
  submitToolResult: (toolCallId: string, result: unknown) => Promise<void>;
}

const PendingToolCallsContext = createContext<PendingToolCallsContextValue | null>(null);

export function PendingToolCallsProvider({
  pendingToolCalls,
  submitToolResult,
  children,
}: {
  pendingToolCalls: PendingToolCall[];
  submitToolResult: (toolCallId: string, result: unknown) => Promise<void>;
  children: ReactNode;
}) {
  return (
    <PendingToolCallsContext.Provider value={{ pendingToolCalls, submitToolResult }}>
      {children}
    </PendingToolCallsContext.Provider>
  );
}

export function usePendingToolCalls() {
  const ctx = useContext(PendingToolCallsContext);
  if (!ctx) {
    return { pendingToolCalls: [], submitToolResult: async () => {} };
  }
  return ctx;
}
