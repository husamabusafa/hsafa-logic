import React, { useState } from 'react';
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
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { haseefsApi } from '../../lib/api';
import { useTheme, spacing, fontSize, fontWeight, borderRadius } from '../../lib/theme';
import type { HaseefsStackParamList } from '../../lib/types';

type Nav = NativeStackNavigationProp<HaseefsStackParamList>;

const MODELS = ['gpt-4o', 'gpt-4o-mini', 'claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022', 'gemini-2.0-flash'];
const PROVIDERS = ['openai', 'anthropic', 'google'];

export function HaseefCreateScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<Nav>();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [model, setModel] = useState('');
  const [provider, setProvider] = useState('');
  const [instructions, setInstructions] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Name is required.');
      return;
    }
    setCreating(true);
    try {
      const { haseef } = await haseefsApi.create({
        name: name.trim(),
        description: description.trim() || undefined,
        model: model || undefined,
        provider: provider || undefined,
        instructions: instructions.trim() || undefined,
      });
      navigation.replace('HaseefDetail', { haseefId: haseef.id });
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create haseef');
    } finally {
      setCreating(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7} style={styles.backBtn}>
          <Text style={[styles.backArrow, { color: colors.primary }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>New Haseef</Text>
        <TouchableOpacity
          onPress={handleCreate}
          disabled={!name.trim() || creating}
          activeOpacity={0.7}
          style={styles.actionBtn}
        >
          {creating ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={[styles.actionBtnText, { color: name.trim() ? colors.primary : colors.textMuted }]}>
              Create
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
            placeholder="e.g. Research Assistant"
            placeholderTextColor={colors.textMuted}
            autoFocus
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

        {/* Model & Provider */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>MODEL</Text>

          <Text style={[styles.label, { color: colors.textMuted }]}>Provider</Text>
          <View style={styles.chipRow}>
            {PROVIDERS.map((p) => (
              <TouchableOpacity
                key={p}
                style={[
                  styles.chip,
                  { borderColor: provider === p ? colors.primary : colors.border },
                  provider === p && { backgroundColor: colors.primary + '15' },
                ]}
                onPress={() => setProvider(provider === p ? '' : p)}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, { color: provider === p ? colors.primary : colors.textSecondary }]}>
                  {p}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.label, { color: colors.textMuted, marginTop: spacing.md }]}>Model</Text>
          <View style={styles.chipRow}>
            {MODELS.map((m) => (
              <TouchableOpacity
                key={m}
                style={[
                  styles.chip,
                  { borderColor: model === m ? colors.primary : colors.border },
                  model === m && { backgroundColor: colors.primary + '15' },
                ]}
                onPress={() => setModel(model === m ? '' : m)}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, { color: model === m ? colors.primary : colors.textSecondary }]}>
                  {m}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    borderRadius: borderRadius.full,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  chipText: { fontSize: fontSize.xs, fontWeight: fontWeight.medium },
});
