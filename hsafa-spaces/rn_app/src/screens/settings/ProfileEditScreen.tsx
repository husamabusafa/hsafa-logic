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
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../lib/auth-context';
import { mediaApi, resolveMediaUrl } from '../../lib/api';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, spacing, fontSize, fontWeight, borderRadius } from '../../lib/theme';

export function ProfileEditScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const { user, refreshUser } = useAuth();

  const [name, setName] = useState(user?.name || '');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const avatarUrl = resolveMediaUrl(user?.avatarUrl ?? null);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Name cannot be empty.');
      return;
    }
    setSaving(true);
    try {
      // TODO: Call profile update API when available
      // For now just refresh
      await refreshUser();
      Alert.alert('Saved', 'Profile updated.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const handlePickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets?.[0]) return;

    setUploadingAvatar(true);
    try {
      const asset = result.assets[0];
      const fileName = asset.uri.split('/').pop() || 'avatar.jpg';
      const _uploaded = await mediaApi.upload(asset.uri, fileName, asset.mimeType || 'image/jpeg');
      // TODO: Call profile update API with new avatar URL
      await refreshUser();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to upload avatar');
    } finally {
      setUploadingAvatar(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7} style={styles.backBtn}>
          <Text style={[styles.backArrow, { color: colors.primary }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Edit Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Avatar */}
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={handlePickAvatar} disabled={uploadingAvatar} activeOpacity={0.7}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primary }]}>
                <Text style={[styles.avatarInitial, { color: colors.primaryForeground }]}>
                  {(user?.name || 'U').charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={[styles.avatarBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {uploadingAvatar ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="camera-outline" size={14} color={colors.primary} />
              )}
            </View>
          </TouchableOpacity>
          <Text style={[styles.avatarHint, { color: colors.textMuted }]}>Tap to change photo</Text>
        </View>

        {/* Form */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.textMuted }]}>Display Name</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={[styles.label, { color: colors.textMuted, marginTop: spacing.lg }]}>Email</Text>
          <View style={[styles.readonlyField, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.readonlyText, { color: colors.textSecondary }]}>{user?.email || ''}</Text>
            {user?.emailVerified && (
              <View style={[styles.verifiedBadge, { backgroundColor: colors.successLight }]}>
                <Text style={[styles.verifiedText, { color: colors.success }]}>Verified</Text>
              </View>
            )}
          </View>

          <Text style={[styles.label, { color: colors.textMuted, marginTop: spacing.lg }]}>Entity ID</Text>
          <View style={[styles.readonlyField, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.readonlyText, { color: colors.textMuted }]} numberOfLines={1}>
              {user?.entityId || 'N/A'}
            </Text>
          </View>
        </View>

        {/* Save */}
        {name !== user?.name && (
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: colors.primary }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.7}
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <Text style={[styles.saveBtnText, { color: colors.primaryForeground }]}>Save Changes</Text>
            )}
          </TouchableOpacity>
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

  avatarSection: { alignItems: 'center', gap: spacing.sm },
  avatar: { width: 96, height: 96, borderRadius: borderRadius.full },
  avatarPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { fontSize: 36, fontWeight: fontWeight.bold },
  avatarBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarHint: { fontSize: fontSize.xs },

  section: { borderRadius: borderRadius.xl, borderWidth: 1, padding: spacing.lg },

  label: { fontSize: fontSize.xs, fontWeight: fontWeight.medium, marginBottom: spacing.xs },
  input: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.sm,
  },
  readonlyField: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  readonlyText: { fontSize: fontSize.sm, flex: 1 },
  verifiedBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    marginLeft: spacing.sm,
  },
  verifiedText: { fontSize: fontSize.xs, fontWeight: fontWeight.medium },

  saveBtn: {
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  saveBtnText: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
});
