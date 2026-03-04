import { useState, useEffect, useCallback } from 'react';
import { useHsafaClient } from '../context';
import type { SmartSpaceMessage } from '../types';

export interface UseMessagesOptions {
  limit?: number;
}

export interface UseMessagesReturn {
  messages: SmartSpaceMessage[];
  isLoading: boolean;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useMessages(
  smartSpaceId: string | null | undefined,
  options?: UseMessagesOptions
): UseMessagesReturn {
  const client = useHsafaClient();
  const limit = options?.limit ?? 50;
  const [messages, setMessages] = useState<SmartSpaceMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);

  const fetchMessages = useCallback(
    async (beforeSeq?: string) => {
      if (!smartSpaceId) return { msgs: [], more: false };

      const { messages: msgs } = await client.messages.list(smartSpaceId, {
        limit,
        beforeSeq,
      });

      return {
        msgs,
        more: msgs.length === limit,
      };
    },
    [client, smartSpaceId, limit]
  );

  useEffect(() => {
    if (!smartSpaceId) {
      setMessages([]);
      setIsLoading(false);
      setHasMore(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    fetchMessages()
      .then(({ msgs, more }) => {
        if (cancelled) return;
        setMessages(msgs);
        setHasMore(more);
        setIsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fetchMessages, smartSpaceId]);

  const loadMore = useCallback(async () => {
    if (!smartSpaceId || messages.length === 0) return;

    const oldestSeq = messages[0].seq;
    const { msgs, more } = await fetchMessages(oldestSeq);

    setMessages((prev) => [...msgs, ...prev]);
    setHasMore(more);
  }, [smartSpaceId, messages, fetchMessages]);

  const refresh = useCallback(async () => {
    if (!smartSpaceId) return;
    setIsLoading(true);

    const { msgs, more } = await fetchMessages();
    setMessages(msgs);
    setHasMore(more);
    setIsLoading(false);
  }, [smartSpaceId, fetchMessages]);

  return { messages, isLoading, hasMore, loadMore, refresh };
}
