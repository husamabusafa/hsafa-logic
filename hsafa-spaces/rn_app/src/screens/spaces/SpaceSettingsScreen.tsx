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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../../lib/auth-context';
import { spacesApi, resolveMediaUrl, type SmartSpace, type SpaceMember } from '../../lib/api';
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
            <View style={[styles.inviteRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.inviteLabel, { color: colors.textMuted }]}>Invite Code</Text>
                <Text style={[styles.inviteCode, { color: colors.text }]}>{space.inviteCode}</Text>
              </View>
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
              <TouchableOpacity
                onPress={() => (navigation as any).navigate('InviteToSpace', { spaceId, spaceName: space?.name || '' })}
                activeOpacity={0.7}
              >
                <Text style={[styles.inviteBtn, { color: colors.primary }]}>+ Invite</Text>
              </TouchableOpacity>
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

  const roleIcon =
    member.role === 'owner' ? '👑' :
    member.role === 'admin' ? '🛡️' :
    member.role === 'viewer' ? '👁️' : '';

  return (
    <View style={[styles.memberRow, { borderBottomColor: colors.border }]}>
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={styles.memberAvatar} />
      ) : (
        <View style={[styles.memberAvatarFallback, { backgroundColor: isAgent ? colors.successLight : colors.primaryLight }]}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: isAgent ? colors.success : colors.primary }}>
            {isAgent ? '🤖' : initial}
          </Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={[styles.memberName, { color: colors.text }]} numberOfLines={1}>
          {member.entity?.displayName || 'Unknown'}
          {isMe ? ' (you)' : ''}
        </Text>
        <Text style={[styles.memberRole, { color: colors.textMuted }]}>
          {roleIcon} {member.role}
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
  memberActionBtn: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },

  // Danger
  dangerBtn: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  dangerBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
});
