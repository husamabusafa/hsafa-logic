import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { AuthSession } from '../App';

interface Props {
  authUrl: string;
  onAuth: (session: AuthSession) => void;
}

export function LoginScreen({ authUrl, onAuth }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLogin = mode === 'login';

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      const endpoint = isLogin ? `${authUrl}/api/login` : `${authUrl}/api/register`;
      const payload = isLogin ? { email, password } : { name, email, password };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      onAuth(data as AuthSession);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = !!email.trim() && !!password.trim() && (!isLogin ? !!name.trim() : true) && !loading;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <View style={styles.iconBox}>
              <Text style={styles.iconText}>✦</Text>
            </View>
            <Text style={styles.title}>{isLogin ? 'Welcome back' : 'Create account'}</Text>
            <Text style={styles.subtitle}>
              {isLogin ? 'Sign in to chat with your AI assistant' : 'Set up your space with an AI assistant'}
            </Text>
          </View>

          <View style={styles.card}>
            {!isLogin && (
              <View style={styles.field}>
                <Text style={styles.label}>Name</Text>
                <TextInput style={styles.input} value={name} onChangeText={setName}
                  placeholder="John Doe" placeholderTextColor="#9CA3AF"
                  autoCapitalize="words" returnKeyType="next" />
              </View>
            )}

            <View style={styles.field}>
              <Text style={styles.label}>Email</Text>
              <TextInput style={styles.input} value={email} onChangeText={setEmail}
                placeholder="john@example.com" placeholderTextColor="#9CA3AF"
                keyboardType="email-address" autoCapitalize="none" autoCorrect={false} returnKeyType="next" />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Password</Text>
              <TextInput style={styles.input} value={password} onChangeText={setPassword}
                placeholder={isLogin ? 'Enter your password' : 'Min 6 characters'}
                placeholderTextColor="#9CA3AF" secureTextEntry returnKeyType="done"
                onSubmitEditing={canSubmit ? handleSubmit : undefined} />
            </View>

            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <TouchableOpacity style={[styles.button, !canSubmit && styles.buttonDisabled]}
              onPress={handleSubmit} disabled={!canSubmit} activeOpacity={0.8}>
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.buttonText}>{isLogin ? 'Sign In' : 'Create Account'}</Text>
              }
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={() => { setMode(isLogin ? 'register' : 'login'); setError(null); setPassword(''); }}>
            <Text style={styles.switchText}>
              {isLogin ? "Don't have an account? " : 'Already have an account? '}
              <Text style={styles.switchLink}>{isLogin ? 'Create one' : 'Sign in'}</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  flex: { flex: 1 },
  container: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 32, gap: 24 },
  header: { alignItems: 'center', gap: 10 },
  iconBox: { width: 56, height: 56, borderRadius: 16, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 24, color: '#3B82F6' },
  title: { fontSize: 22, fontWeight: '600', color: '#111827', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#6B7280', textAlign: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 20, gap: 16, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: '500', color: '#374151' },
  input: { height: 44, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, paddingHorizontal: 12, fontSize: 15, color: '#111827', backgroundColor: '#F9FAFB' },
  errorBox: { backgroundColor: '#FEF2F2', borderRadius: 8, padding: 10 },
  errorText: { fontSize: 13, color: '#DC2626' },
  button: { height: 46, backgroundColor: '#3B82F6', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  switchText: { textAlign: 'center', fontSize: 14, color: '#6B7280' },
  switchLink: { color: '#3B82F6', fontWeight: '500' },
});
