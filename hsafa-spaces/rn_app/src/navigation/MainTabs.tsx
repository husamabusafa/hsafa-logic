import React, { useCallback, useEffect, useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useTheme, fontSize, fontWeight, spacing, borderRadius } from '../lib/theme';
import { invitationsApi } from '../lib/api';
import { SpacesStack } from './stacks/SpacesStack';
import { HaseefsStack } from './stacks/HaseefsStack';
import { BasesStack } from './stacks/BasesStack';
import { InvitesStack } from './stacks/InvitesStack';
import { SettingsStack } from './stacks/SettingsStack';
import type { MainTabParamList } from '../lib/types';

const Tab = createBottomTabNavigator<MainTabParamList>();

const TAB_ICONS: Record<string, string> = {
  SpacesTab: '💬',
  HaseefsTab: '🤖',
  BasesTab: '👥',
  InvitesTab: '✉️',
  SettingsTab: '⚙️',
};

function TabIcon({ name, focused, color }: { name: string; focused: boolean; color: string }) {
  return (
    <View style={styles.tabIconContainer}>
      <Text style={[styles.tabIconEmoji, focused && styles.tabIconFocused]}>
        {TAB_ICONS[name] || '●'}
      </Text>
      {focused && (
        <View style={[styles.tabDot, { backgroundColor: color }]} />
      )}
    </View>
  );
}

export function MainTabs() {
  const { colors } = useTheme();
  const [pendingInvites, setPendingInvites] = useState(0);

  const fetchInviteCount = useCallback(async () => {
    try {
      const { invitations } = await invitationsApi.listMine('pending');
      setPendingInvites(invitations.length);
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => {
    fetchInviteCount();
    const interval = setInterval(fetchInviteCount, 30000);
    return () => clearInterval(interval);
  }, [fetchInviteCount]);

  return (
    <Tab.Navigator
      screenOptions={({ route }: { route: { name: string } }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color }: { focused: boolean; color: string }) => (
          <TabIcon name={route.name} focused={focused} color={color} />
        ),
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.tabBarBorder,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: Platform.OS === 'ios' ? 88 : 64,
          paddingTop: spacing.xs,
          paddingBottom: Platform.OS === 'ios' ? 28 : spacing.sm,
          elevation: 8,
          shadowColor: '#000',
          shadowOpacity: 0.06,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: -4 },
        },
        tabBarLabelStyle: {
          fontSize: fontSize.xs,
          fontWeight: fontWeight.medium,
          marginTop: 2,
        },
        tabBarItemStyle: {
          paddingTop: 2,
        },
      })}
    >
      <Tab.Screen
        name="SpacesTab"
        component={SpacesStack}
        options={{ tabBarLabel: 'Spaces' }}
      />
      <Tab.Screen
        name="HaseefsTab"
        component={HaseefsStack}
        options={{ tabBarLabel: 'Haseefs' }}
      />
      <Tab.Screen
        name="BasesTab"
        component={BasesStack}
        options={{ tabBarLabel: 'Bases' }}
      />
      <Tab.Screen
        name="InvitesTab"
        component={InvitesStack}
        options={{
          tabBarLabel: 'Invites',
          tabBarBadge: pendingInvites > 0 ? pendingInvites : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.badge,
            color: colors.badgeFg,
            fontSize: 10,
            fontWeight: '700',
            minWidth: 18,
            height: 18,
            lineHeight: 17,
            borderRadius: 9,
            top: -2,
          },
        }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsStack}
        options={{ tabBarLabel: 'Settings' }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 28,
  },
  tabIconEmoji: {
    fontSize: 20,
    opacity: 0.55,
  },
  tabIconFocused: {
    fontSize: 22,
    opacity: 1,
  },
  tabDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 2,
  },
});
