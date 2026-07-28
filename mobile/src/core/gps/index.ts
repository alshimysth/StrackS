/**
 * Moteur GPS (Epic 3) — enveloppe expo-location. Foreground uniquement pour
 * l'instant : le suivi en arrière-plan exige un dev build EAS (non supporté
 * par Expo Go), il arrivera avec expo-task-manager en Epic 4.
 */
import * as Location from 'expo-location';

/** Relevé brut, tel que persisté dans le buffer puis envoyé au serveur. */
export interface GpsFix {
  recordedAtMs: number;
  lat: number;
  lng: number;
  altitudeM: number | null;
  accuracyM: number | null;
}

export type GpsSubscription = { remove(): void };

/**
 * Demande la permission foreground puis démarre le watch (1 s / 2 m).
 * Rejette avec un message utilisateur si la permission est refusée.
 */
export async function startGpsWatch(onFix: (fix: GpsFix) => void): Promise<GpsSubscription> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Permission de localisation refusée — active-la dans les réglages.');
  }
  return Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 1000,
      distanceInterval: 2,
    },
    (location) => {
      onFix({
        recordedAtMs: location.timestamp,
        lat: location.coords.latitude,
        lng: location.coords.longitude,
        altitudeM: location.coords.altitude,
        accuracyM: location.coords.accuracy,
      });
    },
  );
}
