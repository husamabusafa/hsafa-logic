import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../../lib/theme';
import { BasesListScreen } from '../../screens/bases/BasesListScreen';
import { BaseDetailScreen } from '../../screens/bases/BaseDetailScreen';
import type { BasesStackParamList } from '../../lib/types';

const Stack = createNativeStackNavigator<BasesStackParamList>();

export function BasesStack() {
  const { colors } = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="BasesList" component={BasesListScreen} />
      <Stack.Screen name="BaseDetail" component={BaseDetailScreen} />
    </Stack.Navigator>
  );
}
