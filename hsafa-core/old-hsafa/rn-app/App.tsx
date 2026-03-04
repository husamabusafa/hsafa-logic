import React, { useState, useEffect, useCallback } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LoginScreen } from './screens/LoginScreen';
import { ChatScreen } from './screens/ChatScreen';
import { AUTH_URL, GATEWAY_URL } from './config';

const SESSION_KEY = 'hsafa_session';

export interface SpaceInfo {
  id: string;
  name?: string | null;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  entityId: string;
  smartSpaceId: string;
  agentEntityId: string;
  spaces?: SpaceInfo[];
}

export interface AuthSession {
  token: string;
  user: AuthUser;
}

export default function App() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(SESSION_KEY)
      .then(async (raw) => {
        if (!raw) return;
        const cached = JSON.parse(raw) as AuthSession;
        const res = await fetch(`${AUTH_URL}/api/me`, {
          headers: { Authorization: `Bearer ${cached.token}` },
        });
        if (res.ok) {
          const data = await res.json();
          // Update cached session with fresh spaces from server
          const updated: AuthSession = {
            ...cached,
            user: { ...cached.user, ...data.user },
          };
          await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(updated));
          setSession(updated);
        } else {
          await AsyncStorage.removeItem(SESSION_KEY);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleAuth = async (s: AuthSession) => {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(s));
    setSession(s);
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem(SESSION_KEY);
    setSession(null);
  };

  const handleUpdateSession = useCallback(async (updated: AuthSession) => {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(updated));
    setSession(updated);
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007AFF" />
        <StatusBar style="auto" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      {session ? (
        <ChatScreen
          session={session}
          gatewayUrl={GATEWAY_URL}
          onLogout={handleLogout}
          onUpdateSession={handleUpdateSession}
        />
      ) : (
        <LoginScreen authUrl={AUTH_URL} onAuth={handleAuth} />
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
});
