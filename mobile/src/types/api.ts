/** DTOs partagés avec le backend Quarkus (JSON camelCase, dates ISO 8601). */

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface SportTypeDescriptor {
  code: string;
  label: string;
  usesGps: boolean;
  schemaVersion: number;
}

export type ActivityStatus = 'in_progress' | 'paused' | 'completed' | 'discarded';

export interface Activity {
  id: string;
  sportType: string;
  status: ActivityStatus;
  startedAt: string;
  endedAt: string | null;
  durationS: number | null;
  distanceM: number | null;
  calories: number | null;
  /** Titre libre (#25). Null = titre dérivé du sport et de la date à l'affichage. */
  title: string | null;
  notes: string | null;
  metrics: Record<string, unknown>;
}

export interface Page<T> {
  items: T[];
  page: number;
  size: number;
  total: number;
}

/** Erreur RFC 7807 renvoyée par le backend. */
export interface Problem {
  title: string;
  status: number;
  detail: string;
}
