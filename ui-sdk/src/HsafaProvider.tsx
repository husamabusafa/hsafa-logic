"use client";

import { type ReactNode } from "react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useHsafaClient, type HsafaClient, type SmartSpace } from "@hsafa/react-sdk";
import { useHsafaRuntime, type ToolExecutor } from "./useHsafaRuntime";
import {
  MembersProvider,
  StreamingToolCallsProvider,
  PendingToolCallsProvider,
} from "./contexts";

export interface HsafaProviderProps {
  children: ReactNode;
  gatewayUrl: string;
  entityId: string;
  smartSpaceId: string | null;
  smartSpaces?: SmartSpace[];
  onSwitchThread?: (smartSpaceId: string) => void;
  onNewThread?: () => void;
  toolExecutor?: ToolExecutor;
  client?: HsafaClient;
}

export function HsafaProvider({
  children,
  gatewayUrl,
  entityId,
  smartSpaceId,
  smartSpaces = [],
  onSwitchThread,
  onNewThread,
  toolExecutor,
  client: externalClient,
}: HsafaProviderProps) {
  const defaultClient = useHsafaClient({ gatewayUrl });
  const client = externalClient ?? defaultClient;

  const {
    runtime,
    membersById,
    pendingToolCalls,
    submitToolResult,
    streamingToolCalls,
  } = useHsafaRuntime({
    client,
    entityId,
    smartSpaceId,
    smartSpaces,
    onSwitchThread,
    onNewThread,
    toolExecutor,
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <MembersProvider membersById={membersById} currentEntityId={entityId}>
        <StreamingToolCallsProvider streamingToolCalls={streamingToolCalls}>
          <PendingToolCallsProvider
            pendingToolCalls={pendingToolCalls}
            submitToolResult={submitToolResult}
          >
            {children}
          </PendingToolCallsProvider>
        </StreamingToolCallsProvider>
      </MembersProvider>
    </AssistantRuntimeProvider>
  );
}
