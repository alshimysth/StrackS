import { Redirect, Tabs, useRouter } from 'expo-router';
import React from 'react';

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

  // Anti-crash (DoD Epic 3) : une séance orpheline dans le buffer SQLite
  // (app tuée en plein tracking) est récupérée et rouverte en pause.
  React.useEffect(() => {
    // Pas de reprise de séance avant la fin de l'onboarding (revue PR #85) : la redirection
    // vers le tracking passerait par-dessus l'explication de la localisation.
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
  // Premier lancement (#82) : expliquer la localisation avant qu'un « Démarrer » ne la
  // demande. Rien n'est affiché tant que l'état n'est pas connu, pour ne pas faire
  // clignoter l'accueil avant la redirection.
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
        // `textSecondary` et non `textTertiary` : le libellé d'un onglet inactif reste un
        // texte à lire (contraste AA, #42).
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: {
          backgroundColor: theme.surfaceCard,
          borderTopColor: theme.borderSubtle,
          height: spacing.tabBarHeight,
        },
        // Taille du jeton `label`, sans sa mise en majuscules : un onglet n'est pas une étiquette.
        tabBarLabelStyle: { fontFamily: fonts.bodySemiBold, fontSize: typography.label.fontSize },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Accueil', tabBarIcon: tabIcon('tab-home') }} />
      <Tabs.Screen
        name="history"
        options={{ title: 'Historique', tabBarIcon: tabIcon('tab-history') }}
      />
      {/* Onglet dédié plutôt qu'une section du profil (#24) : le PRD promet
          « comprendre ta progression », l'enterrer dans les réglages la rendrait
          invisible. La barre reste confortable à 4 ; au-delà il faudra revoir. */}
      <Tabs.Screen name="stats" options={{ title: 'Stats', tabBarIcon: tabIcon('tab-stats') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profil', tabBarIcon: tabIcon('tab-profile') }} />
    </Tabs>
  );
}

/**
 * Icône d'onglet (#2, #39). La couleur vient de la barre : active ou inactive, elle suit
 * exactement le libellé, ce qui distingue l'onglet courant sans règle supplémentaire.
 * Décorative : le libellé de l'onglet nomme déjà la destination.
 */
function tabIcon(name: IconName) {
  function TabIcon({ color }: { color: string }) {
    return <Icon name={name} color={color} size="lg" />;
  }
  return TabIcon;
}

