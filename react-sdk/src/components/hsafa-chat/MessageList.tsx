import React from "react";
import { AssistantMassage } from "./AssistantMassage";
import { Attachment } from "../../types/chat";
import { AttachmentDisplay } from "../AttachmentDisplay";
import type { ThemeColors } from "../../utils/chat-theme";

type MessagePart = {
  type: string;
  text?: string;
  image?: string | URL;
  data?: string | URL;
  url?: string;
  mediaType?: string;
  name?: string;
  size?: number;
};

type RenderMessage = {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  parts?: MessagePart[];
};

interface MessageListProps {
  chatMessages: RenderMessage[];
  isLoading: boolean;
  openReasoningIds: Set<string>;
  toggleReasoning: (id: string) => void;
  resolvedColors: ThemeColors;
  t: (k: string) => string;
  HsafaUI?: Record<string, React.ComponentType<unknown>>;
  onUIError?: (toolCallId: string, toolName: string, error: Error) => void;
  onUISuccess?: (toolCallId: string, toolName: string) => void;
  addToolResult?: (payload: unknown) => void;
  fullPage?: boolean;
  dir?: 'rtl' | 'ltr';
  theme?: 'light' | 'dark';
}

export function MessageList({ 
  chatMessages, 
  isLoading, 
  openReasoningIds, 
  toggleReasoning, 
  resolvedColors, 
  t, 
  HsafaUI,
  onUIError,
  onUISuccess,
  addToolResult,
  fullPage,
  dir,
  theme = 'dark'
}: MessageListProps) {

  return (
    <>
      <style>
        {`
          @keyframes jumpingDots {
            0%, 80%, 100% { 
              transform: translateY(0);
            }
            40% { 
              transform: translateY(-5px);
            }
          }
        `}
      </style>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        direction: dir,
       
      }}>
        {chatMessages.map((m) => {
        const messageParts = Array.isArray(m.parts) ? m.parts : [];
        const messageText = messageParts
          .filter((p) => p.type === 'text')
          .map((p) => (p && typeof p.text === 'string' ? p.text : ''))
          .join('\n');

        // Extract file and image attachments from message parts
        const messageAttachments: Attachment[] = messageParts
          .filter((p) => p.type === 'file' || p.type === 'image')
          .map((p) => {
            if (p.type === 'image') {
              const imgUrl = typeof p.image === 'string' ? p.image : p.image?.toString?.() || '';
              return {
                id: imgUrl || `${m.id}-img-${Date.now()}`,
                name: p.name || 'image',
                url: imgUrl,
                mimeType: p.mediaType || 'image/jpeg',
                size: p.size || 0
              };
            } else {
              const fileUrl = typeof p.data === 'string'
                ? p.data
                : (p.data?.toString?.() || p.url || '');
              return {
                id: fileUrl || `${m.id}-file-${Date.now()}`,
                name: p.name || 'file',
                url: fileUrl || '',
                mimeType: p.mediaType || 'application/octet-stream',
                size: p.size || 0
              };
            }
          });

        return (
          <div key={m.id} style={{ padding: '0 4px', display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' && fullPage ? 'flex-end' : 'stretch' }}>
            {m.role === 'user' ? (
              <div style={{ maxWidth: fullPage ? '80%' : '100%' }}>
                <div
                  style={{
                    maxWidth: fullPage ? '100%' : '720px',
                    borderRadius: fullPage ? '20px' : '16px',
                    padding: '12px 16px',
                    fontSize: '15px',
                    lineHeight: '1.6',
                    whiteSpace: 'pre-wrap',
                    backgroundColor: fullPage ? resolvedColors.inputBackground : resolvedColors.accentColor,
                    color: resolvedColors.textColor,
                    marginBottom: '16px',
                    marginTop: '16px',
                    border: fullPage ? `1px solid ${resolvedColors.borderColor}` : 'none',
                  }}
                >
                  {messageText}
                  {messageAttachments.length > 0 && (
                    <AttachmentDisplay
                      attachments={messageAttachments}
                      resolvedColors={resolvedColors}
                    />
                  )}
                </div>
              </div>
            ) : (
                <AssistantMassage
                  parts={messageParts}
                  messageId={m.id}
                  openReasoningIds={openReasoningIds}
                  toggleReasoning={toggleReasoning}
                  resolvedColors={resolvedColors}
                  HsafaUI={HsafaUI}
                  onUIError={onUIError}
                  onUISuccess={onUISuccess}
                  addToolResult={addToolResult}
                  dir={dir}
                  t={t}
                  theme={theme}
                />
            )}
          </div>
        );
      })}

      {/* Jumping dots loading indicator - appears immediately after user submits */}
      {isLoading && (
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '4px', 
          padding: '0 4px',
          height: '20px'
        }}>
          <span 
            style={{ 
              display: 'inline-block', 
              width: '4px', 
              height: '4px', 
              borderRadius: '50%', 
              backgroundColor: resolvedColors.mutedTextColor,
              animation: 'jumpingDots 1s infinite ease-in-out',
              animationDelay: '0s'
            }} 
          />
          <span 
            style={{ 
              display: 'inline-block', 
              width: '4px', 
              height: '4px', 
              borderRadius: '50%', 
              backgroundColor: resolvedColors.mutedTextColor,
              animation: 'jumpingDots 1s infinite ease-in-out',
              animationDelay: '0.2s'
            }} 
          />
          <span 
            style={{ 
              display: 'inline-block', 
              width: '4px', 
              height: '4px', 
              borderRadius: '50%', 
              backgroundColor: resolvedColors.mutedTextColor,
              animation: 'jumpingDots 1s infinite ease-in-out',
              animationDelay: '0.4s'
            }} 
          />
        </div>
      )}
    </div>
    </>
  );
}


