"use client";

import { useMemo } from "react";
import { useExternalStoreRuntime } from "@assistant-ui/react";
import type { ThreadMessageLike } from "@assistant-ui/react";
import type { AppendMessage } from "@assistant-ui/react";
import type { AssistantRuntime } from "@assistant-ui/react";
import {
  useSmartSpaceMessages,
  useSmartSpaceMembers,
  smartSpaceMessageToText,
  smartSpaceStreamPartsToText,
  type HsafaClient,
  type SmartSpaceMessageRecord,
  type SmartSpace,
  type Entity,
} from "@hsafa/react-sdk";

export interface UseHsafaRuntimeOptions {
  client: HsafaClient;
  entityId: string;
  smartSpaceId: string | null;
  smartSpaces?: SmartSpace[];
  onSwitchThread?: (smartSpaceId: string) => void;
  onNewThread?: () => void;
}

function convertSmartSpaceMessage(msg: SmartSpaceMessageRecord): ThreadMessageLike | null {
  if (msg.role === "tool") {
    return null;
  }

  const text = smartSpaceMessageToText(msg);
  if (!text || text.trim().length === 0) {
    return null;
  }

  return {
    id: msg.id,
    role: msg.role === "user" ? "user" : "assistant",
    content: [{ type: "text", text }],
    createdAt: new Date(msg.createdAt),
    metadata: { custom: { entityId: msg.entityId } },
  };
}

export interface UseHsafaRuntimeReturn {
  runtime: AssistantRuntime;
  membersById: Record<string, Entity>;
}

export function useHsafaRuntime(options: UseHsafaRuntimeOptions): UseHsafaRuntimeReturn {
  const {
    client,
    entityId,
    smartSpaceId,
    smartSpaces = [],
    onSwitchThread,
    onNewThread,
  } = options;

  const { membersById } = useSmartSpaceMembers(client, { smartSpaceId });

  const {
    messages: rawMessages,
    streamingMessages,
    sendMessage,
  } = useSmartSpaceMessages(client, { smartSpaceId, limit: 100 });

  const isRunning = streamingMessages.some((sm) => sm.isStreaming);

  const convertedMessages = useMemo<ThreadMessageLike[]>(() => {
    const persisted = rawMessages
      .map((m) => convertSmartSpaceMessage(m))
      .filter((m): m is ThreadMessageLike => m !== null);

    const activeStreaming = streamingMessages.filter((sm) => sm.isStreaming);

    const streaming = activeStreaming
      .map((sm): ThreadMessageLike | null => {
        const text = smartSpaceStreamPartsToText(sm.parts);
        if (!text) return null;

        return {
          id: sm.id,
          role: "assistant",
          content: [{ type: "text", text }],
          createdAt: new Date(),
          metadata: { custom: { entityId: sm.entityId } },
        };
      })
      .filter((m): m is ThreadMessageLike => m !== null);

    return [...persisted, ...streaming];
  }, [rawMessages, streamingMessages]);

  const onNew = async (message: AppendMessage) => {
    const firstPart = message.content[0];
    if (!firstPart || firstPart.type !== "text") {
      throw new Error("Only text messages are supported");
    }
    const text = firstPart.text;
    await sendMessage({ entityId, content: text });
  };

  const threadListAdapter = useMemo(() => {
    if (!onSwitchThread) return undefined;

    const threads = smartSpaces.map((ss) => ({
      id: ss.id,
      threadId: ss.id,
      status: "regular" as const,
      title: ss.name ?? "Untitled",
    }));

    return {
      threadId: smartSpaceId ?? undefined,
      threads,
      archivedThreads: [],
      onSwitchToThread: (threadId: string) => {
        onSwitchThread(threadId);
      },
      onSwitchToNewThread: () => {
        onNewThread?.();
      },
    };
  }, [smartSpaces, smartSpaceId, onSwitchThread, onNewThread]);

  const runtime = useExternalStoreRuntime({
    isRunning,
    messages: convertedMessages,
    convertMessage: (m) => m,
    onNew,
    adapters: threadListAdapter ? { threadList: threadListAdapter } : undefined,
  });

  return {
    runtime,
    membersById,
  };
}
