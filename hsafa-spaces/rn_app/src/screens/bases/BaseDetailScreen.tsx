import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import { basesApi, resolveMediaUrl, type Base, type BaseMember } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { useTheme, spacing, fontSize, fontWeight, borderRadius } from '../../lib/theme';
import type { BasesStackParamList } from '../../lib/types';

type Props = NativeStackScreenProps<BasesStackParamList, 'BaseDetail'>;

export function BaseDetailScreen({ route }: Props) {
  const { baseId } = route.params;
  const { colors } = useTheme();
  const navigation = useNavigation();
  const { user } = useAuth();

  const [base, setBase] = useState<Base | null>(null);
  const [haseefs, setHaseefs] = useState<Array<{ entityId: string; displayName: string; avatarUrl: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Edit state
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [basesRes, haseefsRes] = await Promise.all([
        basesApi.list(),
        basesApi.listHaseefs(baseId),
      ]);
      const found = basesRes.bases.find((b) => b.id === baseId);
      if (found) {
        setBase(found);
        setEditName(found.name);
      }
      setHaseefs(haseefsRes.haseefs);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to load base');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [baseId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  const isOwnerOrAdmin = base && (base.myRole === 'owner' || base.myRole === 'admin');

  const handleSaveName = async () => {
    if (!base || !editName.trim() || editName === base.name) return;
    setSaving(true);
    try {
      await basesApi.update(baseId, { name: editName.trim() });
      setBase({ ...base, name: editName.trim() });
      Alert.alert('Saved', 'Base name updated.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyCode = async () => {
    if (!base) return;
    await Clipboard.setStringAsync(base.inviteCode);
    Alert.alert('Copied', 'Invite code copied to clipboard.');
  };

  const handleRegenerateCode = () => {
    Alert.alert('Regenerate Code', 'This will invalidate the current invite code.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Regenerate',
        style: 'destructive',
        onPress: async () => {
          try {
            const { inviteCode } = await basesApi.regenerateCode(baseId);
            setBase((prev) => prev ? { ...prev, inviteCode } : prev);
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to regenerate');
          }
        },
      },
    ]);
  };

  const handleToggleInviteLink = async () => {
    if (!base) return;
    try {
      const { inviteLinkActive } = await basesApi.toggleInviteLink(baseId, !base.inviteLinkActive);
      setBase({ ...base, inviteLinkActive });
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to toggle invite link');
    }
  };

  const handleRemoveMember = (member: BaseMember) => {
    Alert.alert('Remove Member', `Remove ${member.displayName} from this base?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await basesApi.removeMember(baseId, member.entityId);
            setBase((prev) => prev ? {
              ...prev,
              members: prev.members.filter((m) => m.entityId !== member.entityId),
              memberCount: prev.memberCount - 1,
            } : prev);
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to remove');
          }
        },
      },
    ]);
  };

  const handleDeleteBase = () => {
    Alert.alert('Delete Base', 'This action cannot be undone. All data will be lost.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await basesApi.delete(baseId);
            navigation.goBack();
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to delete');
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  const getRoleIcon = (role: string) => {
    if (role === 'owner') return '👑';
    if (role === 'admin') return '🛡️';
    return '👤';
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!base) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.center}>
          <Text style={{ color: colors.error }}>Base not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7} style={styles.backBtn}>
          <Text style={[styles.backArrow, { color: colors.primary }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Base Details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Base icon + name */}
        <View style={styles.profileRow}>
          <View style={[styles.baseIcon, { backgroundColor: colors.primaryLight }]}>
            <Text style={{ fontSize: 32 }}>👥</Text>
          </View>
        </View>

        {/* General */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>GENERAL</Text>

          <Text style={[styles.label, { color: colors.textMuted }]}>Name</Text>
          {isOwnerOrAdmin ? (
            <>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                value={editName}
                onChangeText={setEditName}
                placeholder="Base name"
                placeholderTextColor={colors.textMuted}
              />
              {editName !== base.name && editName.trim() && (
                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: colors.primary }]}
                  onPress={handleSaveName}
                  disabled={saving}
                  activeOpacity={0.7}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color={colors.primaryForeground} />
                  ) : (
                    <Text style={[styles.saveBtnText, { color: colors.primaryForeground }]}>Save Name</Text>
                  )}
                </TouchableOpacity>
              )}
            </>
          ) : (
            <Text style={[styles.readonlyValue, { color: colors.text }]}>{base.name}</Text>
          )}

          <Text style={[styles.label, { color: colors.textMuted, marginTop: spacing.md }]}>Your Role</Text>
          <Text style={[styles.readonlyValue, { color: colors.text }]}>
            {getRoleIcon(base.myRole)} {base.myRole}
          </Text>
        </View>

        {/* Invite Code */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>INVITE CODE</Text>

          <TouchableOpacity
            style={[styles.codeBox, { backgroundColor: colors.surface }]}
            onPress={handleCopyCode}
            activeOpacity={0.7}
          >
            <Text style={[styles.codeText, { color: colors.text }]}>{base.inviteCode}</Text>
            <Text style={[styles.copyLabel, { color: colors.primary }]}>📋 Copy</Text>
          </TouchableOpacity>

          <View style={styles.inviteRow}>
            <Text style={[styles.inviteLabel, { color: colors.textSecondary }]}>
              Invite link: {base.inviteLinkActive ? 'Active' : 'Inactive'}
            </Text>
            {isOwnerOrAdmin && (
              <TouchableOpacity onPress={handleToggleInviteLink} activeOpacity={0.7}>
                <Text style={[styles.inviteToggle, { color: colors.primary }]}>
                  {base.inviteLinkActive ? 'Disable' : 'Enable'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {isOwnerOrAdmin && (
            <TouchableOpacity onPress={handleRegenerateCode} activeOpacity={0.7} style={{ marginTop: spacing.sm }}>
              <Text style={[styles.regenerateText, { color: colors.error }]}>Regenerate Code</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Members */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
            MEMBERS ({base.members.length})
          </Text>

          {base.members.map((m, idx) => {
            const avatarUrl = resolveMediaUrl(m.avatarUrl);
            const isMe = m.entityId === user?.entityId;
            return (
              <View
                key={m.entityId}
                style={[
                  styles.memberRow,
                  idx < base.members.length - 1 && { borderBottomColor: colors.borderLight, borderBottomWidth: StyleSheet.hairlineWidth },
                ]}
              >
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.memberAvatar} />
                ) : (
                  <View style={[styles.memberAvatarPlaceholder, { backgroundColor: m.type === 'agent' ? colors.primaryLight : colors.surface }]}>
                    <Text style={{ fontSize: 14 }}>{m.type === 'agent' ? '🤖' : '👤'}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.memberName, { color: colors.text }]} numberOfLines={1}>
                    {m.displayName}{isMe ? ' (you)' : ''}
                  </Text>
                  <Text style={[styles.memberRole, { color: colors.textMuted }]}>
                    {getRoleIcon(m.role)} {m.role}
                  </Text>
                </View>
                {isOwnerOrAdmin && !isMe && m.role !== 'owner' && (
                  <TouchableOpacity onPress={() => handleRemoveMember(m)} activeOpacity={0.7}>
                    <Text style={[styles.removeText, { color: colors.error }]}>Remove</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>

        {/* Haseefs */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
            HASEEFS ({haseefs.length})
          </Text>

          {haseefs.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>No haseefs in this base.</Text>
          ) : (
            haseefs.map((h, idx) => {
              const avatarUrl = resolveMediaUrl(h.avatarUrl);
              return (
                <View
                  key={h.entityId}
                  style={[
                    styles.memberRow,
                    idx < haseefs.length - 1 && { borderBottomColor: colors.borderLight, borderBottomWidth: StyleSheet.hairlineWidth },
                  ]}
                >
                  {avatarUrl ? (
                    <Image source={{ uri: avatarUrl }} style={styles.memberAvatar} />
                  ) : (
                    <View style={[styles.memberAvatarPlaceholder, { backgroundColor: colors.primaryLight }]}>
                      <Text style={{ fontSize: 14 }}>🤖</Text>
                    </View>
                  )}
                  <Text style={[styles.memberName, { color: colors.text, flex: 1 }]} numberOfLines={1}>
                    {h.displayName}
                  </Text>
                </View>
              );
            })
          )}
        </View>

        {/* Danger Zone */}
        {isOwnerOrAdmin && (
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.error + '30' }]}>
            <Text style={[styles.sectionTitle, { color: colors.error }]}>DANGER ZONE</Text>
            <TouchableOpacity
              style={[styles.dangerBtn, { borderColor: colors.error + '30', backgroundColor: colors.errorLight }]}
              onPress={handleDeleteBase}
              disabled={deleting}
              activeOpacity={0.7}
            >
              {deleting ? (
                <ActivityIndicator size="small" color={colors.error} />
              ) : (
                <Text style={[styles.dangerBtnText, { color: colors.error }]}>Delete Base</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  backArrow: { fontSize: 28, fontWeight: '300' },
  headerTitle: { flex: 1, fontSize: fontSize.base, fontWeight: fontWeight.semibold, textAlign: 'center' },

  scrollContent: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing['3xl'] },

  profileRow: { alignItems: 'center' },
  baseIcon: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },

  section: { borderRadius: borderRadius.xl, borderWidth: 1, padding: spacing.lg },
  sectionTitle: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, letterSpacing: 0.5, marginBottom: spacing.md },

  label: { fontSize: fontSize.xs, fontWeight: fontWeight.medium, marginBottom: spacing.xs },
  input: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.sm,
  },
  readonlyValue: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },

  saveBtn: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  saveBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },

  codeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  codeText: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, fontFamily: 'monospace' },
  copyLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold },

  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  inviteLabel: { fontSize: fontSize.xs },
  inviteToggle: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
  regenerateText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold },

  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  memberAvatar: { width: 36, height: 36, borderRadius: borderRadius.full },
  memberAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberName: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  memberRole: { fontSize: fontSize.xs },
  removeText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
  emptyText: { fontSize: fontSize.sm, fontStyle: 'italic' },

  dangerBtn: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  dangerBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
});
