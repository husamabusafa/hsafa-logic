import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../../lib/theme';
import { HaseefsListScreen } from '../../screens/haseefs/HaseefsListScreen';
import { HaseefDetailScreen } from '../../screens/haseefs/HaseefDetailScreen';
import { HaseefCreateScreen } from '../../screens/haseefs/HaseefCreateScreen';
import { HaseefEditScreen } from '../../screens/haseefs/HaseefEditScreen';
import type { HaseefsStackParamList } from '../../lib/types';

const Stack = createNativeStackNavigator<HaseefsStackParamList>();

export function HaseefsStack() {
  const { colors } = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="HaseefsList" component={HaseefsListScreen} />
      <Stack.Screen name="HaseefDetail" component={HaseefDetailScreen} />
      <Stack.Screen name="HaseefCreate" component={HaseefCreateScreen} />
      <Stack.Screen name="HaseefEdit" component={HaseefEditScreen} />
    </Stack.Navigator>
  );
}
