import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useToolResult } from '@hsafa/react-native';
import type { ToolCallContentPart } from '@hsafa/react-native';

interface Props {
  toolCall: ToolCallContentPart;
  runId?: string;
}

interface ConfirmationData {
  title: string;
  message: string;
  confirmLabel: string;
  rejectLabel: string;
}

function parseConfirmation(args: unknown): ConfirmationData | null {
  if (!args || typeof args !== 'object') return null;
  const data = args as Record<string, unknown>;
  if (!data.title || !data.message) return null;
  return {
    title: String(data.title),
    message: String(data.message),
    confirmLabel: data.confirmLabel ? String(data.confirmLabel) : 'Confirm',
    rejectLabel: data.rejectLabel ? String(data.rejectLabel) : 'Cancel',
  };
}

export function ConfirmationCard({ toolCall, runId }: Props) {
  const { submitToRun, isSubmitting } = useToolResult();
  const [choice, setChoice] = useState<'confirmed' | 'rejected' | null>(null);

  const confirmation = parseConfirmation(toolCall.args);
  const persistedResult = toolCall.result as { confirmed?: boolean } | null | undefined;
  const wasConfirmed = choice === 'confirmed' || persistedResult?.confirmed === true;
  const wasRejected = choice === 'rejected' || persistedResult?.confirmed === false;
  const isResolved = wasConfirmed || wasRejected;
  const isPending = !toolCall.result && confirmation != null && !isResolved;

  const handleConfirm = async () => {
    if (!isPending || !toolCall.toolCallId || !runId || isSubmitting) return;
    setChoice('confirmed');
    try {
      await submitToRun(runId, {
        callId: toolCall.toolCallId,
        result: { confirmed: true, action: 'confirmed' },
      });
    } catch {
      setChoice(null);
    }
  };

  const handleReject = async () => {
    if (!isPending || !toolCall.toolCallId || !runId || isSubmitting) return;
    setChoice('rejected');
    try {
      await submitToRun(runId, {
        callId: toolCall.toolCallId,
        result: { confirmed: false, action: 'rejected' },
      });
    } catch {
      setChoice(null);
    }
  };

  // Loading skeleton
  if (!confirmation && !isResolved && !toolCall.result) {
    return (
      <View style={[styles.card, styles.cardPending]}>
        <View style={styles.skeletonTitle} />
        <View style={styles.skeletonMessage} />
        <View style={styles.skeletonButtons}>
          <View style={styles.skeletonBtn} />
          <View style={styles.skeletonBtn} />
        </View>
      </View>
    );
  }

  // Resolved but no confirmation data (e.g. after reload)
  if (!confirmation && isResolved) {
    return (
      <View style={[styles.card, wasConfirmed ? styles.cardConfirmed : styles.cardRejected]}>
        <View style={styles.resolvedRow}>
          <Text style={wasConfirmed ? styles.resolvedIconConfirmed : styles.resolvedIconRejected}>
            {wasConfirmed ? '✓' : '✗'}
          </Text>
          <Text style={wasConfirmed ? styles.resolvedTextConfirmed : styles.resolvedTextRejected}>
            {wasConfirmed ? 'Confirmed' : 'Cancelled'}
          </Text>
        </View>
      </View>
    );
  }

  if (!confirmation) {
    return (
      <View style={[styles.card, styles.cardFallback]}>
        <Text style={styles.fallbackText}>Confirmation data unavailable</Text>
      </View>
    );
  }

  return (
    <View style={[
      styles.card,
      isPending ? styles.cardPending : wasConfirmed ? styles.cardConfirmed : wasRejected ? styles.cardRejected : styles.cardDefault,
    ]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={[
          styles.iconCircle,
          isPending ? styles.iconPending : wasConfirmed ? styles.iconConfirmed : wasRejected ? styles.iconRejected : styles.iconDefault,
        ]}>
          <Text style={styles.iconText}>
            {isPending ? '⚠' : wasConfirmed ? '✓' : wasRejected ? '✗' : '⚠'}
          </Text>
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>{confirmation.title}</Text>
          <Text style={styles.message}>{confirmation.message}</Text>
        </View>
      </View>

      {/* Actions */}
      {isPending && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.rejectBtn}
            onPress={handleReject}
            disabled={isSubmitting}
            activeOpacity={0.7}
          >
            <Text style={styles.rejectBtnText}>{confirmation.rejectLabel}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.confirmBtn, isSubmitting && styles.btnDisabled]}
            onPress={handleConfirm}
            disabled={isSubmitting}
            activeOpacity={0.7}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.confirmBtnText}>{confirmation.confirmLabel}</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {wasConfirmed && (
        <View style={styles.resolvedRow}>
          <Text style={styles.resolvedIconConfirmed}>✓</Text>
          <Text style={styles.resolvedTextConfirmed}>Confirmed</Text>
        </View>
      )}

      {wasRejected && (
        <View style={styles.resolvedRow}>
          <Text style={styles.resolvedIconRejected}>✗</Text>
          <Text style={styles.resolvedTextRejected}>Cancelled</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, marginVertical: 4, gap: 10 },
  cardPending: { borderColor: '#F59E0B', backgroundColor: '#FFFBEB' },
  cardConfirmed: { borderColor: '#10B981', backgroundColor: '#ECFDF5' },
  cardRejected: { borderColor: '#EF4444', backgroundColor: '#FEF2F2' },
  cardDefault: { borderColor: '#E5E7EB', backgroundColor: '#F9FAFB' },
  cardFallback: { borderColor: '#E5E7EB', backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  iconCircle: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  iconPending: { backgroundColor: '#FEF3C7' },
  iconConfirmed: { backgroundColor: '#D1FAE5' },
  iconRejected: { backgroundColor: '#FEE2E2' },
  iconDefault: { backgroundColor: '#F3F4F6' },
  iconText: { fontSize: 14 },
  headerText: { flex: 1, gap: 4 },
  title: { fontSize: 14, fontWeight: '600', color: '#111827' },
  message: { fontSize: 13, color: '#6B7280', lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 8 },
  rejectBtn: { flex: 1, height: 36, borderRadius: 8, borderWidth: 1, borderColor: '#D1D5DB', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  rejectBtnText: { fontSize: 13, fontWeight: '500', color: '#6B7280' },
  confirmBtn: { flex: 1, height: 36, borderRadius: 8, backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center' },
  confirmBtnText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  btnDisabled: { opacity: 0.5 },
  resolvedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  resolvedIconConfirmed: { fontSize: 14, color: '#10B981', fontWeight: '700' },
  resolvedTextConfirmed: { fontSize: 13, fontWeight: '500', color: '#10B981' },
  resolvedIconRejected: { fontSize: 14, color: '#EF4444', fontWeight: '700' },
  resolvedTextRejected: { fontSize: 13, fontWeight: '500', color: '#EF4444' },
  fallbackText: { fontSize: 13, color: '#9CA3AF' },
  skeletonTitle: { height: 16, width: '60%', borderRadius: 4, backgroundColor: '#E5E7EB' },
  skeletonMessage: { height: 12, width: '90%', borderRadius: 4, backgroundColor: '#E5E7EB' },
  skeletonButtons: { flexDirection: 'row', gap: 8 },
  skeletonBtn: { flex: 1, height: 36, borderRadius: 8, backgroundColor: '#E5E7EB' },
});
