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
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { apiKeysApi, type ApiKeyInfo } from '../../lib/api';
import { useTheme, spacing, fontSize, fontWeight, borderRadius } from '../../lib/theme';

const PROVIDERS = [
  { id: 'openai', label: 'OpenAI', icon: 'cube-outline' as const },
  { id: 'anthropic', label: 'Anthropic', icon: 'diamond-outline' as const },
  { id: 'google', label: 'Google AI', icon: 'globe-outline' as const },
  { id: 'groq', label: 'Groq', icon: 'flash-outline' as const },
];

export function ApiKeysScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();

  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [addingProvider, setAddingProvider] = useState<string | null>(null);
  const [newKey, setNewKey] = useState('');
  const [savingKey, setSavingKey] = useState(false);

  const fetchKeys = useCallback(async () => {
    try {
      const { apiKeys } = await apiKeysApi.list();
      setKeys(apiKeys);
    } catch (err: any) {
      console.error('Failed to fetch API keys:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchKeys();
  }, [fetchKeys]);

  const handleSaveKey = async (provider: string) => {
    if (!newKey.trim()) {
      Alert.alert('Error', 'Please enter an API key');
      return;
    }
    setSavingKey(true);
    try {
      const { apiKey } = await apiKeysApi.set(provider, newKey.trim());
      setKeys((prev) => {
        const filtered = prev.filter((k) => k.provider !== provider);
        return [...filtered, apiKey];
      });
      setAddingProvider(null);
      setNewKey('');
      Alert.alert('Saved', `${provider} API key has been saved.`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save key');
    } finally {
      setSavingKey(false);
    }
  };

  const handleRemoveKey = (provider: string) => {
    Alert.alert('Remove Key', `Remove your ${provider} API key?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiKeysApi.remove(provider);
            setKeys((prev) => prev.filter((k) => k.provider !== provider));
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to remove key');
          }
        },
      },
    ]);
  };

  const getKeyForProvider = (provider: string) => keys.find((k) => k.provider === provider);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7} style={styles.backBtn}>
          <Text style={[styles.backArrow, { color: colors.primary }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>API Keys</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <Text style={[styles.description, { color: colors.textSecondary }]}>
          Add API keys for AI providers. Keys are stored securely on the server.
        </Text>

        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing['2xl'] }} />
        ) : (
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {PROVIDERS.map((p, idx) => {
              const existing = getKeyForProvider(p.id);
              const isAdding = addingProvider === p.id;

              return (
                <View
                  key={p.id}
                  style={[
                    styles.providerRow,
                    idx < PROVIDERS.length - 1 && { borderBottomColor: colors.borderLight, borderBottomWidth: StyleSheet.hairlineWidth },
                  ]}
                >
                  <View style={styles.providerHeader}>
                    <View style={[styles.providerIcon, { backgroundColor: colors.primaryLight }]}>
                      <Ionicons name={p.icon} size={18} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.providerName, { color: colors.text }]}>{p.label}</Text>
                      {existing ? (
                        <Text style={[styles.providerHint, { color: colors.success }]}>
                          ✔ {existing.keyHint}
                        </Text>
                      ) : (
                        <Text style={[styles.providerHint, { color: colors.textMuted }]}>Not configured</Text>
                      )}
                    </View>
                    {existing ? (
                      <View style={styles.keyActions}>
                        <TouchableOpacity
                          onPress={() => { setAddingProvider(p.id); setNewKey(''); }}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.actionText, { color: colors.primary }]}>Update</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleRemoveKey(p.id)} activeOpacity={0.7}>
                          <Text style={[styles.actionText, { color: colors.error }]}>Remove</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        onPress={() => { setAddingProvider(p.id); setNewKey(''); }}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.actionText, { color: colors.primary }]}>+ Add</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {isAdding && (
                    <View style={styles.addKeyForm}>
                      <TextInput
                        style={[styles.keyInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                        value={newKey}
                        onChangeText={setNewKey}
                        placeholder={`Enter ${p.label} API key...`}
                        placeholderTextColor={colors.textMuted}
                        autoCapitalize="none"
                        autoCorrect={false}
                        secureTextEntry
                        autoFocus
                      />
                      <View style={styles.addKeyActions}>
                        <TouchableOpacity
                          style={[styles.cancelBtn, { borderColor: colors.border }]}
                          onPress={() => { setAddingProvider(null); setNewKey(''); }}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.saveKeyBtn, { backgroundColor: newKey.trim() ? colors.primary : colors.surface }]}
                          onPress={() => handleSaveKey(p.id)}
                          disabled={!newKey.trim() || savingKey}
                          activeOpacity={0.7}
                        >
                          {savingKey ? (
                            <ActivityIndicator size="small" color={colors.primaryForeground} />
                          ) : (
                            <Text style={[styles.saveKeyBtnText, { color: newKey.trim() ? colors.primaryForeground : colors.textMuted }]}>
                              Save
                            </Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
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

  scrollContent: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing['3xl'] },
  description: { fontSize: fontSize.sm, lineHeight: 20 },

  section: { borderRadius: borderRadius.xl, borderWidth: 1, overflow: 'hidden' },

  providerRow: { padding: spacing.lg },
  providerHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  providerIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerName: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  providerHint: { fontSize: fontSize.xs, marginTop: 1 },

  keyActions: { flexDirection: 'row', gap: spacing.md },
  actionText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold },

  addKeyForm: { marginTop: spacing.md },
  keyInput: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.sm,
    fontFamily: 'monospace',
  },
  addKeyActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, justifyContent: 'flex-end' },
  cancelBtn: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  cancelBtnText: { fontSize: fontSize.sm },
  saveKeyBtn: {
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  saveKeyBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
});
