/**
 * Moteur GPS — enveloppe expo-location.
 *
 * Deux modes complémentaires :
 *  - premier plan (`startGpsWatch`) : alimente l'affichage live via le store ;
 *  - arrière-plan (`startBackgroundUpdates`, #16) : écrit directement dans le buffer
 *    SQLite depuis un contexte JS séparé, écran verrouillé.
 *
 * L'arrière-plan exige un dev build EAS — il ne fonctionne PAS dans Expo Go (#15).
 */
import * as Location from 'expo-location';

import { BACKGROUND_LOCATION_TASK } from './background-task';

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

/**
 * Démarre le suivi en arrière-plan (#16).
 *
 * @returns true si l'arrière-plan est actif ; false si la permission « toujours » a été
 * refusée — l'appelant reste alors en premier plan, ce qui est une dégradation acceptable
 * (la séance continue tant que l'écran est allumé) et non un échec.
 *
 * La permission « toujours » est demandée APRÈS le démarrage de la séance, jamais au
 * lancement de l'app : iOS refuse en bloc une demande hors contexte, et l'utilisateur qui
 * vient de lancer une course comprend pourquoi on la demande à ce moment-là.
 */
export async function startBackgroundUpdates(): Promise<boolean> {
  const permission = await Location.requestBackgroundPermissionsAsync();
  if (!permission.granted) {
    return false;
  }
  if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)) {
    return true; // déjà en cours : ne pas empiler deux souscriptions
  }
  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: 1000,
    distanceInterval: 2,
    // Android impose une notification persistante : sans elle le système tue la tâche
    // au bout de quelques minutes.
    foregroundService: {
      notificationTitle: 'Séance en cours',
      notificationBody: 'StrackS enregistre ton parcours.',
      notificationColor: '#208AEF',
    },
    pausesUpdatesAutomatically: false, // iOS couperait de lui-même à l'arrêt : c'est notre rôle
    showsBackgroundLocationIndicator: true,
  });
  return true;
}

/** Arrête le suivi en arrière-plan. Sans erreur si la tâche n'est pas démarrée. */
export async function stopBackgroundUpdates(): Promise<void> {
  if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => {});
  }
}
