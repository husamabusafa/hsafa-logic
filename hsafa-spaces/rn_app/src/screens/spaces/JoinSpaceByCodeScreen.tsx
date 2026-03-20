import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { spacesApi } from '../../lib/api';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, spacing, fontSize, fontWeight, borderRadius } from '../../lib/theme';
import type { RootStackParamList } from '../../lib/types';

type Props = NativeStackScreenProps<RootStackParamList, 'JoinSpaceByCode'>;

export function JoinSpaceByCodeScreen({ route }: Props) {
  const { code } = route.params;
  const { colors } = useTheme();
  const navigation = useNavigation();

  const [resolving, setResolving] = useState(true);
  const [spaceName, setSpaceName] = useState<string | null>(null);
  const [spaceDesc, setSpaceDesc] = useState<string | null>(null);
  const [memberCount, setMemberCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { space } = await spacesApi.resolveSpaceCode(code);
        setSpaceName(space.name);
        setMemberCount(space.memberCount);
      } catch (err: any) {
        setError(err.message || 'Invalid or expired invite link.');
      } finally {
        setResolving(false);
      }
    })();
  }, [code]);

  const handleJoin = async () => {
    setJoining(true);
    try {
      const { space } = await spacesApi.joinByCode(code);
      Alert.alert('Joined!', `You've joined ${space.name || 'the space'}.`, [
        {
          text: 'Open Space',
          onPress: () => {
            (navigation as any).reset({
              index: 0,
              routes: [{ name: 'Main' }],
            });
          },
        },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to join space.');
    } finally {
      setJoining(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        {resolving ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Resolving invite...</Text>
          </View>
        ) : error ? (
          <View style={styles.center}>
            <View style={[styles.iconCircle, { backgroundColor: colors.errorLight }]}>
              <Text style={{ fontSize: 32 }}>❌</Text>
            </View>
            <Text style={[styles.title, { color: colors.text }]}>Invalid Invite</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{error}</Text>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.primary }]}
              onPress={() => (navigation as any).reset({ index: 0, routes: [{ name: 'Main' }] })}
              activeOpacity={0.7}
            >
              <Text style={[styles.btnText, { color: colors.primaryForeground }]}>Go Home</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.center}>
            <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="chatbubbles" size={32} color={colors.primary} />
            </View>
            <Text style={[styles.title, { color: colors.text }]}>{spaceName || 'Space'}</Text>
            {spaceDesc ? (
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{spaceDesc}</Text>
            ) : null}
            <Text style={[styles.memberCount, { color: colors.textMuted }]}>
              {memberCount} member{memberCount !== 1 ? 's' : ''}
            </Text>

            <Text style={[styles.inviteLabel, { color: colors.textMuted }]}>
              You've been invited to join this space
            </Text>

            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.primary }]}
              onPress={handleJoin}
              disabled={joining}
              activeOpacity={0.7}
            >
              {joining ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <Text style={[styles.btnText, { color: colors.primaryForeground }]}>Join Space</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}
              style={{ marginTop: spacing.md }}
            >
              <Text style={[styles.cancelText, { color: colors.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing['2xl'] },
  center: { alignItems: 'center' },

  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginBottom: spacing.sm,
    lineHeight: 20,
  },
  memberCount: { fontSize: fontSize.xs, marginBottom: spacing.xl },
  inviteLabel: { fontSize: fontSize.sm, marginBottom: spacing.lg },
  loadingText: { fontSize: fontSize.sm, marginTop: spacing.md },

  btn: {
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing['3xl'],
    alignItems: 'center',
    minWidth: 200,
  },
  btnText: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  cancelText: { fontSize: fontSize.sm },
});
