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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useAuthStore } from '../core/auth/use-auth-store';
import { useTheme } from '../design-system/use-theme';

const queryClient = new QueryClient();

export default function RootLayout() {
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
    <QueryClientProvider client={queryClient}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </QueryClientProvider>
  );
}
