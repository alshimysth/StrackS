import { Redirect, Tabs, useRouter } from 'expo-router';
import React from 'react';

import { useAuthStore } from '../../core/auth/use-auth-store';
import { useSessionStore } from '../../core/session/use-session-store';
import { colors, fonts, spacing } from '../../design-system/theme';
import { useTheme } from '../../design-system/use-theme';

export default function TabsLayout() {
  const theme = useTheme();
  const router = useRouter();
  const token = useAuthStore((s) => s.token);

  // Anti-crash (DoD Epic 3) : une séance orpheline dans le buffer SQLite
  // (app tuée en plein tracking) est récupérée et rouverte en pause.
  React.useEffect(() => {
    if (!token) {
      return;
    }
    void useSessionStore
      .getState()
      .recover()
      .then((recovered) => {
        if (recovered) {
          router.replace('/tracking');
        }
      })
      .catch(() => {});
  }, [token, router]);

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
      {/* Onglet dédié plutôt qu'une section du profil (#24) : le PRD promet
          « comprendre ta progression », l'enterrer dans les réglages la rendrait
          invisible. La barre reste confortable à 4 ; au-delà il faudra revoir. */}
      <Tabs.Screen name="stats" options={{ title: 'Stats' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profil' }} />
    </Tabs>
  );
}
