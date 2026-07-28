/**
 * Route de tracking plein écran. Le socle ne connaît aucun sport : il rend
 * sportRegistry[sportType].TrackingScreen de la séance en cours.
 */
import { Redirect } from 'expo-router';
import React from 'react';

import { useSessionStore } from '../core/session/use-session-store';
import { sportRegistry } from '../sports/registry';

export default function TrackingRoute() {
  const sportType = useSessionStore((s) => s.sportType);
  const module = sportType != null ? sportRegistry[sportType] : undefined;
  if (module == null) {
    return <Redirect href="/(tabs)" />;
  }
  const TrackingScreen = module.TrackingScreen;
  return <TrackingScreen />;
}
