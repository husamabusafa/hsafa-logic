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
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { spacesApi, type Contact, resolveMediaUrl } from '../../lib/api';
import { useTheme, spacing, fontSize, fontWeight, borderRadius } from '../../lib/theme';
import type { SpacesStackParamList } from '../../lib/types';

type Nav = NativeStackNavigationProp<SpacesStackParamList>;

export function CreateSpaceScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<Nav>();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isGroup, setIsGroup] = useState(true);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    spacesApi.listContacts().then(({ contacts: c }) => {
      setContacts(c);
    }).catch(() => {}).finally(() => setLoadingContacts(false));
  }, []);

  const toggleContact = useCallback((entityId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(entityId)) next.delete(entityId);
      else next.add(entityId);
      return next;
    });
  }, []);

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Space name is required.');
      return;
    }
    setCreating(true);
    try {
      const { smartSpace } = await spacesApi.create({
        name: name.trim(),
        description: description.trim() || undefined,
        isGroup,
        memberEntityIds: Array.from(selectedIds),
      });
      navigation.replace('Chat', { spaceId: smartSpace.id, spaceName: smartSpace.name });
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create space');
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
        <Text style={[styles.headerTitle, { color: colors.text }]}>Create Space</Text>
        <TouchableOpacity
          onPress={handleCreate}
          disabled={!name.trim() || creating}
          activeOpacity={0.7}
          style={styles.createBtn}
        >
          {creating ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={[styles.createBtnText, { color: name.trim() ? colors.primary : colors.textMuted }]}>
              Create
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Name & Description */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.textMuted }]}>Space Name *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Project Alpha"
            placeholderTextColor={colors.textMuted}
            autoFocus
          />

          <Text style={[styles.label, { color: colors.textMuted, marginTop: spacing.md }]}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
            value={description}
            onChangeText={setDescription}
            placeholder="What's this space about?"
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={3}
          />
        </View>

        {/* Group toggle */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.switchLabel, { color: colors.text }]}>Group Space</Text>
              <Text style={[styles.switchHint, { color: colors.textMuted }]}>
                {isGroup ? 'Multiple members can join' : 'Direct conversation (1-on-1)'}
              </Text>
            </View>
            <Switch
              value={isGroup}
              onValueChange={setIsGroup}
              trackColor={{ false: colors.border, true: colors.primary + '60' }}
              thumbColor={isGroup ? colors.primary : colors.surface}
            />
          </View>
        </View>

        {/* Member selection */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
            ADD MEMBERS ({selectedIds.size} selected)
          </Text>

          {loadingContacts ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ padding: spacing.lg }} />
          ) : contacts.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>No contacts found.</Text>
          ) : (
            contacts.map((c, idx) => {
              const selected = selectedIds.has(c.entityId);
              const avatarUrl = resolveMediaUrl(c.avatarUrl);
              return (
                <TouchableOpacity
                  key={c.entityId}
                  style={[
                    styles.contactRow,
                    idx < contacts.length - 1 && { borderBottomColor: colors.borderLight, borderBottomWidth: StyleSheet.hairlineWidth },
                  ]}
                  onPress={() => toggleContact(c.entityId)}
                  activeOpacity={0.6}
                >
                  {avatarUrl ? (
                    <Image source={{ uri: avatarUrl }} style={styles.contactAvatar} />
                  ) : (
                    <View style={[styles.contactAvatarPlaceholder, { backgroundColor: c.type === 'agent' ? colors.primaryLight : colors.surface }]}>
                      <Text style={{ fontSize: 14 }}>{c.type === 'agent' ? '🤖' : '👤'}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.contactName, { color: colors.text }]} numberOfLines={1}>
                      {c.displayName || 'Unknown'}
                    </Text>
                    <Text style={[styles.contactType, { color: colors.textMuted }]}>
                      {c.type === 'agent' ? 'Haseef' : 'Person'}
                    </Text>
                  </View>
                  <View style={[
                    styles.checkbox,
                    { borderColor: selected ? colors.primary : colors.border },
                    selected && { backgroundColor: colors.primary },
                  ]}>
                    {selected && <Text style={{ color: colors.primaryForeground, fontSize: 12, fontWeight: '700' }}>✓</Text>}
                  </View>
                </TouchableOpacity>
              );
            })
          )}
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
  createBtn: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  createBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },

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

  switchRow: { flexDirection: 'row', alignItems: 'center' },
  switchLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  switchHint: { fontSize: fontSize.xs, marginTop: 2 },

  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  contactAvatar: { width: 36, height: 36, borderRadius: borderRadius.full },
  contactAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactName: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  contactType: { fontSize: fontSize.xs },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: borderRadius.sm,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { fontSize: fontSize.sm, fontStyle: 'italic', padding: spacing.md },
});
