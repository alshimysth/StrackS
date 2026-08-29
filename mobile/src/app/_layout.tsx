/**
 * Layout racine : providers (TanStack Query), chargement des fontes du design
 * system, hydratation de la session et garde d'authentification par groupes
 * de routes — (auth) pour les anonymes, (tabs) pour les connectés.
 */
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import { Sora_600SemiBold, Sora_700Bold, useFonts } from '@expo-google-fonts/sora';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';

import { persistOptions, queryClient } from '../core/api/query-client';
import { useAuthStore } from '../core/auth/use-auth-store';
import { setupOnlineManager } from '../core/network/online';
import { darkTheme } from '../design-system/theme';
import { useTheme } from '../design-system/use-theme';

/**
 * Le provider react-query enveloppe TOUT, y compris l'écran de chargement.
 *
 * Depuis #31, `useTheme` lit la préférence de thème, donc react-query. L'appeler au-dessus
 * du provider ferait planter l'app au lancement avec « No QueryClient set » — d'où la
 * séparation en deux composants. Aucun test ne rend ce fichier : le piège ne se voit qu'à
 * l'exécution.
 */
export default function RootLayout() {
  // Sans ce câblage, react-query croit l'app toujours en ligne sous React Native.
  React.useEffect(() => setupOnlineManager(), []);

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <AppShell />
    </PersistQueryClientProvider>
  );
}

function AppShell() {
  const theme = useTheme();
  const hydrated = useAuthStore((s) => s.hydrated);
  const hydrate = useAuthStore((s) => s.hydrate);

  const [fontsLoaded] = useFonts({
    Sora_600SemiBold,
    Sora_700Bold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
  });

  React.useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (!fontsLoaded || !hydrated) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.surfaceApp,
        }}
      >
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <>
      {/* `style="auto"` suit le thème SYSTÈME, pas le thème résolu : quelqu'un qui
          choisit « sombre » sur un système clair obtenait des icônes foncées sur fond
          sombre. On dérive donc le style du thème effectif (signalé en revue). */}
      <StatusBar style={theme === darkTheme ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="tracking"
          options={{ presentation: 'fullScreenModal', gestureEnabled: false }}
        />
        <Stack.Screen name="summary/[id]" options={{ gestureEnabled: false }} />
      </Stack>
    </>
  );
}
