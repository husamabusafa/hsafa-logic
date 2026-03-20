import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { haseefsApi, type HaseefListItem, resolveMediaUrl } from '../../lib/api';
import { useTheme, spacing, fontSize, fontWeight, borderRadius } from '../../lib/theme';
import { ListSkeleton } from '../../components/Skeleton';
import type { HaseefsStackParamList } from '../../lib/types';

export function HaseefsListScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<HaseefsStackParamList>>();
  const [haseefs, setHaseefs] = useState<HaseefListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchHaseefs = useCallback(async () => {
    try {
      const { haseefs: list } = await haseefsApi.list();
      setHaseefs(list);
    } catch (err) {
      console.error('Failed to fetch haseefs:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchHaseefs();
  }, [fetchHaseefs]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchHaseefs();
  }, [fetchHaseefs]);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const renderHaseef = ({ item }: { item: HaseefListItem }) => {
    const avatarUrl = resolveMediaUrl(item.avatarUrl);
    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
        activeOpacity={0.7}
        onPress={() => navigation.navigate('HaseefDetail', { haseefId: item.haseefId })}
      >
        <View style={styles.cardRow}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="sparkles" size={24} color={colors.primary} />
            </View>
          )}
          <View style={styles.cardInfo}>
            <Text style={[styles.haseefName, { color: colors.text }]} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={[styles.haseefMeta, { color: colors.textMuted }]}>
              Created {formatDate(item.createdAt)}
            </Text>
          </View>
          <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={styles.headerLeft}>
          <View style={[styles.headerIcon, { backgroundColor: colors.primaryLight }]}>
            <Ionicons name="sparkles" size={20} color={colors.primary} />
          </View>
          <View>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Haseefs</Text>
            <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
              {haseefs.length} AI agent{haseefs.length !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('HaseefCreate')}
        >
          <Text style={[styles.addBtnText, { color: colors.primaryForeground }]}>+ New</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ListSkeleton count={5} />
      ) : (
        <FlatList
          data={haseefs}
          keyExtractor={(item) => item.haseefId}
          renderItem={renderHaseef}
          contentContainerStyle={[
            styles.listContent,
            haseefs.length === 0 && styles.emptyContainer,
          ]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="sparkles-outline" size={32} color={colors.primary} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No haseefs yet</Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                Create your first AI agent to get started.
              </Text>
              <TouchableOpacity
                style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
                activeOpacity={0.8}
              >
                <Text style={[styles.emptyBtnText, { color: colors.primaryForeground }]}>
                  + Create Haseef
                </Text>
              </TouchableOpacity>
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
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  headerSubtitle: {
    fontSize: fontSize.xs,
  },
  addBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  addBtnText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  card: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.lg,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.lg,
    marginRight: spacing.md,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  cardInfo: { flex: 1 },
  haseefName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    marginBottom: 2,
  },
  haseefMeta: {
    fontSize: fontSize.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: spacing.sm,
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  empty: {
    alignItems: 'center',
    paddingHorizontal: spacing['2xl'],
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  emptySubtitle: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  emptyBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  emptyBtnText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
});
