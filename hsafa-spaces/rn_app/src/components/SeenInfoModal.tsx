import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Image,
} from 'react-native';
import { resolveMediaUrl } from '../lib/api';
import { useTheme, spacing, fontSize, fontWeight, borderRadius } from '../lib/theme';
import type { Message, Member } from '../lib/types';

interface Props {
  message: Message;
  members: Member[];
  currentEntityId: string;
  onClose: () => void;
}

export function SeenInfoModal({ message, members, currentEntityId, onClose }: Props) {
  const { colors } = useTheme();
  const seenSet = new Set(message.seenBy);

  const relevantMembers = members.filter((m) => m.entityId !== message.entityId);
  const seenMembers = relevantMembers.filter((m) => seenSet.has(m.entityId));
  const unseenMembers = relevantMembers.filter((m) => !seenSet.has(m.entityId));

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={{ fontSize: 16 }}>👁️</Text>
            <Text style={[styles.title, { color: colors.text }]}>Message Info</Text>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
              <Text style={{ fontSize: 18, color: colors.textMuted }}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            {/* Seen */}
            {seenMembers.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
                  SEEN BY ({seenMembers.length})
                </Text>
                {seenMembers.map((m) => {
                  const avatarUrl = resolveMediaUrl(m.avatarUrl ?? null);
                  return (
                    <View key={m.entityId} style={styles.memberRow}>
                      {avatarUrl ? (
                        <Image source={{ uri: avatarUrl }} style={styles.avatar} />
                      ) : (
                        <View style={[styles.avatarPlaceholder, { backgroundColor: m.type === 'agent' ? colors.successLight : colors.primaryLight }]}>
                          <Text style={{ fontSize: 12 }}>{m.type === 'agent' ? '🤖' : '👤'}</Text>
                        </View>
                      )}
                      <Text style={[styles.memberName, { color: colors.text }]}>{m.name}</Text>
                      <Text style={[styles.checkmark, { color: '#3b82f6' }]}>✓✓</Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Not seen */}
            {unseenMembers.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
                  NOT SEEN ({unseenMembers.length})
                </Text>
                {unseenMembers.map((m) => {
                  const avatarUrl = resolveMediaUrl(m.avatarUrl ?? null);
                  return (
                    <View key={m.entityId} style={[styles.memberRow, { opacity: 0.5 }]}>
                      {avatarUrl ? (
                        <Image source={{ uri: avatarUrl }} style={styles.avatar} />
                      ) : (
                        <View style={[styles.avatarPlaceholder, { backgroundColor: m.type === 'agent' ? colors.successLight : colors.primaryLight }]}>
                          <Text style={{ fontSize: 12 }}>{m.type === 'agent' ? '🤖' : '👤'}</Text>
                        </View>
                      )}
                      <Text style={[styles.memberName, { color: colors.textMuted }]}>{m.name}</Text>
                    </View>
                  );
                })}
              </View>
            )}

            {relevantMembers.length === 0 && (
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>No other members</Text>
            )}
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    overflow: 'hidden',
    maxHeight: 400,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { flex: 1, fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  scroll: { paddingHorizontal: spacing.lg },
  section: { paddingVertical: spacing.md },
  sectionTitle: {
    fontSize: 11,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  avatar: { width: 28, height: 28, borderRadius: 14 },
  avatarPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberName: { flex: 1, fontSize: fontSize.sm },
  checkmark: { fontSize: 12, fontWeight: '600' },
  emptyText: { fontSize: fontSize.sm, textAlign: 'center', paddingVertical: spacing.xl },
});
