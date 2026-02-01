/**
 * useHsafaGateway - Simple hook for connecting to Hsafa Gateway
 * 
 * Handles agent connection, run lifecycle, SSE streaming, and browser tools.
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

export interface RunInfo {
  id: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
}

export interface StreamEvent {
  id: string;
  type: string;
  ts: string;
  data: unknown;
}

export interface UseHsafaGatewayConfig {
  /** Gateway URL */
  gatewayUrl: string;
  /** Agent ID (required for existing agents) */
  agentId?: string;
  /** Agent configuration (for registering new agents) */
  agentConfig?: AgentConfig;
  /** Attach to existing run */
  runId?: string;
  /** Sender identity */
  senderId?: string;
  senderName?: string;
  /** Browser-side tools */
  tools?: Record<string, (args: unknown) => Promise<unknown> | unknown>;
  /** Called for UI tools */
  onToolCall?: (toolCall: ToolCall, addResult: (result: unknown) => void) => void;
  /** Called on completion */
  onComplete?: (text: string) => void;
  /** Called on error */
  onError?: (error: Error) => void;
}

export interface HsafaGatewayAPI {
  messages: GatewayMessage[];
  isStreaming: boolean;
  status: 'idle' | 'registering' | 'running' | 'streaming' | 'waiting_tool' | 'completed' | 'error';
  runId: string | null;
  agentId: string | null;
  isReady: boolean;
  error: Error | null;
  pendingToolCalls: ToolCall[];
  /** Load list of runs for current agent from PostgreSQL */
  loadRuns: () => Promise<RunInfo[]>;
  /** Delete a run from PostgreSQL */
  deleteRun: (runId: string) => Promise<boolean>;
  createRun: () => Promise<string>;
  attachToRun: (runId: string) => Promise<void>;
  sendMessage: (text: string, files?: Array<{ url: string; mediaType: string; name?: string }>) => Promise<void>;
  addToolResult: (payload: unknown) => Promise<void>;
  stop: () => void;
  reset: () => void;
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
    tools = {},
    onToolCall,
    onComplete,
    onError,
  } = config;

  // State
  const [messages, setMessages] = useState<GatewayMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [status, setStatus] = useState<HsafaGatewayAPI['status']>(providedAgentId ? 'idle' : 'registering');
  const [runId, setRunId] = useState<string | null>(providedRunId || null);
  const [agentId, setAgentId] = useState<string | null>(providedAgentId || null);
  const [agentVersionId, setAgentVersionId] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [pendingToolCalls, setPendingToolCalls] = useState<ToolCall[]>([]);
  const [isReady, setIsReady] = useState(!!providedAgentId);

  // Refs
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

        // If we have a draft assistant and this is the final message.assistant,
        // finalize the draft: keep streamed text, and merge tool-call parts if present.
        if (type === 'message.assistant' && draftAssistantIdRef.current) {
          const draftId = draftAssistantIdRef.current;
          draftAssistantIdRef.current = null;

          setMessages(prev => prev.map(m => {
            if (m.id !== draftId) return m;

            const draftParts = Array.isArray(m.parts) ? m.parts : [];
            const finalParts = Array.isArray(msg.parts) ? msg.parts : [];

            const draftReasoning = draftParts.find(p => {
              const t = (p as { type?: unknown }).type;
              return typeof t === 'string' && t === 'reasoning';
            });
            const draftText = draftParts.find(p => {
              const t = (p as { type?: unknown }).type;
              return typeof t === 'string' && t === 'text';
            });

            const hasToolCall = finalParts.some(p => {
              const t = (p as { type?: unknown }).type;
              return typeof t === 'string' && t === 'tool-call';
            });
            const hasText = finalParts.some(p => {
              const t = (p as { type?: unknown }).type;
              return typeof t === 'string' && t === 'text';
            });

            let parts: GatewayMessagePart[] = finalParts;

            if (hasToolCall) {
              const merged: GatewayMessagePart[] = [];
              const reasoningText = draftReasoning && typeof (draftReasoning as Record<string, unknown>).text === 'string'
                ? ((draftReasoning as Record<string, unknown>).text as string)
                : '';
              if (reasoningText) merged.push({ type: 'reasoning', text: reasoningText });

              const draftTextValue = draftText && typeof (draftText as Record<string, unknown>).text === 'string'
                ? ((draftText as Record<string, unknown>).text as string)
                : '';
              const textToUse = currentTextRef.current || draftTextValue;
              if (textToUse) merged.push({ type: 'text', text: textToUse });

              merged.push(...finalParts.filter(p => {
                const t = (p as { type?: unknown }).type;
                return t !== 'text' && t !== 'reasoning';
              }));

              parts = merged;
            } else if (hasText && currentTextRef.current) {
              // Prefer the accumulated streamed text
              parts = finalParts.map(p => {
                const t = (p as { type?: unknown }).type;
                if (t === 'text') return { ...p, text: currentTextRef.current };
                return p;
              });
              const reasoningText = draftReasoning && typeof (draftReasoning as Record<string, unknown>).text === 'string'
                ? ((draftReasoning as Record<string, unknown>).text as string)
                : '';
              if (reasoningText && !parts.some(p => {
                const t = (p as { type?: unknown }).type;
                return typeof t === 'string' && t === 'reasoning';
              })) {
                parts = [{ type: 'reasoning', text: reasoningText }, ...parts];
              }
            } else if (finalParts.length === 0) {
              // Nothing in final: keep draft parts
              parts = draftParts;
            }

            return { ...m, id: msg.id, parts };
          }));

          currentTextRef.current = '';
          currentReasoningRef.current = '';
          break;
        }

        // Skip if we already have this message (prevents duplicates from history + stream)
        setMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
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
  }, [agentConfig?.tools, tools, onToolCall, addToolResult, executeBrowserTool, sendToolResult, runId, onComplete, onError, ensureDraftAssistant]);

  // Start SSE stream for a run
  const startStream = useCallback((currentRunId: string) => {
    // Close existing stream
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource(`${gatewayUrl}/api/runs/${currentRunId}/stream`);
    eventSourceRef.current = eventSource;
    attachedRunIdRef.current = currentRunId;
    const streamRunId = currentRunId;

    eventSource.addEventListener('hsafa', (e) => {
      try {
        if (attachedRunIdRef.current !== streamRunId) return;
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

  // Load messages for a run (authoritative source of truth)
  const loadRunMessages = useCallback(async (targetRunId: string): Promise<GatewayMessage[]> => {
    try {
      const response = await fetch(`${gatewayUrl}/api/runs/${targetRunId}/messages`);
      if (!response.ok) {
        console.warn('Failed to load run messages:', response.statusText);
        return [];
      }
      const data = await response.json();
      const msgs = Array.isArray(data?.messages) ? data.messages : [];
      return msgs.filter((m: unknown): m is GatewayMessage => {
        if (!m || typeof m !== 'object') return false;
        const mm = m as { id?: unknown; role?: unknown; parts?: unknown };
        return typeof mm.id === 'string' && (mm.role === 'user' || mm.role === 'assistant' || mm.role === 'tool') && Array.isArray(mm.parts);
      });
    } catch (err) {
      console.error('Error loading run messages:', err);
      return [];
    }
  }, [gatewayUrl]);

  // Load runs list from PostgreSQL
  const loadRuns = useCallback(async (): Promise<RunInfo[]> => {
    if (!agentId) return [];
    try {
      const response = await fetch(`${gatewayUrl}/api/runs?agentId=${agentId}`);
      if (!response.ok) {
        console.warn('Failed to load runs:', response.statusText);
        return [];
      }
      const data = await response.json();
      return Array.isArray(data?.runs) ? data.runs : [];
    } catch (err) {
      console.error('Error loading runs:', err);
      return [];
    }
  }, [gatewayUrl, agentId]);

  // Delete a run from PostgreSQL
  const deleteRun = useCallback(async (targetRunId: string): Promise<boolean> => {
    try {
      const response = await fetch(`${gatewayUrl}/api/runs/${targetRunId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        console.warn('Failed to delete run:', response.statusText);
        return false;
      }
      // If we deleted the current run, reset state
      if (targetRunId === runId) {
        setMessages([]);
        setRunId(null);
        attachedRunIdRef.current = null;
      }
      return true;
    } catch (err) {
      console.error('Error deleting run:', err);
      return false;
    }
  }, [gatewayUrl, runId]);

  const attachToRun = useCallback(async (newRunId: string) => {
    if (!newRunId) {
      console.warn('attachToRun called with empty runId');
      return;
    }

    // Stop any existing stream immediately to avoid mixing runs while we load
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsStreaming(false);
    
    // Clear previous messages when attaching to a new run
    setMessages([]);
    setRunId(newRunId);
    attachedRunIdRef.current = newRunId;

    // Reset streaming/draft refs for this run
    currentTextRef.current = '';
    currentReasoningRef.current = '';
    draftAssistantIdRef.current = null;
    
    // Load existing messages for this run from PostgreSQL
    const history = await loadRunMessages(newRunId);
    setMessages(history);

    // Start streaming live updates
    startStream(newRunId);
  }, [startStream, loadRunMessages]);

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

    // Clear messages for new run
    setMessages([]);
    setRunId(data.runId);
    attachedRunIdRef.current = data.runId;

    // Reset streaming/draft refs for this run
    currentTextRef.current = '';
    currentReasoningRef.current = '';
    draftAssistantIdRef.current = null;

    startStream(data.runId);
    return data.runId;
  }, [agentId, agentVersionId, gatewayUrl, isReady, startStream]);

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
    attachedRunIdRef.current = null;
  }, [stop]);

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
    isStreaming,
    status,
    runId,
    agentId,
    isReady,
    error,
    pendingToolCalls,
    loadRuns,
    deleteRun,
    createRun,
    attachToRun,
    sendMessage,
    addToolResult,
    stop,
    reset,
  };
}
