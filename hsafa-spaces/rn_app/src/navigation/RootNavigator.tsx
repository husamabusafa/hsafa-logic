import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../lib/auth-context';
import { useTheme } from '../lib/theme';
import { AuthScreen } from '../screens/auth/AuthScreen';
import { VerifyEmailScreen } from '../screens/auth/VerifyEmailScreen';
import { JoinSpaceByCodeScreen } from '../screens/spaces/JoinSpaceByCodeScreen';
import { MainTabs } from './MainTabs';
import { ActivityIndicator, View, Image } from 'react-native';
import type { RootStackParamList } from '../lib/types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const { colors, dark } = useTheme();

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.background,
        }}
      >
        <Image
          source={dark
            ? require('../../assets/logo/white-logo-spaces-square.png')
            : require('../../assets/logo/dark-logo-spaces-square.png')}
          style={{ width: 140, height: 105, marginBottom: 24 }}
          resizeMode="contain"
        />
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!isAuthenticated ? (
        <>
          <Stack.Screen name="Auth" component={AuthScreen} />
          <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
        </>
      ) : user && !user.emailVerified ? (
        <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
      ) : (
        <>
          <Stack.Screen name="Main" component={MainTabs} />
          <Stack.Screen name="JoinSpaceByCode" component={JoinSpaceByCodeScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}
