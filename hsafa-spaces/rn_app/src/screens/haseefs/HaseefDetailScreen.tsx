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
import type { NativeStackScreenProps, NativeStackNavigationProp } from '@react-navigation/native-stack';
import { haseefsApi, resolveMediaUrl, type Haseef, type HaseefSpace } from '../../lib/api';
import { useTheme, spacing, fontSize, fontWeight, borderRadius } from '../../lib/theme';
import type { HaseefsStackParamList } from '../../lib/types';

type Props = NativeStackScreenProps<HaseefsStackParamList, 'HaseefDetail'>;

export function HaseefDetailScreen({ route }: Props) {
  const { haseefId } = route.params;
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<HaseefsStackParamList>>();

  const [haseef, setHaseef] = useState<Haseef | null>(null);
  const [spaces, setSpaces] = useState<HaseefSpace[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Edit state
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [hRes, sRes] = await Promise.all([
        haseefsApi.get(haseefId),
        haseefsApi.listSpaces(haseefId),
      ]);
      setHaseef(hRes.haseef);
      setEditName(hRes.haseef.name);
      setEditDesc(hRes.haseef.description || '');
      setSpaces(sRes.spaces);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to load haseef');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [haseefId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  const handleSave = async () => {
    if (!haseef || saving) return;
    setSaving(true);
    try {
      const { haseef: updated } = await haseefsApi.update(haseefId, {
        name: editName,
        description: editDesc || undefined,
      });
      setHaseef(updated);
      Alert.alert('Saved', 'Haseef updated successfully.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert('Delete Haseef', 'This action cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await haseefsApi.delete(haseefId);
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

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!haseef) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.center}>
          <Text style={{ color: colors.error }}>Haseef not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const avatarUrl = resolveMediaUrl(haseef.avatarUrl ?? null);
  const config = haseef.configJson ?? {};
  const hasChanges = editName !== haseef.name || editDesc !== (haseef.description || '');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7} style={styles.backBtn}>
          <Text style={[styles.backArrow, { color: colors.primary }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Haseef Details</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('HaseefEdit', { haseefId })}
          activeOpacity={0.7}
          style={styles.editBtn}
        >
          <Text style={[styles.editBtnText, { color: colors.primary }]}>Edit</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Avatar + Name */}
        <View style={styles.profileRow}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primaryLight }]}>
              <Text style={{ fontSize: 32 }}>🤖</Text>
            </View>
          )}
          <View style={[styles.statusBadge, { backgroundColor: colors.successLight }]}>
            <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
            <Text style={[styles.statusText, { color: colors.success }]}>Active</Text>
          </View>
        </View>

        {/* General Section */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>GENERAL</Text>

          <Text style={[styles.label, { color: colors.textMuted }]}>Name</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
            value={editName}
            onChangeText={setEditName}
            placeholder="Haseef name"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={[styles.label, { color: colors.textMuted, marginTop: spacing.md }]}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
            value={editDesc}
            onChangeText={setEditDesc}
            multiline
            numberOfLines={3}
            placeholder="What does this haseef do?"
            placeholderTextColor={colors.textMuted}
          />

          {hasChanges && (
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
        </View>

        {/* Config Section */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>CONFIGURATION</Text>

          <ConfigRow label="Model" value={(config.model as string) || 'Default'} colors={colors} />
          <ConfigRow label="Provider" value={(config.provider as string) || 'Default'} colors={colors} />
          {typeof config.instructions === 'string' && config.instructions.length > 0 ? (
            <View style={{ marginTop: spacing.sm }}>
              <Text style={[styles.label, { color: colors.textMuted }]}>Instructions</Text>
              <Text style={[styles.configValue, { color: colors.textSecondary }]} numberOfLines={4}>
                {config.instructions}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Spaces Section */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
            SPACES ({spaces.length})
          </Text>
          {spaces.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>Not in any spaces yet.</Text>
          ) : (
            spaces.map((s) => (
              <View key={s.id} style={[styles.spaceRow, { borderBottomColor: colors.borderLight }]}>
                <View style={[styles.spaceIcon, { backgroundColor: colors.primaryLight }]}>
                  <Text style={{ fontSize: 14 }}>💬</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.spaceName, { color: colors.text }]} numberOfLines={1}>
                    {s.name || 'Unnamed space'}
                  </Text>
                  <Text style={[styles.spaceMeta, { color: colors.textMuted }]}>
                    {s.memberCount} member{s.memberCount !== 1 ? 's' : ''} · {s.role}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Danger Zone */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.error + '30' }]}>
          <Text style={[styles.sectionTitle, { color: colors.error }]}>DANGER ZONE</Text>
          <TouchableOpacity
            style={[styles.dangerBtn, { borderColor: colors.error + '30', backgroundColor: colors.errorLight }]}
            onPress={handleDelete}
            disabled={deleting}
            activeOpacity={0.7}
          >
            {deleting ? (
              <ActivityIndicator size="small" color={colors.error} />
            ) : (
              <Text style={[styles.dangerBtnText, { color: colors.error }]}>Delete Haseef</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ConfigRow({ label, value, colors }: { label: string; value: string; colors: any }) {
  return (
    <View style={styles.configRow}>
      <Text style={[styles.configLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.configValue, { color: colors.text }]}>{value}</Text>
    </View>
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
  editBtn: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  editBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },

  scrollContent: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing['3xl'] },

  profileRow: { alignItems: 'center', gap: spacing.md },
  avatar: { width: 80, height: 80, borderRadius: borderRadius.xl },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: fontSize.xs, fontWeight: fontWeight.medium },

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
  textArea: { minHeight: 72, textAlignVertical: 'top' },

  saveBtn: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  saveBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },

  configRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  configLabel: { fontSize: fontSize.sm },
  configValue: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },

  spaceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  spaceIcon: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spaceName: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  spaceMeta: { fontSize: fontSize.xs },
  emptyText: { fontSize: fontSize.sm, fontStyle: 'italic' },

  dangerBtn: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  dangerBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
});
