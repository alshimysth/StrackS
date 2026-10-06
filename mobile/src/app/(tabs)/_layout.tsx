import { Redirect, useRouter } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import React from 'react';
import type { ColorValue } from 'react-native';

import { useAuthStore } from '../../core/auth/use-auth-store';
import { useOnboarding } from '../../core/onboarding/onboarding';
import { useSessionStore } from '../../core/session/use-session-store';
import { Icon, type IconName } from '../../design-system/components/Icon';
import { colors, fonts, spacing, typography } from '../../design-system/theme';
import { useTheme } from '../../design-system/use-theme';

export default function TabsLayout() {
  const theme = useTheme();
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const onboarding = useOnboarding((s) => s.status);

  React.useEffect(() => {
    void useOnboarding.getState().load();
  }, []);

  // Crash-proof (Epic 3 DoD): an orphan session in the SQLite buffer (app killed while
  // tracking) is recovered and reopened paused.
  React.useEffect(() => {
    // No session resume before onboarding ends (PR #85 review): the redirect to tracking
    // would jump over the location explanation.
    if (!token || onboarding !== 'done') {
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
  }, [token, router, onboarding]);

  if (!token) {
    return <Redirect href="/(auth)/login" />;
  }
  // First launch (#82): explain location before a "Démarrer" asks for it. Nothing is
  // shown until the state is known, so the home screen doesn't flash before the
  // redirect.
  if (onboarding === 'unknown') {
    return null;
  }
  if (onboarding === 'pending') {
    return <Redirect href="/onboarding" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary500,
        // `textSecondary` and not `textTertiary`: an inactive tab's label is still text to
        // read (AA contrast, #42).
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: {
          backgroundColor: theme.surfaceCard,
          borderTopColor: theme.borderSubtle,
          height: spacing.tabBarHeight,
        },
        // Size of the `label` token, without its uppercasing: a tab isn't a tag.
        tabBarLabelStyle: { fontFamily: fonts.bodySemiBold, fontSize: typography.label.fontSize },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Accueil', tabBarIcon: tabIcon('tab-home') }} />
      <Tabs.Screen
        name="history"
        options={{ title: 'Historique', tabBarIcon: tabIcon('tab-history') }}
      />
      {/* A dedicated tab rather than a profile section (#24): the PRD promises
          "understand your progress", burying it in the settings would make it invisible.
          The bar stays comfortable with 4; beyond that it will need rethinking. */}
      <Tabs.Screen name="stats" options={{ title: 'Stats', tabBarIcon: tabIcon('tab-stats') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profil', tabBarIcon: tabIcon('tab-profile') }} />
    </Tabs>
  );
}

/**
 * Tab icon (#2, #39). The colour comes from the bar: active or inactive, it follows the
 * label exactly, which distinguishes the current tab without any extra rule.
 * Decorative: the tab label already names the destination.
 */
function tabIcon(name: IconName) {
  // expo-router (SDK 56+) types the tint as `ColorValue`. Both tints above are hex tokens,
  // so it is always a string here; Lucide only accepts strings.
  function TabIcon({ color }: { color: ColorValue }) {
    return <Icon name={name} color={color as string} size="lg" />;
  }
  return TabIcon;
}

