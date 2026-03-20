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
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { haseefsApi, mediaApi } from '../../lib/api';
import { useTheme, spacing, fontSize, fontWeight, borderRadius } from '../../lib/theme';
import { PRESET_MODELS, PROVIDER_OPTIONS, getProviderForModel } from '../../lib/models-config';
import { PREBUILT_PERSONAS, type Persona } from '../../lib/personas';
import type { HaseefsStackParamList } from '../../lib/types';

type Nav = NativeStackNavigationProp<HaseefsStackParamList>;

const SYSTEM_FIELDS = ['entityId', 'haseefId', 'createdAt', 'updatedAt', 'id'];

export function HaseefCreateScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<Nav>();

  // Basic
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');

  // Avatar
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Model
  const [model, setModel] = useState('gpt-5.2');
  const [customModel, setCustomModel] = useState('');
  const [customProvider, setCustomProvider] = useState('openai');

  // Persona
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
  const [isCustomPersona, setIsCustomPersona] = useState(false);
  const [customPersonaName, setCustomPersonaName] = useState('');
  const [customPersonaDesc, setCustomPersonaDesc] = useState('');

  // Voice
  const [voiceGender, setVoiceGender] = useState<'male' | 'female'>('male');
  const [customVoiceId, setCustomVoiceId] = useState('');
  const [useCustomVoice, setUseCustomVoice] = useState(false);

  // Profile fields
  const [profileFields, setProfileFields] = useState<Array<{ id: string; key: string; value: string }>>([]);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [keyError, setKeyError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);

  const models = [...PRESET_MODELS, { value: 'custom', label: 'Custom', provider: 'openai' as const }];
  const resolvedModel = model === 'custom' ? customModel.trim() : model;

  const getProvider = (): string => {
    if (model === 'custom') return customProvider;
    return getProviderForModel(model);
  };

  const handlePickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    setUploading(true);
    try {
      const asset = result.assets[0];
      const { url } = await mediaApi.upload(asset.uri, 'avatar.jpg', 'image/jpeg');
      setAvatarUrl(url);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to upload avatar');
    } finally {
      setUploading(false);
    }
  };

  const buildPersonaPayload = () => {
    if (isCustomPersona && customPersonaName.trim() && customPersonaDesc.trim()) {
      return { id: 'custom', name: customPersonaName.trim(), description: customPersonaDesc.trim() };
    }
    if (selectedPersona) {
      return {
        id: selectedPersona.id,
        name: selectedPersona.name,
        description: selectedPersona.description,
        style: selectedPersona.style,
        traits: selectedPersona.traits,
      };
    }
    return undefined;
  };

  const isSystemField = (key: string) =>
    SYSTEM_FIELDS.some((sf) => sf.toLowerCase() === key.toLowerCase().trim());

  const addProfileField = () => {
    const k = newKey.trim();
    const v = newValue.trim();
    if (!k || !v) return;
    if (isSystemField(k)) { setKeyError(`"${k}" is reserved`); return; }
    if (profileFields.some((f) => f.key.toLowerCase() === k.toLowerCase())) {
      setKeyError(`"${k}" already exists`); return;
    }
    setProfileFields([...profileFields, { id: Date.now().toString(), key: k, value: v }]);
    setNewKey('');
    setNewValue('');
    setKeyError(null);
  };

  const removeProfileField = (id: string) => setProfileFields(profileFields.filter((f) => f.id !== id));

  const buildProfilePayload = () => {
    const profile: Record<string, string> = {};
    const keys: string[] = [];
    profileFields.forEach(({ key, value }) => {
      if (key.trim() && value.trim()) { profile[key.trim()] = value.trim(); keys.push(key.trim()); }
    });
    if (keys.length > 0) profile._userFieldKeys = JSON.stringify(keys);
    return Object.keys(profile).length > 0 ? profile : undefined;
  };

  const handleCreate = async () => {
    if (!name.trim()) { Alert.alert('Error', 'Name is required.'); return; }
    setCreating(true);
    try {
      const persona = buildPersonaPayload();
      const profile = buildProfilePayload();
      const { haseef } = await haseefsApi.create({
        name: name.trim(),
        description: description.trim() || undefined,
        model: resolvedModel || undefined,
        provider: getProvider(),
        instructions: instructions.trim() || undefined,
        voiceGender,
        voiceId: customVoiceId.trim() || undefined,
        ...(avatarUrl ? { avatarUrl } : {}),
        ...(persona ? { persona } : {}),
        ...(profile ? { profile } : {}),
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
          <Ionicons name="chevron-back" size={24} color={colors.primary} />
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
        {/* Avatar */}
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={handlePickAvatar} disabled={uploading} activeOpacity={0.7}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="sparkles" size={32} color={colors.primary} />
              </View>
            )}
            <View style={[styles.avatarBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {uploading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="camera-outline" size={14} color={colors.primary} />
              )}
            </View>
          </TouchableOpacity>
        </View>

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

        {/* Model Selector */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>MODEL</Text>
          <View style={styles.modelGrid}>
            {models.map((m) => (
              <TouchableOpacity
                key={m.value}
                style={[
                  styles.modelCard,
                  { borderColor: model === m.value ? colors.primary : colors.border },
                  model === m.value && { backgroundColor: colors.primary + '0D' },
                ]}
                onPress={() => setModel(m.value)}
                activeOpacity={0.7}
              >
                <View style={styles.modelCardInner}>
                  <Ionicons
                    name={m.value === 'custom' ? 'settings-outline' : 'hardware-chip-outline'}
                    size={14}
                    color={model === m.value ? colors.primary : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.modelLabel,
                      { color: model === m.value ? colors.primary : colors.text },
                      model === m.value && { fontWeight: fontWeight.semibold },
                    ]}
                    numberOfLines={1}
                  >
                    {m.label}
                  </Text>
                </View>
                {'tag' in m && m.tag ? (
                  <Text style={[styles.modelTag, { color: colors.textMuted }]}>{m.tag}</Text>
                ) : null}
              </TouchableOpacity>
            ))}
          </View>

          {model === 'custom' && (
            <View style={styles.customModelSection}>
              <Text style={[styles.label, { color: colors.textMuted }]}>Provider</Text>
              <View style={styles.chipRow}>
                {PROVIDER_OPTIONS.map((p) => (
                  <TouchableOpacity
                    key={p.value}
                    style={[
                      styles.chip,
                      { borderColor: customProvider === p.value ? colors.primary : colors.border },
                      customProvider === p.value && { backgroundColor: colors.primary + '15' },
                    ]}
                    onPress={() => setCustomProvider(p.value)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.chipText, { color: customProvider === p.value ? colors.primary : colors.textSecondary }]}>
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border, marginTop: spacing.sm }]}
                value={customModel}
                onChangeText={setCustomModel}
                placeholder="e.g. gpt-4o or meta-llama/llama-3.1-70b"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          )}
        </View>

        {/* Persona Selector */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="person-outline" size={14} color={colors.textMuted} />
              <Text style={[styles.sectionTitle, { color: colors.textMuted, marginBottom: 0 }]}>PERSONA</Text>
            </View>
            {(selectedPersona || isCustomPersona) && (
              <TouchableOpacity
                onPress={() => { setSelectedPersona(null); setIsCustomPersona(false); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.clearBtn, { color: colors.textMuted }]}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={[styles.sectionHint, { color: colors.textMuted }]}>
            Choose a personality that defines how your Haseef communicates.
          </Text>

          <View style={styles.personaGrid}>
            {PREBUILT_PERSONAS.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={[
                  styles.personaCard,
                  { borderColor: selectedPersona?.id === p.id ? colors.primary : colors.border },
                  selectedPersona?.id === p.id && { backgroundColor: colors.primary + '0D' },
                ]}
                onPress={() => { setSelectedPersona(p); setIsCustomPersona(false); }}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={p.icon as any}
                  size={18}
                  color={selectedPersona?.id === p.id ? colors.primary : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.personaName,
                    { color: selectedPersona?.id === p.id ? colors.primary : colors.text },
                  ]}
                  numberOfLines={1}
                >
                  {p.name}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[
                styles.personaCard,
                { borderColor: isCustomPersona ? colors.primary : colors.border },
                isCustomPersona && { backgroundColor: colors.primary + '0D' },
              ]}
              onPress={() => { setSelectedPersona(null); setIsCustomPersona(true); }}
              activeOpacity={0.7}
            >
              <Ionicons
                name="pencil-outline"
                size={18}
                color={isCustomPersona ? colors.primary : colors.textSecondary}
              />
              <Text style={[styles.personaName, { color: isCustomPersona ? colors.primary : colors.text }]}>
                Custom
              </Text>
            </TouchableOpacity>
          </View>

          {/* Persona preview */}
          {selectedPersona && !isCustomPersona && (
            <View style={[styles.personaPreview, { backgroundColor: colors.surface }]}>
              <Text style={[styles.personaPreviewTitle, { color: colors.text }]}>{selectedPersona.name}</Text>
              <Text style={[styles.personaPreviewDesc, { color: colors.textSecondary }]}>
                {selectedPersona.description}
              </Text>
              <Text style={[styles.personaPreviewQuote, { color: colors.textMuted }]}>
                "{selectedPersona.preview}"
              </Text>
            </View>
          )}

          {/* Custom persona form */}
          {isCustomPersona && (
            <View style={[styles.customPersonaBox, { borderColor: colors.border }]}>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                value={customPersonaName}
                onChangeText={setCustomPersonaName}
                placeholder="Persona name (e.g. The Scientist)"
                placeholderTextColor={colors.textMuted}
              />
              <TextInput
                style={[styles.input, styles.textArea, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border, marginTop: spacing.sm }]}
                value={customPersonaDesc}
                onChangeText={setCustomPersonaDesc}
                placeholder="Describe the personality, tone, and style..."
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={3}
              />
            </View>
          )}
        </View>

        {/* Voice */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="mic-outline" size={14} color={colors.textMuted} />
            <Text style={[styles.sectionTitle, { color: colors.textMuted, marginBottom: 0 }]}>VOICE</Text>
          </View>
          <Text style={[styles.sectionHint, { color: colors.textMuted }]}>
            Choose voice gender for text-to-speech.
          </Text>

          <View style={styles.voiceRow}>
            <TouchableOpacity
              style={[
                styles.voiceOption,
                { borderColor: voiceGender === 'male' ? colors.primary : colors.border },
                voiceGender === 'male' && { backgroundColor: colors.primary + '0D' },
              ]}
              onPress={() => setVoiceGender('male')}
              activeOpacity={0.7}
            >
              <Text style={[styles.voiceLabel, { color: voiceGender === 'male' ? colors.primary : colors.text }]}>
                Male
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.voiceOption,
                { borderColor: voiceGender === 'female' ? colors.primary : colors.border },
                voiceGender === 'female' && { backgroundColor: colors.primary + '0D' },
              ]}
              onPress={() => setVoiceGender('female')}
              activeOpacity={0.7}
            >
              <Text style={[styles.voiceLabel, { color: voiceGender === 'female' ? colors.primary : colors.text }]}>
                Female
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => { setUseCustomVoice(!useCustomVoice); if (useCustomVoice) setCustomVoiceId(''); }}
            activeOpacity={0.7}
          >
            <View style={[
              styles.checkbox,
              { borderColor: useCustomVoice ? colors.primary : colors.border },
              useCustomVoice && { backgroundColor: colors.primary },
            ]}>
              {useCustomVoice && <Ionicons name="checkmark" size={12} color={colors.primaryForeground} />}
            </View>
            <Text style={[styles.checkboxLabel, { color: colors.text }]}>Use custom ElevenLabs voice</Text>
          </TouchableOpacity>

          {useCustomVoice && (
            <View style={{ marginTop: spacing.sm, paddingLeft: 28 }}>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                value={customVoiceId}
                onChangeText={setCustomVoiceId}
                placeholder="e.g. pNInz6obpgDQGcFmaJgB"
                placeholderTextColor={colors.textMuted}
              />
              <Text style={[styles.voiceHint, { color: colors.textMuted }]}>
                Find voice IDs in your ElevenLabs dashboard.
              </Text>
            </View>
          )}
        </View>

        {/* Profile Fields */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="person-circle-outline" size={14} color={colors.textMuted} />
            <Text style={[styles.sectionTitle, { color: colors.textMuted, marginBottom: 0 }]}>PROFILE INFO</Text>
          </View>
          <Text style={[styles.sectionHint, { color: colors.textMuted }]}>
            Add custom details the Haseef knows about itself.
          </Text>

          {/* Existing fields */}
          {profileFields.map((field) => (
            <View key={field.id} style={styles.profileFieldRow}>
              <View style={[styles.profileKeyBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.profileKeyText, { color: colors.textMuted }]}>{field.key}</Text>
              </View>
              <TextInput
                style={[styles.profileValueInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                value={field.value}
                onChangeText={(v) => {
                  setProfileFields(profileFields.map((f) => f.id === field.id ? { ...f, value: v } : f));
                }}
              />
              <TouchableOpacity onPress={() => removeProfileField(field.id)} activeOpacity={0.7}>
                <Ionicons name="trash-outline" size={18} color={colors.error} />
              </TouchableOpacity>
            </View>
          ))}

          {/* Add new field */}
          <View style={styles.profileFieldRow}>
            <TextInput
              style={[styles.profileKeyInput, { backgroundColor: colors.surface, color: colors.text, borderColor: keyError ? colors.error : colors.border }]}
              value={newKey}
              onChangeText={(v) => { setNewKey(v); setKeyError(null); }}
              placeholder="Field name"
              placeholderTextColor={colors.textMuted}
            />
            <TextInput
              style={[styles.profileValueInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
              value={newValue}
              onChangeText={setNewValue}
              placeholder="Value"
              placeholderTextColor={colors.textMuted}
              onSubmitEditing={addProfileField}
            />
            <TouchableOpacity
              onPress={addProfileField}
              disabled={!newKey.trim() || !newValue.trim()}
              activeOpacity={0.7}
              style={[styles.addFieldBtn, { backgroundColor: newKey.trim() && newValue.trim() ? colors.primary : colors.border }]}
            >
              <Ionicons name="add" size={16} color={newKey.trim() && newValue.trim() ? colors.primaryForeground : colors.textMuted} />
            </TouchableOpacity>
          </View>
          {keyError && <Text style={[styles.fieldError, { color: colors.error }]}>{keyError}</Text>}
        </View>

        {/* Instructions */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>INSTRUCTIONS</Text>
          <TextInput
            style={[styles.input, styles.instructionsArea, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
            value={instructions}
            onChangeText={setInstructions}
            placeholder="Additional instructions for your Haseef..."
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
  headerTitle: { flex: 1, fontSize: fontSize.base, fontWeight: fontWeight.semibold, textAlign: 'center' },
  actionBtn: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  actionBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },

  avatarSection: { alignItems: 'center' },
  avatar: { width: 80, height: 80, borderRadius: borderRadius.xl },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  scrollContent: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing['3xl'] },

  section: { borderRadius: borderRadius.xl, borderWidth: 1, padding: spacing.lg },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  sectionTitle: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, letterSpacing: 0.5, marginBottom: spacing.md },
  sectionHint: { fontSize: fontSize.xs, marginBottom: spacing.md },
  clearBtn: { fontSize: fontSize.xs },

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

  // Model
  modelGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  modelCard: {
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minWidth: '30%' as any,
    flexGrow: 1,
  },
  modelCardInner: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  modelLabel: { fontSize: fontSize.xs },
  modelTag: { fontSize: 10, marginTop: 2 },
  customModelSection: { marginTop: spacing.md },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    borderRadius: borderRadius.full,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  chipText: { fontSize: fontSize.xs, fontWeight: fontWeight.medium },

  // Persona
  personaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  personaCard: {
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    minWidth: '30%' as any,
    flexGrow: 1,
    gap: 4,
  },
  personaName: { fontSize: fontSize.xs, fontWeight: fontWeight.medium, textAlign: 'center' },
  personaPreview: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  personaPreviewTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, marginBottom: 4 },
  personaPreviewDesc: { fontSize: fontSize.xs, marginBottom: spacing.xs },
  personaPreviewQuote: { fontSize: fontSize.xs, fontStyle: 'italic' },
  customPersonaBox: { borderRadius: borderRadius.md, borderWidth: 1, padding: spacing.md, marginTop: spacing.md },

  // Voice
  voiceRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  voiceOption: {
    flex: 1,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  voiceLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: borderRadius.sm,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxLabel: { fontSize: fontSize.sm },
  voiceHint: { fontSize: 10, marginTop: 4 },

  // Profile
  profileFieldRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  profileKeyBox: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    width: '30%' as any,
  },
  profileKeyText: { fontSize: fontSize.xs },
  profileKeyInput: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontSize: fontSize.xs,
    width: '30%' as any,
  },
  profileValueInput: {
    flex: 1,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontSize: fontSize.xs,
  },
  addFieldBtn: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldError: { fontSize: fontSize.xs, marginTop: -spacing.xs },
});
