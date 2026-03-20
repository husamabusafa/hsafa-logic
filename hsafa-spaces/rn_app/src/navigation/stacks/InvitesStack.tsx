import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../../lib/theme';
import { InvitationsListScreen } from '../../screens/invitations/InvitationsListScreen';
import type { InvitesStackParamList } from '../../lib/types';

const Stack = createNativeStackNavigator<InvitesStackParamList>();

export function InvitesStack() {
  const { colors } = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="InvitationsList" component={InvitationsListScreen} />
    </Stack.Navigator>
  );
}
