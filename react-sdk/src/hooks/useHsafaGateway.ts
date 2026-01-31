/**
 * useHsafaGateway - Simple hook for connecting to Hsafa Gateway
 * 
 * This hook handles:
 * - Creating/registering agents
 * - Starting runs
 * - Streaming events via SSE
 * - Executing browser tools and sending results back
 * 
 * @example
 * ```tsx
 * function Chat() {
 *   const { messages, sendMessage, isStreaming, status } = useHsafaGateway({
 *     gatewayUrl: 'http://localhost:3001',
 *     agentConfig: myAgentConfig,
 *     tools: {
 *       showNotification: async (args) => {
 *         alert(args.message);
 *         return { shown: true };
 *       }
 *     }
 *   });
 * 
 *   return (
 *     <div>
 *       {messages.map(m => <div key={m.id}>{m.content}</div>)}
 *       <button onClick={() => sendMessage('Hello!')}>Send</button>
 *     </div>
 *   );
 * }
 * ```
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { genId } from '../utils/time';

// ============ Types ============

export interface AgentConfig {
  version?: string;
  agent: {
    name: string;
    description?: string;
    system?: string;
  };
  model: {
    provider: string;
    name: string;
    temperature?: number;
    maxOutputTokens?: number;
  };
  tools?: Array<{
    name: string;
    description: string;
    inputSchema: unknown;
    executionTarget?: 'server' | 'browser' | 'device';
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

export type GatewayMessagePart = {
  type: string;
  [key: string]: unknown;
};

export interface GatewayMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  parts: GatewayMessagePart[];
  createdAt?: number;
}

export interface ToolCall {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  executionTarget?: 'server' | 'browser' | 'device' | 'external';
  status: 'pending' | 'executing' | 'completed' | 'failed';
}

export interface ToolResult {
  toolCallId: string;
  toolName: string;
  result: unknown;
}

export interface StreamEvent {
  id: string;
  type: string;
  ts: string;
  data: unknown;
}

export interface UseHsafaGatewayConfig {
  /** Gateway URL (e.g., 'http://localhost:3001') */
  gatewayUrl: string;
  /** Agent ID (for existing agents) - use this OR agentConfig */
  agentId?: string;
  /** Agent configuration object (for registering new agents) - use this OR agentId */
  agentConfig?: AgentConfig;
  /** Optional existing runId to attach to */
  runId?: string;
  /** Optional sender identity for user messages */
  senderId?: string;
  /** Optional sender name for user messages */
  senderName?: string;
  /** Initial messages to restore */
  initialMessages?: GatewayMessage[];
  /** Browser-side tools that execute on the client */
  tools?: Record<string, (args: unknown) => Promise<unknown> | unknown>;
  /** Called when agent requests a tool with UI (return result via addToolResult) */
  onToolCall?: (toolCall: ToolCall, addResult: (result: unknown) => void) => void;
  /** Called when run completes */
  onComplete?: (text: string) => void;
  /** Called on error */
  onError?: (error: Error) => void;
  /** Called when messages change (for persistence) */
  onMessagesChange?: (messages: GatewayMessage[]) => void;
  /** Persist runId to localStorage for reconnection on page refresh */
  persistRun?: boolean;
  /** Storage key prefix for persisting run (default: 'hsafa-run') */
  storageKey?: string;
}

export interface HsafaGatewayAPI {
  /** All messages in the conversation */
  messages: GatewayMessage[];
  /** Set messages (for restoring from storage) */
  setMessages: (messages: GatewayMessage[]) => void;
  /** Whether currently streaming */
  isStreaming: boolean;
  /** Current status */
  status: 'idle' | 'registering' | 'running' | 'streaming' | 'waiting_tool' | 'completed' | 'error';
  /** Current run ID */
  runId: string | null;
  /** Agent ID */
  agentId: string | null;
  /** Create a new run and attach */
  createRun: () => Promise<string>;
  /** Attach to an existing run (starts streaming and loads history) */
  attachToRun: (runId: string) => Promise<void>;
  /** Load messages from an existing run */
  loadRunHistory: (runId: string) => Promise<GatewayMessage[]>;
  /** Send a message to start/continue the conversation */
  sendMessage: (text: string, files?: Array<{ url: string; mediaType: string; name?: string }>) => Promise<void>;
  /** Add a tool result (for UI tools); supports legacy UI payload objects */
  addToolResult: (payload: unknown) => Promise<void>;
  /** Stop the current run */
  stop: () => void;
  /** Clear messages and start fresh */
  reset: () => void;
  /** Any error that occurred */
  error: Error | null;
  /** Pending tool calls waiting for results */
  pendingToolCalls: ToolCall[];
  /** Whether ready to send messages */
  isReady: boolean;
}

