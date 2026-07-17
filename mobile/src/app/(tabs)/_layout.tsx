import { Redirect, Tabs } from 'expo-router';
import React from 'react';

import { useAuthStore } from '../../core/auth/use-auth-store';
import { colors, fonts, spacing } from '../../design-system/theme';
import { useTheme } from '../../design-system/use-theme';

export default function TabsLayout() {
  const theme = useTheme();
  const token = useAuthStore((s) => s.token);
  if (!token) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary500,
        tabBarInactiveTintColor: theme.textTertiary,
        tabBarStyle: {
          backgroundColor: theme.surfaceCard,
          borderTopColor: theme.borderSubtle,
          height: spacing.tabBarHeight,
        },
        tabBarLabelStyle: { fontFamily: fonts.bodySemiBold, fontSize: 12 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Accueil' }} />
      <Tabs.Screen name="history" options={{ title: 'Historique' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profil' }} />
    </Tabs>
  );
}
