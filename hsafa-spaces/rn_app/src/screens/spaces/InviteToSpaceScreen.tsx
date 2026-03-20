import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { invitationsApi } from '../../lib/api';
import { useTheme, spacing, fontSize, fontWeight, borderRadius } from '../../lib/theme';
import type { SpacesStackParamList } from '../../lib/types';

type Props = NativeStackScreenProps<SpacesStackParamList, 'InviteToSpace'>;

export function InviteToSpaceScreen({ route }: Props) {
  const { spaceId, spaceName } = route.params;
  const { colors } = useTheme();
  const navigation = useNavigation();

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'member' | 'admin' | 'viewer'>('member');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
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
          <Text style={[styles.backArrow, { color: colors.primary }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Invite to Space</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Space name badge */}
        <View style={[styles.spaceBadge, { backgroundColor: colors.primaryLight }]}>
          <Text style={[styles.spaceBadgeText, { color: colors.primary }]}>{spaceName}</Text>
        </View>

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
            autoFocus
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
          onPress={handleSend}
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

  spaceBadge: {
    alignSelf: 'center',
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  spaceBadgeText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },

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
