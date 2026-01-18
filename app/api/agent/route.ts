import { createAgentUIStreamResponse } from 'ai';
import { buildAgent, AgentBuildError } from '@/lib/agent-builder/builder';

export const runtime = 'edge';

interface UIMessagePart {
  type: string;
  text?: string;
  [key: string]: any;
}

interface IncomingMessage {
  id?: string;
  role: 'system' | 'user' | 'assistant';
  content?: string;
  parts?: UIMessagePart[];
}

interface UIMessage {
  id: string;
  role: 'system' | 'user' | 'assistant';
  parts: Array<{ type: string; text?: string; [key: string]: any }>;
}

function generateId(): string {
  return crypto.randomUUID();
}

function normalizeToUIMessages(messages: IncomingMessage[]): UIMessage[] {
  return messages.map((msg) => {
    // If message already has properly formatted parts, use them
    if (msg.parts && msg.parts.length > 0) {
      return {
        id: msg.id || generateId(),
        role: msg.role,
        parts: msg.parts,
      };
    }
    
    // If message has content string, convert to parts format
    if (msg.content) {
      return {
        id: msg.id || generateId(),
        role: msg.role,
        parts: [{ type: 'text', text: msg.content }],
      };
    }
    
    // Fallback - create empty text part
    return {
      id: msg.id || generateId(),
      role: msg.role,
      parts: [{ type: 'text', text: '' }],
    };
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { agentConfig, messages } = body;

    if (!agentConfig) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: agentConfig' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid field: messages (must be an array)' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log('[Agent API] Received messages:', JSON.stringify(messages, null, 2));

    const { agent } = await buildAgent({ configString: agentConfig });

    const uiMessages = normalizeToUIMessages(messages);
    
    console.log('[Agent API] Normalized messages:', JSON.stringify(uiMessages, null, 2));

    return createAgentUIStreamResponse({
      agent,
      uiMessages,
      abortSignal: request.signal,
    });
  } catch (error) {
    console.error('[Agent API Error]', error);

    if (error instanceof AgentBuildError) {
      return new Response(
        JSON.stringify({
          error: 'Agent build failed',
          message: error.message,
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
