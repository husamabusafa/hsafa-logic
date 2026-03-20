import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../../lib/auth-context';
import { spacesApi, type SmartSpace } from '../../lib/api';
import { useTheme, spacing, fontSize, fontWeight, borderRadius } from '../../lib/theme';
import { haptic } from '../../lib/haptics';
import { ListSkeleton } from '../../components/Skeleton';
import type { SpacesStackParamList } from '../../lib/types';

type Nav = NativeStackNavigationProp<SpacesStackParamList, 'SpacesList'>;

export function SpacesListScreen() {
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const { colors } = useTheme();
  const [spaces, setSpaces] = useState<SmartSpace[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [createName, setCreateName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchSpaces = useCallback(async () => {
    try {
      const { smartSpaces } = await spacesApi.list();
      setSpaces(smartSpaces);
    } catch (err) {
      console.error('Failed to fetch spaces:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchSpaces();
  }, [fetchSpaces]);

  useFocusEffect(
    useCallback(() => {
      if (!loading) fetchSpaces();
    }, [loading]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchSpaces();
  }, [fetchSpaces]);

  const currentEntityId = user?.entityId ?? '';

  const handleCreate = async () => {
    if (!createName.trim()) return;
    haptic.medium();
    setActionLoading(true);
    try {
      const { smartSpace } = await spacesApi.create({ name: createName.trim() });
      setCreateName('');
      setShowCreate(false);
      fetchSpaces();
      navigation.navigate('Chat', { spaceId: smartSpace.id, spaceName: smartSpace.name });
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create space');
    } finally {
      setActionLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!joinCode.trim()) return;
    haptic.medium();
    setActionLoading(true);
    try {
      await spacesApi.joinByCode(joinCode.trim());
      setJoinCode('');
      setShowJoin(false);
      fetchSpaces();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to join space');
    } finally {
      setActionLoading(false);
    }
  };

  const getSpaceDisplayName = (space: SmartSpace): string => {
    const meta = space.metadata as Record<string, unknown> | undefined;
    const isDirect = !!meta?.isDirect;
    if (isDirect && space.members) {
      const other = space.members.find((m) => m.entityId !== currentEntityId);
      if (other?.displayName) return other.displayName;
    }
    return space.name || 'Unnamed Space';
  };

  const renderSpace = ({ item }: { item: SmartSpace }) => {
    const name = getSpaceDisplayName(item);
    const meta = item.metadata as Record<string, unknown> | undefined;
    const isDirect = !!meta?.isDirect;
    const memberCount = item.members?.length ?? 0;

    return (
      <TouchableOpacity
        style={[styles.spaceCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => navigation.navigate('Chat', { spaceId: item.id, spaceName: name })}
        activeOpacity={0.7}
      >
        <View style={styles.spaceRow}>
          <View style={[styles.avatar, { backgroundColor: isDirect ? colors.primary : colors.primaryLight }]}>
            <Text style={[styles.avatarText, { color: isDirect ? colors.primaryForeground : colors.primary }]}>
              {isDirect ? name.charAt(0).toUpperCase() : '#'}
            </Text>
          </View>
          <View style={styles.spaceInfo}>
            <Text style={[styles.spaceName, { color: colors.text }]} numberOfLines={1}>
              {name}
            </Text>
            <Text style={[styles.spaceMeta, { color: colors.textMuted }]} numberOfLines={1}>
              {memberCount} member{memberCount !== 1 ? 's' : ''}
              {item.description ? ` · ${item.description}` : ''}
            </Text>
          </View>
          <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderModal = (
    visible: boolean,
    onClose: () => void,
    title: string,
    placeholder: string,
    value: string,
    onChangeText: (t: string) => void,
    onSubmit: () => void,
    submitLabel: string,
  ) => (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Text style={[styles.modalTitle, { color: colors.text }]}>{title}</Text>
          <TextInput
            style={[styles.modalInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
            placeholder={placeholder}
            placeholderTextColor={colors.textMuted}
            value={value}
            onChangeText={onChangeText}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={onSubmit}
          />
          <View style={styles.modalActions}>
            <TouchableOpacity
              style={[styles.modalBtnSecondary, { borderColor: colors.border }]}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={[styles.modalBtnText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalBtnPrimary, { backgroundColor: colors.primary, opacity: actionLoading ? 0.7 : 1 }]}
              onPress={onSubmit}
              disabled={actionLoading}
              activeOpacity={0.8}
            >
              {actionLoading ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <Text style={[styles.modalBtnText, { color: colors.primaryForeground }]}>{submitLabel}</Text>
              )}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={styles.headerLeft}>
          <View style={[styles.headerIcon, { backgroundColor: colors.primaryLight }]}>
            <Text style={styles.headerIconText}>💬</Text>
          </View>
          <View>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Spaces</Text>
            <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
              {spaces.length} space{spaces.length !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>
      </View>

      {/* Action Buttons */}
      <View style={[styles.actionRow, { borderBottomColor: colors.borderLight }]}>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.primary }]}
          onPress={() => setShowCreate(true)}
          activeOpacity={0.8}
        >
          <Text style={[styles.actionBtnText, { color: colors.primaryForeground }]}>+ New Space</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}
          onPress={() => setShowJoin(true)}
          activeOpacity={0.7}
        >
          <Text style={[styles.actionBtnText, { color: colors.text }]}>Join by Code</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ListSkeleton count={6} />
      ) : (
        <FlatList
          data={spaces}
          keyExtractor={(item) => item.id}
          renderItem={renderSpace}
          contentContainerStyle={[
            styles.listContent,
            spaces.length === 0 && styles.emptyContainer,
          ]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.primaryLight }]}>
                <Text style={styles.emptyEmoji}>💬</Text>
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No spaces yet</Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                Create a new space to start chatting, or join one with an invite code.
              </Text>
            </View>
          }
        />
      )}

      {/* Modals */}
      {renderModal(showCreate, () => setShowCreate(false), 'Create Space', 'Space name', createName, setCreateName, handleCreate, 'Create')}
      {renderModal(showJoin, () => setShowJoin(false), 'Join Space', 'Enter invite code', joinCode, setJoinCode, handleJoin, 'Join')}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconText: { fontSize: 20 },
  headerTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  headerSubtitle: { fontSize: fontSize.xs },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actionBtn: {
    flex: 1,
    height: 36,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: spacing.lg, gap: spacing.sm },
  spaceCard: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.lg,
  },
  spaceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  avatarText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  spaceInfo: { flex: 1 },
  spaceName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    marginBottom: 2,
  },
  spaceMeta: { fontSize: fontSize.xs },
  chevron: { fontSize: 22, fontWeight: '300', marginLeft: spacing.sm },
  emptyContainer: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', paddingHorizontal: spacing['2xl'] },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyEmoji: { fontSize: 32 },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  emptySubtitle: {
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing['2xl'],
  },
  modalCard: {
    width: '100%',
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    padding: spacing.xl,
  },
  modalTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, marginBottom: spacing.lg },
  modalInput: {
    height: 44,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.sm,
    marginBottom: spacing.lg,
  },
  modalActions: { flexDirection: 'row', gap: spacing.sm },
  modalBtnSecondary: {
    flex: 1,
    height: 40,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnPrimary: {
    flex: 1,
    height: 40,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
});
