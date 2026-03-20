import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../../lib/theme';
import { SpacesListScreen } from '../../screens/spaces/SpacesListScreen';
import { ChatScreen } from '../../screens/spaces/ChatScreen';
import { SpaceSettingsScreen } from '../../screens/spaces/SpaceSettingsScreen';
import { InviteToSpaceScreen } from '../../screens/spaces/InviteToSpaceScreen';
import { CreateSpaceScreen } from '../../screens/spaces/CreateSpaceScreen';
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
      <Stack.Screen name="Chat" component={ChatScreen} />
      <Stack.Screen name="SpaceSettings" component={SpaceSettingsScreen} />
      <Stack.Screen name="InviteToSpace" component={InviteToSpaceScreen} />
      <Stack.Screen name="CreateSpace" component={CreateSpaceScreen} />
    </Stack.Navigator>
  );
}
