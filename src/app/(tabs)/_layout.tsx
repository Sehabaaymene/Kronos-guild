import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '../../i18n';
import { useTheme } from '../../theme';
import type { IconName } from '../../ui/primitives';

const TABS: { name: string; title: string; icon: IconName; iconActive: IconName }[] = [
  { name: 'index', title: t('nav.dashboard'), icon: 'grid-outline', iconActive: 'grid' },
  { name: 'inventory', title: t('nav.inventory'), icon: 'watch-outline', iconActive: 'watch' },
  { name: 'sales', title: t('nav.sales'), icon: 'bag-handle-outline', iconActive: 'bag-handle' },
  { name: 'finance', title: t('nav.finance'), icon: 'wallet-outline', iconActive: 'wallet' },
  { name: 'goals', title: t('nav.goals'), icon: 'flag-outline', iconActive: 'flag' },
];

export default function TabsLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 60 + insets.bottom,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? tab.iconActive : tab.icon} size={23} color={String(color)} />,
          }}
        />
      ))}
    </Tabs>
  );
}
