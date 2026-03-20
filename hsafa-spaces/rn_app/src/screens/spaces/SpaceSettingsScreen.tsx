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
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../../lib/auth-context';
import { spacesApi, haseefsApi, resolveMediaUrl, type SmartSpace, type SpaceMember, type HaseefListItem } from '../../lib/api';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, spacing, fontSize, fontWeight, borderRadius } from '../../lib/theme';
import type { SpacesStackParamList } from '../../lib/types';

type Props = NativeStackScreenProps<SpacesStackParamList, 'SpaceSettings'>;

export function SpaceSettingsScreen({ route }: Props) {
  const { spaceId } = route.params;
  const { colors } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation();

  const [space, setSpace] = useState<SmartSpace | null>(null);
  const [members, setMembers] = useState<SpaceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [togglingLink, setTogglingLink] = useState(false);
  const [showAddHaseef, setShowAddHaseef] = useState(false);
  const [userHaseefs, setUserHaseefs] = useState<HaseefListItem[]>([]);
  const [loadingHaseefs, setLoadingHaseefs] = useState(false);
  const [addingHaseef, setAddingHaseef] = useState<string | null>(null);

  const currentEntityId = user?.entityId ?? '';

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [spaceRes, membersRes] = await Promise.all([
        spacesApi.get(spaceId),
        spacesApi.listMembers(spaceId),
      ]);
      setSpace(spaceRes.smartSpace);
      setName(spaceRes.smartSpace.name || '');
      setDescription(spaceRes.smartSpace.description || '');
      setMembers(membersRes.members);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to load space');
    } finally {
      setLoading(false);
    }
  }, [spaceId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const myMember = members.find((m) => m.entityId === currentEntityId);
  const isOwner = myMember?.role === 'owner';
  const isAdmin = isOwner || myMember?.role === 'admin';

  const humans = members.filter((m) => m.entity?.type === 'human');
  const agents = members.filter((m) => m.entity?.type === 'agent');

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await spacesApi.update(spaceId, { name, description });
      Alert.alert('Saved', 'Space settings updated.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleLeave = () => {
    Alert.alert('Leave Space', 'Are you sure you want to leave this space?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          setLeaving(true);
          try {
            await spacesApi.leave(spaceId);
            navigation.goBack();
            (navigation as any).navigate('SpacesList');
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to leave');
          } finally {
            setLeaving(false);
          }
        },
      },
    ]);
  };

  const handleDelete = () => {
    Alert.alert('Delete Space', 'This action cannot be undone. All messages will be lost.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await spacesApi.delete(spaceId);
            navigation.goBack();
            (navigation as any).navigate('SpacesList');
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to delete');
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  const handleRemoveMember = (entityId: string, memberName: string) => {
    Alert.alert('Remove Member', `Remove ${memberName} from this space?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await spacesApi.removeMember(spaceId, entityId);
            setMembers((prev) => prev.filter((m) => m.entityId !== entityId));
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to remove member');
          }
        },
      },
    ]);
  };

  const handleChangeRole = (entityId: string, memberName: string, currentRole: string) => {
    const roles = ['member', 'admin', 'viewer'].filter((r) => r !== currentRole);
    Alert.alert(
      `Change Role — ${memberName}`,
      `Current role: ${currentRole}`,
      [
        ...roles.map((role) => ({
          text: role.charAt(0).toUpperCase() + role.slice(1),
          onPress: async () => {
            try {
              await spacesApi.updateMemberRole(spaceId, entityId, role);
              setMembers((prev) =>
                prev.map((m) => m.entityId === entityId ? { ...m, role: role as SpaceMember['role'] } : m),
              );
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to change role');
            }
          },
        })),
        { text: 'Cancel', style: 'cancel' },
      ],
    );
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

  const nameChanged = name !== (space?.name || '');
  const descChanged = description !== (space?.description || '');
  const hasChanges = nameChanged || descChanged;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7} style={styles.backBtn}>
          <Text style={[styles.backArrow, { color: colors.primary }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Space Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* General Section */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>GENERAL</Text>

          {/* Space image */}
          {space?.metadata?.imageUrl ? (
            <Image
              source={{ uri: resolveMediaUrl(space.metadata.imageUrl as string) || '' }}
              style={styles.spaceImage}
              resizeMode="cover"
            />
          ) : null}

          <Text style={[styles.label, { color: colors.textMuted }]}>Space Name</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
            value={name}
            onChangeText={setName}
            editable={isAdmin}
            placeholder="Space name"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={[styles.label, { color: colors.textMuted, marginTop: spacing.md }]}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
            value={description}
            onChangeText={setDescription}
            editable={isAdmin}
            multiline
            numberOfLines={3}
            placeholder="Space description"
            placeholderTextColor={colors.textMuted}
          />

          {isAdmin && hasChanges && (
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: colors.primary }]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.7}
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <Text style={[styles.saveBtnText, { color: colors.primaryForeground }]}>Save Changes</Text>
              )}
            </TouchableOpacity>
          )}

          {/* Invite code */}
          {space?.inviteCode && (
            <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
              <TouchableOpacity
                style={[styles.inviteRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={async () => {
                  if (space?.inviteCode) {
                    await Clipboard.setStringAsync(space.inviteCode);
                    Alert.alert('Copied', 'Invite code copied to clipboard.');
                  }
                }}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.inviteLabel, { color: colors.textMuted }]}>Invite Code</Text>
                  <Text style={[styles.inviteCode, { color: colors.text }]}>{space.inviteCode}</Text>
                </View>
                <Ionicons name="copy-outline" size={16} color={colors.primary} />
              </TouchableOpacity>

              {isAdmin && (
                <View style={styles.inviteLinkRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.inviteLinkLabel, { color: colors.textSecondary }]}>
                      Invite link: {space.inviteLinkActive ? 'Active' : 'Inactive'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={async () => {
                      if (!space || togglingLink) return;
                      setTogglingLink(true);
                      try {
                        const { inviteLinkActive } = await spacesApi.toggleInviteLink(spaceId, !space.inviteLinkActive);
                        setSpace({ ...space, inviteLinkActive });
                      } catch (err: any) {
                        Alert.alert('Error', err.message || 'Failed to toggle');
                      } finally {
                        setTogglingLink(false);
                      }
                    }}
                    activeOpacity={0.7}
                    disabled={togglingLink}
                    style={[styles.actionPill, { backgroundColor: space.inviteLinkActive ? colors.errorLight : colors.primaryLight }]}
                  >
                    <Text style={[styles.actionPillText, { color: space.inviteLinkActive ? colors.error : colors.primary }]}>
                      {togglingLink ? '...' : space.inviteLinkActive ? 'Disable' : 'Enable'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {isAdmin && (
                <TouchableOpacity
                  onPress={() => {
                    Alert.alert('Regenerate Code', 'This will invalidate the current invite code.', [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Regenerate',
                        style: 'destructive',
                        onPress: async () => {
                          try {
                            const { inviteCode } = await spacesApi.regenerateCode(spaceId);
                            setSpace((prev) => prev ? { ...prev, inviteCode } : prev);
                          } catch (err: any) {
                            Alert.alert('Error', err.message || 'Failed to regenerate');
                          }
                        },
                      },
                    ]);
                  }}
                  activeOpacity={0.7}
                  style={[styles.actionPill, { backgroundColor: colors.errorLight, marginTop: spacing.sm }]}
                >
                  <Ionicons name="refresh" size={14} color={colors.error} />
                  <Text style={[styles.actionPillText, { color: colors.error }]}>Regenerate Code</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Members Section */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
              MEMBERS ({members.length})
            </Text>
            {isAdmin && (
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <TouchableOpacity
                  onPress={() => {
                    setShowAddHaseef(true);
                    if (userHaseefs.length === 0) {
                      setLoadingHaseefs(true);
                      haseefsApi.list().then(({ haseefs }) => {
                        setUserHaseefs(haseefs);
                      }).catch(() => {}).finally(() => setLoadingHaseefs(false));
                    }
                  }}
                  activeOpacity={0.7}
                  style={[styles.pillBtn, { backgroundColor: colors.primaryLight }]}
                >
                  <Ionicons name="sparkles" size={14} color={colors.primary} />
                  <Text style={[styles.pillBtnText, { color: colors.primary }]}>Haseef</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => (navigation as any).navigate('InviteToSpace', { spaceId, spaceName: space?.name || '' })}
                  activeOpacity={0.7}
                  style={[styles.pillBtn, { backgroundColor: colors.primary }]}
                >
                  <Ionicons name="person-add" size={14} color={colors.primaryForeground} />
                  <Text style={[styles.pillBtnText, { color: colors.primaryForeground }]}>Invite</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* People */}
          {humans.length > 0 && (
            <View>
              <Text style={[styles.subSectionTitle, { color: colors.textMuted }]}>People ({humans.length})</Text>
              {humans.map((m) => (
                <MemberRow
                  key={m.entityId}
                  member={m}
                  isAdmin={isAdmin}
                  isOwner={isOwner}
                  currentEntityId={currentEntityId}
                  colors={colors}
                  onChangeRole={() => handleChangeRole(m.entityId, m.entity?.displayName || 'Member', m.role)}
                  onRemove={() => handleRemoveMember(m.entityId, m.entity?.displayName || 'Member')}
                />
              ))}
            </View>
          )}

          {/* Agents */}
          {agents.length > 0 && (
            <View style={{ marginTop: spacing.md }}>
              <Text style={[styles.subSectionTitle, { color: colors.textMuted }]}>Haseefs ({agents.length})</Text>
              {agents.map((m) => (
                <MemberRow
                  key={m.entityId}
                  member={m}
                  isAdmin={isAdmin}
                  isOwner={isOwner}
                  currentEntityId={currentEntityId}
                  colors={colors}
                  onChangeRole={() => handleChangeRole(m.entityId, m.entity?.displayName || 'Haseef', m.role)}
                  onRemove={() => handleRemoveMember(m.entityId, m.entity?.displayName || 'Haseef')}
                />
              ))}
            </View>
          )}
        </View>

        {/* Danger Zone */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.error + '30' }]}>
          <Text style={[styles.sectionTitle, { color: colors.error }]}>DANGER ZONE</Text>

          {!isOwner && (
            <TouchableOpacity
              style={[styles.dangerBtn, { borderColor: colors.error + '30' }]}
              onPress={handleLeave}
              disabled={leaving}
              activeOpacity={0.7}
            >
              {leaving ? (
                <ActivityIndicator size="small" color={colors.error} />
              ) : (
                <Text style={[styles.dangerBtnText, { color: colors.error }]}>Leave Space</Text>
              )}
            </TouchableOpacity>
          )}

          {isOwner && (
            <TouchableOpacity
              style={[styles.dangerBtn, { borderColor: colors.error + '30', backgroundColor: colors.errorLight }]}
              onPress={handleDelete}
              disabled={deleting}
              activeOpacity={0.7}
            >
              {deleting ? (
                <ActivityIndicator size="small" color={colors.error} />
              ) : (
                <Text style={[styles.dangerBtnText, { color: colors.error }]}>Delete Space</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
      {/* Add Haseef Modal */}
      <Modal visible={showAddHaseef} transparent animationType="fade" onRequestClose={() => setShowAddHaseef(false)}>
        <TouchableOpacity style={styles.addHaseefOverlay} activeOpacity={1} onPress={() => setShowAddHaseef(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.addHaseefCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.addHaseefTitle, { color: colors.text }]}>Add Haseef to Space</Text>
            {loadingHaseefs ? (
              <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: spacing.lg }} />
            ) : userHaseefs.length === 0 ? (
              <Text style={[styles.addHaseefEmpty, { color: colors.textMuted }]}>No haseefs available.</Text>
            ) : (
              userHaseefs
                .filter((h) => !members.some((m) => m.entityId === h.entityId))
                .map((h) => (
                  <TouchableOpacity
                    key={h.haseefId}
                    style={[styles.addHaseefRow, { borderBottomColor: colors.borderLight }]}
                    onPress={async () => {
                      setAddingHaseef(h.haseefId);
                      try {
                        await haseefsApi.addToSpace(h.haseefId, spaceId);
                        setShowAddHaseef(false);
                        fetchData();
                      } catch (err: any) {
                        Alert.alert('Error', err.message || 'Failed to add haseef');
                      } finally {
                        setAddingHaseef(null);
                      }
                    }}
                    activeOpacity={0.7}
                    disabled={addingHaseef === h.haseefId}
                  >
                    <View style={[styles.addHaseefIcon, { backgroundColor: colors.primaryLight }]}>
                      <Ionicons name="sparkles" size={16} color={colors.primary} />
                    </View>
                    <Text style={[styles.addHaseefName, { color: colors.text }]} numberOfLines={1}>{h.name}</Text>
                    {addingHaseef === h.haseefId ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                ))
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

// =============================================================================
// Member Row
// =============================================================================

function MemberRow({
  member,
  isAdmin,
  isOwner,
  currentEntityId,
  colors,
  onChangeRole,
  onRemove,
}: {
  member: SpaceMember;
  isAdmin: boolean;
  isOwner: boolean;
  currentEntityId: string;
  colors: any;
  onChangeRole: () => void;
  onRemove: () => void;
}) {
  const isMe = member.entityId === currentEntityId;
  const isMemberOwner = member.role === 'owner';
  const avatarUrl = resolveMediaUrl(member.entity?.avatarUrl ?? null);
  const initial = (member.entity?.displayName || '?')[0].toUpperCase();
  const isAgent = member.entity?.type === 'agent';

  const roleLabel = member.role;

  return (
    <View style={[styles.memberRow, { borderBottomColor: colors.border }]}>
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={styles.memberAvatar} />
      ) : (
        <View style={[styles.memberAvatarFallback, { backgroundColor: isAgent ? colors.successLight : colors.primaryLight }]}>
          {isAgent ? (
            <Ionicons name="sparkles" size={16} color={colors.success} />
          ) : (
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.primary }}>
              {initial}
            </Text>
          )}
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={[styles.memberName, { color: colors.text }]} numberOfLines={1}>
          {member.entity?.displayName || 'Unknown'}
          {isMe ? ' (you)' : ''}
        </Text>
        <Text style={[styles.memberRole, { color: colors.textMuted }]}>
          {roleLabel}
        </Text>
      </View>
      {isAdmin && !isMe && !isMemberOwner && (
        <View style={styles.memberActions}>
          <TouchableOpacity onPress={onChangeRole} activeOpacity={0.7} style={styles.memberActionBtn}>
            <Text style={{ color: colors.primary, fontSize: fontSize.xs }}>Role</Text>
          </TouchableOpacity>
          {isOwner && (
            <TouchableOpacity onPress={onRemove} activeOpacity={0.7} style={styles.memberActionBtn}>
              <Text style={{ color: colors.error, fontSize: fontSize.xs }}>Remove</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

// =============================================================================
// Styles
// =============================================================================

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

  section: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    padding: spacing.lg,
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, letterSpacing: 0.5, marginBottom: spacing.md },
  subSectionTitle: { fontSize: 11, fontWeight: fontWeight.medium, letterSpacing: 0.5, marginBottom: spacing.sm },

  label: { fontSize: fontSize.xs, fontWeight: fontWeight.medium, marginBottom: spacing.xs },
  input: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.sm,
  },
  textArea: { minHeight: 72, textAlignVertical: 'top' },

  saveBtn: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  saveBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },

  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  inviteLabel: { fontSize: fontSize.xs },
  inviteCode: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, fontFamily: 'monospace' },
  inviteBtn: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
  pillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  pillBtnText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
  inviteLinkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  inviteLinkLabel: { fontSize: fontSize.xs },
  inviteToggleBtn: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
  regenerateText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  actionPillText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold },

  spaceImage: { width: '100%', height: 120, borderRadius: borderRadius.md, marginBottom: spacing.md },

  // Members
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  memberAvatar: { width: 36, height: 36, borderRadius: borderRadius.full },
  memberAvatarFallback: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberName: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  memberRole: { fontSize: fontSize.xs },
  memberActions: { flexDirection: 'row', gap: spacing.sm },
  memberActionBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minHeight: 36 },

  // Danger
  dangerBtn: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
    minHeight: 48,
    justifyContent: 'center',
  },
  dangerBtnText: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },

  // Add Haseef modal
  addHaseefOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  addHaseefCard: { marginHorizontal: spacing.md, marginBottom: spacing['3xl'], borderRadius: borderRadius.xl, borderWidth: 1, padding: spacing.lg },
  addHaseefTitle: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, marginBottom: spacing.md },
  addHaseefEmpty: { fontSize: fontSize.sm, fontStyle: 'italic', paddingVertical: spacing.md },
  addHaseefRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, gap: spacing.md },
  addHaseefIcon: { width: 36, height: 36, borderRadius: borderRadius.full, alignItems: 'center', justifyContent: 'center' },
  addHaseefName: { flex: 1, fontSize: fontSize.sm, fontWeight: fontWeight.medium },
});
