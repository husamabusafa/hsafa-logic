import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { spacesApi, haseefsApi, type Contact, type HaseefListItem, resolveMediaUrl } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { useTheme, spacing, fontSize, fontWeight, borderRadius } from '../../lib/theme';
import type { SpacesStackParamList } from '../../lib/types';

type Nav = NativeStackNavigationProp<SpacesStackParamList>;

type DirectTarget =
  | { kind: 'contact'; entityId: string; displayName: string; avatarUrl?: string | null }
  | { kind: 'haseef'; entityId: string; name: string }
  | { kind: 'email'; email: string };

export function CreateSpaceScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const currentUserName = user?.name || 'You';

  const [isGroup, setIsGroup] = useState(true);
  const [creating, setCreating] = useState(false);

  // Group fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [inviteEmails, setInviteEmails] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState('');

  // Direct fields
  const [directTarget, setDirectTarget] = useState<DirectTarget | null>(null);
  const [directSearch, setDirectSearch] = useState('');

  // Shared data
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [haseefs, setHaseefs] = useState<HaseefListItem[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingData(true);
    Promise.all([
      spacesApi.listContacts().then(({ contacts: c }) => c).catch(() => [] as Contact[]),
      haseefsApi.list().then(({ haseefs: h }) => h).catch(() => [] as HaseefListItem[]),
    ]).then(([c, h]) => {
      if (cancelled) return;
      setContacts(c);
      setHaseefs(h);
    }).finally(() => { if (!cancelled) setLoadingData(false); });
    return () => { cancelled = true; };
  }, []);

  const toggleEntity = useCallback((entityId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(entityId)) next.delete(entityId);
      else next.add(entityId);
      return next;
    });
  }, []);

  const addEmail = () => {
    const trimmed = emailInput.trim().toLowerCase();
    if (trimmed.includes('@') && !inviteEmails.includes(trimmed)) {
      setInviteEmails((prev) => [...prev, trimmed]);
    }
    setEmailInput('');
  };

  // Direct mode: filtered search results
  const filteredDirectItems = useMemo(() => {
    const q = directSearch.toLowerCase();
    const matchedContacts = contacts
      .filter((c) => (c.displayName || '').toLowerCase().includes(q))
      .map((c) => ({ kind: 'contact' as const, ...c }));
    const matchedHaseefs = haseefs
      .filter((h) => h.name.toLowerCase().includes(q))
      .map((h) => ({ kind: 'haseef' as const, entityId: h.entityId, name: h.name }));
    return [...matchedContacts, ...matchedHaseefs];
  }, [contacts, haseefs, directSearch]);

  const directTargetName = directTarget
    ? directTarget.kind === 'contact'
      ? directTarget.displayName || 'Unknown'
      : directTarget.kind === 'haseef'
        ? directTarget.name
        : directTarget.email
    : '';

  const canCreate = isGroup ? !!name.trim() : !!directTarget;

  const handleCreate = async () => {
    if (creating || !canCreate) return;
    setCreating(true);
    try {
      if (isGroup) {
        const { smartSpace } = await spacesApi.create({
          name: name.trim(),
          description: description.trim() || undefined,
          isGroup: true,
          memberEntityIds: Array.from(selectedIds),
          inviteEmails: inviteEmails.length > 0 ? inviteEmails : undefined,
        });
        navigation.replace('Chat', { spaceId: smartSpace.id, spaceName: smartSpace.name });
      } else {
        const memberEntityIds: string[] = [];
        const emails: string[] = [];
        let targetName = '';

        if (directTarget!.kind === 'contact') {
          memberEntityIds.push(directTarget!.entityId);
          targetName = directTarget!.displayName || 'Unknown';
        } else if (directTarget!.kind === 'haseef') {
          memberEntityIds.push(directTarget!.entityId);
          targetName = directTarget!.name;
        } else {
          emails.push(directTarget!.email);
          targetName = directTarget!.email;
        }

        const spaceName = `${currentUserName} ↔ ${targetName}`;
        const { smartSpace } = await spacesApi.create({
          name: spaceName,
          description: '',
          isGroup: false,
          memberEntityIds,
          inviteEmails: emails.length > 0 ? emails : undefined,
        });
        navigation.replace('Chat', { spaceId: smartSpace.id, spaceName: smartSpace.name });
      }
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
          <Ionicons name="chevron-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Create Space</Text>
        <TouchableOpacity
          onPress={handleCreate}
          disabled={!canCreate || creating}
          activeOpacity={0.7}
          style={styles.createBtn}
        >
          {creating ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={[styles.createBtnText, { color: canCreate ? colors.primary : colors.textMuted }]}>
              {isGroup ? 'Create' : 'Start'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Type selector */}
        <View style={styles.typeRow}>
          <TouchableOpacity
            style={[
              styles.typeCard,
              { borderColor: isGroup ? colors.primary : colors.border },
              isGroup && { backgroundColor: colors.primary + '0D' },
            ]}
            onPress={() => { setIsGroup(true); setDirectTarget(null); setDirectSearch(''); }}
            activeOpacity={0.7}
          >
            <Ionicons name="people" size={22} color={isGroup ? colors.primary : colors.textMuted} />
            <Text style={[styles.typeLabel, { color: isGroup ? colors.primary : colors.text }]}>Group</Text>
            <Text style={[styles.typeHint, { color: colors.textMuted }]}>Multiple members</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.typeCard,
              { borderColor: !isGroup ? colors.primary : colors.border },
              !isGroup && { backgroundColor: colors.primary + '0D' },
            ]}
            onPress={() => { setIsGroup(false); setSelectedIds(new Set()); setInviteEmails([]); setEmailInput(''); }}
            activeOpacity={0.7}
          >
            <Ionicons name="person" size={22} color={!isGroup ? colors.primary : colors.textMuted} />
            <Text style={[styles.typeLabel, { color: !isGroup ? colors.primary : colors.text }]}>Direct</Text>
            <Text style={[styles.typeHint, { color: colors.textMuted }]}>1-on-1 chat</Text>
          </TouchableOpacity>
        </View>

        {/* ── DIRECT MODE ─────────────────────────────────────────── */}
        {!isGroup && (
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {directTarget ? (
              <View style={[styles.targetChip, { backgroundColor: colors.primary + '0D', borderColor: colors.primary + '30' }]}>
                {directTarget.kind === 'haseef' ? (
                  <View style={[styles.targetAvatar, { backgroundColor: colors.successLight }]}>
                    <Ionicons name="sparkles" size={14} color={colors.success} />
                  </View>
                ) : directTarget.kind === 'email' ? (
                  <View style={[styles.targetAvatar, { backgroundColor: colors.primaryLight }]}>
                    <Ionicons name="mail-outline" size={14} color={colors.primary} />
                  </View>
                ) : (
                  <View style={[styles.targetAvatar, { backgroundColor: colors.surface }]}>
                    <Ionicons name="person" size={14} color={colors.textSecondary} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.targetName, { color: colors.text }]} numberOfLines={1}>{directTargetName}</Text>
                  <Text style={[styles.targetKind, { color: colors.textMuted }]}>
                    {directTarget.kind === 'contact' ? 'Contact' : directTarget.kind === 'haseef' ? 'Haseef' : 'Email invite'}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setDirectTarget(null)} activeOpacity={0.7}>
                  <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Ionicons name="search-outline" size={16} color={colors.textMuted} />
                  <TextInput
                    style={[styles.searchInput, { color: colors.text }]}
                    value={directSearch}
                    onChangeText={setDirectSearch}
                    placeholder="Search contacts, haseefs, or enter email..."
                    placeholderTextColor={colors.textMuted}
                    autoFocus
                    onSubmitEditing={() => {
                      if (directSearch.includes('@')) {
                        setDirectTarget({ kind: 'email', email: directSearch.trim().toLowerCase() });
                        setDirectSearch('');
                      }
                    }}
                  />
                </View>

                {loadingData ? (
                  <ActivityIndicator size="small" color={colors.primary} style={{ padding: spacing.lg }} />
                ) : (
                  <View style={{ marginTop: spacing.sm }}>
                    {/* Email invite option */}
                    {directSearch.includes('@') && (
                      <TouchableOpacity
                        style={[styles.contactRow, { borderBottomColor: colors.borderLight, borderBottomWidth: StyleSheet.hairlineWidth }]}
                        onPress={() => {
                          setDirectTarget({ kind: 'email', email: directSearch.trim().toLowerCase() });
                          setDirectSearch('');
                        }}
                        activeOpacity={0.6}
                      >
                        <View style={[styles.contactAvatarPlaceholder, { backgroundColor: colors.primaryLight }]}>
                          <Ionicons name="mail-outline" size={16} color={colors.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.contactName, { color: colors.text }]}>Invite {directSearch.trim()}</Text>
                          <Text style={[styles.contactType, { color: colors.textMuted }]}>Send email invitation</Text>
                        </View>
                      </TouchableOpacity>
                    )}

                    {filteredDirectItems.length === 0 && !directSearch.includes('@') && (
                      <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                        No contacts or haseefs found.{directSearch ? ' Try entering an email.' : ''}
                      </Text>
                    )}

                    {filteredDirectItems.map((item) => (
                      <TouchableOpacity
                        key={item.kind === 'contact' ? `c-${item.entityId}` : `h-${item.entityId}`}
                        style={styles.contactRow}
                        onPress={() => {
                          if (item.kind === 'contact') {
                            setDirectTarget({ kind: 'contact', entityId: item.entityId, displayName: item.displayName || 'Unknown', avatarUrl: item.avatarUrl });
                          } else {
                            setDirectTarget({ kind: 'haseef', entityId: item.entityId, name: item.name });
                          }
                          setDirectSearch('');
                        }}
                        activeOpacity={0.6}
                      >
                        {item.kind === 'contact' ? (
                          (() => {
                            const url = resolveMediaUrl((item as any).avatarUrl);
                            return url ? (
                              <Image source={{ uri: url }} style={styles.contactAvatar} />
                            ) : (
                              <View style={[styles.contactAvatarPlaceholder, { backgroundColor: colors.surface }]}>
                                <Ionicons name="person" size={16} color={colors.textSecondary} />
                              </View>
                            );
                          })()
                        ) : (
                          <View style={[styles.contactAvatarPlaceholder, { backgroundColor: colors.successLight }]}>
                            <Ionicons name="sparkles" size={16} color={colors.success} />
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.contactName, { color: colors.text }]} numberOfLines={1}>
                            {item.kind === 'contact' ? item.displayName || 'Unknown' : item.name}
                          </Text>
                          <Text style={[styles.contactType, { color: colors.textMuted }]}>
                            {item.kind === 'contact' ? 'Contact' : 'Haseef'}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </>
            )}
          </View>
        )}

        {/* ── GROUP MODE ──────────────────────────────────────────── */}
        {isGroup && (
          <>
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

            {/* Selected chips */}
            {(selectedIds.size > 0 || inviteEmails.length > 0) && (
              <View style={styles.chipWrap}>
                {contacts.filter((c) => selectedIds.has(c.entityId)).map((c) => (
                  <TouchableOpacity
                    key={c.entityId}
                    style={[styles.memberChip, { backgroundColor: colors.primaryLight }]}
                    onPress={() => toggleEntity(c.entityId)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="person" size={10} color={colors.primary} />
                    <Text style={[styles.chipLabel, { color: colors.primary }]}>{c.displayName || 'Unknown'}</Text>
                    <Ionicons name="close" size={12} color={colors.primary} />
                  </TouchableOpacity>
                ))}
                {haseefs.filter((h) => selectedIds.has(h.entityId)).map((h) => (
                  <TouchableOpacity
                    key={h.entityId}
                    style={[styles.memberChip, { backgroundColor: colors.successLight }]}
                    onPress={() => toggleEntity(h.entityId)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="sparkles" size={10} color={colors.success} />
                    <Text style={[styles.chipLabel, { color: colors.success }]}>{h.name}</Text>
                    <Ionicons name="close" size={12} color={colors.success} />
                  </TouchableOpacity>
                ))}
                {inviteEmails.map((email) => (
                  <TouchableOpacity
                    key={email}
                    style={[styles.memberChip, { backgroundColor: '#8b5cf620' }]}
                    onPress={() => setInviteEmails((prev) => prev.filter((e) => e !== email))}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="mail-outline" size={10} color="#8b5cf6" />
                    <Text style={[styles.chipLabel, { color: '#8b5cf6' }]}>{email}</Text>
                    <Ionicons name="close" size={12} color="#8b5cf6" />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Member picker: Contacts + Haseefs */}
            <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
                ADD MEMBERS ({selectedIds.size} selected)
              </Text>

              {loadingData ? (
                <ActivityIndicator size="small" color={colors.primary} style={{ padding: spacing.lg }} />
              ) : contacts.length === 0 && haseefs.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>No contacts or haseefs available.</Text>
              ) : (
                <>
                  {/* Contacts */}
                  {contacts.map((c, idx) => {
                    const selected = selectedIds.has(c.entityId);
                    const avatarUrl = resolveMediaUrl(c.avatarUrl);
                    return (
                      <TouchableOpacity
                        key={c.entityId}
                        style={[
                          styles.contactRow,
                          selected && { backgroundColor: colors.primary + '08' },
                          idx < contacts.length - 1 && { borderBottomColor: colors.borderLight, borderBottomWidth: StyleSheet.hairlineWidth },
                        ]}
                        onPress={() => toggleEntity(c.entityId)}
                        activeOpacity={0.6}
                      >
                        {avatarUrl ? (
                          <Image source={{ uri: avatarUrl }} style={styles.contactAvatar} />
                        ) : (
                          <View style={[styles.contactAvatarPlaceholder, { backgroundColor: colors.surface }]}>
                            <Ionicons name="person" size={16} color={colors.textSecondary} />
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.contactName, { color: colors.text }]} numberOfLines={1}>
                            {c.displayName || 'Unknown'}
                          </Text>
                          <Text style={[styles.contactType, { color: colors.textMuted }]}>Contact</Text>
                        </View>
                        {selected && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
                      </TouchableOpacity>
                    );
                  })}

                  {/* Haseefs */}
                  {haseefs.map((h, idx) => {
                    const selected = selectedIds.has(h.entityId);
                    return (
                      <TouchableOpacity
                        key={h.entityId}
                        style={[
                          styles.contactRow,
                          selected && { backgroundColor: colors.primary + '08' },
                          idx < haseefs.length - 1 && { borderBottomColor: colors.borderLight, borderBottomWidth: StyleSheet.hairlineWidth },
                        ]}
                        onPress={() => toggleEntity(h.entityId)}
                        activeOpacity={0.6}
                      >
                        <View style={[styles.contactAvatarPlaceholder, { backgroundColor: colors.successLight }]}>
                          <Ionicons name="sparkles" size={16} color={colors.success} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.contactName, { color: colors.text }]} numberOfLines={1}>{h.name}</Text>
                          <Text style={[styles.contactType, { color: colors.textMuted }]}>Haseef</Text>
                        </View>
                        {selected && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
                      </TouchableOpacity>
                    );
                  })}
                </>
              )}
            </View>

            {/* Invite by email */}
            <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="mail-outline" size={14} color={colors.textMuted} />
                <Text style={[styles.sectionTitle, { color: colors.textMuted, marginBottom: 0 }]}>INVITE BY EMAIL</Text>
              </View>
              <View style={styles.emailRow}>
                <TextInput
                  style={[styles.emailInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                  value={emailInput}
                  onChangeText={setEmailInput}
                  placeholder="Enter email address..."
                  placeholderTextColor={colors.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  onSubmitEditing={() => { if (emailInput.includes('@')) addEmail(); }}
                />
                <TouchableOpacity
                  onPress={addEmail}
                  disabled={!emailInput.includes('@')}
                  activeOpacity={0.7}
                  style={[styles.addEmailBtn, { backgroundColor: emailInput.includes('@') ? colors.primary : colors.border }]}
                >
                  <Text style={[styles.addEmailText, { color: emailInput.includes('@') ? colors.primaryForeground : colors.textMuted }]}>Add</Text>
                </TouchableOpacity>
              </View>
              <Text style={[styles.emailHint, { color: colors.textMuted }]}>
                New users will receive an invitation after the space is created.
              </Text>
            </View>
          </>
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
  headerTitle: { flex: 1, fontSize: fontSize.base, fontWeight: fontWeight.semibold, textAlign: 'center' },
  createBtn: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  createBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },

  scrollContent: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing['3xl'] },

  // Type selector
  typeRow: { flexDirection: 'row', gap: spacing.sm },
  typeCard: {
    flex: 1,
    borderRadius: borderRadius.xl,
    borderWidth: 2,
    paddingVertical: spacing.md,
    alignItems: 'center',
    gap: 4,
  },
  typeLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  typeHint: { fontSize: 11 },

  section: { borderRadius: borderRadius.xl, borderWidth: 1, padding: spacing.lg },
  sectionTitle: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, letterSpacing: 0.5, marginBottom: spacing.md },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.md },

  label: { fontSize: fontSize.xs, fontWeight: fontWeight.medium, marginBottom: spacing.xs },
  input: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.sm,
  },
  textArea: { minHeight: 72, textAlignVertical: 'top' },

  // Direct mode
  targetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.md,
  },
  targetAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetName: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  targetKind: { fontSize: 11 },

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  searchInput: { flex: 1, fontSize: fontSize.sm, paddingVertical: spacing.sm },

  // Member chips
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  memberChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    gap: 4,
  },
  chipLabel: { fontSize: 11, fontWeight: fontWeight.medium },

  // Contacts / haseefs list
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
  emptyText: { fontSize: fontSize.sm, fontStyle: 'italic', padding: spacing.md },

  // Email invite
  emailRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  emailInput: {
    flex: 1,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.sm,
  },
  addEmailBtn: {
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  addEmailText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  emailHint: { fontSize: 11, marginTop: spacing.xs },
});
