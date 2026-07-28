/**
 * File d'upload du tracé (Epic 3). Envoie les points du buffer par lots vers
 * l'endpoint idempotent (rejeu sans doublon côté serveur). Tolérant au réseau
 * coupé : un échec laisse les points en attente, le prochain flush réessaie.
 */
import { markUploaded, pendingPoints } from './buffer';
import { ApiError } from '../api/client';
import { uploadTrackPoints } from '../api/activities';

const BATCH_SIZE = 100;

let flushing = false;

/**
 * Pousse tous les points en attente. @returns true si le buffer est vidé,
 * false si le réseau a lâché (réessayer plus tard). Les erreurs API
 * (404 activité supprimée, 401…) remontent à l'appelant.
 */
export async function flushTrackPoints(activityId: string): Promise<boolean> {
  if (flushing) {
    return false;
  }
  flushing = true;
  try {
    for (;;) {
      const batch = await pendingPoints(BATCH_SIZE);
      if (batch.length === 0) {
        return true;
      }
      await uploadTrackPoints(
        activityId,
        batch.map((p) => ({
          seq: p.seq,
          recordedAt: new Date(p.recordedAtMs).toISOString(),
          lat: p.lat,
          lng: p.lng,
          altitudeM: p.altitudeM,
          accuracyM: p.accuracyM,
        })),
      );
      await markUploaded(batch.map((p) => p.seq));
    }
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    return false; // panne réseau : les points restent en attente
  } finally {
    flushing = false;
  }
}
