import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../../lib/theme';
import { SettingsScreen } from '../../screens/settings/SettingsScreen';
import { ProfileEditScreen } from '../../screens/settings/ProfileEditScreen';
import { ApiKeysScreen } from '../../screens/settings/ApiKeysScreen';
import type { SettingsStackParamList } from '../../lib/types';

const Stack = createNativeStackNavigator<SettingsStackParamList>();

export function SettingsStack() {
  const { colors } = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="SettingsMain" component={SettingsScreen} />
      <Stack.Screen name="Profile" component={ProfileEditScreen} />
      <Stack.Screen name="ApiKeys" component={ApiKeysScreen} />
    </Stack.Navigator>
  );
}
