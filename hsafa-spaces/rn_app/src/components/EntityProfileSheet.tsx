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
import type { Member } from '../lib/types';

interface Props {
  member: Member;
  currentEntityId: string;
  onClose: () => void;
}

export function EntityProfileSheet({ member, currentEntityId, onClose }: Props) {
  const { colors } = useTheme();
  const isAgent = member.type === 'agent';
  const isMe = member.entityId === currentEntityId;
  const avatarUrl = resolveMediaUrl(member.avatarUrl ?? null);

  const getRoleLabel = (role: string) => {
    if (role === 'owner') return '👑 Owner';
    if (role === 'admin') return '🛡️ Admin';
    if (role === 'viewer') return '👁️ Viewer';
    return '👤 Member';
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Handle */}
          <View style={styles.handleRow}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            {/* Avatar + Name */}
            <View style={styles.profileSection}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatarPlaceholder, { backgroundColor: isAgent ? colors.successLight : colors.primaryLight }]}>
                  <Text style={{ fontSize: 28 }}>{isAgent ? '🤖' : '👤'}</Text>
                </View>
              )}
              <Text style={[styles.name, { color: colors.text }]}>
                {member.name}
                {isMe && <Text style={{ color: colors.textMuted, fontWeight: '400', fontSize: fontSize.sm }}> (you)</Text>}
              </Text>
              <View style={[styles.statusPill, { backgroundColor: isAgent ? colors.successLight : (member.isOnline ? colors.successLight : colors.surface) }]}>
                {member.isOnline && <View style={[styles.onlineDot, { backgroundColor: colors.success }]} />}
                <Text style={[styles.statusText, { color: isAgent ? colors.success : (member.isOnline ? colors.success : colors.textMuted) }]}>
                  {isAgent ? (member.isOnline ? 'Active Haseef' : 'Idle Haseef') : (member.isOnline ? 'Online' : 'Offline')}
                </Text>
              </View>
            </View>

            {/* Info rows */}
            <View style={[styles.infoSection, { borderTopColor: colors.border }]}>
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Role</Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>{getRoleLabel(member.role)}</Text>
              </View>
              {member.joinedAt && (
                <View style={styles.infoRow}>
                  <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Joined</Text>
                  <Text style={[styles.infoValue, { color: colors.text }]}>
                    {new Date(member.joinedAt).toLocaleDateString()}
                  </Text>
                </View>
              )}
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Type</Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>
                  {isAgent ? '🤖 AI Agent' : '👤 Human'}
                </Text>
              </View>
            </View>
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    maxHeight: '60%',
  },
  handleRow: { alignItems: 'center', paddingTop: spacing.sm },
  handle: { width: 36, height: 4, borderRadius: 2 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing['3xl'] },

  profileSection: { alignItems: 'center', paddingVertical: spacing.xl },
  avatar: { width: 72, height: 72, borderRadius: 36 },
  avatarPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, marginTop: spacing.md },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    marginTop: spacing.sm,
  },
  onlineDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: fontSize.xs, fontWeight: fontWeight.medium },

  infoSection: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.lg },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  infoLabel: { fontSize: fontSize.sm },
  infoValue: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
});
