import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { ThreadMessageLike, ContentPart } from '@hsafa/react-native';
import { ToolCallBubble } from './ToolCallBubble';
import { ConfirmationCard } from './ConfirmationCard';
import { ChartCard } from './ChartCard';
import type { ToolCallContentPart } from '@hsafa/react-native';

interface Props {
  message: ThreadMessageLike;
  membersById?: Record<string, { displayName?: string | null; type?: string }>;
}

function renderToolCall(tc: ToolCallContentPart, message: ThreadMessageLike) {
  const runId = (message.metadata?.custom as any)?.runId as string | undefined;
  switch (tc.toolName) {
    case 'confirmAction':
      return <ConfirmationCard key={tc.toolCallId} toolCall={tc} runId={runId} />;
    case 'displayChart':
      return <ChartCard key={tc.toolCallId} toolCall={tc} />;
    default:
      return <ToolCallBubble key={tc.toolCallId} toolCall={tc} />;
  }
}

export function MessageBubble({ message, membersById }: Props) {
  const isUser = message.role === 'user';
  const entityId = (message.metadata?.custom as any)?.entityId;
  const isOtherHuman = (message.metadata?.custom as any)?.isOtherHuman;

  // Resolve sender name for assistant messages
  let senderName: string | null = null;
  if (!isUser && entityId && membersById?.[entityId]) {
    const member = membersById[entityId];
    senderName = member.displayName || (member.type === 'agent' ? 'AI Assistant' : null);
  }

  const parts = Array.isArray(message.content)
    ? message.content as ContentPart[]
    : [{ type: 'text' as const, text: message.content as string }];

  // Check if this message has tool-call parts
  const toolCallParts = parts.filter((p): p is ToolCallContentPart => p.type === 'tool-call');
  const textParts = parts.filter((p) => p.type === 'text');

  // Render tool-call-only messages inside a message bubble
  if (toolCallParts.length > 0 && textParts.length === 0) {
    return (
      <View style={[styles.row, styles.rowLeft]}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>✦</Text>
        </View>
        <View style={styles.toolBubble}>
          {senderName && <Text style={styles.senderName}>{senderName}</Text>}
          {toolCallParts.map((tc) => renderToolCall(tc, message))}
        </View>
      </View>
    );
  }

  const text = textParts.map((p) => (p as any).text).join('\n');
  if (!text.trim()) return null;

  const time = message.createdAt
    ? new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <View style={[styles.row, isUser ? styles.rowRight : styles.rowLeft]}>
      {!isUser && (
        <View style={[styles.avatar, isOtherHuman && styles.avatarHuman]}>
          <Text style={[styles.avatarText, isOtherHuman && styles.avatarTextHuman]}>
            {isOtherHuman ? (senderName?.charAt(0)?.toUpperCase() || 'U') : '✦'}
          </Text>
        </View>
      )}
      <View style={[styles.bubble, isUser ? styles.bubbleOwn : styles.bubbleOther]}>
        {!isUser && senderName && (
          <Text style={styles.senderName}>{senderName}</Text>
        )}
        <Text style={[styles.content, isUser ? styles.contentOwn : styles.contentOther]}>
          {text}
        </Text>
        {/* Inline tool calls after text */}
        {toolCallParts.length > 0 && toolCallParts.map((tc) => renderToolCall(tc, message))}
        {time ? (
          <Text style={[styles.time, isUser ? styles.timeOwn : styles.timeOther]}>
            {time}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', marginVertical: 3, paddingHorizontal: 12, alignItems: 'flex-end', gap: 8 },
  rowLeft: { justifyContent: 'flex-start' },
  rowRight: { justifyContent: 'flex-end' },
  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarHuman: { backgroundColor: '#FEF3C7' },
  avatarText: { fontSize: 12, color: '#3B82F6' },
  avatarTextHuman: { color: '#D97706', fontWeight: '600' },
  bubble: { maxWidth: '75%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8, gap: 2 },
  bubbleOwn: { backgroundColor: '#3B82F6', borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: '#F3F4F6', borderBottomLeftRadius: 4 },
  toolBubble: { width: '75%', backgroundColor: '#F3F4F6', borderRadius: 18, borderBottomLeftRadius: 4, paddingHorizontal: 10, paddingVertical: 8, gap: 4 },
  senderName: { fontSize: 11, fontWeight: '600', color: '#6366F1', marginBottom: 2 },
  content: { fontSize: 15, lineHeight: 21 },
  contentOwn: { color: '#fff' },
  contentOther: { color: '#111827' },
  time: { fontSize: 11, alignSelf: 'flex-end' },
  timeOwn: { color: 'rgba(255,255,255,0.65)' },
  timeOther: { color: '#9CA3AF' },
});