// ============ Hook Implementation ============

export function useHsafaGateway(config: UseHsafaGatewayConfig): HsafaGatewayAPI {
  const {
    gatewayUrl,
    agentId: providedAgentId,
    agentConfig,
    runId: providedRunId,
    senderId,
    senderName,
    initialMessages,
    tools = {},
    onToolCall,
    onComplete,
    onError,
    onMessagesChange,
    persistRun = false,
    storageKey = 'hsafa-run',
  } = config;

  // Helper to get storage key for this agent
  const getStorageKey = useCallback(() => {
    const id = providedAgentId || agentConfig?.agent?.name || 'default';
    return `${storageKey}:${id}`;
  }, [storageKey, providedAgentId, agentConfig?.agent?.name]);

  // State
  const [messages, setMessagesInternal] = useState<GatewayMessage[]>(initialMessages || []);
  const [isStreaming, setIsStreaming] = useState(false);
  const [status, setStatus] = useState<HsafaGatewayAPI['status']>(providedAgentId ? 'idle' : 'registering');
  const [runId, setRunId] = useState<string | null>(providedRunId || null);
  const [agentId, setAgentId] = useState<string | null>(providedAgentId || null);
  const [agentVersionId, setAgentVersionId] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [pendingToolCalls, setPendingToolCalls] = useState<ToolCall[]>([]);
  const [isReady, setIsReady] = useState(!!providedAgentId);

  // Wrapped setMessages that notifies changes
  const setMessages = useCallback((newMessages: GatewayMessage[] | ((prev: GatewayMessage[]) => GatewayMessage[])) => {
    setMessagesInternal(prev => {
      const updated = typeof newMessages === 'function' ? newMessages(prev) : newMessages;
      // Notify on next tick to avoid state update during render
      if (onMessagesChange) {
        setTimeout(() => onMessagesChange(updated), 0);
      }
      return updated;
    });
  }, [onMessagesChange]);

  // Refs
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentTextRef = useRef<string>('');
  const currentReasoningRef = useRef<string>('');
  const draftAssistantIdRef = useRef<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (providedRunId) {
      setRunId(providedRunId);
    }
  }, [providedRunId]);

  const attachedRunIdRef = useRef<string | null>(null);

  const upsertMessageById = useCallback((msg: GatewayMessage) => {
    setMessages(prev => {
      const idx = prev.findIndex(m => m.id === msg.id);
      if (idx === -1) return [...prev, msg];
      const updated = [...prev];
      updated[idx] = msg;
      return updated;
    });
  }, [setMessages]);

  const ensureDraftAssistant = useCallback(() => {
    if (draftAssistantIdRef.current) return draftAssistantIdRef.current;
    const id = `draft_${genId()}`;
    draftAssistantIdRef.current = id;
    upsertMessageById({
      id,
      role: 'assistant',
      parts: [],
      createdAt: Date.now(),
    });
    return id;
  }, [upsertMessageById]);

  // Register agent on mount (only if agentConfig provided, not agentId)
  useEffect(() => {
    // If agentId is provided directly, we're ready
    if (providedAgentId) {
      setAgentId(providedAgentId);
      setIsReady(true);
      setStatus('idle');
      return;
    }

    // If no agentConfig, nothing to register
    if (!agentConfig) {
      setError(new Error('Either agentId or agentConfig must be provided'));
      setStatus('error');
      return;
    }

    const registerAgent = async () => {
      try {
        setStatus('registering');
        const response = await fetch(`${gatewayUrl}/api/agents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: agentConfig.agent.name,
            config: agentConfig,
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to register agent: ${response.statusText}`);
        }

        const data = await response.json();
        setAgentId(data.agentId);
        setAgentVersionId(data.agentVersionId);
        setIsReady(true);
        setStatus('idle');
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        setStatus('error');
        onError?.(error);
      }
    };

    registerAgent();
  }, [gatewayUrl, providedAgentId, agentConfig, onError]);

  // Handle browser tool execution
  const executeBrowserTool = useCallback(async (toolCall: ToolCall): Promise<unknown> => {
    const toolFn = tools[toolCall.toolName];
    if (toolFn) {
      try {
        const result = await toolFn(toolCall.args);
        return result;
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    }
    return { error: `Tool ${toolCall.toolName} not found` };
  }, [tools]);

  // Send tool result to gateway
  const sendToolResult = useCallback(async (currentRunId: string, callId: string, result: unknown) => {
    try {
      await fetch(`${gatewayUrl}/api/runs/${currentRunId}/tool-results`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callId,
          result,
          source: 'browser',
        }),
      });
    } catch (err) {
      console.error('Failed to send tool result:', err);
    }
  }, [gatewayUrl]);

  // Add tool result (public API for UI tools)
  const addToolResult = useCallback(async (payload: unknown) => {
    if (!runId) return;

    if (typeof payload === 'string') {
      return;
    }

    const p = payload as Record<string, unknown>;
    const toolCallId = typeof p.toolCallId === 'string' ? p.toolCallId : undefined;
    const result = p.output ?? p.result;
    if (!toolCallId) return;

    setPendingToolCalls(prev => prev.filter(tc => tc.id !== toolCallId));
    await sendToolResult(runId, toolCallId, result);
  }, [runId, sendToolResult]);

  // Process SSE event
  const processEvent = useCallback((event: StreamEvent) => {
    const { type, data } = event;

    switch (type) {
      case 'run.created':
      case 'run.started':
        setStatus('streaming');
        break;

      case 'run.waiting_tool':
        setStatus('waiting_tool');
        break;

      case 'reasoning.delta': {
        const d = data as Record<string, unknown> | null | undefined;
        const delta = typeof d?.delta === 'string' ? d.delta : '';
        if (!delta) break;
        currentReasoningRef.current += delta;
        const draftId = ensureDraftAssistant();
        setMessages(prev => prev.map(m => {
          if (m.id !== draftId) return m;
          const parts = Array.isArray(m.parts) ? [...m.parts] : [];
          const idx = parts.findIndex(p => p.type === 'reasoning');
          if (idx === -1) {
            parts.unshift({ type: 'reasoning', text: currentReasoningRef.current });
          } else {
            parts[idx] = { ...parts[idx], text: currentReasoningRef.current };
          }
          return { ...m, parts };
        }));
        break;
      }

      case 'text.delta': {
        const d = data as Record<string, unknown> | null | undefined;
        const delta = typeof d?.delta === 'string' ? d.delta : '';
        if (!delta) break;
        currentTextRef.current += delta;
        const draftId = ensureDraftAssistant();
        setMessages(prev => prev.map(m => {
          if (m.id !== draftId) return m;
          const parts = Array.isArray(m.parts) ? [...m.parts] : [];
          const idx = parts.findIndex(p => p.type === 'text');
          if (idx === -1) {
            parts.push({ type: 'text', text: currentTextRef.current });
          } else {
            parts[idx] = { ...parts[idx], text: currentTextRef.current };
          }
          return { ...m, parts };
        }));
        break;
      }

      case 'message.user':
      case 'message.assistant':
      case 'message.tool': {
        const maybeMessage = (data as { message?: unknown } | null | undefined)?.message;
        const msg = maybeMessage as GatewayMessage | undefined;
        if (!msg || typeof msg !== 'object' || typeof msg.id !== 'string') break;

        if (
          type === 'message.assistant' &&
          msg.role === 'assistant' &&
          draftAssistantIdRef.current &&
          Array.isArray(msg.parts) &&
          msg.parts.some(p => p && typeof p === 'object' && (p as { type?: unknown }).type === 'text')
        ) {
          const draftId = draftAssistantIdRef.current;
          draftAssistantIdRef.current = null;
          currentTextRef.current = '';
          currentReasoningRef.current = '';
          setMessages(prev => {
            const idx = prev.findIndex(m => m.id === draftId);
            if (idx === -1) return [...prev, msg];
            const updated = [...prev];
            updated[idx] = msg;
            return updated;
          });
        } else {
          upsertMessageById(msg);
        }
        break;
      }

      case 'tool.call': {
        const d = data as Record<string, unknown> | null | undefined;
        const executionTarget = typeof d?.executionTarget === 'string'
          ? (d.executionTarget as ToolCall['executionTarget'])
          : undefined;
        const toolCall: ToolCall = {
          id: (data as { toolCallId?: string } | null | undefined)?.toolCallId || '',
          toolName: (data as { toolName?: string } | null | undefined)?.toolName || '',
          args: ((data as { args?: Record<string, unknown> } | null | undefined)?.args) || {},
          executionTarget,
          status: 'pending',
        };

        if (!toolCall.id || !toolCall.toolName) break;

        // Check if this is a browser tool
        const toolConfig = agentConfig?.tools?.find(t => t.name === toolCall.toolName);
        const inferredTarget = toolConfig?.executionTarget;
        const target = executionTarget || inferredTarget;

        const isBrowserTool = target === 'browser' || !!tools[toolCall.toolName];

        if (isBrowserTool) {
          // Check if it needs UI interaction
          if (onToolCall && !tools[toolCall.toolName]) {
            // UI tool - let the app handle it
            setStatus('waiting_tool');
            setPendingToolCalls(prev => [...prev, toolCall]);
            onToolCall(toolCall, (result) => addToolResult({ toolCallId: toolCall.id, output: result }));
          } else if (tools[toolCall.toolName]) {
            // Auto-execute browser tool
            executeBrowserTool(toolCall).then(result => {
              if (runId) {
                sendToolResult(runId, toolCall.id, result);
              }
            });
          }
        }
        // Server tools are handled by the gateway automatically
        break;
      }

      case 'tool.result':
        {
          const d = data as Record<string, unknown> | null | undefined;
          const toolCallId = typeof d?.toolCallId === 'string' ? d.toolCallId : undefined;
          if (toolCallId) {
            setPendingToolCalls(prev => prev.filter(tc => tc.id !== toolCallId));
          }
          setStatus('streaming');
        }
        break;

      case 'run.completed':
        setStatus('completed');
        setIsStreaming(false);
        {
          const d = data as Record<string, unknown> | null | undefined;
          const text = typeof d?.text === 'string' ? d.text : '';
          onComplete?.(text || currentTextRef.current);
        }
        break;

      case 'run.failed':
      case 'stream.error':
        {
          const msg = typeof (data as { error?: unknown } | null | undefined)?.error === 'string'
            ? (data as { error?: string }).error
            : 'Run failed';
          const err = new Error(msg || 'Run failed');
          setError(err);
          setStatus('error');
          setIsStreaming(false);
          onError?.(err);
          break;
        }
    }
  }, [agentConfig?.tools, tools, onToolCall, addToolResult, executeBrowserTool, sendToolResult, runId, onComplete, onError, setMessages, ensureDraftAssistant, upsertMessageById]);

  // Start SSE stream for a run
  const startStream = useCallback((currentRunId: string) => {
    // Close existing stream
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource(`${gatewayUrl}/api/runs/${currentRunId}/stream`);
    eventSourceRef.current = eventSource;
    attachedRunIdRef.current = currentRunId;

    eventSource.addEventListener('hsafa', (e) => {
      try {
        const event: StreamEvent = JSON.parse(e.data);
        processEvent(event);
      } catch (err) {
        console.error('Failed to parse event:', err);
      }
    });

    eventSource.onerror = (err) => {
      console.error('SSE error:', err);
      eventSource.close();
      setIsStreaming(false);
    };
  }, [gatewayUrl, processEvent]);

  // Load messages from an existing run
  const loadRunHistory = useCallback(async (targetRunId: string): Promise<GatewayMessage[]> => {
    try {
      const response = await fetch(`${gatewayUrl}/api/runs/${targetRunId}/events`);
      if (!response.ok) {
        console.warn('Failed to load run history:', response.statusText);
        return [];
      }
      const data = await response.json();
      const events = Array.isArray(data?.events) ? data.events : [];
      
      const loadedMessages: GatewayMessage[] = [];
      for (const evt of events) {
        if (!evt || typeof evt !== 'object') continue;
        const evtType = evt.type;
        if (evtType !== 'message.user' && evtType !== 'message.assistant' && evtType !== 'message.tool') continue;
        const payload = evt.payload as { message?: unknown } | null | undefined;
        const msg = payload?.message as GatewayMessage | undefined;
        if (msg && typeof msg === 'object' && typeof msg.id === 'string') {
          loadedMessages.push(msg);
        }
      }
      return loadedMessages;
    } catch (err) {
      console.error('Error loading run history:', err);
      return [];
    }
  }, [gatewayUrl]);

  const attachToRun = useCallback(async (newRunId: string) => {
    setRunId(newRunId);
    // Persist runId if enabled
    if (persistRun) {
      try {
        localStorage.setItem(getStorageKey(), newRunId);
      } catch { /* ignore storage errors */ }
    }
    // Load existing messages
    const history = await loadRunHistory(newRunId);
    if (history.length > 0) {
      setMessages(history);
    }
    // Start streaming
    startStream(newRunId);
  }, [startStream, loadRunHistory, persistRun, getStorageKey, setMessages]);

  // Auto-reconnect to persisted run on mount
  useEffect(() => {
    if (!persistRun || !isReady || providedRunId) return;
    try {
      const storedRunId = localStorage.getItem(getStorageKey());
      if (storedRunId && !attachedRunIdRef.current) {
        attachToRun(storedRunId);
      }
    } catch { /* ignore storage errors */ }
  }, [persistRun, isReady, providedRunId, getStorageKey, attachToRun]);

  useEffect(() => {
    if (!providedRunId) return;
    if (attachedRunIdRef.current === providedRunId) return;
    attachToRun(providedRunId);
  }, [providedRunId, attachToRun]);

  const createRun = useCallback(async () => {
    if (!agentId || !isReady) {
      throw new Error('Agent not ready yet');
    }

    const response = await fetch(`${gatewayUrl}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId,
        agentVersionId: agentVersionId || undefined,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create run: ${response.statusText}`);
    }

    const data = (await response.json()) as { runId?: string };
    if (!data?.runId) {
      throw new Error('Failed to create run: missing runId');
    }

    setRunId(data.runId);
    // Persist runId if enabled
    if (persistRun) {
      try {
        localStorage.setItem(getStorageKey(), data.runId);
      } catch { /* ignore storage errors */ }
    }
    startStream(data.runId);
    return data.runId;
  }, [agentId, agentVersionId, gatewayUrl, isReady, startStream, persistRun, getStorageKey]);

  // Send message
  const sendMessage = useCallback(async (text: string, files?: Array<{ url: string; mediaType: string; name?: string }>) => {
    if (!agentId || !isReady) {
      throw new Error('Agent not ready yet');
    }

    const trimmed = text.trim();
    if (!trimmed && (!files || files.length === 0)) return;

    let currentRunId = runId;
    if (!currentRunId) {
      currentRunId = await createRun();
    }

    const parts: GatewayMessagePart[] = [];
    if (trimmed) {
      parts.push({ type: 'text', text: trimmed });
    }
    for (const f of files || []) {
      parts.push({
        type: 'file',
        data: f.url,
        mediaType: f.mediaType,
        ...(f.name ? { name: f.name } : {}),
      });
    }

    const userMessage: GatewayMessage = {
      id: `msg_${genId()}`,
      role: 'user',
      parts,
      createdAt: Date.now(),
    };

    upsertMessageById(userMessage);

    currentTextRef.current = '';
    currentReasoningRef.current = '';
    draftAssistantIdRef.current = null;
    ensureDraftAssistant();

    try {
      setIsStreaming(true);
      setStatus('running');
      setError(null);

      const response = await fetch(`${gatewayUrl}/api/runs/${currentRunId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          senderId: senderId ?? null,
          senderName: senderName ?? null,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to send message: ${response.statusText}`);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      setStatus('error');
      setIsStreaming(false);
      onError?.(error);
    }
  }, [agentId, isReady, runId, createRun, gatewayUrl, onError, senderId, senderName, ensureDraftAssistant, upsertMessageById]);

  // Stop current run
  const stop = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setStatus('idle');
  }, []);

  // Reset
  const reset = useCallback(() => {
    stop();
    setMessages([]);
    setRunId(null);
    setError(null);
    setPendingToolCalls([]);
    currentTextRef.current = '';
    currentReasoningRef.current = '';
    draftAssistantIdRef.current = null;
  }, [stop, setMessages]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  return {
    messages,
    setMessages,
    isStreaming,
    status,
    runId,
    agentId,
    createRun,
    attachToRun,
    loadRunHistory,
    sendMessage,
    addToolResult,
    stop,
    reset,
    error,
    pendingToolCalls,
    isReady,
  };
}
