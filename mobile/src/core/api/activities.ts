/**
 * Appels API du cycle de vie d'activité — consommés par core/session
 * (jamais par les modules de sport directement).
 */
import { api } from './client';
import type { Activity } from '../../types/api';

export interface TrackPointPayload {
  seq: number;
  recordedAt: string;
  lat: number;
  lng: number;
  altitudeM: number | null;
  accuracyM: number | null;
}

export function startActivity(sportType: string): Promise<Activity> {
  return api<Activity>('/api/v1/activities', {
    method: 'POST',
    body: { sportType, startedAt: new Date().toISOString() },
  });
}

export function pauseActivity(id: string): Promise<Activity> {
  return api<Activity>(`/api/v1/activities/${id}/pause`, { method: 'POST' });
}

export function resumeActivity(id: string): Promise<Activity> {
  return api<Activity>(`/api/v1/activities/${id}/resume`, { method: 'POST' });
}

export function stopActivity(
  id: string,
  body: { endedAt: string; durationS: number; notes?: string },
): Promise<Activity> {
  return api<Activity>(`/api/v1/activities/${id}/stop`, { method: 'POST', body });
}

export function deleteActivity(id: string): Promise<void> {
  return api<void>(`/api/v1/activities/${id}`, { method: 'DELETE' });
}

export function getActivity(id: string): Promise<Activity> {
  return api<Activity>(`/api/v1/activities/${id}`);
}

/**
 * Édition partielle (#25). Un champ omis n'est pas touché côté serveur ; une chaîne
 * vide efface. Ne jamais envoyer `null` en croyant effacer — le backend l'ignorerait.
 */
export function updateActivity(
  id: string,
  patch: { title?: string; notes?: string },
): Promise<Activity> {
  return api<Activity>(`/api/v1/activities/${id}`, { method: 'PATCH', body: patch });
}

export function getTrackPoints(id: string): Promise<TrackPointPayload[]> {
  return api<TrackPointPayload[]>(`/api/v1/activities/${id}/track-points`);
}

export function uploadTrackPoints(
  id: string,
  points: TrackPointPayload[],
): Promise<{ received: number; inserted: number }> {
  return api<{ received: number; inserted: number }>(`/api/v1/activities/${id}/track-points`, {
    method: 'POST',
    body: { points },
  });
}
