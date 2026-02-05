"use client";

import { type ReactNode } from "react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useHsafaClient, type HsafaClient, type SmartSpace } from "@hsafa/react-sdk";
import { useHsafaRuntime } from "./useHsafaRuntime";
import { MembersProvider } from "./contexts";

export interface HsafaProviderProps {
  children: ReactNode;
  gatewayUrl: string;
  entityId: string;
  smartSpaceId: string | null;
  smartSpaces?: SmartSpace[];
  onSwitchThread?: (smartSpaceId: string) => void;
  onNewThread?: () => void;
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
  client: externalClient,
}: HsafaProviderProps) {
  const defaultClient = useHsafaClient({ gatewayUrl });
  const client = externalClient ?? defaultClient;

  const { runtime, membersById } = useHsafaRuntime({
    client,
    entityId,
    smartSpaceId,
    smartSpaces,
    onSwitchThread,
    onNewThread,
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <MembersProvider membersById={membersById} currentEntityId={entityId}>
        {children}
      </MembersProvider>
    </AssistantRuntimeProvider>
  );
}
