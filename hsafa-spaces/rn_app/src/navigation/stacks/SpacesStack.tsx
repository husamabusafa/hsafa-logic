import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../../lib/theme';
import { SpacesListScreen } from '../../screens/spaces/SpacesListScreen';
import type { SpacesStackParamList } from '../../lib/types';

const Stack = createNativeStackNavigator<SpacesStackParamList>();

export function SpacesStack() {
  const { colors } = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="SpacesList" component={SpacesListScreen} />
    </Stack.Navigator>
  );
}
