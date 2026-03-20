import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { basesApi, type Base } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { useTheme, spacing, fontSize, fontWeight, borderRadius } from '../../lib/theme';
import { ListSkeleton } from '../../components/Skeleton';
import type { BasesStackParamList } from '../../lib/types';

export function BasesListScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<BasesStackParamList>>();
  const [bases, setBases] = useState<Base[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [createName, setCreateName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchBases = useCallback(async () => {
    try {
      const { bases: list } = await basesApi.list();
      setBases(list);
    } catch (err) {
      console.error('Failed to fetch bases:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchBases();
  }, [fetchBases]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchBases();
  }, [fetchBases]);

  const handleCreate = async () => {
    if (!createName.trim()) return;
    setActionLoading(true);
    try {
      await basesApi.create({ name: createName.trim() });
      setCreateName('');
      setShowCreate(false);
      fetchBases();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create base');
    } finally {
      setActionLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!joinCode.trim()) return;
    setActionLoading(true);
    try {
      await basesApi.join(joinCode.trim());
      setJoinCode('');
      setShowJoin(false);
      fetchBases();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to join base');
    } finally {
      setActionLoading(false);
    }
  };

  const copyCode = async (code: string) => {
    await Clipboard.setStringAsync(code);
    Alert.alert('Copied', 'Invite code copied to clipboard');
  };

  const getRoleLabel = (role: string) => {
    return role;
  };

  const renderBase = ({ item }: { item: Base }) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      activeOpacity={0.7}
      onPress={() => navigation.navigate('BaseDetail', { baseId: item.id })}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.baseIcon, { backgroundColor: colors.primaryLight }]}>
          <Ionicons name="people" size={22} color={colors.primary} />
        </View>
        <View style={styles.cardInfo}>
          <Text style={[styles.baseName, { color: colors.text }]} numberOfLines={1}>
            {item.name}
          </Text>
          <View style={styles.metaRow}>
            <Text style={[styles.roleBadge, { color: colors.primary }]}>
              {getRoleLabel(item.myRole)}
            </Text>
            <Text style={[styles.memberCount, { color: colors.textMuted }]}>
              · {item.memberCount} member{item.memberCount !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>
      </View>

      {/* Invite code */}
      <TouchableOpacity
        style={[styles.codeRow, { backgroundColor: colors.surface }]}
        onPress={() => copyCode(item.inviteCode)}
        activeOpacity={0.7}
      >
        <Text style={[styles.codeLabel, { color: colors.textMuted }]}>Invite:</Text>
        <Text style={[styles.codeText, { color: colors.text }]}>{item.inviteCode}</Text>
        <Ionicons name="copy-outline" size={14} color={colors.primary} />
      </TouchableOpacity>
    </TouchableOpacity>
  );

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
            <Ionicons name="people" size={20} color={colors.primary} />
          </View>
          <View>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Bases</Text>
            <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
              Your teams and groups
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
          <Text style={[styles.actionBtnText, { color: colors.primaryForeground }]}>+ Create Base</Text>
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
        <ListSkeleton count={5} />
      ) : (
        <FlatList
          data={bases}
          keyExtractor={(item) => item.id}
          renderItem={renderBase}
          contentContainerStyle={[styles.listContent, bases.length === 0 && styles.emptyContainer]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="people-outline" size={32} color={colors.primary} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No bases yet</Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                Create a base to organize your team or join one with an invite code.
              </Text>
            </View>
          }
        />
      )}

      {/* Modals */}
      {renderModal(showCreate, () => setShowCreate(false), 'Create Base', 'Base name', createName, setCreateName, handleCreate, 'Create')}
      {renderModal(showJoin, () => setShowJoin(false), 'Join Base', 'Enter invite code', joinCode, setJoinCode, handleJoin, 'Join')}
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
  listContent: { padding: spacing.lg, gap: spacing.md },
  card: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.lg,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  baseIcon: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  cardInfo: { flex: 1 },
  baseName: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, marginBottom: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  roleBadge: { fontSize: fontSize.xs, fontWeight: fontWeight.medium },
  memberCount: { fontSize: fontSize.xs },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    gap: spacing.xs,
  },
  codeLabel: { fontSize: fontSize.xs },
  codeText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, flex: 1 },
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
  emptyTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, marginBottom: spacing.xs },
  emptySubtitle: { fontSize: fontSize.sm, textAlign: 'center' },
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
