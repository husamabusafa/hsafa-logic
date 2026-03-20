import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../../lib/auth-context';
import { resolveMediaUrl } from '../../lib/api';
import { useTheme, spacing, fontSize, fontWeight, borderRadius } from '../../lib/theme';
import type { SettingsStackParamList } from '../../lib/types';

interface SettingsRowProps {
  icon: string;
  label: string;
  subtitle?: string;
  onPress: () => void;
  danger?: boolean;
  colors: ReturnType<typeof useTheme>['colors'];
}

function SettingsRow({ icon, label, subtitle, onPress, danger, colors }: SettingsRowProps) {
  return (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: colors.borderLight }]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <View style={[styles.rowIcon, { backgroundColor: danger ? colors.errorLight : colors.primaryLight }]}>
        <Text style={styles.rowIconText}>{icon}</Text>
      </View>
      <View style={styles.rowContent}>
        <Text style={[styles.rowLabel, { color: danger ? colors.error : colors.text }]}>
          {label}
        </Text>
        {subtitle && (
          <Text style={[styles.rowSubtitle, { color: colors.textMuted }]}>{subtitle}</Text>
        )}
      </View>
      <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
    </TouchableOpacity>
  );
}

export function SettingsScreen() {
  const { colors, dark } = useTheme();
  const { user, logout } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();
  const avatarUrl = resolveMediaUrl(user?.avatarUrl ?? null);

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Profile Card */}
        <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.profileAvatar} />
          ) : (
            <View style={[styles.profileAvatarPlaceholder, { backgroundColor: colors.primary }]}>
              <Text style={[styles.profileInitial, { color: colors.primaryForeground }]}>
                {(user?.name || 'U').charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: colors.text }]} numberOfLines={1}>
              {user?.name || 'User'}
            </Text>
            <Text style={[styles.profileEmail, { color: colors.textSecondary }]} numberOfLines={1}>
              {user?.email || ''}
            </Text>
            {user?.emailVerified && (
              <View style={[styles.verifiedBadge, { backgroundColor: colors.successLight }]}>
                <Text style={[styles.verifiedText, { color: colors.success }]}>✓ Verified</Text>
              </View>
            )}
          </View>
        </View>

        {/* Account Section */}
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Account</Text>
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingsRow
            icon="👤"
            label="Edit Profile"
            subtitle="Name and avatar"
            onPress={() => navigation.navigate('Profile')}
            colors={colors}
          />
          <SettingsRow
            icon="🔑"
            label="API Keys"
            subtitle="Manage your API keys"
            onPress={() => navigation.navigate('ApiKeys')}
            colors={colors}
          />
          <SettingsRow
            icon="🔒"
            label="Change Password"
            onPress={() => {}}
            colors={colors}
          />
        </View>

        {/* App Section */}
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>App</Text>
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingsRow
            icon="🔔"
            label="Notifications"
            subtitle="Push notification settings"
            onPress={() => {}}
            colors={colors}
          />
          <SettingsRow
            icon={dark ? '🌙' : '☀️'}
            label="Appearance"
            subtitle={dark ? 'Dark mode' : 'Light mode'}
            onPress={() => {}}
            colors={colors}
          />
        </View>

        {/* Danger Zone */}
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Session</Text>
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingsRow
            icon="🚪"
            label="Sign Out"
            onPress={handleLogout}
            danger
            colors={colors}
          />
        </View>

        {/* Version */}
        <Text style={[styles.versionText, { color: colors.textMuted }]}>
          Hsafa Spaces v1.0.0
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.bold },
  scrollContent: {
    paddingBottom: spacing['4xl'],
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: spacing.lg,
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
  },
  profileAvatar: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.full,
    marginRight: spacing.lg,
  },
  profileAvatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.lg,
  },
  profileInitial: { fontSize: fontSize.xl, fontWeight: fontWeight.bold },
  profileInfo: { flex: 1 },
  profileName: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, marginBottom: 2 },
  profileEmail: { fontSize: fontSize.sm, marginBottom: spacing.xs },
  verifiedBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  verifiedText: { fontSize: fontSize.xs, fontWeight: fontWeight.medium },
  sectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  section: {
    marginHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  rowIconText: { fontSize: 18 },
  rowContent: { flex: 1 },
  rowLabel: { fontSize: fontSize.base, fontWeight: fontWeight.medium },
  rowSubtitle: { fontSize: fontSize.xs, marginTop: 1 },
  chevron: { fontSize: 22, fontWeight: '300' },
  versionText: {
    textAlign: 'center',
    fontSize: fontSize.xs,
    marginTop: spacing['3xl'],
  },
});
