import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { invitationsApi, type Invitation } from '../../lib/api';
import { useTheme, spacing, fontSize, fontWeight, borderRadius } from '../../lib/theme';

export function InvitationsListScreen() {
  const { colors } = useTheme();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const fetchInvitations = useCallback(async () => {
    try {
      const { invitations: list } = await invitationsApi.listMine('pending');
      setInvitations(list);
    } catch (err) {
      console.error('Failed to fetch invitations:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchInvitations();
  }, [fetchInvitations]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchInvitations();
  }, [fetchInvitations]);

  const handleAccept = async (id: string) => {
    setActionId(id);
    try {
      await invitationsApi.accept(id);
      await fetchInvitations();
    } catch (err) {
      console.error('Failed to accept invitation:', err);
    } finally {
      setActionId(null);
    }
  };

  const handleDecline = async (id: string) => {
    setActionId(id);
    try {
      await invitationsApi.decline(id);
      await fetchInvitations();
    } catch (err) {
      console.error('Failed to decline invitation:', err);
    } finally {
      setActionId(null);
    }
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    return `${diffDays}d ago`;
  };

  const renderInvitation = ({ item }: { item: Invitation }) => {
    const isActing = actionId === item.id;
    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.cardTop}>
          <View style={[styles.inviteIcon, { backgroundColor: colors.primaryLight }]}>
            <Ionicons name="mail-outline" size={22} color={colors.primary} />
          </View>
          <View style={styles.cardInfo}>
            <Text style={[styles.spaceName, { color: colors.text }]} numberOfLines={1}>
              {item.smartSpace?.name || 'Unnamed Space'}
            </Text>
            <Text style={[styles.inviterText, { color: colors.textSecondary }]} numberOfLines={1}>
              Invited by {item.inviter?.displayName || 'someone'} · {formatTime(item.createdAt)}
            </Text>
          </View>
        </View>

        {item.role && (
          <View style={[styles.rolePill, { backgroundColor: colors.surface }]}>
            <Text style={[styles.roleText, { color: colors.textSecondary }]}>
              Role: {item.role}
            </Text>
          </View>
        )}

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.declineBtn, { borderColor: colors.border }]}
            onPress={() => handleDecline(item.id)}
            disabled={isActing}
            activeOpacity={0.7}
          >
            {isActing ? (
              <ActivityIndicator size="small" color={colors.textSecondary} />
            ) : (
              <Text style={[styles.declineBtnText, { color: colors.textSecondary }]}>Decline</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.acceptBtn, { backgroundColor: colors.primary }]}
            onPress={() => handleAccept(item.id)}
            disabled={isActing}
            activeOpacity={0.8}
          >
            {isActing ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <Text style={[styles.acceptBtnText, { color: colors.primaryForeground }]}>Accept</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={styles.headerLeft}>
          <View style={[styles.headerIcon, { backgroundColor: colors.primaryLight }]}>
            <Ionicons name="mail" size={20} color={colors.primary} />
          </View>
          <View>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Invitations</Text>
            <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
              {invitations.length} pending
            </Text>
          </View>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={invitations}
          keyExtractor={(item) => item.id}
          renderItem={renderInvitation}
          contentContainerStyle={[styles.listContent, invitations.length === 0 && styles.emptyContainer]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="mail-outline" size={32} color={colors.primary} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No invitations</Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                When someone invites you to a space, it will appear here.
              </Text>
            </View>
          }
        />
      )}
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: spacing.lg, gap: spacing.md },
  card: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.lg,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inviteIcon: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  cardInfo: { flex: 1 },
  spaceName: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, marginBottom: 2 },
  inviterText: { fontSize: fontSize.xs },
  rolePill: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    marginTop: spacing.sm,
  },
  roleText: { fontSize: fontSize.xs, fontWeight: fontWeight.medium },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  declineBtn: {
    flex: 1,
    height: 38,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  acceptBtn: {
    flex: 1,
    height: 38,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
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
});
