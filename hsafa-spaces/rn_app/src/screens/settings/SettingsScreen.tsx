import React, { useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth-context';
import { resolveMediaUrl } from '../../lib/api';
import { useTheme, spacing, fontSize, fontWeight, borderRadius, type ThemeMode } from '../../lib/theme';
import type { SettingsStackParamList } from '../../lib/types';

interface SettingsRowProps {
  iconName: string;
  label: string;
  subtitle?: string;
  onPress: () => void;
  danger?: boolean;
  rightElement?: React.ReactNode;
  colors: ReturnType<typeof useTheme>['colors'];
}

function SettingsRow({ iconName, label, subtitle, onPress, danger, rightElement, colors }: SettingsRowProps) {
  return (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: colors.borderLight }]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <View style={[styles.rowIcon, { backgroundColor: danger ? colors.errorLight : colors.primaryLight }]}>
        <Ionicons name={iconName as any} size={18} color={danger ? colors.error : colors.primary} />
      </View>
      <View style={styles.rowContent}>
        <Text style={[styles.rowLabel, { color: danger ? colors.error : colors.text }]}>
          {label}
        </Text>
        {subtitle && (
          <Text style={[styles.rowSubtitle, { color: colors.textMuted }]}>{subtitle}</Text>
        )}
      </View>
      {rightElement || <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />}
    </TouchableOpacity>
  );
}

const THEME_OPTIONS: { mode: ThemeMode; label: string; icon: string }[] = [
  { mode: 'light', label: 'Light', icon: 'sunny-outline' },
  { mode: 'dark', label: 'Dark', icon: 'moon-outline' },
  { mode: 'system', label: 'System', icon: 'phone-portrait-outline' },
];

export function SettingsScreen() {
  const { colors, dark, mode, setMode } = useTheme();
  const { user, logout } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();
  const avatarUrl = resolveMediaUrl(user?.avatarUrl ?? null);
  const [showThemePicker, setShowThemePicker] = useState(false);

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

  const currentThemeLabel = THEME_OPTIONS.find((o) => o.mode === mode)?.label ?? 'System';

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
                <Ionicons name="checkmark-circle" size={12} color={colors.success} />
                <Text style={[styles.verifiedText, { color: colors.success }]}> Verified</Text>
              </View>
            )}
          </View>
        </View>

        {/* Account Section */}
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Account</Text>
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingsRow
            iconName="person-outline"
            label="Edit Profile"
            subtitle="Name and avatar"
            onPress={() => navigation.navigate('Profile')}
            colors={colors}
          />
          <SettingsRow
            iconName="key-outline"
            label="API Keys"
            subtitle="Manage your API keys"
            onPress={() => navigation.navigate('ApiKeys')}
            colors={colors}
          />
          <SettingsRow
            iconName="lock-closed-outline"
            label="Change Password"
            onPress={() => {}}
            colors={colors}
          />
        </View>

        {/* App Section */}
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>App</Text>
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingsRow
            iconName="notifications-outline"
            label="Notifications"
            subtitle="Push notification settings"
            onPress={() => {}}
            colors={colors}
          />
          <SettingsRow
            iconName={dark ? 'moon-outline' : 'sunny-outline'}
            label="Appearance"
            subtitle={currentThemeLabel}
            onPress={() => setShowThemePicker(!showThemePicker)}
            colors={colors}
            rightElement={
              <Ionicons name={showThemePicker ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
            }
          />
          {showThemePicker && (
            <View style={[styles.themePicker, { borderTopColor: colors.borderLight }]}>
              {THEME_OPTIONS.map((opt) => {
                const isActive = mode === opt.mode;
                return (
                  <TouchableOpacity
                    key={opt.mode}
                    style={[
                      styles.themeOption,
                      {
                        backgroundColor: isActive ? colors.primary + '15' : colors.surface,
                        borderColor: isActive ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => {
                      setMode(opt.mode);
                      setShowThemePicker(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name={opt.icon as any} size={18} color={isActive ? colors.primary : colors.textSecondary} />
                    <Text style={[styles.themeOptionText, { color: isActive ? colors.primary : colors.text }]}>
                      {opt.label}
                    </Text>
                    {isActive && <Ionicons name="checkmark" size={16} color={colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* Danger Zone */}
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Session</Text>
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingsRow
            iconName="log-out-outline"
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
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
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
  rowContent: { flex: 1 },
  rowLabel: { fontSize: fontSize.base, fontWeight: fontWeight.medium },
  rowSubtitle: { fontSize: fontSize.xs, marginTop: 1 },
  themePicker: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  themeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  themeOptionText: { fontSize: fontSize.xs, fontWeight: fontWeight.medium },
  versionText: {
    textAlign: 'center',
    fontSize: fontSize.xs,
    marginTop: spacing['3xl'],
  },
});
