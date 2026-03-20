import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth-context';
import { useTheme, spacing, fontSize, fontWeight, borderRadius } from '../../lib/theme';

const CODE_LENGTH = 6;

export function VerifyEmailScreen() {
  const { verifyEmail, resendCode, user, logout } = useAuth();
  const { colors } = useTheme();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputRef = useRef<TextInput>(null);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const successScale = useRef(new Animated.Value(0)).current;

  // Auto-submit when 6 digits entered
  useEffect(() => {
    if (code.length === CODE_LENGTH) {
      handleVerify(code);
    }
  }, [code]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const handleVerify = async (c: string) => {
    if (c.length !== CODE_LENGTH) return;
    setError(null);
    setLoading(true);
    try {
      await verifyEmail(c);
      setSuccess(true);
      Animated.spring(successScale, {
        toValue: 1,
        friction: 4,
        tension: 80,
        useNativeDriver: true,
      }).start();
    } catch (err: any) {
      setError(err.message || 'Invalid verification code');
      setCode('');
      shake();
      inputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setError(null);
    try {
      await resendCode();
      setResendCooldown(60);
    } catch (err: any) {
      setError(err.message || 'Failed to resend code');
    }
  };

  if (success) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.content}>
          <Animated.View style={{ transform: [{ scale: successScale }] }}>
            <View style={[styles.successIcon, { backgroundColor: colors.successLight }]}>
              <Text style={styles.successEmoji}>✓</Text>
            </View>
          </Animated.View>
          <Text style={[styles.title, { color: colors.text }]}>Email verified!</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Redirecting you to your spaces...
          </Text>
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        {/* Header */}
        <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
          <Text style={styles.iconEmoji}>✉️</Text>
        </View>
        <Text style={[styles.title, { color: colors.text }]}>Check your email</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          We sent a 6-digit code to{'\n'}
          <Text style={{ fontWeight: fontWeight.semibold, color: colors.text }}>
            {user?.email || 'your email'}
          </Text>
        </Text>

        {/* Code Input Card */}
        <Animated.View
          style={[
            styles.codeCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              transform: [{ translateX: shakeAnim }],
            },
          ]}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => inputRef.current?.focus()}
            style={styles.codeRow}
          >
            {Array.from({ length: CODE_LENGTH }).map((_, i) => {
              const isFilled = i < code.length;
              const isCursor = i === code.length;
              return (
                <View
                  key={i}
                  style={[
                    styles.codeBox,
                    {
                      backgroundColor: isFilled ? colors.primaryLight : colors.surface,
                      borderColor: isCursor ? colors.primary : isFilled ? colors.primary : colors.border,
                      borderWidth: isCursor ? 2 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.codeDigit,
                      { color: isFilled ? colors.primary : colors.textMuted },
                    ]}
                  >
                    {code[i] || ''}
                  </Text>
                </View>
              );
            })}
          </TouchableOpacity>

          {/* Hidden input */}
          <TextInput
            ref={inputRef}
            value={code}
            onChangeText={(t) => {
              setError(null);
              setCode(t.replace(/\D/g, '').slice(0, CODE_LENGTH));
            }}
            keyboardType="number-pad"
            autoFocus
            style={styles.hiddenInput}
            maxLength={CODE_LENGTH}
          />

          {loading && (
            <ActivityIndicator
              color={colors.primary}
              size="small"
              style={{ marginTop: spacing.lg }}
            />
          )}

          {error && (
            <View style={[styles.errorBox, { backgroundColor: colors.errorLight }]}>
              <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
            </View>
          )}
        </Animated.View>

        {/* Resend */}
        <TouchableOpacity
          onPress={handleResend}
          disabled={resendCooldown > 0}
          style={styles.resendRow}
          activeOpacity={0.7}
        >
          <Text style={[styles.resendText, { color: colors.textSecondary }]}>
            Didn't receive a code?{' '}
          </Text>
          <Text
            style={[
              styles.resendLink,
              { color: resendCooldown > 0 ? colors.textMuted : colors.primary },
            ]}
          >
            {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend'}
          </Text>
        </TouchableOpacity>

        {/* Logout */}
        <TouchableOpacity onPress={logout} style={styles.logoutBtn} activeOpacity={0.7}>
          <Text style={[styles.logoutText, { color: colors.textMuted }]}>Use another account</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['2xl'],
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  iconEmoji: { fontSize: 30 },
  successIcon: {
    width: 72,
    height: 72,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  successEmoji: { fontSize: 36, color: '#22c55e', fontWeight: '700' },
  title: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginBottom: spacing['3xl'],
    lineHeight: 20,
  },
  codeCard: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    padding: spacing.xl,
    alignItems: 'center',
    width: '100%',
  },
  codeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  codeBox: {
    width: 44,
    height: 52,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeDigit: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    height: 0,
    width: 0,
  },
  errorBox: {
    marginTop: spacing.lg,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    width: '100%',
  },
  errorText: { fontSize: fontSize.sm, textAlign: 'center' },
  resendRow: {
    flexDirection: 'row',
    marginTop: spacing['3xl'],
  },
  resendText: { fontSize: fontSize.sm },
  resendLink: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  logoutBtn: {
    marginTop: spacing.xl,
    padding: spacing.sm,
  },
  logoutText: { fontSize: fontSize.sm },
});
