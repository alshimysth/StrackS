/**
 * Route de tracking plein écran.
 *
 * Deux responsabilités, dans cet ordre : dérouler le compte à rebours (#3) puis rendre
 * `sportRegistry[sportType].TrackingScreen` de la séance. Le socle ne connaît toujours
 * aucun sport — il passe par le registre.
 *
 * C'est ici qu'a lieu le `start()` effectif, plus sur l'accueil : le décompte doit
 * couvrir la transition d'écran ET précéder la demande de permission GPS.
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

  // Une séance déjà en cours court-circuite le décompte : on revient sur un tracking
  // actif (reprise après kill, retour depuis l'accueil), on ne le redémarre pas.
  const resuming = status !== 'idle';
  const sportCode = resuming ? sessionSport : (sport ?? null);
  const module = sportCode != null ? sportRegistry[sportCode] : undefined;

  // `undefined` tant que les préférences chargent — ne pas trancher trop tôt, sinon le
  // décompte s'affiche puis disparaît chez quelqu'un qui l'a désactivé.
  const countdownEnabled = preferences.data?.countdownEnabled;
  const [counting, setCounting] = React.useState(!resuming);

  const begin = React.useCallback(async () => {
    if (module == null) {
      return;
    }
    setCounting(false);
    try {
      await useSessionStore.getState().start(module.code, module.maxGpsSpeedKmh ?? 25);
    } catch (error) {
      Alert.alert(
        'Impossible de démarrer',
        error instanceof Error ? error.message : 'Erreur inattendue.',
      );
      router.replace('/(tabs)');
    }
  }, [module, router]);

  // Décompte désactivé en préférence : on démarre dès que la réponse est connue.
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
