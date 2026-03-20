import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { invitationsApi, spacesApi, resolveMediaUrl, type Contact, type SpaceMember } from '../../lib/api';
import { useTheme, spacing, fontSize, fontWeight, borderRadius } from '../../lib/theme';
import type { SpacesStackParamList } from '../../lib/types';

type Props = NativeStackScreenProps<SpacesStackParamList, 'InviteToSpace'>;

export function InviteToSpaceScreen({ route }: Props) {
  const { spaceId, spaceName } = route.params;
  const { colors } = useTheme();
  const navigation = useNavigation();

  const [tab, setTab] = useState<'people' | 'email'>('people');

  // People tab state
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [existingMemberIds, setExistingMemberIds] = useState<Set<string>>(new Set());
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Email tab state
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'member' | 'admin' | 'viewer'>('member');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      spacesApi.listContacts().then(({ contacts: c }) => c).catch(() => [] as Contact[]),
      spacesApi.listMembers(spaceId).then(({ members }) => new Set(members.map((m: SpaceMember) => m.entityId))).catch(() => new Set<string>()),
    ]).then(([c, ids]) => {
      if (cancelled) return;
      setContacts(c);
      setExistingMemberIds(ids);
    }).finally(() => { if (!cancelled) setLoadingContacts(false); });
    return () => { cancelled = true; };
  }, [spaceId]);

  const filteredContacts = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return contacts
      .filter((c) => !existingMemberIds.has(c.entityId))
      .filter((c) => !q || (c.displayName || '').toLowerCase().includes(q));
  }, [contacts, existingMemberIds, searchQuery]);

  const handleAddContact = async (contact: Contact) => {
    setAddingId(contact.entityId);
    try {
      await spacesApi.addMember(spaceId, contact.entityId);
      setExistingMemberIds((prev) => new Set([...prev, contact.entityId]));
      Alert.alert('Added', `${contact.displayName || 'User'} added to the space.`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to add member');
    } finally {
      setAddingId(null);
    }
  };

  const handleSendEmail = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      Alert.alert('Error', 'Please enter an email address');
      return;
    }
    setSending(true);
    try {
      await invitationsApi.createForSpace(spaceId, {
        email: trimmed,
        role,
        message: message.trim() || undefined,
      });
      Alert.alert('Invitation Sent', `Invited ${trimmed} to ${spaceName}`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to send invitation');
    } finally {
      setSending(false);
    }
  };

  const roles: Array<{ value: 'member' | 'admin' | 'viewer'; label: string; desc: string }> = [
    { value: 'member', label: 'Member', desc: 'Can send messages and view content' },
    { value: 'admin', label: 'Admin', desc: 'Can manage members and settings' },
    { value: 'viewer', label: 'Viewer', desc: 'Can only view messages' },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Invite to Space</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Space badge */}
      <View style={{ alignItems: 'center', paddingVertical: spacing.sm }}>
        <View style={[styles.spaceBadge, { backgroundColor: colors.primaryLight }]}>
          <Text style={[styles.spaceBadgeText, { color: colors.primary }]}>{spaceName}</Text>
        </View>
      </View>

      {/* Tab bar */}
      <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.tab, tab === 'people' && [styles.tabActive, { borderBottomColor: colors.primary }]]}
          onPress={() => setTab('people')}
          activeOpacity={0.7}
        >
          <Ionicons name="people" size={18} color={tab === 'people' ? colors.primary : colors.textMuted} />
          <Text style={[styles.tabText, { color: tab === 'people' ? colors.primary : colors.textMuted }]}>People</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'email' && [styles.tabActive, { borderBottomColor: colors.primary }]]}
          onPress={() => setTab('email')}
          activeOpacity={0.7}
        >
          <Ionicons name="mail" size={18} color={tab === 'email' ? colors.primary : colors.textMuted} />
          <Text style={[styles.tabText, { color: tab === 'email' ? colors.primary : colors.textMuted }]}>Email</Text>
        </TouchableOpacity>
      </View>

      {/* Tab content */}
      {tab === 'people' ? (
        <View style={{ flex: 1 }}>
          {/* Search */}
          <View style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }}>
            <View style={[styles.searchRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="search" size={16} color={colors.textMuted} />
              <TextInput
                style={[styles.searchInput, { color: colors.text }]}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search contacts..."
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </View>

          <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing['3xl'] }}>
            {loadingContacts ? (
              <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: spacing['2xl'] }} />
            ) : filteredContacts.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={40} color={colors.textMuted} />
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                  {searchQuery ? 'No contacts match your search' : 'No contacts available to add'}
                </Text>
                <TouchableOpacity onPress={() => setTab('email')} activeOpacity={0.7}>
                  <Text style={[styles.emptyLink, { color: colors.primary }]}>Invite by email instead</Text>
                </TouchableOpacity>
              </View>
            ) : (
              filteredContacts.map((c) => {
                const avatar = resolveMediaUrl(c.avatarUrl ?? null);
                return (
                  <View key={c.entityId} style={[styles.contactRow, { borderBottomColor: colors.borderLight }]}>
                    {avatar ? (
                      <Image source={{ uri: avatar }} style={styles.contactAvatar} />
                    ) : (
                      <View style={[styles.contactAvatarFallback, { backgroundColor: colors.primaryLight }]}>
                        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.primary }}>
                          {(c.displayName || '?')[0].toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.contactName, { color: colors.text }]} numberOfLines={1}>
                        {c.displayName || 'Unknown'}
                      </Text>
                      <Text style={[styles.contactType, { color: colors.textMuted }]}>
                        {c.type === 'agent' ? 'Agent' : 'Person'}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleAddContact(c)}
                      disabled={addingId === c.entityId}
                      activeOpacity={0.7}
                      style={[styles.addBtn, { backgroundColor: colors.primary }]}
                    >
                      {addingId === c.entityId ? (
                        <ActivityIndicator size="small" color={colors.primaryForeground} />
                      ) : (
                        <Text style={[styles.addBtnText, { color: colors.primaryForeground }]}>Add</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Email */}
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.label, { color: colors.textMuted }]}>Email Address</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
              value={email}
              onChangeText={setEmail}
              placeholder="user@example.com"
              placeholderTextColor={colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          {/* Role */}
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.label, { color: colors.textMuted }]}>Role</Text>
            <View style={styles.roleList}>
              {roles.map((r) => (
                <TouchableOpacity
                  key={r.value}
                  style={[
                    styles.roleOption,
                    {
                      backgroundColor: role === r.value ? colors.primaryLight : colors.surface,
                      borderColor: role === r.value ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => setRole(r.value)}
                  activeOpacity={0.7}
                >
                  <View style={styles.roleHeader}>
                    <View
                      style={[
                        styles.radioOuter,
                        { borderColor: role === r.value ? colors.primary : colors.border },
                      ]}
                    >
                      {role === r.value && (
                        <View style={[styles.radioInner, { backgroundColor: colors.primary }]} />
                      )}
                    </View>
                    <Text style={[styles.roleLabel, { color: colors.text }]}>{r.label}</Text>
                  </View>
                  <Text style={[styles.roleDesc, { color: colors.textMuted }]}>{r.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Message */}
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.label, { color: colors.textMuted }]}>Message (optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
              value={message}
              onChangeText={setMessage}
              placeholder="Add a personal message..."
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={3}
            />
          </View>

          {/* Send */}
          <TouchableOpacity
            style={[styles.sendBtn, { backgroundColor: email.trim() ? colors.primary : colors.surface }]}
            onPress={handleSendEmail}
            disabled={!email.trim() || sending}
            activeOpacity={0.7}
          >
            {sending ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <Text style={[styles.sendBtnText, { color: email.trim() ? colors.primaryForeground : colors.textMuted }]}>
                Send Invitation
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}
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

  spaceBadge: {
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  spaceBadgeText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.md,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomWidth: 2 },
  tabText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },

  // People tab
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  searchInput: { flex: 1, paddingVertical: spacing.sm, fontSize: fontSize.sm },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
  },
  contactAvatar: { width: 44, height: 44, borderRadius: 22 },
  contactAvatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactName: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  contactType: { fontSize: fontSize.xs, marginTop: 2 },
  addBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    minWidth: 64,
    alignItems: 'center',
  },
  addBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  emptyState: { alignItems: 'center', paddingVertical: spacing['3xl'], gap: spacing.md },
  emptyText: { fontSize: fontSize.sm, textAlign: 'center' },
  emptyLink: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },

  // Email tab
  scrollContent: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing['3xl'] },
  section: { borderRadius: borderRadius.xl, borderWidth: 1, padding: spacing.lg },
  label: { fontSize: fontSize.xs, fontWeight: fontWeight.medium, marginBottom: spacing.sm },
  input: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.sm,
  },
  textArea: { minHeight: 72, textAlignVertical: 'top' },
  roleList: { gap: spacing.sm },
  roleOption: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    padding: spacing.md,
  },
  roleHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 4 },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: { width: 10, height: 10, borderRadius: 5 },
  roleLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  roleDesc: { fontSize: fontSize.xs, marginLeft: 26 },
  sendBtn: {
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  sendBtnText: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
});
