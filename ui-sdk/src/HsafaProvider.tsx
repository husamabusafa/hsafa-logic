"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import {
  HsafaProvider as HsafaSdkProvider,
  useHsafaClient,
  type SmartSpace,
} from "@hsafa/react-sdk";
import { useHsafaChatRuntime } from "./useHsafaRuntime";
import { MembersProvider } from "./contexts";

export interface HsafaChatProviderProps {
  children: ReactNode;
  gatewayUrl: string;
  entityId: string;
  secretKey?: string;
  publicKey?: string;
  jwt?: string;

  // --- Controlled mode (existing API, fully backward-compatible) ---
  smartSpaceId?: string | null;
  smartSpaces?: SmartSpace[];
  onSwitchThread?: (smartSpaceId: string) => void;
  onNewThread?: () => void;

  // --- Auto mode (simpler: provider manages spaces internally) ---
  /** Initial space to select. Enables auto-mode when set without smartSpaces. */
  defaultSpaceId?: string;
  /** Called when user clicks "new thread". Return the new space ID. */
  onCreateSpace?: () => Promise<string>;
  /** Called whenever the selected space changes (auto-mode only). */
  onSpaceChange?: (spaceId: string) => void;
}

interface InnerProps {
  children: ReactNode;
  entityId: string;
  // Controlled
  smartSpaceId?: string | null;
  smartSpaces?: SmartSpace[];
  onSwitchThread?: (smartSpaceId: string) => void;
  onNewThread?: () => void;
  // Auto
  defaultSpaceId?: string;
  onCreateSpace?: () => Promise<string>;
  onSpaceChange?: (spaceId: string) => void;
}

function HsafaChatProviderInner({
  children,
  entityId,
  smartSpaceId: controlledSpaceId,
  smartSpaces: controlledSpaces,
  onSwitchThread: controlledOnSwitch,
  onNewThread: controlledOnNew,
  defaultSpaceId,
  onCreateSpace,
  onSpaceChange,
}: InnerProps) {
  const client = useHsafaClient();

  // Auto-mode: provider manages spaces + selection internally
  const isAutoMode = controlledSpaces === undefined && defaultSpaceId !== undefined;

  const [autoSpaces, setAutoSpaces] = useState<SmartSpace[]>([]);
  const [autoSelectedId, setAutoSelectedId] = useState<string | null>(
    defaultSpaceId ?? null
  );

  // Auto-fetch spaces on mount
  useEffect(() => {
    if (!isAutoMode) return;
    client.spaces
      .list()
      .then(({ smartSpaces: fetched }) => {
        if (fetched?.length) setAutoSpaces(fetched);
      })
      .catch((err: unknown) =>
        console.error("[HsafaChatProvider] Failed to list spaces:", err)
      );
  }, [client, isAutoMode]);

  const refreshSpaces = useCallback(async () => {
    try {
      const { smartSpaces: fetched } = await client.spaces.list();
      if (fetched?.length) setAutoSpaces(fetched);
    } catch (err) {
      console.error("[HsafaChatProvider] Failed to refresh spaces:", err);
    }
  }, [client]);

  // Auto-mode: switch handler
  const autoOnSwitch = useCallback((spaceId: string) => {
    setAutoSelectedId(spaceId);
    onSpaceChange?.(spaceId);
  }, [onSpaceChange]);

  // Auto-mode: new thread handler
  const autoOnNew = useCallback(async () => {
    if (!onCreateSpace) return;
    try {
      const newSpaceId = await onCreateSpace();
      await refreshSpaces();
      setAutoSelectedId(newSpaceId);
      onSpaceChange?.(newSpaceId);
    } catch (err) {
      console.error("[HsafaChatProvider] Failed to create space:", err);
    }
  }, [onCreateSpace, refreshSpaces]);

  // Resolve final values — controlled props win when provided
  const smartSpaceId = isAutoMode ? autoSelectedId : (controlledSpaceId ?? null);
  const smartSpaces = isAutoMode ? autoSpaces : (controlledSpaces ?? []);
  const onSwitchThread = controlledOnSwitch ?? (isAutoMode ? autoOnSwitch : undefined);
  const onNewThread = controlledOnNew ?? (isAutoMode ? autoOnNew : undefined);

  const { runtime, membersById } = useHsafaChatRuntime({
    smartSpaceId,
    entityId,
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

export function HsafaChatProvider({
  children,
  gatewayUrl,
  secretKey,
  publicKey,
  jwt,
  ...innerProps
}: HsafaChatProviderProps) {
  return (
    <HsafaSdkProvider
      gatewayUrl={gatewayUrl}
      secretKey={secretKey}
      publicKey={publicKey}
      jwt={jwt}
    >
      <HsafaChatProviderInner {...innerProps}>
        {children}
      </HsafaChatProviderInner>
    </HsafaSdkProvider>
  );
}
