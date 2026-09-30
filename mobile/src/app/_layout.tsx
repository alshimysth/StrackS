/**
 * Root layout: providers (TanStack Query), loading of the design system fonts, session
 * hydration and authentication guard by route group: (auth) for anonymous users, (tabs)
 * for logged-in ones.
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
import { initMonitoring, withMonitoring } from '../core/monitoring/sentry';
import { useAuthStore } from '../core/auth/use-auth-store';
import { setupOnlineManager } from '../core/network/online';
import { darkTheme } from '../design-system/theme';
import { useTheme } from '../design-system/use-theme';

// Error monitoring (lot 5): inactive without `EXPO_PUBLIC_SENTRY_DSN`. Initialized when the
// module loads, before the first render, so startup errors are captured too.
initMonitoring();

export default withMonitoring(RootLayout);

/**
 * The react-query provider wraps EVERYTHING, the loading screen included.
 *
 * Since #31, `useTheme` reads the theme preference, hence react-query. Calling it above the
 * provider would crash the app at launch with "No QueryClient set", hence the split into
 * two components. No test renders this file: the trap only shows at runtime.
 */
function RootLayout() {
  // Without this wiring, react-query thinks the app is always online under React Native.
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
      {/* `style="auto"` follows the SYSTEM theme, not the resolved one: someone choosing
          "dark" on a light system got dark icons on a dark background. The style is
          therefore derived from the effective theme (raised in review). */}
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
