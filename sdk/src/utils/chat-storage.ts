import { ChatMessage } from '../types/chat';

export interface ChatMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface ChatData {
  id: string;
  messages: ChatMessage[];
  agentId?: string;
}

export function createChatStorage(agentId: string) {
  const LS_PREFIX = `hsafaChat_${agentId}`;
  const chatsIndexKey = `${LS_PREFIX}.chats`;
  const chatKey = (id: string) => `${LS_PREFIX}.chat.${id}`;
  const currentChatKey = `${LS_PREFIX}.currentChatId`;
  const showChatKey = `${LS_PREFIX}.showChat`;

  const loadChatsIndex = (): ChatMeta[] => {
    try {
      const raw = localStorage.getItem(chatsIndexKey);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  };

  const saveChatsIndex = (list: ChatMeta[]) => {
    try { localStorage.setItem(chatsIndexKey, JSON.stringify(list)); } catch {}
  };

  const loadChat = (id: string): ChatData | null => {
    try { 
      const raw = localStorage.getItem(chatKey(id)); 
      return raw ? JSON.parse(raw) : null; 
    } catch { return null; }
  };

  const saveChat = (data: ChatData) => {
    try { localStorage.setItem(chatKey(data.id), JSON.stringify(data)); } catch {}
  };

  const upsertChatMeta = (meta: ChatMeta) => {
    const list = loadChatsIndex();
    const idx = list.findIndex(x => x.id === meta.id);
    if (idx >= 0) list[idx] = meta; else list.unshift(meta);
    saveChatsIndex(list);
  };

  const deleteChatMeta = (id: string) => {
    const list = loadChatsIndex();
    const next = list.filter(x => x.id !== id);
    saveChatsIndex(next);
  };

  const deleteChatData = (id: string) => {
    try { localStorage.removeItem(chatKey(id)); } catch {}
  };

  const deleteChat = (id: string) => {
    deleteChatData(id);
    deleteChatMeta(id);
  };

  const loadShowChatPreference = (defaultValue: boolean): boolean => {
    try {
      const savedShow = localStorage.getItem(showChatKey);
      return savedShow !== null ? savedShow === 'true' : defaultValue;
    } catch {
      return defaultValue;
    }
  };

  const saveShowChatPreference = (value: boolean) => {
    try { localStorage.setItem(showChatKey, String(value)); } catch {}
  };

  const loadCurrentChatId = (): string | null => {
    try {
      return localStorage.getItem(currentChatKey);
    } catch {
      return null;
    }
  };

  const saveCurrentChatId = (chatId: string) => {
    try { localStorage.setItem(currentChatKey, chatId); } catch {}
  };

  const removeCurrentChatId = () => {
    try { localStorage.removeItem(currentChatKey); } catch {}
  };

  return {
    loadChatsIndex,
    saveChatsIndex,
    loadChat,
    saveChat,
    upsertChatMeta,
    deleteChatMeta,
    deleteChatData,
    deleteChat,
    loadShowChatPreference,
    saveShowChatPreference,
    loadCurrentChatId,
    saveCurrentChatId,
    removeCurrentChatId
  };
}

export function genId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
