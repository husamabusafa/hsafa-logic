import React from 'react';
import { StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, type LinkingOptions } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Linking from 'expo-linking';
import { AuthProvider } from './src/lib/auth-context';
import { ThemeContext, useAppTheme } from './src/lib/theme';
import { RootNavigator } from './src/navigation/RootNavigator';
import type { RootStackParamList } from './src/lib/types';

const prefix = Linking.createURL('/');

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [prefix, 'hsafa://', 'https://hsafa.app'],
  config: {
    screens: {
      JoinSpaceByCode: 'join/:code',
      Main: {
        screens: {
          SpacesTab: {
            screens: {
              Chat: 'spaces/:spaceId',
            },
          },
        },
      },
    },
  },
};

export default function App() {
  const theme = useAppTheme();

  return (
    <GestureHandlerRootView style={styles.flex}>
      <ThemeContext.Provider value={theme}>
        <SafeAreaProvider>
          <NavigationContainer
            linking={linking}
            theme={{
              dark: theme.dark,
              colors: {
                primary: theme.colors.primary,
                background: theme.colors.background,
                card: theme.colors.card,
                text: theme.colors.text,
                border: theme.colors.border,
                notification: theme.colors.badge,
              },
              fonts: {
                regular: { fontFamily: 'System', fontWeight: '400' },
                medium: { fontFamily: 'System', fontWeight: '500' },
                bold: { fontFamily: 'System', fontWeight: '700' },
                heavy: { fontFamily: 'System', fontWeight: '800' },
              },
            }}
          >
            <AuthProvider>
              <StatusBar style={theme.dark ? 'light' : 'dark'} />
              <RootNavigator />
            </AuthProvider>
          </NavigationContainer>
        </SafeAreaProvider>
      </ThemeContext.Provider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
});
