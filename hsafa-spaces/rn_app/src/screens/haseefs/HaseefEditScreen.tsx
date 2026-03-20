import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { haseefsApi, type Haseef } from '../../lib/api';
import { useTheme, spacing, fontSize, fontWeight, borderRadius } from '../../lib/theme';
import type { HaseefsStackParamList } from '../../lib/types';

type Props = NativeStackScreenProps<HaseefsStackParamList, 'HaseefEdit'>;

export function HaseefEditScreen({ route }: Props) {
  const { haseefId } = route.params;
  const { colors } = useTheme();
  const navigation = useNavigation();

  const [haseef, setHaseef] = useState<Haseef | null>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    haseefsApi.get(haseefId).then(({ haseef: h }) => {
      setHaseef(h);
      setName(h.name);
      setDescription(h.description || '');
      const config = h.configJson ?? {};
      setInstructions(typeof config.instructions === 'string' ? config.instructions : '');
    }).catch((err: any) => {
      Alert.alert('Error', err.message || 'Failed to load haseef');
    }).finally(() => setLoading(false));
  }, [haseefId]);

  const hasChanges = haseef && (
    name !== haseef.name ||
    description !== (haseef.description || '') ||
    instructions !== (typeof haseef.configJson?.instructions === 'string' ? haseef.configJson.instructions : '')
  );

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Name is required.');
      return;
    }
    setSaving(true);
    try {
      const updateData: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || undefined,
      };
      if (instructions.trim()) {
        updateData.configJson = {
          ...(haseef?.configJson ?? {}),
          instructions: instructions.trim(),
        };
      }
      const { haseef: updated } = await haseefsApi.update(haseefId, updateData as any);
      setHaseef(updated);
      Alert.alert('Saved', 'Haseef updated successfully.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7} style={styles.backBtn}>
          <Text style={[styles.backArrow, { color: colors.primary }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Edit Haseef</Text>
        <TouchableOpacity
          onPress={handleSave}
          disabled={!hasChanges || saving}
          activeOpacity={0.7}
          style={styles.actionBtn}
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={[styles.actionBtnText, { color: hasChanges ? colors.primary : colors.textMuted }]}>
              Save
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Basic Info */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>BASIC INFO</Text>

          <Text style={[styles.label, { color: colors.textMuted }]}>Name *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
            value={name}
            onChangeText={setName}
            placeholder="Haseef name"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={[styles.label, { color: colors.textMuted, marginTop: spacing.md }]}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
            value={description}
            onChangeText={setDescription}
            placeholder="What does this haseef do?"
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={3}
          />
        </View>

        {/* Instructions */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>INSTRUCTIONS</Text>
          <TextInput
            style={[styles.input, styles.instructionsArea, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
            value={instructions}
            onChangeText={setInstructions}
            placeholder="System instructions for this haseef..."
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={6}
          />
        </View>

        {/* Config summary (read-only) */}
        {haseef?.configJson && (
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>CURRENT CONFIG</Text>
            {(() => {
              const m = haseef.configJson!.model;
              const modelStr = typeof m === 'object' && m !== null ? String((m as any).model || '') : typeof m === 'string' ? m : '';
              const providerStr = typeof m === 'object' && m !== null ? String((m as any).provider || '') : typeof haseef.configJson!.provider === 'string' ? String(haseef.configJson!.provider) : '';
              return (
                <>
                  {modelStr ? (
                    <View style={styles.configRow}>
                      <Text style={[styles.configLabel, { color: colors.textMuted }]}>Model</Text>
                      <Text style={[styles.configValue, { color: colors.text }]}>{modelStr}</Text>
                    </View>
                  ) : null}
                  {providerStr ? (
                    <View style={styles.configRow}>
                      <Text style={[styles.configLabel, { color: colors.textMuted }]}>Provider</Text>
                      <Text style={[styles.configValue, { color: colors.text }]}>{providerStr}</Text>
                    </View>
                  ) : null}
                </>
              );
            })()}
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
  actionBtn: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  actionBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },

  scrollContent: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing['3xl'] },

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
  instructionsArea: { minHeight: 120, textAlignVertical: 'top' },

  configRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  configLabel: { fontSize: fontSize.sm },
  configValue: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
});
