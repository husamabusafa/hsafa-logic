
import { useExternalStoreRuntime } from "@assistant-ui/react";
import type { AssistantRuntime, ThreadMessageLike } from "@assistant-ui/react";
import {
  useHsafaRuntime as useHsafaRuntimeCore,
  type UseHsafaRuntimeOptions as CoreRuntimeOptions,
  type Entity,
  type ActiveAgent,
  type OnlineUser,
  type TypingUser,
  type SeenWatermarks,
} from "../hsafa-react";

export interface UseHsafaChatRuntimeOptions extends CoreRuntimeOptions {}

export interface UseHsafaChatRuntimeReturn {
  runtime: AssistantRuntime;
  membersById: Record<string, Entity>;
  activeAgents: ActiveAgent[];
  onlineUsers: OnlineUser[];
  typingUsers: TypingUser[];
  seenWatermarks: SeenWatermarks;
}

export function useHsafaChatRuntime(
  options: UseHsafaChatRuntimeOptions
): UseHsafaChatRuntimeReturn {
  const { messages, activeAgents, onlineUsers, typingUsers, seenWatermarks, onNew, threadListAdapter, membersById } =
    useHsafaRuntimeCore(options);

  const runtime = useExternalStoreRuntime({
    isRunning: false, // Never block sending — multiple concurrent runs are supported
    messages: messages as ThreadMessageLike[],
    convertMessage: (m) => m,
    onNew: onNew as (message: Parameters<typeof onNew>[0]) => Promise<void>,
    adapters: threadListAdapter
      ? { threadList: threadListAdapter as any }
      : undefined,
  });

  return { runtime, membersById, activeAgents, onlineUsers, typingUsers, seenWatermarks };
}
