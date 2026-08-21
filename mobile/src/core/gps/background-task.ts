/**
 * Tâche de localisation en arrière-plan (#16).
 *
 * ⚠️ Ce module s'exécute dans un CONTEXTE JS SÉPARÉ. Sur iOS, le système réveille l'app
 * en « headless » : ni React, ni le store Zustand, ni le moteur de séance n'existent
 * alors. La tâche ne peut donc écrire que dans le buffer SQLite — c'est précisément la
 * raison pour laquelle le buffer a été posé en Epic 3, indépendant du store.
 *
 * Le rapprochement avec l'affichage live se fait au retour au premier plan
 * (`resyncFromBuffer` dans use-session-store) : le store rejoue ce que la tâche a écrit.
 * Il n'y a donc jamais deux écrivains concurrents sur la même séquence.
 *
 * La définition de la tâche doit être évaluée AVANT que le système ne la réveille, donc
 * au chargement du module — pas dans un composant. D'où l'import de ce fichier depuis
 * `core/gps/index.ts`, lui-même importé par le moteur de séance.
 */
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { appendPoint, loadSession, nextSeqAfterBuffer } from '../session/buffer';
import type { GpsFix } from './index';

export const BACKGROUND_LOCATION_TASK = 'stracks-background-location';

interface LocationTaskData {
  locations: Location.LocationObject[];
}

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error != null) {
    return; // rien à faire : le système réessaiera au prochain fix
  }
  const locations = (data as LocationTaskData | undefined)?.locations ?? [];
  if (locations.length === 0) {
    return;
  }

  // Pas de séance en cours : la tâche a survécu à un stop mal terminé. On ne
  // rattache pas des points orphelins à une séance qui n'existe plus.
  const session = await loadSession().catch(() => null);
  if (session == null) {
    return;
  }

  // La numérotation repart du buffer, jamais d'un compteur en mémoire : ce contexte
  // peut être créé et détruit plusieurs fois pendant une même séance.
  let seq = await nextSeqAfterBuffer();
  for (const location of locations) {
    const fix: GpsFix = {
      recordedAtMs: location.timestamp,
      lat: location.coords.latitude,
      lng: location.coords.longitude,
      altitudeM: location.coords.altitude,
      accuracyM: location.coords.accuracy,
    };
    await appendPoint(seq, fix).catch(() => {});
    seq += 1;
  }
});
