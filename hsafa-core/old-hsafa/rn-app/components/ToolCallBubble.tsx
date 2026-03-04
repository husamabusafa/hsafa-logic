import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import type { ToolCallContentPart } from '@hsafa/react-native';

interface Props {
  toolCall: ToolCallContentPart;
}

export function ToolCallBubble({ toolCall }: Props) {
  const isRunning = toolCall.status?.type === 'running';
  const isComplete = toolCall.status?.type === 'complete';
  const isError = toolCall.status?.type === 'incomplete';

  return (
    <View style={[styles.card, isError && styles.cardError]}>
      <View style={styles.header}>
        <View style={[styles.dot, isRunning && styles.dotRunning, isComplete && styles.dotComplete, isError && styles.dotError]} />
        <Text style={styles.toolName} numberOfLines={1}>{toolCall.toolName}</Text>
        {isRunning && <ActivityIndicator size="small" color="#6366F1" style={styles.spinner} />}
      </View>

      {toolCall.args && Object.keys(toolCall.args).length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Input</Text>
          <Text style={styles.code} numberOfLines={4}>
            {JSON.stringify(toolCall.args, null, 2)}
          </Text>
        </View>
      )}

      {isComplete && toolCall.result !== undefined && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Result</Text>
          <Text style={styles.code} numberOfLines={4}>
            {typeof toolCall.result === 'string' ? toolCall.result : JSON.stringify(toolCall.result, null, 2)}
          </Text>
        </View>
      )}

      {isError && (
        <Text style={styles.errorText}>Tool call failed</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, backgroundColor: '#F5F3FF', borderWidth: 1, borderColor: '#E0E7FF', paddingHorizontal: 12, paddingVertical: 10, gap: 6 },
  cardError: { borderColor: '#FECACA', backgroundColor: '#FEF2F2' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  dotRunning: { backgroundColor: '#F59E0B' },
  dotComplete: { backgroundColor: '#10B981' },
  dotError: { backgroundColor: '#EF4444' },
  toolName: { fontSize: 13, fontWeight: '600', color: '#4338CA', flex: 1 },
  spinner: { marginLeft: 4 },
  section: { gap: 2 },
  sectionLabel: { fontSize: 11, fontWeight: '500', color: '#6B7280', textTransform: 'uppercase' },
  code: { fontSize: 12, color: '#374151', fontFamily: 'Courier', backgroundColor: '#fff', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, overflow: 'hidden' },
  errorText: { fontSize: 12, color: '#DC2626' },
});
