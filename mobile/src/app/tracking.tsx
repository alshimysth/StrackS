/**
 * Full-screen tracking route.
 *
 * Two responsibilities, in this order: run the countdown (#3) then render the session's
 * `sportRegistry[sportType].TrackingScreen`. The core still knows no sport: it goes
 * through the registry.
 *
 * The actual `start()` happens here, no longer on the home screen: the countdown must
 * cover the screen transition AND precede the GPS permission request.
 */
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Alert } from 'react-native';

import { usePreferences } from '../core/preferences/use-preferences';
import { Countdown } from '../core/session/Countdown';
import { useSessionStore } from '../core/session/use-session-store';
import { sportRegistry } from '../sports/registry';

export default function TrackingRoute() {
  const router = useRouter();
  const { sport } = useLocalSearchParams<{ sport?: string }>();
  const status = useSessionStore((s) => s.status);
  const sessionSport = useSessionStore((s) => s.sportType);
  const preferences = usePreferences();

  // A session already in progress skips the countdown: we come back to an active tracking
  // (resume after a kill, return from the home screen), we don't restart it.
  const resuming = status !== 'idle';
  const sportCode = resuming ? sessionSport : (sport ?? null);
  const module = sportCode != null ? sportRegistry[sportCode] : undefined;

  // `undefined` while preferences load: don't decide too early, otherwise the countdown
  // shows then disappears for someone who disabled it.
  const countdownEnabled = preferences.data?.countdownEnabled;
  const [counting, setCounting] = React.useState(!resuming);

  const begin = React.useCallback(async () => {
    if (module == null) {
      return;
    }
    setCounting(false);
    try {
      await useSessionStore
        .getState()
        .start(module.code, module.maxGpsSpeedKmh ?? 25, preferences.data?.gpsMode ?? 'balanced');
    } catch (error) {
      Alert.alert(
        'Impossible de démarrer',
        error instanceof Error ? error.message : 'Erreur inattendue.',
      );
      router.replace('/(tabs)');
    }
  }, [module, router, preferences.data?.gpsMode]);

  // Countdown disabled in preferences: start as soon as the answer is known.
  React.useEffect(() => {
    if (counting && countdownEnabled === false) {
      void begin();
    }
  }, [counting, countdownEnabled, begin]);

  if (module == null) {
    return <Redirect href="/(tabs)" />;
  }

  if (counting && countdownEnabled !== false) {
    return (
      <Countdown
        onDone={() => void begin()}
        onCancel={() => router.replace('/(tabs)')}
      />
    );
  }

  const TrackingScreen = module.TrackingScreen;
  return <TrackingScreen />;
}
